// handlers/clientFunctions.js
// Contiene la lógica para la gestión de clientes y sus productos usando PostgreSQL.

const db = require('../utils/db');
const { dataStore } = require('../data/dataHandlers');
const { ROLES, PRODUCT_STATUS, FLOW_STEPS } = require('../config/constants');
const { getPersonalizedGreeting, escapeMarkdown, userHasRole, handleError, encrypt, decrypt } = require('../utils/helpers'); 
const { moment } = require('../config/botConfig');
const { v4: uuidv4 } = require('uuid');

// --- MANEJADOR DE ESTADO CENTRALIZADO ---
const activeFlows = new Map();

function getActiveFlow(userId) {
    return activeFlows.get(userId);
}

function clearActiveFlow(userId) {
    activeFlows.delete(userId);
}

async function routeFlowMessage(bot, msg) {
    const userId = msg.from.id;
    const flow = getActiveFlow(userId);
    if (!flow) return;

    try {
        const flowHandlers = {
            'addClient': handleAddClientStep,
            'addProduct': handleAddProductToClientStep,
            'updateClient': handleUpdateClientStep,
            'deleteClient': handleDeleteClientStep,
            'deleteProduct': handleDeleteProductStep,
            'renewProduct': handleRenewProductStep,
            'viewClient': handleViewClientStep
        };
        
        const handler = flowHandlers[flow.name];
        if (handler) {
            await handler(bot, msg);
        }
    } catch (error) {
        await handleError(error, bot, msg.chat.id);
        clearActiveFlow(userId);
    }
}

// --- FUNCIONES DE UTILIDAD ---
function formatWhatsAppNumber(input) {
    if (!input) return null;
    let cleaned = input.replace(/[^\d+]/g, '');
    if (cleaned.length < 7) return null;
    if (cleaned.startsWith('+')) {
        if (cleaned.startsWith('+54') && cleaned.length === 12 && !cleaned.startsWith('+549')) {
            return `+549${cleaned.substring(3)}`;
        }
        return cleaned;
    } else {
        if (cleaned.startsWith('0') && cleaned.length > 1) {
            cleaned = cleaned.substring(1);
        }
        if (cleaned.startsWith('549') && cleaned.length >= 10) {
            return `+${cleaned}`;
        } else if (cleaned.startsWith('54') && cleaned.length >= 9) {
            return `+549${cleaned.substring(2)}`;
        } else if (cleaned.length === 10) {
            return `+549${cleaned}`;
        } else if (cleaned.length === 8) {
            return `+549370${cleaned}`;
        }
        return null;
    }
}

async function sendClientGeneralDetailsMessage(bot, chatId, client, messagePrefix = '') {
    const whatsappLink = client.whatsapp ? `[${escapeMarkdown(client.whatsapp)}](${escapeMarkdown(`https://wa.me/${client.whatsapp.replace('+', '')}`)})` : 'N/A';
    let message = `${messagePrefix}*Detalles del Cliente:*\n\n` +
                  `*ID:* \`${escapeMarkdown(client.id)}\`\n` +
                  `*Nombre:* ${escapeMarkdown(client.name)}\n` +
                  `*WhatsApp:* ${whatsappLink}\n` +
                  `*Correo:* ${escapeMarkdown(client.email || 'N/A')}\n` +
                  `*Notas:* ${escapeMarkdown(client.general_notes || 'N/A')}`;
    return bot.sendMessage(chatId, message, { parse_mode: 'Markdown', disable_web_page_preview: true });
}

async function sendProductDetailsMessage(bot, chatId, product, messagePrefix = '') {
    const decryptedPassword = decrypt(product.service_password);
    let message = `${messagePrefix}*Detalles del Producto:*\n\n` +
                  `*ID Producto:* \`${escapeMarkdown(product.id.toString())}\`\n` +
                  `*Nombre:* ${escapeMarkdown(product.product_name)}\n` +
                  `*Estado:* ${escapeMarkdown(product.status)}\n` +
                  `*Vencimiento:* ${escapeMarkdown(moment(product.expiry_date).format('DD-MM-YYYY'))}\n` +
                  `*Usuario/Correo:* \`${escapeMarkdown(product.service_username || 'N/A')}\`\n` +
                  `*Contraseña:* \`${escapeMarkdown(decryptedPassword || 'N/A')}\`\n` +
                  `*Notas:* ${escapeMarkdown(product.product_notes || 'N/A')}`;
    return bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
}

async function deleteMessages(bot, chatId, messageIds) {
    if (!messageIds || !Array.isArray(messageIds)) return;
    for (const msgId of messageIds) {
        try {
            await bot.deleteMessage(chatId, msgId);
        } catch (deleteError) {
            // Ignorar errores
        }
    }
}

async function _promptClientSelection(bot, chatId, userId, flowName, nextStep, promptMessage) {
    const user = await db.getUserByIdDb(userId);
    const clients = await db.getAllClientsDb({}, user?.role === ROLES.OWNER ? null : userId);

    if (clients.length === 0) {
        await bot.sendMessage(chatId, `No tienes clientes registrados para esta acción.`);
        return false;
    }

    let clientListMessage = `${promptMessage}\n\n*Envía el N° de la fila, el ID o el nombre:*\n\n\`\`\`\n`;
    const clientMap = {};
    clients.forEach((client, index) => {
        const rowNumber = index + 1;
        clientMap[rowNumber] = { id: client.id, name: client.name };
        clientListMessage += `${String(rowNumber).padEnd(2)} | ${client.name.padEnd(20)} | ${client.id}\n`;
    });
    clientListMessage += `\`\`\``;

    const sentMessage = await bot.sendMessage(chatId, clientListMessage, { parse_mode: 'Markdown' });

    activeFlows.set(userId, {
        name: flowName,
        step: nextStep,
        clientMap,
        messagesToDelete: [sentMessage.message_id]
    });
    return true;
}

