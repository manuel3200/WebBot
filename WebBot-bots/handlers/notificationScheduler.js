// handlers/notificationScheduler.js
const cron = require('node-cron');
const moment = require('moment-timezone');
const db = require('../utils/db');
const { escapeMarkdown } = require('../utils/helpers');

const ARGENTINA_TIMEZONE = 'America/Argentina/Cordoba';

async function checkAndSendExpiryNotices(telegramBot, whatsAppSock) {
    console.log(`[${moment().tz(ARGENTINA_TIMEZONE).format('HH:mm')}] Ejecutando tarea programada de notificaciones...`);

    try {
        const productsToNotify = await db.getProductsNearingExpiryDb();
        if (productsToNotify.length === 0) {
            console.log("No hay notificaciones de vencimiento para enviar hoy.");
            return;
        }

        console.log(`Se encontraron ${productsToNotify.length} productos para notificar.`);

        const noticesByReseller = {};
        for (const product of productsToNotify) {
            if (!noticesByReseller[product.owner_user_id]) {
                noticesByReseller[product.owner_user_id] = [];
            }
            noticesByReseller[product.owner_user_id].push(product);
        }

        for (const resellerId in noticesByReseller) {
            const products = noticesByReseller[resellerId];
            let resellerSummaryMessage = `🚨 *Resumen de Vencimientos Próximos* 🚨\n\n`;

            for (const product of products) {
                const daysUntilExpiry = moment(product.expiry_date).diff(moment().tz(ARGENTINA_TIMEZONE).startOf('day'), 'days');
                const expiryDateFormatted = moment(product.expiry_date).format('DD-MM-YYYY');
                
                // --- INICIO: LÓGICA DE NOTIFICACIÓN MULTICANAL PARA CLIENTES ---
                
                // 1. Buscar si el cliente es un usuario registrado en el bot
                const clientUser = await db.findUserByClientIdDb(product.client_id);

                // 2. Notificar al cliente por Telegram si es un usuario registrado
                if (clientUser && telegramBot) {
                    const clientTelegramMessage = `Hola *${escapeMarkdown(product.client_name)}* 👋\n\n` +
                                                  `Te recordamos que tu servicio *${escapeMarkdown(product.product_name)}* está a punto de vencer.\n\n` +
                                                  `🗓️ *Fecha de Vencimiento:* ${expiryDateFormatted}\n\n` +
                                                  `Por favor, contacta a tu proveedor para renovarlo.`;
                    try {
                        await telegramBot.sendMessage(clientUser.id, clientTelegramMessage, { parse_mode: 'Markdown' });
                        console.log(`Notificación enviada al cliente ${product.client_name} por Telegram (ID: ${clientUser.id}).`);
                    } catch (e) {
                        console.error(`Error al enviar Telegram al cliente ${product.client_name}:`, e.message);
                    }
                }

                // 3. Notificar al cliente por WhatsApp si tiene un número y el bot está conectado
                if (product.whatsapp && whatsAppSock) {
                    const clientWhatsAppMessage = `Hola *${escapeMarkdown(product.client_name)}* 👋\n\n` +
                                                  `Te recordamos que tu servicio *${escapeMarkdown(product.product_name)}* está a punto de vencer.\n\n` +
                                                  `🗓️ *Fecha de Vencimiento:* ${expiryDateFormatted}\n\n` +
                                                  `Por favor, contacta a tu proveedor para renovarlo.`;
                    try {
                        const clientJid = `${product.whatsapp.replace(/\D/g, '')}@s.whatsapp.net`;
                        await whatsAppSock.sendMessage(clientJid, { text: clientWhatsAppMessage });
                        console.log(`Notificación enviada al cliente ${product.client_name} por WhatsApp.`);
                    } catch (e) {
                        console.error(`Error al enviar WhatsApp al cliente ${product.client_name}:`, e.message);
                    }
                }
                // --- FIN: LÓGICA DE NOTIFICACIÓN MULTICANAL ---

                resellerSummaryMessage += `  - Cliente: *${escapeMarkdown(product.client_name)}*\n` +
                                          `    Producto: ${escapeMarkdown(product.product_name)}\n` +
                                          `    Vence en: *${daysUntilExpiry} día(s)*\n\n`;
                
                await db.markProductAsNotifiedDb(product.product_id);
            }
            
            // --- LÓGICA MEJORADA PARA NOTIFICAR AL RESELLER ---
            const resellerUser = await db.getUserByIdDb(resellerId);
            if (resellerUser) {
                if (telegramBot) {
                    try {
                        await telegramBot.sendMessage(resellerId, resellerSummaryMessage, { parse_mode: 'Markdown' });
                        console.log(`Resumen de ${products.length} vencimientos enviado al reseller ${resellerId} por Telegram.`);
                    } catch (e) {
                        console.error(`Error al enviar resumen al reseller ${resellerId} por Telegram:`, e.message);
                    }
                }
                if (whatsAppSock && resellerUser.whatsapp_id) {
                     try {
                        const resellerJid = `${resellerUser.whatsapp_id}@s.whatsapp.net`;
                        await whatsAppSock.sendMessage(resellerJid, { text: resellerSummaryMessage });
                        console.log(`Resumen de ${products.length} vencimientos enviado al reseller ${resellerId} por WhatsApp.`);
                    } catch (e) {
                        console.error(`Error al enviar resumen al reseller ${resellerId} por WhatsApp:`, e.message);
                    }
                }
            }
        }

    } catch (error) {
        console.error('Error crítico en checkAndSendExpiryNotices:', error);
    }
}

function startNotificationScheduler(telegramBot, whatsAppSock) {
    cron.schedule('0 9 * * *', () => {
        checkAndSendExpiryNotices(telegramBot, whatsAppSock);
    }, {
        timezone: ARGENTINA_TIMEZONE
    });
    console.log("⏰ Planificador de notificaciones configurado para ejecutarse a las 9:00 AM (Argentina).");
}

module.exports = {
    startNotificationScheduler,
    checkAndSendExpiryNotices 
};
