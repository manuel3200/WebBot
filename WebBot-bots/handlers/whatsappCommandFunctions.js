// handlers/whatsappCommandFunctions.js

const db = require('../utils/db');
const { escapeMarkdown, delay } = require('../utils/helpers');
const { CONTACT_INFO, ADMIN_USER_IDS } = require('../config/botConfig');
const { ROLES } = require('../config/constants');
const moment = require('moment-timezone');

/**
 * Maneja el comando /start, registrando nuevos usuarios y mostrando un mensaje de bienvenida inteligente.
 */
async function handleStart(sock, msg) {
    const sender = msg.key.remoteJid;
    const whatsappId = sender.split('@')[0];
    const userName = msg.pushName || `Usuario ${whatsappId.slice(-4)}`;

    try {
        await sock.sendPresenceUpdate('composing', sender);
        await delay(Math.random() * 1500 + 800);

        let user = await db.findUserByWhatsappIdDb(whatsappId);

        if (!user) {
            console.log(`Nuevo usuario de WhatsApp detectado: ${whatsappId}`);
            const isAdmin = ADMIN_USER_IDS.includes(parseInt(whatsappId, 10));
            const newUser = {
                id: whatsappId,
                name: userName,
                authorizationDate: moment().format('YYYY-MM-DD'),
                role: isAdmin ? ROLES.OWNER : ROLES.USER,
                client_id: null,
                whatsapp_id: whatsappId,
                authorization_end_date: isAdmin ? '9999-12-31' : null
            };
            await db.upsertUserDb(newUser);
            user = newUser;
            console.log(`Usuario ${whatsappId} creado con rol: ${user.role}`);
        }

        let dbStatus = '🔴 Desconectado';
        try {
            await db.query('SELECT 1');
            dbStatus = '✅ Conectado';
        } catch (e) {
            // El estado se mantiene como desconectado
        }

        const totalUsersInDb = (await db.query('SELECT COUNT(*) FROM users')).rows[0].count;
        const now = moment().tz('America/Argentina/Cordoba');

        let licenseInfo = `🔥 ROL: *${escapeMarkdown(user.role.toUpperCase())}* 🔥\n`;
        if (user.authorization_end_date) {
            const endDate = moment(user.authorization_end_date);
            if (endDate.year() > 9000) {
                licenseInfo += `✩ LICENCIA VITALICIA ⌚️\n`;
            } else {
                const duration = moment.duration(endDate.diff(now));
                const years = duration.years();
                const months = duration.months();
                const days = duration.days();
                let durationString = '';
                if (years > 0) durationString += `${years} año(s) `;
                if (months > 0) durationString += `${months} mes(es) `;
                if (days >= 0) durationString += `${days} día(s) `;
                licenseInfo += `🔥 TIENE ACCESO POR ${durationString.trim()} 🔥\n` +
                               `✩ AUTORIZACIÓN VÁLIDA HASTA: ${endDate.format('DD-MM-YYYY')} ⌚️\n`;
            }
        }

        const welcomeMessage =
          `✨ BIENVENIDO A ClientesT1Bot ✨\n` +
          `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n` +
          `${licenseInfo}` +
          `🗃️ ESTADO DB: *${dbStatus}*\n` +
          `| 📅 FECHA: ${now.format('DD-MM-YYYY')} - | - ⏰ HORA: ${now.format('HH:mm:ss')}\n` +
          `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n` +
          `RESELLER ACTUAL: ${user.name ? escapeMarkdown(user.name) : 'No definido'}\n` +
          `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n` +
          `MENU DEL BOT▬▬▬▬▬▬▬▬► /menu\n` +
          `INSTRUCCIONES DEL BOT▬▬► /info\n` +
          `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n` +
          `TOTAL DE USUARIOS (${totalUsersInDb}) ✨\n` +
          `Inconvenientes con el Bot Contactame : ${CONTACT_INFO.PHONE} 📲`;

        await sock.sendMessage(sender, { text: welcomeMessage });

    } catch (error) {
        console.error("Error en handleStart de WhatsApp:", error);
        await sock.sendMessage(sender, { text: "Ocurrió un error al iniciar el bot." });
    }
}