// ##########################################################################################
// FLUJO: AÑADIR CLIENTE (/addclient)
// ##########################################################################################
async function startAddClient(bot, chatId, userId) {
    if (!await userHasRole(userId, [ROLES.OWNER, ROLES.ADMIN, ROLES.MODERATOR])) {
        return bot.sendMessage(chatId, `Lo siento, tu rol no te permite añadir clientes.`);
    }
    activeFlows.set(userId, {
        name: 'addClient',
        step: FLOW_STEPS.AWAIT_CLIENT_NAME,
        data: {},
        messagesToDelete: []
    });
    const sentMessage = await bot.sendMessage(chatId, `Ok, vamos a añadir un *nuevo cliente*.\n\n*Paso 1:* Dime el *nombre* del cliente:`, { parse_mode: 'Markdown' });
    const flow = getActiveFlow(userId);
    if (flow) flow.messagesToDelete.push(sentMessage.message_id);
}

async function handleAddClientStep(bot, msg) {
    const userId = msg.from.id;
    const currentState = getActiveFlow(userId);
    if (!currentState) return;
    currentState.messagesToDelete.push(msg.message_id);
    const stepHandlers = {
        [FLOW_STEPS.AWAIT_CLIENT_NAME]: _getClientName,
        [FLOW_STEPS.AWAIT_CLIENT_WHATSAPP]: _getClientWhatsapp,
        [FLOW_STEPS.AWAIT_CLIENT_EMAIL]: _getClientEmail,
        [FLOW_STEPS.AWAIT_CLIENT_NOTES]: _getClientNotes,
        [FLOW_STEPS.AWAIT_PRODUCT_NAME]: _getProductName,
        [FLOW_STEPS.AWAIT_PRODUCT_DURATION]: _getProductDuration,
        [FLOW_STEPS.AWAIT_PRODUCT_NOTES]: _getProductNotes,
        [FLOW_STEPS.AWAIT_PRODUCT_USERNAME]: _getProductUsername,
        [FLOW_STEPS.AWAIT_PRODUCT_PASSWORD]: _getProductPasswordAndSave,
    };
    const handler = stepHandlers[currentState.step];
    if (handler) await handler(bot, msg, currentState);
}

async function _getClientName(bot, msg, currentState) {
    currentState.data.name = msg.text.trim();
    currentState.step = FLOW_STEPS.AWAIT_CLIENT_WHATSAPP;
    const sentMessage = await bot.sendMessage(msg.chat.id, `*Paso 2:* Ingresa el *WhatsApp* del cliente (o "no"):`, { parse_mode: 'Markdown' });
    currentState.messagesToDelete.push(sentMessage.message_id);
}

async function _getClientWhatsapp(bot, msg, currentState) {
    const text = msg.text.trim();
    const formattedWhatsapp = formatWhatsAppNumber(text);
    if (text.toLowerCase() !== 'no' && !formattedWhatsapp) {
        const sentMessage = await bot.sendMessage(msg.chat.id, `Número de WhatsApp inválido. Intenta de nuevo.`);
        currentState.messagesToDelete.push(sentMessage.message_id);
        return;
    }
    currentState.data.whatsapp = text.toLowerCase() === 'no' ? null : formattedWhatsapp;
    currentState.step = FLOW_STEPS.AWAIT_CLIENT_EMAIL;
    const sentMessage = await bot.sendMessage(msg.chat.id, `*Paso 3:* Ingresa el *correo* del cliente (o "no"):`, { parse_mode: 'Markdown' });
    currentState.messagesToDelete.push(sentMessage.message_id);
}

async function _getClientEmail(bot, msg, currentState) {
    const emailInput = msg.text.trim();
    if (emailInput.toLowerCase() !== 'no' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput)) {
        const sentMessage = await bot.sendMessage(msg.chat.id, `Formato de correo inválido.`);
        currentState.messagesToDelete.push(sentMessage.message_id);
        return;
    }
    currentState.data.email = emailInput.toLowerCase() === 'no' ? null : emailInput;
    currentState.step = FLOW_STEPS.AWAIT_CLIENT_NOTES;
    const sentMessage = await bot.sendMessage(msg.chat.id, `*Paso 4:* ¿Alguna *nota general* sobre el cliente? (o "no"):`, { parse_mode: 'Markdown' });
    currentState.messagesToDelete.push(sentMessage.message_id);
}

async function _getClientNotes(bot, msg, currentState) {
    currentState.data.generalNotes = msg.text.trim().toLowerCase() === 'no' ? null : msg.text.trim();
    currentState.data.id = `clt_${uuidv4().split('-')[0]}`;
    currentState.step = FLOW_STEPS.AWAIT_PRODUCT_NAME;
    const sentMessage = await bot.sendMessage(msg.chat.id, `*Cliente "${escapeMarkdown(currentState.data.name)}"* listo. Ahora, su primer producto.\n\n*Paso 5:* ¿Qué *producto* vendiste?`, { parse_mode: 'Markdown' });
    currentState.messagesToDelete.push(sentMessage.message_id);
}

async function _getProductName(bot, msg, currentState) {
    currentState.data.productName = msg.text.trim();
    currentState.step = FLOW_STEPS.AWAIT_PRODUCT_DURATION;
    const sentMessage = await bot.sendMessage(msg.chat.id, `*Paso 6:* ¿Cuántos *días* dura el servicio? (Ej: 30):`, { parse_mode: 'Markdown' });
    currentState.messagesToDelete.push(sentMessage.message_id);
}

