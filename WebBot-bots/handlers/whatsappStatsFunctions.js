// handlers/whatsappStatsFunctions.js

const db = require('../utils/db');
const { escapeMarkdown, userHasRole } = require('../utils/helpers');
const { ROLES } = require('../config/constants');
const moment = require('moment-timezone');

/**
 * Obtiene y envía las estadísticas formateadas para WhatsApp.
 * @param {object} sock - La instancia del socket de Baileys.
 * @param {string} sender - El JID del usuario que solicita las estadísticas.
 */
async function sendWhatsAppStats(sock, sender) {
    const whatsappId = sender.split('@')[0];

    try {
        // ¡CAMBIO CLAVE! Buscamos al usuario por su whatsapp_id
        const userRes = await db.query('SELECT * FROM users WHERE whatsapp_id = $1', [whatsappId]);
        const user = userRes.rows[0];

        if (!user) {
            await sock.sendMessage(sender, { text: "❌ Tu número de WhatsApp no está vinculado a ningún usuario del sistema. Pide a un administrador que use el comando /linkwhatsapp." });
            return;
        }

        // Ahora usamos el ID de Telegram del usuario encontrado para verificar roles
        if (!await userHasRole(user.id, [ROLES.OWNER, ROLES.ADMIN])) {
            await sock.sendMessage(sender, { text: "❌ No tienes permiso para ver las estadísticas." });
            return;
        }

        const isOwner = user.role === ROLES.OWNER;
        // Usamos el ID de Telegram del usuario para obtener las estadísticas correctas
        const stats = await db.getStatsDb(isOwner ? null : user.id);

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

        await sock.sendMessage(sender, { text: message });

    } catch (error) {
        console.error("Error al enviar stats de WhatsApp:", error);
        await sock.sendMessage(sender, { text: `Ocurrió un error al generar las estadísticas.` });
    }
}

module.exports = {
    sendWhatsAppStats
};
