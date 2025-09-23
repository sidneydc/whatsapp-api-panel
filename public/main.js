// public/main.js (VERSÃO FUNCIONAL DO USUÁRIO + MELHORIA MÍNIMA E SEGURA)

// --- VERIFICAÇÃO DE AUTENTICAÇÃO ---
// A variável 'token' é o código base64, não o 'Basic ...' completo.
const token = localStorage.getItem('authToken'); 
if (!token) {
    window.location.href = '/login.html';
}

// --- REFERÊNCIAS AOS ELEMENTOS DO DOM ---
const sessionsContainer = document.getElementById('sessions');
const newSessionInput = document.getElementById('new-session-id');
const createSessionBtn = document.getElementById('create-session-btn');
const modal = document.getElementById('qr-modal');
const qrImg = document.getElementById('qr-code-img');
const qrModalTitle = document.getElementById('qr-modal-title');
const logContainer = document.getElementById('log');
const closeModalBtn = document.getElementById('close-modal-btn');
const logoutBtn = document.getElementById('logout-button');
const authTokenField = document.getElementById('auth-token-field');

// --- FUNÇÕES AUXILIARES ---

function addLog(message) {
    const now = new Date().toLocaleTimeString();
    const logEntry = document.createElement('p');
    logEntry.innerHTML = `<strong>[${now}]</strong> ${message}`;
    logContainer.prepend(logEntry);
}

async function fetchApi(url, options = {}) {
    // A sua função original estava correta. Ela usa a variável 'token' global.
    const defaultOptions = {
        headers: {
            'Authorization': `Basic ${token}`,
            'Content-Type': 'application/json'
        }
    };
    const mergedOptions = { ...defaultOptions, ...options, headers: {...defaultOptions.headers, ...options.headers} };
    
    try {
        const response = await fetch(url, mergedOptions);
        if (response.status === 401) {
            addLog("<strong>Erro de Autenticação:</strong> Token inválido. Redirecionando para o login.");
            localStorage.removeItem('authToken');
            window.location.href = '/login.html';
            return null;
        }
        return response;
    } catch (error) {
        console.error('Erro de conexão com a API:', error);
        addLog(`<strong>Erro de Rede:</strong> Não foi possível conectar ao servidor.`);
        return null;
    }
}

// ▼▼▼ ÚNICA FUNÇÃO MODIFICADA ▼▼▼
function displayAuthToken() {
    const basicToken = `Basic ${token}`;
    const host = window.location.host;

    // 1. Preenche o campo de input com o token
    authTokenField.value = basicToken;
    authTokenField.addEventListener('click', () => {
        navigator.clipboard.writeText(basicToken);
        addLog("Token de autenticação copiado para a área de transferência!");
    });

    // 2. Preenche dinamicamente os exemplos de cURL
    document.querySelectorAll('.api-host').forEach(span => {
        span.textContent = host;
    });
    document.querySelectorAll('.api-token').forEach(span => {
        span.textContent = basicToken;
    });
}

// --- FUNÇÕES PRINCIPAIS DA APLICAÇÃO (EXATAMENTE A SUA VERSÃO) ---

async function renderSessions() {
    const response = await fetchApi('/sessions');
    if (!response) return;
    const sessions = await response.json();
    sessionsContainer.innerHTML = '';

    if (sessions.length === 0) {
        sessionsContainer.innerHTML = '<p>Nenhuma sessão criada ainda.</p>';
        return;
    }

    sessions.forEach(session => {
        const details = document.createElement('details');
        details.className = 'session-item';
        details.id = `session-${session.id}`;

        details.innerHTML = `
            <summary>
                <span class="session-summary-title">${session.id}</span>
                <span class="status ${session.status}">${session.status}</span>
            </summary>
            <div class="details-content">
                <div class="session-actions">
                    <button class="status-btn">Ver Status/QR</button>
                    <button class="webhooks-btn">Webhooks</button>
                    <button class="delete-btn">Excluir</button>
                </div>
                <div class="send-form">
                    ${session.status === 'CONNECTED' ? `
                        <h4>Enviar Mensagem</h4>
                        <div class="form-group"><input type="text" id="to-${session.id}" placeholder="Número (ex: 55119...)" /></div>
                        <div class="form-group"><textarea id="text-${session.id}" placeholder="Sua mensagem"></textarea></div>
                        <button class="send-btn">Enviar Mensagem</button>
                    ` : '<p>Conecte a sessão para enviar mensagens.</p>'}
                </div>
                <div class="webhook-manager" style="display: none;">
                    <h4>Gerenciar Webhooks</h4>
                    <ul class="webhook-list"></ul>
                    <div class="webhook-creator">
                        <input type="text" class="webhook-url" placeholder="https://seu-servidor.com/webhook">
                        <div class="webhook-events">
                            <label><input type="checkbox" value="onMessageReceived"> Recebidas</label>
                            <label><input type="checkbox" value="onMessageSent"> Enviadas</label>
                        </div>
                        <button class="add-webhook-btn">Adicionar</button>
                    </div>
                </div>
            </div>
        `;

        details.querySelector('.status-btn'  ).addEventListener('click', () => checkStatus(session.id));
        details.querySelector('.delete-btn').addEventListener('click', () => deleteSession(session.id));
        details.querySelector('.webhooks-btn').addEventListener('click', (e) => { e.stopPropagation(); toggleWebhookManager(session.id); });
        
        if (session.status === 'CONNECTED') {
            details.querySelector('.send-btn').addEventListener('click', () => sendMessage(session.id));
        }
        
        details.querySelector('.add-webhook-btn').addEventListener('click', () => addWebhook(session.id));

        sessionsContainer.appendChild(details);
    });
}