async function _getProductDuration(bot, msg, currentState) {
    const durationDays = parseInt(msg.text.trim(), 10);
    if (isNaN(durationDays) || durationDays <= 0) {
        const sentMessage = await bot.sendMessage(msg.chat.id, `Duración inválida. Ingresa un número positivo de días.`);
        currentState.messagesToDelete.push(sentMessage.message_id);
        return;
    }
    currentState.data.durationDays = durationDays;
    currentState.step = FLOW_STEPS.AWAIT_PRODUCT_NOTES;
    const sentMessage = await bot.sendMessage(msg.chat.id, `*Paso 7:* ¿Alguna *nota* para este producto? (o "no"):`, { parse_mode: 'Markdown' });
    currentState.messagesToDelete.push(sentMessage.message_id);
}

async function _getProductNotes(bot, msg, currentState) {
    currentState.data.productNotes = msg.text.trim().toLowerCase() === 'no' ? null : msg.text.trim();
    currentState.step = FLOW_STEPS.AWAIT_PRODUCT_USERNAME;
    const sentMessage = await bot.sendMessage(msg.chat.id, `*Paso 8:* Ahora, ingresa el *usuario/correo* para el servicio (o "no"):`, { parse_mode: 'Markdown' });
    currentState.messagesToDelete.push(sentMessage.message_id);
}

async function _getProductUsername(bot, msg, currentState) {
    currentState.data.serviceUsername = msg.text.trim().toLowerCase() === 'no' ? null : msg.text.trim();
    currentState.step = FLOW_STEPS.AWAIT_PRODUCT_PASSWORD;
    const sentMessage = await bot.sendMessage(msg.chat.id, `*Paso 9:* Finalmente, ingresa la *contraseña* para el servicio (o "no"):`, { parse_mode: 'Markdown' });
    currentState.messagesToDelete.push(sentMessage.message_id);
}

async function _getProductPasswordAndSave(bot, msg, currentState) {
    const userId = msg.from.id;
    const plainPassword = msg.text.trim().toLowerCase() === 'no' ? null : msg.text.trim();
    const expiryDate = moment().add(currentState.data.durationDays, 'days');
    const noticeDate = expiryDate.clone().subtract(2, 'days');
    const productData = {
        product_name: currentState.data.productName,
        contract_date: moment().format('YYYY-MM-DD'),
        expiry_date: expiryDate.format('YYYY-MM-DD'),
        notice_date: noticeDate.format('YYYY-MM-DD'),
        status: PRODUCT_STATUS.ACTIVE,
        product_notes: currentState.data.productNotes,
        service_username: currentState.data.serviceUsername,
        service_password: encrypt(plainPassword)
    };
    await db.addClientWithFirstProductDb(currentState.data, productData, userId);
    await deleteMessages(bot, msg.chat.id, currentState.messagesToDelete);
    await bot.sendMessage(msg.chat.id, `✅ *¡Cliente y producto añadidos exitosamente con una operación segura!*`, { parse_mode: 'Markdown' });
    clearActiveFlow(userId);
}

// ##########################################################################################
// FLUJO: AÑADIR PRODUCTO A CLIENTE EXISTENTE (/addproduct)
// ##########################################################################################
async function startAddProductToClient(bot, chatId, userId) {
    if (!await userHasRole(userId, [ROLES.OWNER, ROLES.ADMIN, ROLES.MODERATOR])) {
        return bot.sendMessage(chatId, `No tienes permiso.`);
    }
    await _promptClientSelection(bot, chatId, userId, 'addProduct', FLOW_STEPS.AWAIT_CLIENT_SELECTION_FOR_PRODUCT, 'Ok, vamos a añadir un producto a un cliente existente.');
}

async function handleAddProductToClientStep(bot, msg) {
    const userId = msg.from.id;
    const currentState = getActiveFlow(userId);
    if (!currentState) return;
    currentState.messagesToDelete.push(msg.message_id);
    const stepHandlers = {
        [FLOW_STEPS.AWAIT_CLIENT_SELECTION_FOR_PRODUCT]: _handleAddProduct_GetClient,
        [FLOW_STEPS.AWAIT_PRODUCT_DETAILS]: _handleAddProduct_GetDetailsAndSave
    };
    const handler = stepHandlers[currentState.step];
    if (handler) await handler(bot, msg, currentState);
}

async function _handleAddProduct_GetClient(bot, msg, currentState) {
    const { id: userId } = msg.from;
    const { id: chatId } = msg.chat;
    const text = msg.text.trim();
    const user = await db.getUserByIdDb(userId);
    const isOwner = user?.role === ROLES.OWNER;
    const rowNumber = parseInt(text, 10);
    const clientFromMap = currentState.clientMap[rowNumber];
    const query = clientFromMap ? clientFromMap.id : text;
    const client = await db.findClientGeneralInfoDb(query, isOwner ? null : userId);
    if (!client) {
        const sentMessage = await bot.sendMessage(chatId, `Cliente no encontrado. Intenta de nuevo o /cancel.`);
        currentState.messagesToDelete.push(sentMessage.message_id);
        return;
    }
    currentState.client = client;
    currentState.step = FLOW_STEPS.AWAIT_PRODUCT_DETAILS;
    await deleteMessages(bot, chatId, currentState.messagesToDelete);
    currentState.messagesToDelete = [];
    const prompt = `Cliente seleccionado: *${escapeMarkdown(client.name)}*.\n\n` +
                   `Ahora, por favor, envía los detalles del nuevo producto en el siguiente formato:\n\n` +
                   `*Nombre, Duración (días), Usuario, Contraseña, Notas (opcional)*\n\n` +
                   `*Ejemplo:*\n` +
                   `\`Netflix, 30, correo@ejemplo.com, pass123, Pantalla principal\``;
    const sentMessage = await bot.sendMessage(chatId, prompt, { parse_mode: 'Markdown' });
    currentState.messagesToDelete.push(sentMessage.message_id);
}

