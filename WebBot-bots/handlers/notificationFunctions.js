// handlers/notificationFunctions.js (Versión Mejorada)

const moment = require('moment-timezone');
const db = require('../utils/db');
const { escapeMarkdown } = require('../utils/helpers');

const ARGENTINA_TIMEZONE = 'America/Argentina/Cordoba';

async function checkAndSendExpiryNotices(bot, isStartup = false) {
    console.log(`[${moment().tz(ARGENTINA_TIMEZONE).format('YYYY-MM-DD HH:mm:ss')}] Ejecutando verificación de avisos de vencimiento...`);
    const adminChatId = process.env.ADMIN_CHAT_ID;

    if (!adminChatId) {
        console.warn('ADVERTENCIA: ADMIN_CHAT_ID no está definido en .env. No se pueden enviar notificaciones.');
        return;
    }

    try {
        const productsToNotify = await db.getProductsNearingExpiryDb();

        if (productsToNotify.length > 0) {
            // Si hay productos por vencer, enviamos el resumen detallado
            let adminSummaryMessage = `🚨 *Resumen de Vencimientos Próximos* 🚨\n\n`;
            productsToNotify.forEach(product => {
                const daysUntilExpiry = moment(product.expiry_date).tz(ARGENTINA_TIMEZONE).startOf('day').diff(moment().tz(ARGENTINA_TIMEZONE).startOf('day'), 'days');
                let noticeType;

                if (daysUntilExpiry <= 0) {
                    noticeType = "Venció hoy o antes";
                } else if (daysUntilExpiry === 1) {
                    noticeType = "Vence mañana";
                } else {
                    noticeType = `Vence en ${daysUntilExpiry} días`;
                }

                adminSummaryMessage += `  - Cliente: *${escapeMarkdown(product.client_name)}*\n`;
                adminSummaryMessage += `    Producto: ${escapeMarkdown(product.product_name)}\n`;
                adminSummaryMessage += `    Aviso: *${noticeType}* (Vence el ${moment(product.expiry_date).format('DD-MM-YYYY')})\n\n`;
            });

            await bot.sendMessage(adminChatId, adminSummaryMessage, { parse_mode: 'Markdown' });
            console.log(`Resumen de ${productsToNotify.length} vencimientos enviado al chat de admin ${adminChatId}.`);

        } else {
            // Si NO hay productos por vencer, solo enviamos un mensaje si es el inicio del bot
            console.log('No hay productos próximos a vencer.');
            if (isStartup) {
                await bot.sendMessage(adminChatId, `✅ El sistema de notificaciones está activo. No hay vencimientos en los próximos 2 días.`);
            }
        }
    } catch (error) {
        console.error('Error en checkAndSendExpiryNotices:', error);
        // Opcional: notificar al admin sobre el error
        try {
            await bot.sendMessage(adminChatId, `⚠️ Hubo un error al procesar las notificaciones de vencimiento.`);
        } catch (sendError) {
            console.error('Fallo crítico al intentar notificar el error al admin.');
        }
    }
}

module.exports = {
    checkAndSendExpiryNotices
};