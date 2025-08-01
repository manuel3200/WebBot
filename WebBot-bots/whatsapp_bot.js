// whatsapp_bot.js

require('dotenv').config();

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const { setupWhatsAppEventHandlers } = require('./handlers/whatsappEventHandlers');
const { startNotificationScheduler, checkAndSendExpiryNotices } = require('./handlers/notificationScheduler');

// --- NUEVO: Notificador de Telegram para el QR ---
const TelegramBot = require('node-telegram-bot-api');
const token = process.env.TELEGRAM_BOT_TOKEN;
const adminChatId = process.env.ADMIN_CHAT_ID;
// No necesitamos polling, solo la capacidad de enviar mensajes.
const telegramNotifier = new TelegramBot(token);
// ---------------------------------------------

let initialNotificationsSent = false;

async function connectToWhatsApp() {
    
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const sock = makeWASocket({ auth: state, defaultQueryTimeoutMs: undefined });

    startNotificationScheduler(null, sock);
    setupWhatsAppEventHandlers(sock);

    // --- LÓGICA DE CONEXIÓN ACTUALIZADA ---
    sock.ev.on('connection.update', async (update) => { // La función ahora es async
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log("QR Code recibido. Enviando al administrador por Telegram...");
            
            // Usamos un servicio online para convertir el texto del QR en una imagen
            const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qr)}`;
            
            try {
                // Enviamos la imagen del QR a tu chat de admin en Telegram
                await telegramNotifier.sendPhoto(adminChatId, qrImageUrl, { 
                    caption: 'Escanea este código QR con WhatsApp para vincular el bot.\n\nEl código también se mostrará en la terminal si estás en modo local.' 
                });
                console.log("QR enviado a Telegram exitosamente.");
            } catch (error) {
                console.error("Error al enviar el QR por Telegram. Asegúrate de que el bot de Telegram esté configurado y que ADMIN_CHAT_ID sea correcto.", error.message);
                // Si falla el envío de la imagen, enviamos el texto plano como fallback
                await telegramNotifier.sendMessage(adminChatId, `No se pudo generar la imagen del QR. Por favor, copia el siguiente texto y pégalo en un generador de QR online:\n\n${qr}`);
            }
            
            // Mantenemos la funcionalidad de mostrar en terminal para desarrollo local
            qrcode.generate(qr, { small: true }); 
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('✅ ¡Conexión con WhatsApp abierta y exitosa!');
            
            if (!initialNotificationsSent) {
                console.log("Conexión establecida. Ejecutando verificación de notificaciones al inicio...");
                checkAndSendExpiryNotices(null, sock);
                initialNotificationsSent = true;
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

connectToWhatsApp();