async function _handleAddProduct_GetDetailsAndSave(bot, msg, currentState) {
    const { id: userId } = msg.from;
    const { id: chatId } = msg.chat;
    const details = msg.text.trim().split(',').map(item => item.trim());
    if (details.length < 4) {
        const sentMessage = await bot.sendMessage(chatId, `Formato incorrecto. Asegúrate de incluir al menos Nombre, Duración, Usuario y Contraseña separados por comas. Inténtalo de nuevo o /cancel.`);
        currentState.messagesToDelete.push(sentMessage.message_id);
        return;
    }
    const [product_name, duration_days, service_username, service_password, product_notes] = details;
    const duration = parseInt(duration_days, 10);
    if (isNaN(duration) || duration <= 0) {
        const sentMessage = await bot.sendMessage(chatId, `La duración en días debe ser un número positivo. Inténtalo de nuevo.`);
        currentState.messagesToDelete.push(sentMessage.message_id);
        return;
    }
    const expiryDate = moment().add(duration, 'days');
    const noticeDate = expiryDate.clone().subtract(2, 'days');
    const newProductData = {
        client_id: currentState.client.id,
        product_name,
        contract_date: moment().format('YYYY-MM-DD'),
        expiry_date: expiryDate.format('YYYY-MM-DD'),
        notice_date: noticeDate.format('YYYY-MM-DD'),
        status: PRODUCT_STATUS.ACTIVE,
        product_notes: product_notes || null,
        service_username: service_username || null,
        service_password: encrypt(service_password)
    };
    await db.addClientProductDb(newProductData, userId);
    await deleteMessages(bot, chatId, currentState.messagesToDelete);
    await bot.sendMessage(chatId, `✅ Producto *${escapeMarkdown(product_name)}* añadido exitosamente al cliente *${escapeMarkdown(currentState.client.name)}*.`, { parse_mode: 'Markdown' });
    clearActiveFlow(userId);
}

// ##########################################################################################
// FLUJO: ELIMINAR CLIENTE (/delclient)
// ##########################################################################################
async function startDeleteClient(bot, chatId, userId) {
    if (!await userHasRole(userId, [ROLES.OWNER, ROLES.ADMIN])) {
        return bot.sendMessage(chatId, `No tienes permiso para eliminar clientes.`);
    }
    await _promptClientSelection(bot, chatId, userId, 'deleteClient', FLOW_STEPS.AWAIT_CLIENT_SELECTION_FOR_DELETION, 'Por favor, selecciona el cliente que deseas eliminar.');
}

async function handleDeleteClientStep(bot, msg) {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const currentState = getActiveFlow(userId);
    if (!currentState) return;
    currentState.messagesToDelete.push(msg.message_id);
    try {
        const rowNumber = parseInt(msg.text.trim(), 10);
        const clientToDelete = currentState.clientMap[rowNumber];
        if (!clientToDelete) {
            await bot.sendMessage(chatId, `Entrada inválida. Operación cancelada.`);
        } else {
            const user = await db.getUserByIdDb(userId);
            const isOwner = user?.role === ROLES.OWNER;
            const deleted = await db.deleteClientDb(clientToDelete.id, isOwner ? null : userId);
            if (deleted) {
                await bot.sendMessage(chatId, `✅ Cliente *"${escapeMarkdown(clientToDelete.name)}"* eliminado exitosamente.`, { parse_mode: 'Markdown' });
            } else {
                await bot.sendMessage(chatId, `No se encontró el cliente o no tienes permiso para eliminarlo.`);
            }
        }
    } catch (error) {
        await handleError(error, bot, chatId);
    } finally {
        await deleteMessages(bot, chatId, currentState.messagesToDelete);
        clearActiveFlow(userId);
    }
}

// ##########################################################################################
// FLUJO: ELIMINAR PRODUCTO (/delproduct)
// ##########################################################################################
async function startDeleteProduct(bot, chatId, userId) {
    if (!await userHasRole(userId, [ROLES.OWNER, ROLES.ADMIN, ROLES.MODERATOR])) {
        return bot.sendMessage(chatId, `No tienes permiso para eliminar productos.`);
    }
    await _promptClientSelection(bot, chatId, userId, 'deleteProduct', 'AWAIT_CLIENT_SELECTION_FOR_PROD_DELETION', 'Ok, vamos a eliminar un producto. Primero, selecciona el cliente.');
}

async function handleDeleteProductStep(bot, msg) {
    const userId = msg.from.id;
    const currentState = getActiveFlow(userId);
    if (!currentState) return;
    currentState.messagesToDelete.push(msg.message_id);
    const stepHandlers = {
        'AWAIT_CLIENT_SELECTION_FOR_PROD_DELETION': _handleDeleteProd_GetClient,
        'AWAIT_PRODUCT_SELECTION_FOR_DELETION': _handleDeleteProd_GetProductAndConfirm
    };
    const handler = stepHandlers[currentState.step];
    if (handler) await handler(bot, msg, currentState);
}

async function _handleDeleteProd_GetClient(bot, msg, currentState) {
    const { id: userId } = msg.from;
    const { id: chatId } = msg.chat;
    const text = msg.text.trim();
    const user = await db.getUserByIdDb(userId);
    const isOwner = user?.role === ROLES.OWNER;
    const rowNumber = parseInt(text, 10);
    const clientFromMap = currentState.clientMap[rowNumber];
    const query = clientFromMap ? clientFromMap.id : text;
    const client = await db.findClientGeneralInfoDb(query, isOwner ? null : userId);
    if (!client) {
        await bot.sendMessage(chatId, `Cliente no encontrado. Operación cancelada.`);
        await deleteMessages(bot, chatId, currentState.messagesToDelete);
        clearActiveFlow(userId);
        return;
    }
    currentState.client = client;
    const products = await db.getClientProductsDb(client.id, isOwner ? null : userId);
    if (products.length === 0) {
        await bot.sendMessage(chatId, `Este cliente no tiene productos para eliminar.`);
        await deleteMessages(bot, chatId, currentState.messagesToDelete);
        clearActiveFlow(userId);
        return;
    }
    await deleteMessages(bot, chatId, currentState.messagesToDelete);
    currentState.messagesToDelete = [];
    let productListMessage = `Cliente: *${escapeMarkdown(client.name)}*.\n\n*Paso 2: Selecciona el producto a eliminar*\n\n\`\`\`\n`;
    const productMap = {};
    products.forEach((p, idx) => {
        const rowNum = idx + 1;
        productMap[rowNum] = p;
        productListMessage += `${rowNum}. ${p.product_name}\n`;
    });
    productListMessage += `\`\`\``;
    currentState.productMap = productMap;
    currentState.step = 'AWAIT_PRODUCT_SELECTION_FOR_DELETION';
    const sentMessage = await bot.sendMessage(chatId, productListMessage, { parse_mode: 'Markdown' });
    currentState.messagesToDelete.push(sentMessage.message_id);
}

