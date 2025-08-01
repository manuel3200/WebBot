// handlers/commandFunctions.js
// Contiene la lógica para comandos generales del bot.

const moment = require('moment-timezone');
const { dataStore, saveUserData } = require('../data/dataHandlers'); 
const { getPersonalizedGreeting, escapeMarkdown } = require('../utils/helpers');
const { CONTACT_INFO } = require('../config/botConfig');
const db = require('../utils/db');

// --- Funciones de Comandos ---

async function sendInfo(bot, chatId, userId) {
    const infoMessage =
`${getPersonalizedGreeting(userId, dataStore.userNames)} Aquí tienes un resumen de los comandos disponibles.

*Comandos Generales*
\`/start\` - Inicia el bot y muestra tu estado.
\`/menu\` - Muestra el menú principal de botones.
\`/info\` - Muestra este mensaje de ayuda.
\`/mimbre [nombre]\` - Cambia tu nombre en el bot.

*Gestión de Clientes y Productos*
\`/addclient\` - Inicia el flujo para añadir un nuevo cliente.
\`/addproduct\` - Añade un nuevo producto a un cliente existente.
\`/listclients [filtros]\` - Lista tus clientes con filtros opcionales.
\`/client [ID o nombre]\` - Muestra los detalles de un cliente.
\`/updateclient\` - Modifica la información de un cliente o producto.

*Comandos de Eliminación*
\`/delclient\` - Elimina un cliente y todos sus productos.
\`/delproduct\` - Elimina un producto específico de un cliente.

*Administración (Solo Owner)*
\`/setrole [ID] [rol]\` - Asigna un rol a un usuario.

*Comandos de Usuario*
\`/presente [ID_Cliente]\` - Vincula tu cuenta a un servicio.
\`/misproductos\` - Muestra tus servicios contratados.
`;

    const inlineKeyboard = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '💬 WhatsApp', url: `https://wa.me/${CONTACT_INFO.PHONE.replace('+', '')}` },
                    { text: '✈️ Telegram', url: `https://t.me/${CONTACT_INFO.TELEGRAM_USER}` }
                ],
                [
                    { text: 'ℹ️ Más Información', url: CONTACT_INFO.HUB_LINK }
                ]
            ]
        }
    };

    await bot.sendMessage(chatId, infoMessage, { parse_mode: 'Markdown', ...inlineKeyboard });
}

async function handleSetNombre(bot, msg, newName) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const trimmedName = newName.trim();

    if (!trimmedName) {
        await bot.sendMessage(chatId, `${getPersonalizedGreeting(userId, dataStore.userNames)} Por favor, proporciona un nombre válido. Ejemplo: \`/mimbre Juan\``);
        return;
    }

    try {
        let userData = await db.getUserByIdDb(userId);

        if (!userData) {
            // Si el usuario no existe, creamos un registro básico.
            // El rol se asignará formalmente cuando use /start.
            userData = {
                id: userId,
                name: trimmedName,
                authorizationDate: moment().format('DD-MM-YYYY HH:mm:ss'),
                role: 'usuario'
            };
        } else {
            // Si ya existe, solo actualizamos el nombre.
            userData.name = trimmedName;
        }

        // Guardamos los cambios en la base de datos.
        await db.upsertUserDb(userData);

        // Actualizamos la caché en memoria para que el saludo sea inmediato.
        if (!dataStore.userNames[userId]) {
            dataStore.userNames[userId] = {};
        }
        dataStore.userNames[userId].name = trimmedName;
        
        // La línea "saveUserData();" que causaba el error ha sido eliminada.

        await bot.sendMessage(chatId, `¡Tu nombre ha sido actualizado a *${escapeMarkdown(trimmedName)}*!`, { parse_mode: 'Markdown' });
    } catch (error) {
        // Usamos nuestro manejador de errores centralizado.
        await handleError(error, bot, chatId);
    }
}

// --- Exportar SOLO las funciones definidas en ESTE archivo ---
module.exports = {
    sendInfo,
    handleSetNombre
};