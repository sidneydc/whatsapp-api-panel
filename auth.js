// auth.js (Backend Middleware)

// Para um sistema real, use um banco de dados e senhas com hash!
// Para nosso exemplo, vamos armazenar as credenciais em memória.
const USERS = {
    "admin": "admin123" // Usuário: admin, Senha: admin123
};

// Este é o nosso "middleware" de autenticação.
// Ele vai rodar antes de cada endpoint que protegermos.
const authenticate = (req, res, next) => {
    const { authorization } = req.headers;

    if (!authorization) {
        return res.status(401).json({ error: "Acesso não autorizado. Token não fornecido." });
    }

    // O token virá no formato "Basic base64(usuario:senha)"
    // Ex: "Basic YWRtaW46YWRtaW4xMjM="
    const [type, token] = authorization.split(' ');

    if (type !== 'Basic' || !token) {
        return res.status(401).json({ error: "Formato de token inválido. Use Basic Auth." });
    }

    // Decodifica o token de Base64 para "usuario:senha"
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const [username, password] = decoded.split(':');

    // Verifica se o usuário existe e se a senha está correta
    if (USERS[username] && USERS[username] === password) {
        // Se tudo estiver OK, permite que a requisição continue para o endpoint final
        next();
    } else {
        return res.status(401).json({ error: "Credenciais inválidas." });
    }
};

export default authenticate;