async function _handleDeleteProd_GetProductAndConfirm(bot, msg, currentState) {
    const { id: userId } = msg.from;
    const { id: chatId } = msg.chat;
    const rowNumber = parseInt(msg.text.trim(), 10);
    const productToDelete = currentState.productMap[rowNumber];
    if (!productToDelete) {
        await bot.sendMessage(chatId, `N° inválido. Operación cancelada.`);
    } else {
        const deleted = await db.deleteClientProductDb(productToDelete.id, userId);
        if (deleted) {
            // --- CORRECCIÓN AQUÍ ---
            // Cambiado de productToDelete.name a productToDelete.product_name
            await bot.sendMessage(chatId, `✅ Producto *"${escapeMarkdown(productToDelete.product_name)}"* eliminado exitosamente.`, { parse_mode: 'Markdown' });
        } else {
            await bot.sendMessage(chatId, `No se pudo eliminar el producto.`);
        }
    }
    await deleteMessages(bot, chatId, currentState.messagesToDelete);
    clearActiveFlow(userId);
}

// ##########################################################################################
// FUNCIONES PARA LISTAR Y VER DETALLES DE CLIENTES Y SUS PRODUCTOS
// ##########################################################################################
async function listClients(bot, chatId, userId, incomingFilters = {}, page = 1, messageId = null) {
    if (!await userHasRole(userId, [ROLES.OWNER, ROLES.ADMIN, ROLES.MODERATOR])) {
        return bot.sendMessage(chatId, `No tienes permiso para listar clientes.`);
    }

    try {
        const user = await db.getUserByIdDb(userId);
        const isOwner = user?.role === ROLES.OWNER;
        
        const clients = Object.keys(incomingFilters).length > 0
            ? await db.getFilteredClientsDb(incomingFilters, isOwner ? null : userId)
            : await db.getAllClientsDb({}, isOwner ? null : userId);
        
        if (clients.length === 0) {
            const message = Object.keys(incomingFilters).length > 0
                ? `No se encontraron clientes que coincidan con tus filtros.`
                : `No tienes clientes registrados aún.`;
            return bot.sendMessage(chatId, message);
        }

        const pageSize = 5;
        const totalPages = Math.ceil(clients.length / pageSize);
        page = Math.max(1, Math.min(page, totalPages));
        const paginatedClients = clients.slice((page - 1) * pageSize, page * pageSize);

        let responseMessage = `📋 *Lista de Clientes* (Página ${page}/${totalPages})\n\n`;
        
        for (const client of paginatedClients) {
            if (!client.products) {
                client.products = await db.getClientProductsDb(client.id, isOwner ? null : userId);
            }
            responseMessage += `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n`;
            responseMessage += `*Cliente:* ${escapeMarkdown(client.name)} (ID: \`${escapeMarkdown(client.id)}\`)\n`;
            
            const productsToShow = client.products.filter(p => {
                if (incomingFilters.product && !p.product_name.toLowerCase().includes(incomingFilters.product.toLowerCase())) return false;
                if (incomingFilters.status && p.status.toLowerCase() !== incomingFilters.status.toLowerCase()) return false;
                return true;
            });

            if (productsToShow.length > 0) {
                productsToShow.forEach(product => {
                    responseMessage += `  - *Prod:* ${escapeMarkdown(product.product_name)} | *Vence:* ${escapeMarkdown(moment(product.expiry_date).format('DD-MM-YY'))}\n`;
                });
            } else {
                 responseMessage += `  - _No tiene productos activos o que coincidan con el filtro._\n`;
            }
        }
        responseMessage += `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n`;

        const keyboard = [];
        const navigationButtons = [];
        if (page > 1) {
            navigationButtons.push({ text: '⬅️ Anterior', callback_data: `list_page_${page - 1}` });
        }
        if (page < totalPages) {
            navigationButtons.push({ text: 'Siguiente ➡️', callback_data: `list_page_${page + 1}` });
        }
        if (navigationButtons.length > 0) {
            keyboard.push(navigationButtons);
        }
        const replyMarkup = { inline_keyboard: keyboard };

        if (messageId) {
            await bot.editMessageText(responseMessage, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: replyMarkup });
        } else {
            await bot.sendMessage(chatId, responseMessage, { parse_mode: 'Markdown', reply_markup: replyMarkup });
        }

    } catch (error) {
        await handleError(error, bot, chatId);
    }
}

