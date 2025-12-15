import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  WASocket,
} from "@whiskeysockets/baileys";
import path from "path";
import { Boom } from "@hapi/boom";
import qrTerminal from "qrcode-terminal";
import fs from "fs";
import type {
  MessageReceived,
  MessageUpdated,
  StartSessionParams,
  StartSessionWithPairingCodeParams,
} from "../Types/index.js";
import { CALLBACK_KEY, CREDENTIALS, Messages } from "../Defaults/index.js";
import {
  saveAudioHandler,
  saveDocumentHandler,
  saveImageHandler,
  saveVideoHandler,
} from "../Utils/save-media.js";
import { WhatsappError } from "../Error/index.js";
import { parseMessageStatusCodeToReadable } from "../Utils/message-status.js";
import pino from "pino";

const sessions: Map<string, WASocket> = new Map();

const callback: Map<string, Function> = new Map();

const retryCount: Map<string, number> = new Map();

const P = pino({
  level: "silent",
});

export const startSession = async (
  sessionId = "mysession",
  options: StartSessionParams = { printQR: true }
): Promise<WASocket> => {
  if (isSessionExistAndRunning(sessionId))
    throw new WhatsappError(Messages.sessionAlreadyExist(sessionId));

  const { version } = await fetchLatestBaileysVersion();
  const startSocket = async () => {
    const credentialsPath = path.resolve(CREDENTIALS.DIR_NAME, sessionId + CREDENTIALS.PREFIX);
    console.log(`[CREDS] Caminho das credenciais para ${sessionId}: ${credentialsPath}`);
    
    const { state, saveCreds } = await useMultiFileAuthState(credentialsPath);
    
    console.log(`[CREDS] Estado de autenticação carregado para ${sessionId}`);
    
    const sock: WASocket = makeWASocket({
      version,
      auth: state,
      logger: P,
      markOnlineOnConnect: false,
      browser: Browsers.ubuntu("Chrome"),
    });
    sessions.set(sessionId, { ...sock });
    try {
      sock.ev.process(async (events) => {
        if (events["connection.update"]) {
          const update = events["connection.update"];
          const { connection, lastDisconnect } = update;
          if (update.qr) {
            callback.get(CALLBACK_KEY.ON_QR)?.({
              sessionId,
              qr: update.qr,
            });
            options.onQRUpdated?.(update.qr);
            if (options.printQR) {
              qrTerminal.generate(update.qr, { small: true }, (qrcode) => {
                console.log(sessionId + ":");
                console.log(qrcode);
              });
            }
          }
          if (connection == "connecting") {
            callback.get(CALLBACK_KEY.ON_CONNECTING)?.(sessionId);
            options.onConnecting?.();
          }
          if (connection === "close") {
            const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
            const reason = (lastDisconnect?.error as Boom)?.output?.payload?.error;
            let retryAttempt = retryCount.get(sessionId) ?? 0;
            
            console.log(`[CONNECTION] Conexão fechada para ${sessionId}. Código: ${code}, Razão: ${reason}, Tentativas: ${retryAttempt}`);
            
            let shouldRetry;
            let shouldDeleteCreds = false;
            
            // Baileys usa 401 para várias situações, não apenas logout
            // Apenas deletamos credenciais se for realmente um logout explícito do usuário
            // Códigos conhecidos:
            // 401 = Unauthorized (pode ser desconexão temporária OU logout)
            // 403 = Forbidden
            // 408 = Request Timeout
            // 428 = Precondition Required  
            // 440 = Connection Closed
            // 500 = Internal Error
            // 515 = Need to Restart
            
            // Para determinar se é logout real, checamos se as credenciais ainda existem
            const credsPath = path.resolve(CREDENTIALS.DIR_NAME, sessionId + CREDENTIALS.PREFIX);
            const credsExist = fs.existsSync(credsPath) && fs.readdirSync(credsPath).length > 0;
            
            if (code === 403) {
              // 403 é logout definitivo
              shouldRetry = false;
              shouldDeleteCreds = true;
              console.log(`[CONNECTION] Logout definitivo (403) detectado para ${sessionId}.`);
            } else if (code === 401 && !credsExist) {
              // 401 sem credenciais = logout
              shouldRetry = false;
              shouldDeleteCreds = true;
              console.log(`[CONNECTION] Logout (401 sem credenciais) detectado para ${sessionId}.`);
            } else if (retryAttempt < 10) {
              // Qualquer outro erro: tenta reconectar
              shouldRetry = true;
              console.log(`[CONNECTION] Tentando reconectar ${sessionId}. Tentativa ${retryAttempt + 1}/10 (Código: ${code})`);
            } else {
              // Após 10 tentativas, para mas mantém credenciais
              shouldRetry = false;
              shouldDeleteCreds = false;
              console.log(`[CONNECTION] ${sessionId} atingiu limite de tentativas. Mantendo credenciais para reconexão manual.`);
            }
            
            if (shouldRetry) {
              retryAttempt++;
              retryCount.set(sessionId, retryAttempt);
              startSocket();
            } else {
              retryCount.delete(sessionId);
              console.log(`[DISCONNECT] Sessão ${sessionId} encerrada. Código: ${code}, Deletar credenciais: ${shouldDeleteCreds}`);
              deleteSession(sessionId, shouldDeleteCreds);
              callback.get(CALLBACK_KEY.ON_DISCONNECTED)?.(sessionId);
              options.onDisconnected?.();
            }
          }
          if (connection == "open") {
            retryCount.delete(sessionId);
            callback.get(CALLBACK_KEY.ON_CONNECTED)?.(sessionId);
            options.onConnected?.();
          }
        }
        if (events["creds.update"]) {
          console.log(`[CREDS] Salvando credenciais para ${sessionId}...`);
          try {
            await saveCreds();
            console.log(`[CREDS] Credenciais salvas com sucesso para ${sessionId}`);
          } catch (error) {
            console.error(`[CREDS] Erro ao salvar credenciais para ${sessionId}:`, error);
          }
        }
        if (events["messages.update"]) {
          const msg = events["messages.update"][0];
          const data: MessageUpdated = {
            sessionId: sessionId,
            messageStatus: parseMessageStatusCodeToReadable(msg.update.status!),
            ...msg,
          };
          callback.get(CALLBACK_KEY.ON_MESSAGE_UPDATED)?.(data);
          options.onMessageUpdated?.(data);
        }
        if (events["messages.upsert"]) {
          const msg = events["messages.upsert"]
            .messages?.[0] as unknown as MessageReceived;
          msg.sessionId = sessionId;
          msg.saveImage = (path) => saveImageHandler(msg, path);
          msg.saveVideo = (path) => saveVideoHandler(msg, path);
          msg.saveDocument = (path) => saveDocumentHandler(msg, path);
          msg.saveAudio = (path) => saveAudioHandler(msg, path);
          callback.get(CALLBACK_KEY.ON_MESSAGE_RECEIVED)?.({
            ...msg,
          });
          options.onMessageReceived?.(msg);
        }
      });
      return sock;
    } catch (error) {
      // console.log("SOCKET ERROR", error);
      return sock;
    }
  };
  return startSocket();
};

