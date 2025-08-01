// WebBot/backend/routes/products.js
const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { verifyToken } = require('../middleware/authMiddleware');
const moment = require('moment');
const { encrypt, decrypt } = require('../utils/helpers');
const { PRODUCT_STATUS } = require('../config/constants');

router.use(verifyToken);

// ... (POST /, DELETE /:productId, GET /:productId, PUT /:productId que ya tenías) ...
router.post('/', async (req, res) => {
    try {
        const { client_id, product_name, duration_days, service_username, service_password, product_notes } = req.body;
        const ownerUserId = req.user.id;
        if (!client_id || !product_name || !duration_days) {
            return res.status(400).json({ message: 'El ID del cliente, nombre del producto y duración son obligatorios.' });
        }
        const duration = parseInt(duration_days, 10);
        if (isNaN(duration) || duration <= 0) {
            return res.status(400).json({ message: 'La duración debe ser un número positivo.' });
        }
        const client = await db.findClientGeneralInfoDb(client_id, req.user.role === 'owner' ? null : ownerUserId);
        if (!client) {
            return res.status(404).json({ message: 'Cliente no encontrado o no tienes permiso sobre él.' });
        }
        const expiryDate = moment().add(duration, 'days');
        const newProductData = {
            client_id,
            product_name,
            contract_date: moment().format('YYYY-MM-DD'),
            expiry_date: expiryDate.format('YYYY-MM-DD'),
            notice_date: expiryDate.clone().subtract(2, 'days').format('YYYY-MM-DD'),
            status: 'Activa',
            product_notes: product_notes || null,
            service_username: service_username || null,
            service_password: encrypt(service_password || null)
        };
        const addedProduct = await db.addClientProductDb(newProductData, ownerUserId);
        res.status(201).json(addedProduct);
    } catch (error) {
        console.error('Error al crear el producto:', error);
        res.status(500).json({ message: 'Error interno del servidor al crear el producto.' });
    }
});
router.delete('/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        const ownerUserId = req.user.role === 'owner' ? null : req.user.id;
        const deleted = await db.deleteClientProductDb(productId, ownerUserId);
        if (deleted) {
            res.status(200).json({ message: 'Producto eliminado exitosamente.' });
        } else {
            res.status(404).json({ message: 'Producto no encontrado o no tienes permiso para eliminarlo.' });
        }
    } catch (error) {
        console.error('Error al eliminar el producto:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});
router.get('/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        const ownerUserId = req.user.role === 'owner' ? null : req.user.id;
        const product = await db.findClientProductByIdDb(productId, ownerUserId);
        if (!product) {
            return res.status(404).json({ message: 'Producto no encontrado o sin permisos.' });
        }
        product.service_password = decrypt(product.service_password);
        res.status(200).json(product);
    } catch (error) {
        console.error('Error al obtener el producto:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});
router.put('/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        const ownerUserId = req.user.role === 'owner' ? null : req.user.id;
        const changedByUserId = req.user.id; // ID del usuario que edita
        const dataToUpdate = req.body;
        if (dataToUpdate.service_password) {
            dataToUpdate.service_password = encrypt(dataToUpdate.service_password);
        }
        // Ahora pasamos changedByUserId como cuarto argumento
        const updatedProduct = await db.updateFullClientProductDb(productId, dataToUpdate, ownerUserId, changedByUserId);
        if (updatedProduct) {
            res.status(200).json(updatedProduct);
        } else {
            res.status(404).json({ message: 'Producto no encontrado o sin permisos para actualizar.' });
        }
    } catch (error) {
        console.error('Error al actualizar el producto:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});


// =================================================================
// ========= AÑADE ESTA NUEVA RUTA AQUÍ =========
// =================================================================
/**
 * @route   POST /api/products/:productId/renew
 * @desc    Renovar un producto, extendiendo su fecha de vencimiento.
 * @access  Privado
 */
router.post('/:productId/renew', async (req, res) => {
    try {
        const { productId } = req.params;
        const { duration_days } = req.body;
        const ownerUserId = req.user.role === 'owner' ? null : req.user.id;

        if (!duration_days || parseInt(duration_days, 10) <= 0) {
            return res.status(400).json({ message: 'La duración debe ser un número positivo.' });
        }

        const product = await db.findClientProductByIdDb(productId, ownerUserId);
        if (!product) {
            return res.status(404).json({ message: 'Producto no encontrado o sin permisos.' });
        }

        // Si el producto estaba vencido, renovamos desde hoy. Si no, desde su fecha de vencimiento.
        const baseDate = moment().isAfter(product.expiry_date) ? moment() : moment(product.expiry_date);
        const newExpiryDate = baseDate.add(parseInt(duration_days, 10), 'days');

        const dataToUpdate = {
            expiry_date: newExpiryDate.format('YYYY-MM-DD'),
            notice_date: newExpiryDate.clone().subtract(2, 'days').format('YYYY-MM-DD'),
            status: PRODUCT_STATUS.ACTIVE // Lo reactivamos
        };

        const renewedProduct = await db.updateFullClientProductDb(productId, dataToUpdate, ownerUserId);
        res.status(200).json(renewedProduct);

    } catch (error) {
        console.error('Error al renovar el producto:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

// Historial de cambios de producto
router.get('/:productId/history', async (req, res) => {
    try {
        const { productId } = req.params;
        const ownerUserId = req.user.role === 'owner' ? null : req.user.id;

        // Opcional: primero verifica que el usuario tenga acceso al producto
        const product = await db.findClientProductByIdDb(productId, ownerUserId);
        if (!product) {
            return res.status(404).json({ message: 'Producto no encontrado o sin permisos.' });
        }

        // Ahora trae el historial
        const history = await db.getProductChangeHistory(productId);

        res.status(200).json(history);
    } catch (error) {
        console.error('Error al obtener el historial del producto:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

module.exports = router;
