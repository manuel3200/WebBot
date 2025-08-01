// WebBot/backend/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

function verifyToken(req, res, next) {
    // 1. Buscamos el token en la cabecera 'Authorization'
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Formato "Bearer TOKEN"

    // 2. Si no hay token, lo rechazamos
    if (!token) {
        return res.status(403).json({ message: 'No se proveyó un token.' });
    }

    // 3. Verificamos la validez del token
    jwt.verify(token, process.env.SESSION_SECRET, (err, user) => {
        if (err) {
            return res.status(401).json({ message: 'Token no válido o expirado.' });
        }
        // 4. Si es válido, adjuntamos los datos del usuario a la petición
        req.user = user;
        // 5. ¡Adelante! Dejamos que la petición continúe a su destino
        next();
    });
}

module.exports = { verifyToken };