async function viewClientDetails(bot, chatId, userId, query) {
    if (!await userHasRole(userId, [ROLES.OWNER, ROLES.ADMIN, ROLES.MODERATOR])) {
        return bot.sendMessage(chatId, `No tienes permiso.`);
    }
    try {
        const user = await db.getUserByIdDb(userId);
        const ownerId = user?.role === ROLES.OWNER ? null : userId;
        const client = await db.findClientGeneralInfoDb(query, ownerId);

        if (!client) {
            return bot.sendMessage(chatId, `No se encontró cliente con '${escapeMarkdown(query)}'.`);
        }
        
        const products = await db.getClientProductsDb(client.id, ownerId);
        
        await sendClientGeneralDetailsMessage(bot, chatId, client);

        if (products.length > 0) {
            for (const product of products) {
                await sendProductDetailsMessage(bot, chatId, product);
            }
        } else {
            await bot.sendMessage(chatId, `Este cliente no tiene productos registrados.`);
        }
    } catch (dbError) {
        await handleError(dbError, bot, chatId);
    }
}

// ##########################################################################################
// FLUJO: VER CLIENTE (/client interactivo)
// ##########################################################################################
async function startViewClient(bot, chatId, userId) {
    if (!await userHasRole(userId, [ROLES.OWNER, ROLES.ADMIN, ROLES.MODERATOR])) {
        return bot.sendMessage(chatId, `Lo siento, tu rol no te permite ver clientes.`);
    }
    activeFlows.set(userId, { name: 'viewClient' });
    await bot.sendMessage(chatId, `${getPersonalizedGreeting(userId, dataStore.userNames)} Ok, dime el *ID o nombre* del cliente que deseas ver:`, { parse_mode: 'Markdown' });
}

async function handleViewClientStep(bot, msg) {
    const userId = msg.from.id;
    const query = msg.text.trim();
    if (!getActiveFlow(userId)) return;
    
    await viewClientDetails(bot, msg.chat.id, userId, query);
    clearActiveFlow(userId);
}

// ##########################################################################################
// FLUJO: ACTUALIZAR CLIENTE/PRODUCTO (/updateclient)
// ##########################################################################################
async function startUpdateClient(bot, chatId, userId) {
    if (!await userHasRole(userId, [ROLES.OWNER, ROLES.ADMIN, ROLES.MODERATOR])) {
        return bot.sendMessage(chatId, `No tienes permiso para actualizar.`);
    }
    await _promptClientSelection(bot, chatId, userId, 'updateClient', FLOW_STEPS.AWAIT_CLIENT_SELECTION, 'Ok, vamos a *actualizar*. Por favor, selecciona un cliente:');
}

async function handleUpdateClientStep(bot, msg) {
    const userId = msg.from.id;
    const currentState = getActiveFlow(userId);
    if (!currentState) return;
    currentState.messagesToDelete.push(msg.message_id);
    const stepHandlers = {
        [FLOW_STEPS.AWAIT_CLIENT_SELECTION]: _handleUpdate_GetClient,
        [FLOW_STEPS.AWAIT_UPDATE_TYPE]: _handleUpdate_GetType,
        [FLOW_STEPS.AWAIT_PRODUCT_SELECTION]: _handleUpdate_GetProduct,
        [FLOW_STEPS.AWAIT_FIELD_SELECTION]: _handleUpdate_GetField,
        [FLOW_STEPS.AWAIT_NEW_VALUE]: _handleUpdate_GetValueAndSave
    };
    const handler = stepHandlers[currentState.step];
    if (handler) await handler(bot, msg, currentState);
}

async function _handleUpdate_GetClient(bot, msg, currentState) {
    const { id: userId } = msg.from;
    const { id: chatId } = msg.chat;
    const text = msg.text.trim();
    const user = await db.getUserByIdDb(userId);
    const isOwner = user?.role === ROLES.OWNER;
    const rowNumber = parseInt(text, 10);
    const clientFromMap = currentState.clientMap[rowNumber];
    const query = clientFromMap ? clientFromMap.id : text;
    const client = await db.findClientGeneralInfoDb(query, isOwner ? null : userId);
    if (!client) {
        const sentMessage = await bot.sendMessage(chatId, `Cliente no encontrado. Inténtalo de nuevo o escribe /cancel.`);
        currentState.messagesToDelete.push(sentMessage.message_id);
        return;
    }
    currentState.client = client;
    currentState.step = FLOW_STEPS.AWAIT_UPDATE_TYPE;
    await deleteMessages(bot, chatId, currentState.messagesToDelete);
    currentState.messagesToDelete = [];
    const prompt = `Cliente seleccionado: *${escapeMarkdown(client.name)}*.\n\n¿Qué deseas actualizar?\n\n*1.* Información General del Cliente\n*2.* Un Producto Específico`;
    const sentMessage = await bot.sendMessage(chatId, prompt, { parse_mode: 'Markdown' });
    currentState.messagesToDelete.push(sentMessage.message_id);
}

async function _handleUpdate_GetType(bot, msg, currentState) {
    const { id: chatId } = msg.chat;
    const { id: userId } = msg.from;
    const choice = msg.text.trim();
    if (choice !== '1' && choice !== '2') {
        const sentMessage = await bot.sendMessage(chatId, "Opción inválida. Por favor, elige '1' o '2'.");
        currentState.messagesToDelete.push(sentMessage.message_id);
        return;
    }
    await deleteMessages(bot, chatId, currentState.messagesToDelete);
    currentState.messagesToDelete = [];
    if (choice === '1') {
        currentState.updateType = 'client_general';
        currentState.step = FLOW_STEPS.AWAIT_FIELD_SELECTION;
        const fields = '`name`, `whatsapp`, `email`, `general_notes`';
        const prompt = `Ok, vamos a actualizar la información general.\n\n¿Qué campo deseas modificar?\nEnvía una de estas opciones: ${fields}`;
        const sentMessage = await bot.sendMessage(chatId, prompt, { parse_mode: 'Markdown' });
        currentState.messagesToDelete.push(sentMessage.message_id);
    } else {
        currentState.updateType = 'product_specific';
        const user = await db.getUserByIdDb(userId);
        const isOwner = user?.role === ROLES.OWNER;
        const products = await db.getClientProductsDb(currentState.client.id, isOwner ? null : userId);
        if (products.length === 0) {
            await bot.sendMessage(chatId, "Este cliente no tiene productos para actualizar.");
            clearActiveFlow(userId);
            return;
        }
        let productListMessage = `Ok, selecciona el producto a actualizar:\n\n\`\`\`\n`;
        const productMap = {};
        products.forEach((p, idx) => {
            const rowNum = idx + 1;
            productMap[rowNum] = p.id;
            productListMessage += `${rowNum}. ${p.product_name} (Vence: ${moment(p.expiry_date).format('DD-MM-YY')})\n`;
        });
        productListMessage += `\`\`\``;
        currentState.productMap = productMap;
        currentState.step = FLOW_STEPS.AWAIT_PRODUCT_SELECTION;
        const sentMessage = await bot.sendMessage(chatId, productListMessage, { parse_mode: 'Markdown' });
        currentState.messagesToDelete.push(sentMessage.message_id);
    }
}

