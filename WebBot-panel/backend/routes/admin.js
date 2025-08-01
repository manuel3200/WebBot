// WebBot/backend/routes/admin.js
const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { verifyToken } = require('../middleware/authMiddleware');

// --- Middleware de Seguridad Específico para el Owner ---
// Este es un guardia de seguridad más estricto que solo deja pasar al owner.
const ownerOnly = (req, res, next) => {
    if (req.user && req.user.role === 'owner') {
        next(); // Si es owner, puede continuar.
    } else {
        // Si no, le negamos el acceso.
        res.status(403).json({ message: 'Acceso denegado. Se requiere rol de Owner.' });
    }
};

// Aplicamos el guardia de token a todas las rutas de este archivo.
router.use(verifyToken);
// Aplicamos nuestro nuevo guardia "ownerOnly" a todas las rutas de este archivo.
router.use(ownerOnly);

/**
 * @route   GET /api/admin/users
 * @desc    Obtener una lista de todos los usuarios del sistema.
 * @access  Solo Owner
 */
router.get('/users', async (req, res) => {
    try {
        const users = await db.query('SELECT id, name, role, web_username FROM users ORDER BY name');
        res.status(200).json(users.rows);
    } catch (error) {
        console.error('Error al obtener usuarios:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

/**
 * @route   PUT /api/admin/users/:userId/role
 * @desc    Actualizar el rol de un usuario específico.
 * @access  Solo Owner
 */
router.put('/users/:userId/role', async (req, res) => {
    try {
        const { userId } = req.params;
        const { role } = req.body;

        // Validación simple
        if (!role || !['owner', 'administrador', 'moderador', 'usuario'].includes(role)) {
            return res.status(400).json({ message: 'Rol no válido.' });
        }

        const result = await db.query('UPDATE users SET role = $1 WHERE id = $2 RETURNING id, name, role, web_username', [role, userId]);

        if (result.rows.length > 0) {
            res.status(200).json(result.rows[0]);
        } else {
            res.status(404).json({ message: 'Usuario no encontrado.' });
        }
    } catch (error) {
        console.error('Error al actualizar rol:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

module.exports = router;