/**
 *
 * @deprecated Use startSession method instead
 */
export const startSessionWithPairingCode = async (
  sessionId: string,
  options: StartSessionWithPairingCodeParams
): Promise<WASocket> => {
  if (isSessionExistAndRunning(sessionId))
    throw new WhatsappError(Messages.sessionAlreadyExist(sessionId));

  const { version } = await fetchLatestBaileysVersion();
  const startSocket = async () => {
    const { state, saveCreds } = await useMultiFileAuthState(
      path.resolve(CREDENTIALS.DIR_NAME, sessionId + CREDENTIALS.PREFIX)
    );
    const sock: WASocket = makeWASocket({
      version,
      printQRInTerminal: false,
      auth: state,
      logger: P,
      markOnlineOnConnect: false,
      browser: Browsers.ubuntu("Chrome"),
    });
    sessions.set(sessionId, { ...sock });
    try {
      if (!sock.authState.creds.registered) {
        console.log("first time pairing");
        const code = await sock.requestPairingCode(options.phoneNumber);
        console.log(code);
        callback.get(CALLBACK_KEY.ON_PAIRING_CODE)?.(sessionId, code);
      }

      sock.ev.process(async (events) => {
        if (events["connection.update"]) {
          const update = events["connection.update"];
          const { connection, lastDisconnect } = update;
          if (update.qr) {
            callback.get(CALLBACK_KEY.ON_QR)?.({
              sessionId,
              qr: update.qr,
            });
          }
          if (connection == "connecting") {
            callback.get(CALLBACK_KEY.ON_CONNECTING)?.(sessionId);
          }
          if (connection === "close") {
            const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
            let retryAttempt = retryCount.get(sessionId) ?? 0;
            let shouldRetry;
            if (code != DisconnectReason.loggedOut && retryAttempt < 10) {
              shouldRetry = true;
            }
            if (shouldRetry) {
              retryAttempt++;
            }
            if (shouldRetry) {
              retryCount.set(sessionId, retryAttempt);
              startSocket();
            } else {
              retryCount.delete(sessionId);
              deleteSession(sessionId);
              callback.get(CALLBACK_KEY.ON_DISCONNECTED)?.(sessionId);
            }
          }
          if (connection == "open") {
            retryCount.delete(sessionId);
            callback.get(CALLBACK_KEY.ON_CONNECTED)?.(sessionId);
          }
        }
        if (events["creds.update"]) {
          await saveCreds();
        }
        if (events["messages.update"]) {
          const msg = events["messages.update"][0];
          const data: MessageUpdated = {
            sessionId: sessionId,
            messageStatus: parseMessageStatusCodeToReadable(msg.update.status!),
            ...msg,
          };
          callback.get(CALLBACK_KEY.ON_MESSAGE_UPDATED)?.( data);
        }
        if (events["messages.upsert"]) {
          const msg = events["messages.upsert"]
            .messages?.[0] as unknown as MessageReceived;
          msg.sessionId = sessionId;
          msg.saveImage = (path) => saveImageHandler(msg, path);
          msg.saveVideo = (path) => saveVideoHandler(msg, path);
          msg.saveDocument = (path) => saveDocumentHandler(msg, path);
          msg.saveAudio = (path) => saveAudioHandler(msg, path);
          callback.get(CALLBACK_KEY.ON_MESSAGE_RECEIVED)?.({
            ...msg,
          });
        }
      });
      return sock;
    } catch (error) {
      // console.log("SOCKET ERROR", error);
      return sock;
    }
  };
  return startSocket();
};

