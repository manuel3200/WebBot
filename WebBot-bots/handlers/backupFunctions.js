// handlers/backupFunctions.js
// Contiene la lógica para generar y enviar backups.

const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const db = require('../utils/db');
const { userHasRole, handleError } = require('../utils/helpers');

/**
 * Genera un backup de los clientes en formato JSON y lo envía al chat.
 * @param {object} bot - La instancia del bot.
 * @param {number} chatId - El ID del chat.
 * @param {number} userId - El ID del usuario que solicita el backup.
 */
async function sendClientBackup(bot, chatId, userId) {
    // Esta acción es sensible, solo el OWNER puede ejecutarla.
    if (!await userHasRole(userId, ['owner'])) {
        await bot.sendMessage(chatId, "❌ No tienes permiso para realizar esta acción.");
        return;
    }

    let tempFilePath = '';

    try {
        await bot.sendMessage(chatId, "⏳ Generando backup de clientes... por favor espera.");

        // 1. Obtener los datos de la base de datos
        const backupData = await db.getFullClientBackupDb(userId); // Pasamos el userId para backups por dueño
        const jsonContent = JSON.stringify(backupData, null, 2);

        // 2. Crear un archivo temporal
        const fileName = `backup-clientes-${moment().format('YYYY-MM-DD_HH-mm')}.json`;
        tempFilePath = path.join(__dirname, '..', fileName); // Lo crea en la carpeta raíz del proyecto
        fs.writeFileSync(tempFilePath, jsonContent, 'utf8');

        // 3. Enviar el archivo al usuario
        await bot.sendDocument(chatId, tempFilePath);

    } catch (error) {
        await handleError(error, bot, chatId);
    } finally {
        // 4. Borrar el archivo temporal, incluso si hubo un error
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
    }
}

module.exports = {
    sendClientBackup
};