// server.js (VERSÃO FINAL CONSOLIDADA COM TODAS AS FUNCIONALIDADES)

import express from "express";
import * as whatsapp from "wa-multi-session";
import qrcode from "qrcode";
import fs from 'fs';
import authenticate from './auth.js';
import axios from 'axios';
import multer from 'multer'; // Para upload de arquivos

const app = express();
app.use(express.json());
app.use(express.static("public"));
app.use('/downloads', express.static('downloads'));

// Configuração da Multer para upload de arquivos em memória
const upload = multer({ storage: multer.memoryStorage() });

const sessionStates = new Map();
const WEBHOOK_FILE = './webhooks.json';

// --- LÓGICA DO WEBHOOK ---
const loadWebhooks = () => {
    if (fs.existsSync(WEBHOOK_FILE)) {
        try {
            const data = fs.readFileSync(WEBHOOK_FILE, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            console.error("[ERRO] Falha ao ler ou parsear webhooks.json:", error);
            return {};
        }
    }
    return {};
};

const saveWebhooks = (webhooks) => {
    fs.writeFileSync(WEBHOOK_FILE, JSON.stringify(webhooks, null, 2));
};

const dispatchWebhook = async (sessionId, event, data) => {
    const webhooks = loadWebhooks();
    const sessionWebhooks = webhooks[sessionId] || [];
    if (sessionWebhooks.length === 0) return;

    for (const wh of sessionWebhooks) {
        if (wh.events.includes(event)) {
            console.log(`[DISPATCH] Webhook encontrado para evento '${event}'. Disparando para ${wh.url}...`);
            try {
                await axios.post(wh.url, { event, sessionId, data }, { timeout: 5000 });
                console.log(`[DISPATCH] Sucesso.`);
            } catch (error) {
                console.error(`[DISPATCH] Erro:`, error.message);
            }
        }
    }
};

// --- LISTENERS GLOBAIS DO WHATSAPP ---
whatsapp.onQRUpdated(async ({ sessionId, qr }) => {
    const qrCodeUrl = await qrcode.toDataURL(qr);
    sessionStates.set(sessionId, { status: 'SCAN_QR', qrCodeUrl });
});

whatsapp.onConnected((sessionId) => {
    console.log(`[EVENTO] Sessão conectada: ${sessionId}`);
    sessionStates.set(sessionId, { status: 'CONNECTED' });
});

whatsapp.onDisconnected((sessionId) => {
    console.log(`[EVENTO] Sessão desconectada: ${sessionId}`);
    sessionStates.set(sessionId, { status: 'DISCONNECTED' });
});

// VERSÃO FINAL - USA OS MÉTODOS .save<Media>() DO README
whatsapp.onMessageReceived(async (msg) => {
    // Ignora mensagens de status, mensagens sem conteúdo ou as que nós mesmos enviamos.
    if (msg.key.remoteJid === 'status@broadcast' || !msg.message || msg.key.fromMe) {
        return;
    }

    // Cria a pasta 'downloads' se ela não existir.
    // Fazemos isso uma vez aqui para todos os tipos de mídia.
    const downloadDir = './downloads';
    if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir);
    }

    try {
        let savedFilePath = null;
        let mediaType = null;

        // Lógica para salvar IMAGEM
        if (msg.message.imageMessage) {
            mediaType = 'image';
            const fileName = `${msg.key.id}.jpg`;
            savedFilePath = `${downloadDir}/${fileName}`;
            await msg.saveImage(savedFilePath);
        }
        // Lógica para salvar VÍDEO
        else if (msg.message.videoMessage) {
            mediaType = 'video';
            const fileName = `${msg.key.id}.mp4`;
            savedFilePath = `${downloadDir}/${fileName}`;
            await msg.saveVideo(savedFilePath);
        }
        // Lógica para salvar DOCUMENTO
        else if (msg.message.documentMessage) {
            mediaType = 'document';
            // Para documentos, o nome original é mais útil.
            const fileName = msg.message.documentMessage.fileName || `${msg.key.id}.bin`;
            savedFilePath = `${downloadDir}/${fileName}`;
            await msg.saveDocument(savedFilePath);
        }
        // Lógica para salvar ÁUDIO (Seguindo o padrão da biblioteca)
        else if (msg.message.audioMessage) {
            mediaType = 'audio';
            const fileName = `${msg.key.id}.ogg`;
            savedFilePath = `${downloadDir}/${fileName}`;
            // Assumindo que o método .saveAudio() existe, seguindo o padrão.
            await msg.saveAudio(savedFilePath);
        }

        if (savedFilePath) {
            console.log(`[MÍDIA] Mídia do tipo '${mediaType}' salva com sucesso em: ${savedFilePath}`);
            // Adiciona o caminho do arquivo salvo ao objeto da mensagem.
            msg.savedFilePath = savedFilePath;
        }

    } catch (error) {
        console.error(`[MÍDIA] Falha ao salvar a mídia:`, error);
    }

    // Dispara o webhook com o objeto 'msg' potencialmente modificado (com savedFilePath).
    console.log(`[WEBHOOK] Mensagem recebida na sessão ${msg.sessionId}.`);
    await dispatchWebhook(msg.sessionId, 'onMessageReceived', msg);
});


