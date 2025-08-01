// handlers/telegramEventHandlers.js
// Contiene todos los manejadores de eventos del bot (mensajes, comandos, callbacks).
// Esta es la versión corregida que soluciona el bug con el comando /start para nuevos usuarios.

const { ROLES } = require('../config/constants');
const moment = require('moment-timezone');
const { MAIN_MENU_INLINE_KEYBOARD, CLIENTS_MENU_INLINE_KEYBOARD, CONTACT_INFO, ADMIN_USER_IDS } = require('../config/botConfig');
const { dataStore } = require('../data/dataHandlers');
const { getPersonalizedGreeting, escapeMarkdown, userHasRole, handleError } = require('../utils/helpers'); 
const db = require('../utils/db');
const clientFunctions = require('./clientFunctions');
const { sendInfo, handleSetNombre } = require('./commandFunctions');
const { sendStats } = require('./statsFunctions');
const { sendClientBackup } = require('./backupFunctions');
const { restoreState, startRestore, handleRestoreFile, handleRestoreConfirmation } = require('./restoreFunctions');

function setupEventHandlers(bot) {

  // 1. Comando /start: Lógica unificada y corregida para manejar nuevos usuarios
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const telegramUserName = msg.from.first_name || `Usuario ${userId}`;

    try {
        let userData = await db.getUserByIdDb(userId);

        if (!userData) {
            console.log(`Detectado nuevo usuario de Telegram: ${userId}. Creando registro...`);
            userData = {
                id: userId,
                name: telegramUserName,
                authorizationDate: moment().format('YYYY-MM-DD'),
                role: ROLES.USER,
                client_id: null,
                whatsapp_id: null,
                authorization_end_date: null
            };
            if (ADMIN_USER_IDS.includes(userId)) {
                userData.role = ROLES.OWNER;
                userData.authorization_end_date = '9999-12-31';
            }
            await db.upsertUserDb(userData);
            console.log(`Nuevo usuario de Telegram ${userId} creado en la DB con rol: ${userData.role}.`);
        }
        
        let dbStatus = '🔴 Desconectado';
        try {
            await db.query('SELECT 1');
            dbStatus = '✅ Conectado';
        } catch (e) { /* No hacer nada */ }

        const totalUsersInDb = (await db.query('SELECT COUNT(*) FROM users')).rows[0].count;
        const now = moment().tz('America/Argentina/Cordoba');

        let licenseInfo = `🔥 ROL: *${escapeMarkdown(userData.role.toUpperCase())}* 🔥\n`;
        if (userData.authorization_end_date) {
            const endDate = moment(userData.authorization_end_date);
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

                // Aseguramos el escape en esta línea también
                licenseInfo += `🔥 TIENE ACCESO POR ${escapeMarkdown(durationString.trim())} 🔥\n` +
                               `✩ AUTORIZACIÓN VÁLIDA HASTA: *${escapeMarkdown(endDate.format('DD-MM-YYYY'))}* ⌚️\n`;
            }
        }

        const welcomeMessage =
          `✨ BIENVENIDO A ClientesT1Bot ✨\n` +
          `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n` +
          `${licenseInfo}` +
          `🗃️ ESTADO DB: *${dbStatus}*\n` +
          `| 📅 FECHA: ${escapeMarkdown(now.format('DD-MM-YYYY'))} - | - ⏰ HORA: ${escapeMarkdown(now.format('HH:mm:ss'))}\n` +
          `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n` +
          `RESELLER ACTUAL: ${userData.name ? escapeMarkdown(userData.name) : 'No definido'}\n` +
          `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n` +
          `MENU DEL BOT▬▬▬▬▬▬▬▬► /menu\n` +
          `INSTRUCCIONES DEL BOT▬▬► /info\n` +
          `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n` +
          `TOTAL DE USUARIOS (${totalUsersInDb}) ✨\n` +
          `Inconvenientes con el Bot Contactame : ${escapeMarkdown(CONTACT_INFO.PHONE)} 📲`;

        await bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
    } catch (error) {
        await handleError(error, bot, chatId);
    }
  });

  // --- Regex dinámico para /setrole con duración ---
  const rolePattern = Object.values(ROLES).join('|');
  const setRoleRegex = new RegExp(`\\/setrole\\s+(\\d+)\\s+(${rolePattern})(?:\\s+(\\d+)\\s+(mes|año))?`, 'i');

  bot.onText(setRoleRegex, async (msg, match) => {
    const chatId = msg.chat.id; 
    const callerId = msg.from.id; 
    const targetUserId = parseInt(match[1], 10);
    const newRole = match[2].toLowerCase();
    const durationValue = match[3] ? parseInt(match[3], 10) : null;
    const durationUnit = match[4] ? match[4].toLowerCase() : null;

    if (!await userHasRole(callerId, [ROLES.OWNER])) {
        return bot.sendMessage(chatId, `Lo siento, solo el *Owner* puede asignar roles.`, { parse_mode: 'Markdown' });
    }
    
    if (targetUserId <= 0) {
        return bot.sendMessage(chatId, `❌ **ID Inválido.** El comando /setrole solo funciona con IDs de usuarios personales, no con IDs de grupos.`, { parse_mode: 'Markdown' });
    }
    if (callerId === targetUserId) {
        return bot.sendMessage(chatId, `No puedes cambiar tu propio rol.`);
    }

    try {
        let targetUser = await db.getUserByIdDb(targetUserId);
        if (!targetUser) {
            targetUser = { 
                id: targetUserId, name: `Usuario ${targetUserId}`, role: newRole,
                whatsapp_id: null, client_id: null, authorization_end_date: null
            };
        }
        
        targetUser.role = newRole;

        let endDate = targetUser.authorization_end_date || null;
        if (durationValue && durationUnit) {
            endDate = moment().add(durationValue, durationUnit === 'mes' ? 'months' : 'years').format('YYYY-MM-DD');
        } else if (newRole === ROLES.USER) {
            endDate = null;
        } else if (!endDate) {
            endDate = moment().add(1, 'year').format('YYYY-MM-DD');
        }
        
        targetUser.authorization_end_date = endDate;
        await db.upsertUserDb(targetUser);
        
        let confirmationMessage = `✅ El rol del usuario *${escapeMarkdown(targetUser.name)}* ha sido cambiado a *${escapeMarkdown(newRole.toUpperCase())}*.`;
        if (endDate && moment(endDate).year() < 9000) {
            confirmationMessage += `\nSu licencia es válida hasta el *${moment(endDate).format('DD-MM-YYYY')}*.`;
        }
        
        await bot.sendMessage(chatId, confirmationMessage, { parse_mode: 'Markdown' });
    } catch (error) {
        await handleError(error, bot, chatId);
    }
  });

  // ... (El resto de los manejadores de eventos del archivo original se mantienen aquí sin cambios)
  bot.on('callback_query', async (callbackQuery) => {
    const message = callbackQuery.message;
    const data = callbackQuery.data;
    const chatId = message.chat.id;
    const userId = callbackQuery.from.id;
    console.log(`Callback Query recibido: ${data}`);
    await bot.answerCallbackQuery(callbackQuery.id);
    const user = await db.getUserByIdDb(userId);
    const userRole = user?.role || ROLES.USER;
    if (data === 'show_main_menu') {
        await bot.sendMessage(chatId, `${getPersonalizedGreeting(userId, dataStore.userNames)} Aquí está el menú de comandos:`, { reply_markup: MAIN_MENU_INLINE_KEYBOARD });
        return;
    }
    if (data === 'cmd_info') {
      await sendInfo(bot, chatId, userId);
    }
    else if (data === 'cmd_stats') {
        await sendStats(bot, chatId, userId);
    }
    else if (data.startsWith('list_page_')) {
        const page = parseInt(data.split('_')[2], 10);
        await clientFunctions.listClients(bot, chatId, userId, {}, page, message.message_id);
    }
    else if (data === 'cmd_clients_menu') {
        if (await userHasRole(userId, [ROLES.OWNER, ROLES.ADMIN, ROLES.MODERATOR])) {
            await bot.sendMessage(chatId, `${getPersonalizedGreeting(userId, dataStore.userNames)} *Menú de Clientes:*\nSelecciona una opción:`, { parse_mode: 'Markdown', ...CLIENTS_MENU_INLINE_KEYBOARD });
        } else {
            await bot.sendMessage(chatId, `${getPersonalizedGreeting(userId, dataStore.userNames)} Lo siento, tu rol (*${escapeMarkdown(userRole.toUpperCase())}*) no te permite acceder a la gestión de clientes.`, { parse_mode: 'Markdown' });
        }
    }
    else if (data === 'clients_add') {
        await clientFunctions.startAddClient(bot, chatId, userId);
    }
    else if (data === 'clients_delete') {
        await clientFunctions.startDeleteClient(bot, chatId, userId);
    }
    else if (data === 'clients_delete_product') { 
        await clientFunctions.startDeleteProduct(bot, chatId, userId);
    }
    else if (data === 'clients_list') {
        await clientFunctions.listClients(bot, chatId, userId, {});
    }
    else if (data === 'clients_view') {
        await clientFunctions.startViewClient(bot, chatId, userId);
    }
    else if (data === 'clients_update') {
        await clientFunctions.startUpdateClient(bot, chatId, userId);
    }
    else if (data === 'clients_renew') {
        await clientFunctions.startRenewProduct(bot, chatId, userId);
    }
    else if (data === 'clients_add_product') { 
        await clientFunctions.startAddProductToClient(bot, chatId, userId);
    }
    else if (data === 'cmd_misproductos') {
        await clientFunctions.viewMyProducts(bot, chatId, userId);
    }
    else if (data.startsWith('restore_')) {
        await handleRestoreConfirmation(bot, callbackQuery);
    }
  });
  bot.onText(/\/menu|menu/i, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userText = msg.text.toLowerCase().trim();
    if (userText === '/menu' || userText === 'menu') {
      await bot.sendMessage(chatId, `${getPersonalizedGreeting(userId, dataStore.userNames)} Aquí está el menú de comandos:`, { reply_markup: MAIN_MENU_INLINE_KEYBOARD });
    }
  });
  bot.onText(/\/mimbre (.+)/, async (msg, match) => {
    await handleSetNombre(bot, msg, match[1]);
  });
  bot.onText(/\/info/, async (msg) => {
      await sendInfo(bot, msg.chat.id, msg.from.id);
  });
  bot.onText(/\/addclient/, async (msg) => {
      await clientFunctions.startAddClient(bot, msg.chat.id, msg.from.id);
  });
  bot.onText(/\/delclient/, async (msg) => {
      await clientFunctions.startDeleteClient(bot, msg.chat.id, msg.from.id);
  });
  bot.onText(/\/delproduct/, async (msg) => {
      await clientFunctions.startDeleteProduct(bot, msg.chat.id, msg.from.id);
  });
  bot.onText(/\/listclients(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const rawArgsString = match[1];
    const parsedFilters = {}; 
    if (rawArgsString) {
        const regex = /(\w+)=("([^"]*)"|(\S+))/g;
        let m;
        while ((m = regex.exec(rawArgsString)) !== null) {
            const key = m[1].toLowerCase();
            const value = m[3] !== undefined ? m[3] : m[4]; 
            parsedFilters[key] = value;
        }
    }
    await clientFunctions.listClients(bot, chatId, userId, parsedFilters); 
  });
  bot.onText(/\/client (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const userId = msg.from.id;
      const query = match[1];
      await clientFunctions.viewClientDetails(bot, chatId, userId, query);
  });
  bot.onText(/\/updateclient/, async (msg) => {
      await clientFunctions.startUpdateClient(bot, msg.chat.id, msg.from.id);
  });
  bot.onText(/\/addproduct/, async (msg) => {
      await clientFunctions.startAddProductToClient(bot, msg.chat.id, msg.from.id);
  });
  bot.onText(/\/renew/, async (msg) => {
      await clientFunctions.startRenewProduct(bot, msg.chat.id, msg.from.id);
  });
  bot.onText(/\/stats/, async (msg) => {
    await sendStats(bot, msg.chat.id, msg.from.id);
  });
  bot.onText(/\/presente\s+(clt_[a-zA-Z0-9]+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const userId = msg.from.id;
      const clientIdToLink = match[1];
      try {
          const client = await db.findClientGeneralInfoDb(clientIdToLink, null, null); 
          if (!client) {
              await bot.sendMessage(chatId, `Lo siento, no se encontró ningún servicio con el ID \`${escapeMarkdown(clientIdToLink)}\`.`, { parse_mode: 'Markdown' });
              return;
          }
          let userData = await db.getUserByIdDb(userId);
          if (!userData) {
              userData = {
                  id: userId, name: msg.from.first_name || `Usuario ${userId}`,
                  role: ROLES.USER, client_id: clientIdToLink
              };
          } else {
              userData.client_id = clientIdToLink;
              if (![ROLES.OWNER, ROLES.ADMIN, ROLES.MODERATOR].includes(userData.role)) {
                  userData.role = ROLES.USER;
              }
          }
          await db.upsertUserDb(userData);
          dataStore.userNames[userId] = { ...dataStore.userNames[userId], client_id: clientIdToLink, role: userData.role };
          await bot.sendMessage(chatId,`¡Gracias! Tu usuario ha sido vinculado con el servicio (ID: \`${escapeMarkdown(clientIdToLink)}\`).\n\nAhora puedes usar /misproductos.`, { parse_mode: 'Markdown' });
      } catch (error) {
          console.error('Error al vincular usuario a cliente:', error);
          await bot.sendMessage(chatId, `Lo siento, hubo un error al vincular tu usuario.`);
      }
  });
  bot.onText(/\/misproductos/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from.id;
      try {
        const user = await db.getUserByIdDb(userId);
        if (user?.role !== ROLES.USER || !user.client_id) {
            await bot.sendMessage(chatId, `Lo siento, este comando es solo para usuarios vinculados. Usa \`/presente [ID_Cliente]\`.`, { parse_mode: 'Markdown' });
            return;
        }
        const products = await db.getClientProductsDb(user.client_id);
        if (products.length === 0) {
            await bot.sendMessage(chatId, `No se encontraron servicios vinculados a tu cuenta.`);
            return;
        }
        let responseMessage = `*Tus Servicios Contratados:*\n\n`;
        products.forEach(product => {
            responseMessage += `*Producto:* ${escapeMarkdown(product.product_name)}\n` +
                               `  Vencimiento: ${escapeMarkdown(moment(product.expiry_date).format('DD-MM-YYYY'))}\n` +
                               `  Estado: ${escapeMarkdown(product.status)}\n\n`;
        });
        await bot.sendMessage(chatId, responseMessage, { parse_mode: 'Markdown' });
      } catch (error) {
          console.error('Error al obtener productos para usuario final:', error);
          await bot.sendMessage(chatId, `Lo siento, hubo un error al obtener tus servicios.`);
      }
  });
  bot.onText(/\/cancel/, async (msg) => {
      const userId = msg.from.id;
      const chatId = msg.chat.id;
      if (clientFunctions.getActiveFlow(userId)) {
          clientFunctions.clearActiveFlow(userId);
          await bot.sendMessage(chatId, `Operación cancelada.`);
    } else {
          await bot.sendMessage(chatId, `No hay ninguna operación en curso para cancelar.`);
    }
  });
  bot.onText(/\/backup/, async (msg) => {
        await sendClientBackup(bot, msg.chat.id, msg.from.id);
  });
  bot.onText(/\/restore/, async (msg) => {
        await startRestore(bot, msg.chat.id, msg.from.id);
  });
  bot.onText(/\/linkwhatsapp\s+(\d+)\s+(\d+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const callerId = msg.from.id;
      const targetTelegramId = match[1];
      const targetWhatsAppId = match[2];
      if (!await userHasRole(callerId, [ROLES.OWNER])) {
          return bot.sendMessage(chatId, "❌ No tienes permiso para esta acción.");
      }
      try {
          const updatedUser = await db.linkWhatsAppIdDb(targetTelegramId, targetWhatsAppId);
          if (updatedUser) {
              await bot.sendMessage(chatId, `✅ Usuario ${escapeMarkdown(updatedUser.name)} (ID: ${targetTelegramId}) vinculado exitosamente al WhatsApp ${targetWhatsAppId}.`);
          } else {
              await bot.sendMessage(chatId, `No se encontró un usuario con el ID de Telegram ${targetTelegramId}.`);
          }
      } catch (error) {
          if (error.code === '23505') {
              await bot.sendMessage(chatId, `❌ Error: El número de WhatsApp ${targetWhatsAppId} ya está vinculado a otro usuario.`);
          } else {
              await handleError(error, bot, chatId);
          }
      }
  });
  bot.onText(/\/crearacceso\s+(\d+)\s+(\S+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const callerId = msg.from.id;
    const targetUserId = parseInt(match[1], 10);
    const webUsername = match[2];
    if (!await userHasRole(callerId, [ROLES.OWNER])) {
        return bot.sendMessage(chatId, "❌ No tienes permiso para esta acción.");
    }
    const bcrypt = require('bcrypt');
    try {
        const targetUser = await db.getUserByIdDb(targetUserId);
        if (!targetUser) {
            return bot.sendMessage(chatId, `El usuario con ID ${targetUserId} no existe. Debe usar /start primero.`);
        }
        const tempPassword = Math.random().toString(36).slice(-8);
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(tempPassword, saltRounds);
        await db.query(
            'UPDATE users SET web_username = $1, password_hash = $2 WHERE id = $3',
            [webUsername, passwordHash, targetUserId]
        );
        const credentialsMessage = `✅ Acceso web creado/actualizado para *${escapeMarkdown(targetUser.name)}* (ID: ${targetUserId}):\n\n` +
                                 `*Usuario:* \`${webUsername}\`\n` +
                                 `*Contraseña Temporal:* \`${tempPassword}\`\n\n` +
                                 `⚠️ Por favor, entrega estas credenciales de forma segura. Esta contraseña no se volverá a mostrar.`;
        await bot.sendMessage(callerId, credentialsMessage, { parse_mode: 'Markdown' });
        if (chatId !== callerId) {
             await bot.sendMessage(chatId, `✅ Acceso creado. Te he enviado las credenciales por mensaje privado.`);
        }
    } catch (error) {
        if (error.code === '23505') { 
            await bot.sendMessage(chatId, `❌ El nombre de usuario web \`${webUsername}\` ya está en uso. Por favor, elige otro.`);
        } else {
            await handleError(error, bot, chatId);
        }
    }
  });

  // 6. Manejador genérico para mensajes
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (msg.document && restoreState[userId]) {
        await handleRestoreFile(bot, msg);
        return;
    }
    if (!msg.text || msg.text.startsWith('/')) return;
    if (clientFunctions.getActiveFlow(userId)) {
        await clientFunctions.routeFlowMessage(bot, msg);
    } else {
        await bot.sendMessage(chatId, `${getPersonalizedGreeting(userId, dataStore.userNames)} Recibí tu mensaje, pero no sé cómo responder. Intenta /start o /menu.`);
    }
  });
}

module.exports = {
  setupEventHandlers
};