// ... (El resto de las funciones se mantienen igual)
async function handlePresente(sock, sender, clientId) {
    const whatsappId = sender.split('@')[0];
    try {
        await sock.sendPresenceUpdate('composing', sender);
        await delay(Math.random() * 1000 + 500);

        const client = await db.findClientGeneralInfoDb(clientId);
        if (!client) {
            return sock.sendMessage(sender, { text: `Lo siento, no se encontró ningún servicio con el ID \`${escapeMarkdown(clientId)}\`. Verifica que sea correcto.` });
        }
        let user = await db.findUserByWhatsappIdDb(whatsappId);
        if (!user) {
            user = {
                id: whatsappId, name: `Usuario ${whatsappId.slice(-4)}`, role: ROLES.USER,
                client_id: clientId, whatsapp_id: whatsappId,
                authorizationDate: moment().format('YYYY-MM-DD'),
                authorization_end_date: null
            };
            await db.upsertUserDb(user);
        } else {
            await db.query('UPDATE users SET client_id = $1 WHERE whatsapp_id = $2', [clientId, whatsappId]);
        }
        await sock.sendMessage(sender, { text: `¡Gracias! Tu número ha sido vinculado con el cliente *${escapeMarkdown(client.name)}*.\n\nAhora puedes usar el comando /misproductos para ver tus servicios.` });
    } catch (error) {
        console.error("Error en handlePresente:", error);
        await sock.sendMessage(sender, { text: "Ocurrió un error al intentar vincular tu cuenta." });
    }
}

async function handleMisProductos(sock, sender) {
    const whatsappId = sender.split('@')[0];
    try {
        await sock.sendPresenceUpdate('composing', sender);
        await delay(Math.random() * 1200 + 600);

        const user = await db.findUserByWhatsappIdDb(whatsappId);
        if (!user || !user.client_id) {
            return sock.sendMessage(sender, { text: `Tu número no está vinculado a ningún cliente. Usa el comando \`/presente [ID_Cliente]\` que te proporcionó tu vendedor.` });
        }
        const products = await db.getClientProductsDb(user.client_id);
        if (products.length === 0) {
            return sock.sendMessage(sender, { text: "No tienes productos o servicios registrados en este momento." });
        }
        let responseMessage = `*Tus Servicios Contratados:*\n\n`;
        products.forEach(product => {
            responseMessage += `*Producto:* ${escapeMarkdown(product.product_name)}\n` +
                               `  - *Estado:* ${escapeMarkdown(product.status)}\n` +
                               `  - *Vencimiento:* ${moment(product.expiry_date).format('DD-MM-YYYY')}\n\n`;
        });
        await sock.sendMessage(sender, { text: responseMessage });
    } catch (error) {
        console.error("Error en handleMisProductos:", error);
        await sock.sendMessage(sender, { text: "Ocurrió un error al consultar tus productos." });
    }
}

async function handleSetNombre(sock, sender, newName) {
    const whatsappId = sender.split('@')[0];
    const trimmedName = newName.trim();
    if (!trimmedName) {
        await sock.sendPresenceUpdate('composing', sender);
        await delay(500);
        await sock.sendMessage(sender, { text: `Por favor, proporciona un nombre válido. Ejemplo: \`/mimbre Juan\`` });
        return;
    }
    try {
        await sock.sendPresenceUpdate('composing', sender);
        await delay(Math.random() * 800 + 400);

        const user = await db.findUserByWhatsappIdDb(whatsappId);
        if (!user) {
            return sock.sendMessage(sender, { text: `Tu número no está registrado en el sistema. Usa /start primero.` });
        }
        await db.query('UPDATE users SET name = $1 WHERE id = $2', [trimmedName, user.id]);
        await sock.sendMessage(sender, { text: `¡Tu nombre ha sido actualizado a *${escapeMarkdown(trimmedName)}*!` });
    } catch (error) {
        console.error("Error en handleSetNombre para WhatsApp:", error);
        await sock.sendMessage(sender, { text: `Ocurrió un error al actualizar tu nombre.` });
    }
}

async function sendInfo(sock, sender) {
    await sock.sendPresenceUpdate('composing', sender);
    await delay(1000);
    const infoMessage = `Aquí tienes un resumen de los comandos disponibles.\n\n` +
                        `*/menu* - Muestra el menú principal de opciones.\n` +
                        `*/mimbre [nombre]* - Cambia tu nombre en el bot.\n` +
                        `*/listclients [página]* - Lista tus clientes.\n` +
                        `*/client [ID o nombre]* - Muestra los detalles de un cliente.\n` +
                        `*/cancel* - Cancela cualquier operación en curso.`;
    
    await sock.sendMessage(sender, { text: infoMessage });

    await sock.sendPresenceUpdate('composing', sender);
    await delay(1500);
    const footerMessage = `*Contacto y Soporte:*\n` +
                         `💬 WhatsApp: https://wa.me/${CONTACT_INFO.PHONE.replace('+', '')}\n` +
                         `✈️ Telegram: https://t.me/${CONTACT_INFO.TELEGRAM_USER}\n` +
                         `ℹ️ Más Info: ${CONTACT_INFO.HUB_LINK}`;
    
    await sock.sendMessage(sender, { text: footerMessage });
}

module.exports = {
    handleStart,
    handleSetNombre,
    sendInfo,
    handlePresente,
    handleMisProductos
};
