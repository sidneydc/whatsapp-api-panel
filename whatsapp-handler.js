// whatsapp-handler.js (CORRIGIDO)

import * as whatsapp from 'wa-multi-session';
import fs from 'fs';
import axios from 'axios';
import qrcode from 'qrcode'; // A importação que faltava

const WEBHOOK_FILE = './webhooks.json';

// --- Funções de Webhook ---
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

const dispatchWebhook = async (sessionId, event, data) => {
    console.log(`[DISPATCH] Procurando webhooks para sessão '${sessionId}' e evento '${event}'...`);
    const webhooks = loadWebhooks();
    const sessionWebhooks = webhooks[sessionId] || [];
    
    if (sessionWebhooks.length === 0) {
        return;
    }

    for (const wh of sessionWebhooks) {
        if (wh.events.includes(event)) {
            console.log(`[DISPATCH] Webhook correspondente encontrado: ${wh.url}. Disparando...`);
            try {
                await axios.post(wh.url, { event, sessionId, data }, { timeout: 5000 });
                console.log(`[DISPATCH] Webhook para ${wh.url} disparado com sucesso.`);
            } catch (error) {
                console.error(`[DISPATCH] Erro ao disparar webhook para ${wh.url}:`, error.message);
            }
        }
    }
};

// --- Função de Inicialização do WhatsApp ---
export function initializeWhatsApp(sessionStates) {
    console.log('[WHATSAPP HANDLER] Inicializando listeners...');

    whatsapp.onQRUpdated(async ({ sessionId, qr }) => {
        console.log(`[EVENTO] QR Code para sessão: ${sessionId}`);
        const qrCodeUrl = await qrcode.toDataURL(qr); // Agora 'qrcode' está definido
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

    whatsapp.onMessageReceived(async (msg) => {
        console.log(`[onMessageReceived] Evento de mensagem recebida disparado para sessão: ${msg.sessionId}.`);
        if (msg.key.remoteJid === 'status@broadcast' || !msg.message || msg.key.fromMe) {
            return;
        }
        console.log(`[onMessageReceived] Mensagem válida. Chamando dispatchWebhook...`);
        await dispatchWebhook(msg.sessionId, 'onMessageReceived', msg);
    });

    console.log('[WHATSAPP HANDLER] Carregando sessões do armazenamento...');
    whatsapp.loadSessionsFromStorage();
}

export const dispatchSentMessageWebhook = dispatchWebhook;