async function sendMessage(sessionId) {
    const to = document.getElementById(`to-${sessionId}`).value;
    const text = document.getElementById(`text-${sessionId}`).value;
    if (!to || !text) return alert('Preencha o número e a mensagem.');
    addLog(`Enviando mensagem de <strong>${sessionId}</strong> para <strong>${to}</strong>...`);
    const response = await fetchApi('/send', { method: 'POST', body: JSON.stringify({ sessionId, to, text }) });
    if (!response) return;
    const responseData = await response.json();
    if (response.ok) {
        addLog(`Mensagem para <strong>${to}</strong> enviada com sucesso!`);
        document.getElementById(`text-${sessionId}`).value = '';
    } else {
        addLog(`<strong>Erro</strong> ao enviar mensagem: ${responseData.error || 'Falha desconhecida'}`);
    }
}

async function createSession() {
    const sessionId = newSessionInput.value.trim();
    if (!sessionId) return alert('Por favor, digite um nome para a sessão.');
    addLog(`Criando sessão: <strong>${sessionId}</strong>`);
    await fetchApi('/sessions/start', { method: 'POST', body: JSON.stringify({ sessionId }) });
    newSessionInput.value = '';
    await renderSessions();
    setTimeout(() => checkStatus(sessionId), 2000);
}

async function checkStatus(sessionId) {
    const response = await fetchApi(`/sessions/${sessionId}/status`);
    if (!response) return;
    const state = await response.json();
    if (state && state.status === 'SCAN_QR') {
        qrModalTitle.innerText = `Escaneie o QR Code para: ${sessionId}`;
        qrImg.src = state.qrCodeUrl;
        modal.style.display = 'flex';
    } else {
        alert(`Status da sessão "${sessionId}": ${state?.status || 'Desconhecido'}`);
    }
    await renderSessions();
}

async function deleteSession(sessionId) {
    if (!confirm(`Tem certeza que deseja excluir a sessão "${sessionId}"?`)) return;
    addLog(`Excluindo sessão: <strong>${sessionId}</strong>`);
    await fetchApi(`/sessions/${sessionId}`, { method: 'DELETE' });
    await renderSessions();
    addLog(`Sessão <strong>${sessionId}</strong> excluída.`);
}

async function toggleWebhookManager(sessionId) {
    const manager = document.querySelector(`#session-${sessionId} .webhook-manager`);
    const isVisible = manager.style.display === 'block';
    document.querySelectorAll('.webhook-manager').forEach(m => m.style.display = 'none');
    if (!isVisible) {
        manager.style.display = 'block';
        await listWebhooks(sessionId);
    }
}

async function listWebhooks(sessionId) {
    const listElement = document.querySelector(`#session-${sessionId} .webhook-list`);
    listElement.innerHTML = '<li>Carregando...</li>';
    const response = await fetchApi(`/sessions/${sessionId}/webhooks`);
    if (!response) return;
    const webhooks = await response.json();
    listElement.innerHTML = '';
    if (webhooks.length === 0) {
        listElement.innerHTML = '<li>Nenhum webhook configurado.</li>';
        return;
    }
    webhooks.forEach(wh => {
        const whLi = document.createElement('li');
        whLi.innerHTML = `<span>${wh.url} (${wh.events.join(', ')})</span><button class="delete-webhook-btn" style="background-color: transparent; color: #e74c3c; font-weight: bold; margin-left: 15px;">&times;</button>`;
        whLi.querySelector('.delete-webhook-btn').addEventListener('click', () => deleteWebhook(sessionId, wh.url));
        listElement.appendChild(whLi);
    });
}

async function addWebhook(sessionId) {
    const sessionCard = document.querySelector(`#session-${sessionId}`);
    const url = sessionCard.querySelector('.webhook-url').value.trim();
    const selectedEvents = Array.from(sessionCard.querySelectorAll('.webhook-events input:checked')).map(el => el.value);
    if (!url || selectedEvents.length === 0) {
        return alert('Por favor, insira uma URL e selecione pelo menos um evento.');
    }
    addLog(`Adicionando webhook para <strong>${sessionId}</strong>: ${url}`);
    await fetchApi(`/sessions/${sessionId}/webhooks`, { method: 'POST', body: JSON.stringify({ url, events: selectedEvents }) });
    sessionCard.querySelector('.webhook-url').value = '';
    await listWebhooks(sessionId);
}

async function deleteWebhook(sessionId, url) {
    if (!confirm(`Tem certeza que deseja remover o webhook: ${url}?`)) return;
    addLog(`Removendo webhook de <strong>${sessionId}</strong>: ${url}`);
    await fetchApi(`/sessions/${sessionId}/webhooks`, { method: 'DELETE', body: JSON.stringify({ url }) });
    await listWebhooks(sessionId);
}

function closeModal() {
    modal.style.display = 'none';
}

// --- INICIALIZAÇÃO E EVENTOS GLOBAIS (EXATAMENTE A SUA VERSÃO) ---
createSessionBtn.addEventListener('click', createSession);
logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('authToken');
    addLog('Usuário deslogado.');
    window.location.href = '/login.html';
});
closeModalBtn.addEventListener('click', closeModal);
window.addEventListener('click', (event) => {
    if (event.target == modal) {
        closeModal();
    }
    if (!event.target.closest('.session-item')) {
        document.querySelectorAll('.webhook-manager').forEach(m => m.style.display = 'none');
    }
});

window.onload = () => {
    addLog("Painel iniciado. Carregando sessões...");
    displayAuthToken(); // A sua função original, que agora está modificada
    renderSessions();
};
