// public/auth.js (CORRIGIDO para usar o endpoint /login)

document.getElementById('login-form').addEventListener('submit', (event) => {
    event.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorMessage = document.getElementById('error-message');

    // Limpa mensagens de erro anteriores
    errorMessage.textContent = '';

    // Envia as credenciais para o novo endpoint /login
    fetch('/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
    })
    .then(response => {
        if (response.ok) {
            // Se o login foi bem-sucedido (status 200 OK):
            // 1. Criamos o token que será usado nas próximas requisições
            const token = btoa(`${username}:${password}`);
            
            // 2. Salvamos o token no localStorage para ser usado pelo painel
            localStorage.setItem('authToken', token);
            
            // 3. Redirecionamos para o painel principal
            window.location.href = '/index.html';
        } else {
            // Se o login falhou (status 401 Unauthorized):
            errorMessage.textContent = 'Usuário ou senha inválidos.';
            localStorage.removeItem('authToken'); // Garante que nenhum token antigo permaneça
        }
    })
    .catch(error => {
        console.error('Erro de conexão:', error);
        errorMessage.textContent = 'Erro ao conectar com o servidor. Verifique se ele está rodando.';
    });
});
