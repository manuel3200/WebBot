// WebBot/backend/routes/clients.js
const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { v4: uuidv4 } = require('uuid');
const { verifyToken } = require('../middleware/authMiddleware');
const { formatWhatsAppNumber } = require('../utils/helpers'); // <-- ¡Línea de importación clave!

router.use(verifyToken);

/**
 * @route   GET /api/clients
 * @desc    Obtener una lista PAGINADA de clientes con filtros.
 * @access  Privado
 */
router.get('/', async (req, res) => {
    try {
        const ownerUserId = req.user.role === 'owner' ? null : req.user.id;
        const page = parseInt(req.query.page || '1', 10);
        const limit = 15; // Mostramos 15 clientes por página

        // 1. Obtenemos los clientes para la página actual
        const clients = await db.getAllClientsDb(req.query, ownerUserId, page, limit);
        
        // 2. Obtenemos el conteo total de clientes que coinciden con los filtros
        const totalClients = await db.countClientsDb(req.query, ownerUserId);
        
        // 3. Calculamos el total de páginas
        const totalPages = Math.ceil(totalClients / limit);

        // 4. Enviamos una respuesta estructurada al frontend
        res.status(200).json({
            clients,
            totalPages,
            currentPage: page
        });

    } catch (error) {
        console.error('Error al obtener clientes:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const ownerUserId = req.user.role === 'owner' ? null : req.user.id;
        const client = await db.findClientGeneralInfoDb(id, ownerUserId);
        if (client) {
            res.status(200).json(client);
        } else {
            res.status(404).json({ message: 'Cliente no encontrado o no tienes permiso para verlo.' });
        }
    } catch (error) {
        console.error('Error al obtener detalle del cliente:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

router.get('/:id/products', async (req, res) => {
    try {
        const { id } = req.params;
        const ownerUserId = req.user.role === 'owner' ? null : req.user.id;
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 15;

        const client = await db.findClientGeneralInfoDb(id, ownerUserId);
        if (!client) {
            return res.status(404).json({ message: 'Cliente no encontrado o no tienes permiso para verlo.' });
        }

        // Cambia aquí: ahora pasamos page y limit a la función
        const { products, totalPages, currentPage } = await db.getClientProductsDb(id, ownerUserId, page, limit);

        res.status(200).json({ products, totalPages, currentPage });
    } catch (error) {
        console.error('Error al obtener productos del cliente:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

// --- Ruta POST para CREAR ---
router.post('/', async (req, res) => {
    try {
        const { name, whatsapp, email, general_notes } = req.body;
        const ownerUserId = req.user.id;

        if (!name) {
            return res.status(400).json({ message: 'El campo "name" es obligatorio.' });
        }

        const newClientData = {
            id: `clt_${uuidv4().split('-')[0]}`,
            name,
            whatsapp: formatWhatsAppNumber(whatsapp),
            email: email || null,
            generalNotes: general_notes || null
        };
        
        const clientAdded = await db.addClientGeneralInfoDb(newClientData, ownerUserId);
        res.status(201).json(clientAdded);

    } catch (error) {
        console.error('Error al crear cliente:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

// --- Ruta PUT para ACTUALIZAR ---
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const ownerUserId = req.user.role === 'owner' ? null : req.user.id;
        const clientDataToUpdate = req.body;

        if (clientDataToUpdate.whatsapp !== undefined) { // Verificamos si el campo whatsapp fue enviado
            clientDataToUpdate.whatsapp = formatWhatsAppNumber(clientDataToUpdate.whatsapp);
        }

        const updatedClient = await db.updateFullClientGeneralInfoDb(id, clientDataToUpdate, ownerUserId);

        if (updatedClient) {
            res.status(200).json(updatedClient);
        } else {
            res.status(404).json({ message: 'Cliente no encontrado o no tienes permiso para editarlo.' });
        }
    } catch (error) {
        console.error('Error al actualizar cliente:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

// --- Ruta DELETE para ELIMINAR ---
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const ownerUserId = req.user.role === 'owner' ? null : req.user.id;
        const deleted = await db.deleteClientDb(id, ownerUserId);
        if (deleted) {
            res.status(200).json({ message: 'Cliente eliminado exitosamente.' });
        } else {
            res.status(404).json({ message: 'Cliente no encontrado o no tienes permiso para eliminarlo.' });
        }
    } catch (error) {
        console.error('Error al eliminar cliente:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});


module.exports = router;