// --- ENDPOINTS DA API ---

// Autenticação
app.post("/login", (req, res) => {
    const { username, password } = req.body;
    const USERS = { "admin": "admin123" }; // Simples autenticação em memória
    if (USERS[username] && USERS[username] === password) {
        res.json({ status: "success" });
    } else {
        res.status(401).json({ error: "Credenciais inválidas." });
    }
});

// Middleware para proteger rotas
app.use('/sessions', authenticate);
app.use('/send', authenticate);
app.use('/presence', authenticate);
app.use('/send-media', authenticate);

// Gerenciamento de Sessões
app.get("/sessions", (req, res) => {
    const sessions = whatsapp.getAllSession();
    const sessionDetails = sessions.map(id => ({ id, status: sessionStates.get(id)?.status || 'DISCONNECTED' }));
    res.json(sessionDetails);
});

// VERSÃO NOVA E CORRIGIDA
app.post("/sessions/start", (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) {
        return res.status(400).json({ error: "sessionId é obrigatório." });
    }

    // ▼▼▼ LÓGICA DE VERIFICAÇÃO ADICIONADA ▼▼▼
    const allSessions = whatsapp.getAllSession();
    if (allSessions.includes(sessionId)) {
        // Se a sessão já existe, não faz nada e avisa o usuário.
        return res.status(200).json({ message: `Sessão "${sessionId}" já existe ou está sendo iniciada.` });
    }
    // ▲▲▲ FIM DA LÓGICA DE VERIFICAÇÃO ▲▲▲

    // Se a sessão não existe, então a inicia.
    whatsapp.startSession(sessionId);
    res.status(201).json({ message: `Iniciando sessão ${sessionId}.` });
});


app.get("/sessions/:sessionId/status", (req, res) => {
    const { sessionId } = req.params;
    const state = sessionStates.get(sessionId);
    if (!state) return res.status(404).json({ status: 'NOT_FOUND' });
    res.json(state);
});

app.delete("/sessions/:sessionId", async (req, res) => {
    const { sessionId } = req.params;
    try {
        await whatsapp.deleteSession(sessionId);
        sessionStates.delete(sessionId);
        const credsDir = `wa_credentials/${sessionId}`;
        if (fs.existsSync(credsDir)) fs.rmSync(credsDir, { recursive: true, force: true });
        res.json({ message: `Sessão ${sessionId} deletada.` });
    } catch (error) {
        res.status(500).json({ error: "Falha ao deletar sessão." });
    }
});

// Gerenciamento de Webhooks
app.get('/sessions/:sessionId/webhooks', (req, res) => {
    const { sessionId } = req.params;
    const webhooks = loadWebhooks();
    res.json(webhooks[sessionId] || []);
});

app.post('/sessions/:sessionId/webhooks', (req, res) => {
    const { sessionId } = req.params;
    const { url, events } = req.body;
    if (!url || !events || !Array.isArray(events)) return res.status(400).json({ error: 'URL e uma lista de eventos são obrigatórios.' });
    const webhooks = loadWebhooks();
    if (!webhooks[sessionId]) webhooks[sessionId] = [];
    if (!webhooks[sessionId].some(wh => wh.url === url)) {
        webhooks[sessionId].push({ url, events });
        saveWebhooks(webhooks);
    }
    res.status(201).json(webhooks[sessionId]);
});

