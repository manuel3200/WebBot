// handlers/whatsappBackupFunctions.js

const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const db = require('../utils/db');
const { userHasRole } = require('../utils/helpers');
const { ROLES } = require('../config/constants');
// --- IMPORTANTE: Añadimos la nueva función para descargar ---
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const activeFlows = new Map(); // Flujos específicos para este módulo

/**
 * Inicia el proceso de backup.
 */
async function sendClientBackup(sock, sender) {
    const whatsappId = sender.split('@')[0];
    try {
        const userRes = await db.query('SELECT * FROM users WHERE whatsapp_id = $1', [whatsappId]);
        const user = userRes.rows[0];

        if (!user || !await userHasRole(user.id, [ROLES.OWNER])) {
            return sock.sendMessage(sender, { text: "❌ No tienes permiso para realizar esta acción." });
        }

        await sock.sendMessage(sender, { text: "⏳ Generando backup de clientes... por favor espera." });

        const backupData = await db.getFullClientBackupDb(user.id);
        const jsonContent = JSON.stringify(backupData, null, 2);

        const fileName = `backup-clientes-${moment().format('YYYY-MM-DD_HH-mm')}.json`;
        const tempFilePath = path.join(__dirname, '..', fileName);
        fs.writeFileSync(tempFilePath, jsonContent, 'utf8');

        await sock.sendMessage(sender, {
            document: fs.readFileSync(tempFilePath), // Cambiado a readFileSync para mayor estabilidad
            mimetype: 'application/json',
            fileName: fileName
        });

        fs.unlinkSync(tempFilePath);

    } catch (error) {
        console.error("Error en sendClientBackup:", error);
        sock.sendMessage(sender, { text: "Ocurrió un error al generar el backup." });
    }
}

/**
 * Inicia el flujo de restauración.
 */
async function startRestore(sock, sender) {
    const whatsappId = sender.split('@')[0];
    try {
        const userRes = await db.query('SELECT * FROM users WHERE whatsapp_id = $1', [whatsappId]);
        const user = userRes.rows[0];

        if (!user || !await userHasRole(user.id, [ROLES.OWNER])) {
            return sock.sendMessage(sender, { text: "❌ No tienes permiso para restaurar datos." });
        }

        activeFlows.set(sender, { name: 'restore', step: 'AWAIT_FILE' });
        await sock.sendMessage(sender, { text: "⚠️ *Estás a punto de iniciar un proceso de restauración.*\n\nPor favor, envíame ahora el archivo de backup `.json`." });
    } catch (error) {
        console.error("Error en startRestore:", error);
        sock.sendMessage(sender, { text: "Ocurrió un error al iniciar el proceso." });
    }
}

/**
 * Maneja la recepción del archivo de backup.
 */
async function handleRestoreFile(sock, msg) {
    const sender = msg.key.remoteJid;
    const currentState = activeFlows.get(sender);
    if (!currentState || currentState.name !== 'restore' || currentState.step !== 'AWAIT_FILE') return;

    const messageContent = msg.message;
    const doc = messageContent.documentMessage;

    if (!doc || doc.mimetype !== 'application/json') {
        return sock.sendMessage(sender, { text: "Por favor, envía un archivo con formato `.json`." });
    }

    try {
        // --- CAMBIO CLAVE: Usamos el método de descarga correcto ---
        const stream = await downloadContentFromMessage(doc, 'document');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        const backupClients = JSON.parse(buffer.toString('utf8'));
        // ---------------------------------------------------------

        if (!Array.isArray(backupClients)) {
            await sock.sendMessage(sender, { text: "El archivo JSON no tiene el formato correcto. Operación cancelada." });
            return activeFlows.delete(sender);
        }

        const userRes = await db.query('SELECT * FROM users WHERE whatsapp_id = $1', [sender.split('@')[0]]);
        const user = userRes.rows[0];
        const existingClients = await db.getAllClientsDb({}, user.id);
        const existingClientIds = new Set(existingClients.map(c => c.id));

        const clientsToCreate = backupClients.filter(c => !existingClientIds.has(c.id));
        const clientsToIgnore = backupClients.length - clientsToCreate.length;

        if (clientsToCreate.length === 0) {
            await sock.sendMessage(sender, { text: "Análisis completo: No se encontraron clientes nuevos para añadir. Todos los clientes del archivo ya existen." });
            return activeFlows.delete(sender);
        }

        currentState.clientsToCreate = clientsToCreate;
        currentState.step = 'AWAIT_CONFIRMATION';

        let summary = `*Análisis del Backup Completo*\n\n` +
                      `Clientes nuevos a crear: *${clientsToCreate.length}*\n` +
                      `Clientes ignorados (ya existentes): *${clientsToIgnore}*\n\n` +
                      `⚠️ *Esta acción es irreversible.*\n¿Confirmas que deseas proceder? Responde *SI*.`;
        
        await sock.sendMessage(sender, { text: summary });

    } catch (error) {
        console.error("Error procesando archivo de restore:", error);
        await sock.sendMessage(sender, { text: "Hubo un error al leer el archivo. Asegúrate de que sea un JSON válido." });
        activeFlows.delete(sender);
    }
}

/**
 * Maneja la confirmación final de la restauración.
 */
async function handleRestoreConfirmation(sock, msg) {
    const sender = msg.key.remoteJid;
    const currentState = activeFlows.get(sender);
    const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();

    if (!currentState || currentState.name !== 'restore' || currentState.step !== 'AWAIT_CONFIRMATION') return;

    if (text.toLowerCase() === 'si') {
        try {
            const userRes = await db.query('SELECT * FROM users WHERE whatsapp_id = $1', [sender.split('@')[0]]);
            const user = userRes.rows[0];
            const insertedCount = await db.restoreClientsFromBackupDb(currentState.clientsToCreate, user.id);
            await sock.sendMessage(sender, { text: `✅ *Restauración completada!*\nSe añadieron *${insertedCount}* clientes nuevos.` });
        } catch (error) {
            console.error("Error en la transacción de restauración:", error);
            await sock.sendMessage(sender, { text: "Hubo un error crítico durante la restauración. Los cambios han sido revertidos." });
        }
    } else {
        await sock.sendMessage(sender, { text: "Confirmación no válida. Operación cancelada." });
    }
    activeFlows.delete(sender);
}


module.exports = {
    sendClientBackup,
    startRestore,
    handleRestoreFile,
    handleRestoreConfirmation,
    backupRestoreFlows: activeFlows
};
