// handlers/statsFunctions.js
// Contiene la lógica para el comando de estadísticas.

const db = require('../utils/db');
const { getPersonalizedGreeting, escapeMarkdown, userHasRole } = require('../utils/helpers');
const moment = require('moment-timezone');
// --- LÍNEA AÑADIDA ---
const { dataStore } = require('../data/dataHandlers');

/**
 * Obtiene y muestra las estadísticas para el usuario.
 * @param {object} bot - La instancia del bot.
 * @param {number} chatId - El ID del chat.
 * @param {number} userId - El ID del usuario que solicita las estadísticas.
 */
async function sendStats(bot, chatId, userId) {
    // La comprobación de permisos ahora funcionará correctamente
    if (!await userHasRole(userId, ['owner', 'administrador'])) {
        await bot.sendMessage(chatId, `${getPersonalizedGreeting(userId, dataStore.userNames)} No tienes permiso para ver las estadísticas.`);
        return;
    }

    try {
        const user = await db.getUserByIdDb(userId);
        const isOwner = user?.role === 'owner';

        const stats = await db.getStatsDb(isOwner ? null : userId);

        let message = `📊 *Estadísticas del Bot*\n\n`;
        message += `👥 *Total de Clientes:* ${stats.totalClients}\n`;
        message += `✅ *Productos Activos:* ${stats.activeProducts}\n\n`;
        message += `🗓️ *Próximos Vencimientos (7 días):*\n`;

        if (stats.upcomingExpiries.length > 0) {
            stats.upcomingExpiries.forEach(item => {
                const expiry = moment(item.expiry_date).format('DD-MM-YYYY');
                message += `  - *${escapeMarkdown(item.client_name)}* (${escapeMarkdown(item.product_name)}) vence el *${expiry}*\n`;
            });
        } else {
            message += `  - _No hay productos que venzan en los próximos 7 días._\n`;
        }

        await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

    } catch (error) {
        // Usamos nuestro manejador de errores centralizado
        const { handleError } = require('../utils/helpers');
        await handleError(error, bot, chatId);
    }
}

module.exports = {
    sendStats
};