async function _handleUpdate_GetProduct(bot, msg, currentState) {
    const { id: chatId } = msg.chat;
    const rowNumber = parseInt(msg.text.trim(), 10);
    const productId = currentState.productMap[rowNumber];
    if (!productId) {
        const sentMessage = await bot.sendMessage(chatId, `Número de producto inválido. Inténtalo de nuevo o /cancel.`);
        currentState.messagesToDelete.push(sentMessage.message_id);
        return;
    }
    currentState.productId = productId;
    currentState.step = FLOW_STEPS.AWAIT_FIELD_SELECTION;
    await deleteMessages(bot, chatId, currentState.messagesToDelete);
    currentState.messagesToDelete = [];
    const fields = '`product_name`, `expiry_date`, `status`, `product_notes`, `service_username`, `service_password`';
    const prompt = `Producto seleccionado. ¿Qué campo deseas modificar?\n\nEnvía una de estas opciones:\n${fields}`;
    const sentMessage = await bot.sendMessage(chatId, prompt, { parse_mode: 'Markdown' });
    currentState.messagesToDelete.push(sentMessage.message_id);
}

async function _handleUpdate_GetField(bot, msg, currentState) {
    const { id: chatId } = msg.chat;
    const field = msg.text.trim().toLowerCase();
    const allowedClientFields = ['name', 'whatsapp', 'email', 'general_notes'];
    const allowedProductFields = ['product_name', 'expiry_date', 'status', 'product_notes', 'service_username', 'service_password'];
    const isValid = (currentState.updateType === 'client_general' && allowedClientFields.includes(field)) ||
                      (currentState.updateType === 'product_specific' && allowedProductFields.includes(field));
    if (!isValid) {
        const sentMessage = await bot.sendMessage(chatId, `Campo inválido. Por favor, elige uno de la lista o /cancel.`);
        currentState.messagesToDelete.push(sentMessage.message_id);
        return;
    }
    currentState.fieldToUpdate = field;
    currentState.step = FLOW_STEPS.AWAIT_NEW_VALUE;
    await deleteMessages(bot, chatId, currentState.messagesToDelete);
    currentState.messagesToDelete = [];
    const prompt = `Ok, ingresa el nuevo valor para *${escapeMarkdown(field)}*:`;
    const sentMessage = await bot.sendMessage(chatId, prompt, { parse_mode: 'Markdown' });
    currentState.messagesToDelete.push(sentMessage.message_id);
}

async function _handleUpdate_GetValueAndSave(bot, msg, currentState) {
    const { id: chatId } = msg.chat;
    const { id: userId } = msg.from;
    const newValue = msg.text.trim();
    const user = await db.getUserByIdDb(userId);
    const isOwner = user?.role === ROLES.OWNER;
    if (currentState.fieldToUpdate === 'whatsapp' && newValue.toLowerCase() !== 'no' && !formatWhatsAppNumber(newValue)) {
        await bot.sendMessage(chatId, `Número de WhatsApp inválido. Operación cancelada.`);
    } else {
        if (currentState.updateType === 'client_general') {
            await db.updateFullClientGeneralInfoDb(currentState.client.id, { [currentState.fieldToUpdate]: newValue }, isOwner ? null : userId);
        } else {
            let valueToStore = newValue;
            if (currentState.fieldToUpdate === 'service_password') {
                valueToStore = encrypt(newValue);
            }
            await db.updateFullClientProductDb(currentState.productId, { [currentState.fieldToUpdate]: valueToStore }, isOwner ? null : userId);
        }
        await bot.sendMessage(chatId, `✅ ¡Campo actualizado exitosamente!`);
    }
    await deleteMessages(bot, chatId, currentState.messagesToDelete);
    clearActiveFlow(userId);
}

// ##########################################################################################
// FLUJO: RENOVAR PRODUCTO (/renew)
// ##########################################################################################
async function startRenewProduct(bot, chatId, userId) {
    if (!await userHasRole(userId, [ROLES.OWNER, ROLES.ADMIN, ROLES.MODERATOR])) {
        return bot.sendMessage(chatId, `No tienes permiso para renovar productos.`);
    }
    await _promptClientSelection(bot, chatId, userId, 'renewProduct', FLOW_STEPS.AWAIT_CLIENT_SELECTION_FOR_RENEWAL, 'Ok, vamos a renovar un producto. Primero, selecciona el cliente.');
}

async function handleRenewProductStep(bot, msg) {
    const userId = msg.from.id;
    const currentState = getActiveFlow(userId);
    if (!currentState) return;
    currentState.messagesToDelete.push(msg.message_id);
    const stepHandlers = {
        [FLOW_STEPS.AWAIT_CLIENT_SELECTION_FOR_RENEWAL]: _handleRenew_GetClient,
        [FLOW_STEPS.AWAIT_PRODUCT_SELECTION_FOR_RENEWAL]: _handleRenew_GetProduct,
        [FLOW_STEPS.AWAIT_DURATION_FOR_RENEWAL]: _handleRenew_GetDurationAndSave
    };
    const handler = stepHandlers[currentState.step];
    if (handler) await handler(bot, msg, currentState);
}

