// WebBot/backend/routes/stats.js
const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { verifyToken } = require('../middleware/authMiddleware');

router.use(verifyToken);

router.get('/', async (req, res) => {
    try {
        const ownerUserId = req.user.role === 'owner' ? null : req.user.id;
        const stats = await db.getStatsDb(ownerUserId);
        res.status(200).json(stats);
    } catch (error) {
        console.error('Error al obtener estadísticas:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

module.exports = router;