app.delete('/sessions/:sessionId/webhooks', (req, res) => {
    const { sessionId } = req.params;
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'A URL do webhook é obrigatória.' });
    const webhooks = loadWebhooks();
    if (webhooks[sessionId]) {
        webhooks[sessionId] = webhooks[sessionId].filter(wh => wh.url !== url);
        saveWebhooks(webhooks);
    }
    res.status(200).json(webhooks[sessionId] || []);
});

// Envio de Mensagem de Texto
app.post("/send", async (req, res) => {
    const { sessionId, to, text } = req.body;
    if (!sessionId || !to || !text) return res.status(400).json({ error: "Campos obrigatórios faltando." });
    try {
        const result = await whatsapp.sendTextMessage({ sessionId, to, text });
        await dispatchWebhook(sessionId, 'onMessageSent', result);
        res.json({ status: "Mensagem enviada!", result });
    } catch (err) {
        console.error("Erro ao enviar mensagem:", err);
        res.status(500).json({ error: "Falha ao enviar mensagem.", details: err.message });
    }
});

// --- NOVOS ENDPOINTS DE FUNCIONALIDADES ---

// Enviar "digitando..."
app.post('/presence/typing', async (req, res) => {
    const { sessionId, to, duration = 3000 } = req.body;
    try {
        await whatsapp.sendTyping({ sessionId, to, duration });
        res.json({ status: "Success", message: `Typing presence sent to ${to}` });
    } catch (error) {
        res.status(500).json({ status: "Error", message: error.message });
    }
});

// Enviar "gravando áudio..."
app.post('/presence/recording', async (req, res) => {
    const { sessionId, to } = req.body;
    try {
        const session = whatsapp.getSession(sessionId);
        if (!session) throw new Error('Session not found');
        await session.sock.sendPresenceUpdate('recording', to);
        res.json({ status: "Success", message: `Recording presence sent to ${to}` });
    } catch (error) {
        res.status(500).json({ status: "Error", message: error.message });
    }
});

// Enviar localização
app.post('/send-media/location', async (req, res) => {
    const { sessionId, to, latitude, longitude } = req.body;
    try {
        const session = whatsapp.getSession(sessionId);
        if (!session) throw new Error('Session not found');
        await session.sock.sendMessage(to, { location: { degreesLatitude: latitude, degreesLongitude: longitude } });
        res.json({ status: "Success", message: `Location sent to ${to}` });
    } catch (error) {
        res.status(500).json({ status: "Error", message: error.message });
    }
});

// Enviar arquivos (imagem, vídeo, documento)
app.post('/send-media/file', upload.single('media'), async (req, res) => {
    const { sessionId, to, type, caption, filename } = req.body;
    if (!req.file) return res.status(400).json({ status: "Error", message: "Media file is required." });

    const media = req.file.buffer;
    try {
        let response;
        switch (type) {
            case 'image':
                response = await whatsapp.sendImage({ sessionId, to, text: caption, media });
                break;
            case 'video':
                response = await whatsapp.sendVideo({ sessionId, to, text: caption, media });
                break;
            case 'document':
                response = await whatsapp.sendDocument({ sessionId, to, filename: filename || req.file.originalname, media });
                break;
            default:
                return res.status(400).json({ status: "Error", message: "Invalid media type: 'image', 'video', or 'document'." });
        }
        res.json({ status: "Success", data: response });
    } catch (error) {
        res.status(500).json({ status: "Error", message: error.message });
    }
});

// Enviar nota de voz (PTT)
app.post('/send-media/ptt', upload.single('media'), async (req, res) => {
    const { sessionId, to } = req.body;
    if (!req.file) return res.status(400).json({ status: "Error", message: "Audio file is required." });
    
    const media = req.file.buffer;
    try {
        const response = await whatsapp.sendVoiceNote({ sessionId, to, media });
        res.json({ status: "Success", data: response });
    } catch (error) {
        res.status(500).json({ status: "Error", message: error.message });
    }
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
app.listen(3333, () => {
    console.log("Servidor Express rodando em http://localhost:3333" );
    // Carrega as sessões salvas. Os listeners globais já estão ativos.
    whatsapp.loadSessionsFromStorage();
});