async function _handleRenew_GetClient(bot, msg, currentState) {
    const { id: userId } = msg.from;
    const { id: chatId } = msg.chat;
    const text = msg.text.trim();
    const user = await db.getUserByIdDb(userId);
    const isOwner = user?.role === ROLES.OWNER;
    const rowNumber = parseInt(text, 10);
    const clientFromMap = currentState.clientMap[rowNumber];
    const query = clientFromMap ? clientFromMap.id : text;
    const client = await db.findClientGeneralInfoDb(query, isOwner ? null : userId);
    if (!client) {
        const sentMessage = await bot.sendMessage(chatId, `Cliente no encontrado. Inténtalo de nuevo o /cancel.`);
        currentState.messagesToDelete.push(sentMessage.message_id);
        return;
    }
    currentState.client = client;
    const products = await db.getClientProductsDb(client.id, isOwner ? null : userId);
    if (products.length === 0) {
        await bot.sendMessage(chatId, `Este cliente no tiene productos para renovar.`);
        await deleteMessages(bot, chatId, currentState.messagesToDelete);
        clearActiveFlow(userId);
        return;
    }
    await deleteMessages(bot, chatId, currentState.messagesToDelete);
    currentState.messagesToDelete = [];
    let productListMessage = `Cliente: *${escapeMarkdown(client.name)}*.\n\n*Paso 2: Selecciona el producto a renovar*\n\n\`\`\`\n`;
    const productMap = {};
    products.forEach((p, idx) => {
        const rowNum = idx + 1;
        productMap[rowNum] = p;
        productListMessage += `${rowNum}. ${p.product_name} (Vence: ${moment(p.expiry_date).format('DD-MM-YY')})\n`;
    });
    productListMessage += `\`\`\``;
    currentState.productMap = productMap;
    currentState.step = FLOW_STEPS.AWAIT_PRODUCT_SELECTION_FOR_RENEWAL;
    const sentMessage = await bot.sendMessage(chatId, productListMessage, { parse_mode: 'Markdown' });
    currentState.messagesToDelete.push(sentMessage.message_id);
}

async function _handleRenew_GetProduct(bot, msg, currentState) {
    const { id: chatId } = msg.chat;
    const rowNumber = parseInt(msg.text.trim(), 10);
    const product = currentState.productMap[rowNumber];
    if (!product) {
        const sentMessage = await bot.sendMessage(chatId, `Número de producto inválido. Inténtalo de nuevo o /cancel.`);
        currentState.messagesToDelete.push(sentMessage.message_id);
        return;
    }
    currentState.product = product;
    currentState.step = FLOW_STEPS.AWAIT_DURATION_FOR_RENEWAL;
    await deleteMessages(bot, chatId, currentState.messagesToDelete);
    currentState.messagesToDelete = [];
    const prompt = `Producto seleccionado: *${escapeMarkdown(product.product_name)}*.\n\nVencimiento actual: *${moment(product.expiry_date).format('DD-MM-YYYY')}*\n\n*Paso 3:* ¿Por cuántos *días* quieres extender el servicio? (Ej: 30)`;
    const sentMessage = await bot.sendMessage(chatId, prompt, { parse_mode: 'Markdown' });
    currentState.messagesToDelete.push(sentMessage.message_id);
}

async function _handleRenew_GetDurationAndSave(bot, msg, currentState) {
    const { id: chatId } = msg.chat;
    const { id: userId } = msg.from;
    const durationDays = parseInt(msg.text.trim(), 10);
    if (isNaN(durationDays) || durationDays <= 0) {
        const sentMessage = await bot.sendMessage(chatId, `Duración inválida. Ingresa un número positivo de días.`);
        currentState.messagesToDelete.push(sentMessage.message_id);
        return;
    }
    const currentExpiryDate = moment(currentState.product.expiry_date);
    const newExpiryDate = currentExpiryDate.add(durationDays, 'days');
    const newNoticeDate = newExpiryDate.clone().subtract(2, 'days');
    const productDataToUpdate = {
        expiry_date: newExpiryDate.format('YYYY-MM-DD'),
        notice_date: newNoticeDate.format('YYYY-MM-DD'),
        status: PRODUCT_STATUS.RENEWED
    };
    await db.updateFullClientProductDb(currentState.product.id, productDataToUpdate, userId);
    await deleteMessages(bot, chatId, currentState.messagesToDelete);
    await bot.sendMessage(chatId, `✅ *¡Producto renovado!*\n*Cliente:* ${escapeMarkdown(currentState.client.name)}\n*Nuevo Vencimiento:* *${escapeMarkdown(newExpiryDate.format('DD-MM-YYYY'))}*`, { parse_mode: 'Markdown' });
    clearActiveFlow(userId);
}

// ##########################################################################################
// FLUJO: VER PRODUCTOS DEL USUARIO (/misproductos)
// ##########################################################################################
async function viewMyProducts(bot, chatId, userId) {
    try {
        const user = await db.getUserByIdDb(userId);
        if (user?.role !== ROLES.USER || !user.client_id) {
            await bot.sendMessage(chatId, `Este comando es solo para usuarios vinculados. Usa \`/presente [ID_Cliente]\``, { parse_mode: 'Markdown' });
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
        await handleError(error, bot, chatId);
    }
}

// --- EXPORTACIONES ---
module.exports = {
    getActiveFlow,
    routeFlowMessage,
    startAddClient,
    startAddProductToClient,
    startDeleteClient,
    startDeleteProduct,
    startUpdateClient,
    startRenewProduct,
    startViewClient,
    listClients,
    viewMyProducts,
    viewClientDetails,
    formatWhatsAppNumber,
    clearActiveFlow
};
