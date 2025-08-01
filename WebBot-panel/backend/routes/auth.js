// WebBot/backend/routes/auth.js

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../utils/db'); // Asumiendo que copiaste tu carpeta utils
const router = express.Router();

// Ruta para el login: POST /api/auth/login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        // 1. Buscar al usuario en la DB por su nombre de usuario web
        const result = await db.query('SELECT * FROM users WHERE web_username = $1', [username]);
        const user = result.rows[0];

        // 2. Si no existe el usuario o no tiene contraseña, rechazamos
        if (!user || !user.password_hash) {
            return res.status(401).json({ message: 'Credenciales incorrectas' });
        }

        // 3. Comparar la contraseña enviada con el hash guardado
        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
            return res.status(401).json({ message: 'Credenciales incorrectas' });
        }

        // 4. Si la contraseña es válida, creamos el "pasaporte" (JWT)
        const payload = {
            id: user.id,
            name: user.name,
            role: user.role
        };

        const token = jwt.sign(payload, process.env.SESSION_SECRET, {
            expiresIn: '8h' // El token será válido por 8 horas
        });

        // 5. Enviamos el token al frontend
        res.json({ token });

    } catch (error) {
        console.error('Error en el login:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

module.exports = router;