/**
 * @deprecated Use startSession method instead
 */
export const startWhatsapp = startSession;

export const deleteSession = async (sessionId: string, deleteCredentials: boolean = true) => {
  const session = getSession(sessionId);
  try {
    await session?.logout();
  } catch (error) {}
  session?.end(undefined);
  sessions.delete(sessionId);
  
  // Apenas deleta as credenciais se explicitamente solicitado
  if (deleteCredentials) {
    const dir = path.resolve(
      CREDENTIALS.DIR_NAME,
      sessionId + CREDENTIALS.PREFIX
    );
    if (fs.existsSync(dir)) {
      console.log(`[CREDS] Deletando credenciais para ${sessionId}`);
      fs.rmSync(dir, { force: true, recursive: true });
    }
  } else {
    console.log(`[CREDS] Mantendo credenciais salvas para ${sessionId}`);
  }
};
export const getAllSession = (): string[] => Array.from(sessions.keys());

export const getSession = (key: string): WASocket | undefined =>
  sessions.get(key) as WASocket;

const isSessionExistAndRunning = (sessionId: string): boolean => {
  if (
    fs.existsSync(path.resolve(CREDENTIALS.DIR_NAME)) &&
    fs.existsSync(
      path.resolve(CREDENTIALS.DIR_NAME, sessionId + CREDENTIALS.PREFIX)
    ) &&
    fs.readdirSync(
      path.resolve(CREDENTIALS.DIR_NAME, sessionId + CREDENTIALS.PREFIX)
    ).length &&
    getSession(sessionId)
  ) {
    return true;
  }
  return false;
};
const shouldLoadSession = (sessionId: string): boolean => {
  if (
    fs.existsSync(path.resolve(CREDENTIALS.DIR_NAME)) &&
    fs.existsSync(
      path.resolve(CREDENTIALS.DIR_NAME, sessionId + CREDENTIALS.PREFIX)
    ) &&
    fs.readdirSync(
      path.resolve(CREDENTIALS.DIR_NAME, sessionId + CREDENTIALS.PREFIX)
    ).length &&
    !getSession(sessionId)
  ) {
    return true;
  }
  return false;
};

export const loadSessionsFromStorage = () => {
  if (!fs.existsSync(path.resolve(CREDENTIALS.DIR_NAME))) {
    fs.mkdirSync(path.resolve(CREDENTIALS.DIR_NAME));
  }
  fs.readdir(path.resolve(CREDENTIALS.DIR_NAME), async (err, dirs) => {
    if (err) {
      throw err;
    }
    for (const dir of dirs) {
      const sessionId = dir.split("_")[0];
      if (!shouldLoadSession(sessionId)) continue;
      startSession(sessionId);
    }
  });
};

export const onMessageReceived = (listener: (msg: MessageReceived) => any) => {
  callback.set(CALLBACK_KEY.ON_MESSAGE_RECEIVED, listener);
};
export const onQRUpdated = (
  listener: ({ sessionId, qr }: { sessionId: string; qr: string }) => any
) => {
  callback.set(CALLBACK_KEY.ON_QR, listener);
};
export const onConnected = (listener: (sessionId: string) => any) => {
  callback.set(CALLBACK_KEY.ON_CONNECTED, listener);
};
export const onDisconnected = (listener: (sessionId: string) => any) => {
  callback.set(CALLBACK_KEY.ON_DISCONNECTED, listener);
};
export const onConnecting = (listener: (sessionId: string) => any) => {
  callback.set(CALLBACK_KEY.ON_CONNECTING, listener);
};

export const onMessageUpdate = (listener: (data: MessageUpdated) => any) => {
  callback.set(CALLBACK_KEY.ON_MESSAGE_UPDATED, listener);
};

export const onPairingCode = (
  listener: (sessionId: string, code: string) => any
) => {
  callback.set(CALLBACK_KEY.ON_PAIRING_CODE, listener);
};
