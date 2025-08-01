// handlers/restoreFunctions.js
const db = require('../utils/db');
const { userHasRole, handleError } = require('../utils/helpers');

const restoreState = {};

async function startRestore(bot, chatId, userId) {
    if (!await userHasRole(userId, ['owner'])) {
        await bot.sendMessage(chatId, "❌ No tienes permiso para restaurar datos.");
        return;
    }
    restoreState[userId] = { step: 1 };
    await bot.sendMessage(chatId, "⚠️ **Estás a punto de iniciar un proceso de restauración.**\n\nPor favor, envíame ahora el archivo de backup `.json`.", { parse_mode: 'Markdown' });
}

async function handleRestoreFile(bot, msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!restoreState[userId] || restoreState[userId].step !== 1) return;

    if (!msg.document || msg.document.mime_type !== 'application/json') {
        await bot.sendMessage(chatId, "Por favor, envía un archivo con formato `.json`.");
        return;
    }

    try {
        const fileId = msg.document.file_id;
        const fileContent = await bot.getFileStream(fileId);
        let data = '';
        for await (const chunk of fileContent) {
            data += chunk;
        }

        const backupClients = JSON.parse(data);

        if (!Array.isArray(backupClients)) {
            await bot.sendMessage(chatId, "El archivo JSON no tiene el formato correcto (debe ser un array de clientes).");
            delete restoreState[userId];
            return;
        }

        const existingClients = await db.getAllClientsDb(userId);
        const existingClientIds = new Set(existingClients.map(c => c.id));

        const clientsToCreate = backupClients.filter(c => !existingClientIds.has(c.id));
        const clientsToIgnore = backupClients.length - clientsToCreate.length;

        if (clientsToCreate.length === 0) {
            await bot.sendMessage(chatId, "Análisis completo: No se encontraron clientes nuevos para añadir. Todos los clientes del archivo ya existen en la base de datos.");
            delete restoreState[userId];
            return;
        }

        restoreState[userId].clientsToCreate = clientsToCreate;
        restoreState[userId].step = 2; // Esperando confirmación

        let summary = `*Análisis del Backup Completo*\n\n`;
        summary += `Clientes nuevos a crear: *${clientsToCreate.length}*\n`;
        summary += `Clientes ignorados (ya existentes): *${clientsToIgnore}*\n\n`;
        summary += `⚠️ **Esta acción es irreversible.**\n¿Confirmas que deseas proceder con la restauración?`;

        const keyboard = {
            inline_keyboard: [[
                { text: '✅ Sí, restaurar', callback_data: 'restore_confirm' },
                { text: '❌ Cancelar', callback_data: 'restore_cancel' }
            ]]
        };
        await bot.sendMessage(chatId, summary, { parse_mode: 'Markdown', reply_markup: keyboard });

    } catch (error) {
        await bot.sendMessage(chatId, "Hubo un error al leer o procesar el archivo. Asegúrate de que sea un JSON válido.");
        console.error(error);
        delete restoreState[userId];
    }
}

async function handleRestoreConfirmation(bot, callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;

    if (!restoreState[userId] || restoreState[userId].step !== 2) {
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: callbackQuery.message.message_id });

    if (data === 'restore_cancel') {
        await bot.sendMessage(chatId, "Restauración cancelada.");
        delete restoreState[userId];
        return;
    }

    if (data === 'restore_confirm') {
        try {
            const clientsToCreate = restoreState[userId].clientsToCreate;
            await bot.sendMessage(chatId, `⏳ Restaurando ${clientsToCreate.length} clientes... Esto puede tardar un momento.`);

            const insertedCount = await db.restoreClientsFromBackupDb(clientsToCreate, userId);

            await bot.sendMessage(chatId, `✅ **Restauración completada!**\nSe añadieron *${insertedCount}* clientes nuevos a la base de datos.`);
        } catch (error) {
            await handleError(error, bot, chatId);
        } finally {
            delete restoreState[userId];
        }
    }
}

module.exports = {
    restoreState,
    startRestore,
    handleRestoreFile,
    handleRestoreConfirmation
};