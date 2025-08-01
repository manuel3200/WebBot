// handlers/whatsappClientFunctions.js
// Contiene la lógica para los flujos interactivos de gestión de clientes y productos en WhatsApp.

const db = require('../utils/db');
const { ROLES, PRODUCT_STATUS, FLOW_STEPS } = require('../config/constants');
const { escapeMarkdown, userHasRole, handleError, encrypt, decrypt, delay } = require('../utils/helpers');
const { moment } = require('../config/botConfig');
const { v4: uuidv4 } = require('uuid');

const activeFlows = new Map();

// --- LÓGICA DE FLUJOS DE PRODUCTOS ---

async function startAddProduct(sock, sender) {
    const whatsappId = sender.split('@')[0];
    try {
        const userRes = await db.query('SELECT * FROM users WHERE whatsapp_id = $1', [whatsappId]);
        const user = userRes.rows[0];
        if (!user || !await userHasRole(user.id, [ROLES.OWNER, ROLES.ADMIN, ROLES.MODERATOR])) {
            return sock.sendMessage(sender, { text: "❌ No tienes permiso para añadir productos." });
        }
        const isOwner = user.role === ROLES.OWNER;
        const clients = await db.getAllClientsDb({}, isOwner ? null : user.id);
        if (clients.length === 0) return sock.sendMessage(sender, { text: "ℹ️ No tienes clientes a los que añadir productos." });

        let clientListMessage = `*Ok, vamos a añadir un producto.* Primero, selecciona el cliente:\n\n`;
        const clientMap = {};
        clients.forEach((c, i) => { clientMap[i + 1] = c; clientListMessage += `*${i + 1}.* ${escapeMarkdown(c.name)}\n`; });
        
        activeFlows.set(sender, { name: 'addProduct', step: 'AWAIT_CLIENT_SELECTION', clientMap });
        await sock.sendMessage(sender, { text: clientListMessage });
    } catch (error) { console.error(error); sock.sendMessage(sender, { text: "Error al iniciar el proceso." }); }
}

async function handleAddProductStep(sock, msg) {
    const sender = msg.key.remoteJid;
    const currentState = activeFlows.get(sender);
    const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();

    if (currentState.step === 'AWAIT_CLIENT_SELECTION') {
        const client = currentState.clientMap[parseInt(text, 10)];
        if (!client) {
            await sock.sendMessage(sender, { text: "Selección inválida. Operación cancelada." });
            return activeFlows.delete(sender);
        }
        currentState.client = client;
        currentState.step = 'AWAIT_PRODUCT_DETAILS';
        await sock.sendMessage(sender, { text: `Cliente: *${escapeMarkdown(client.name)}*.\n\nAhora, envía los detalles del producto en este formato:\n*Nombre, Duración (días), Usuario, Contraseña, Notas (opcional)*` });
    } else if (currentState.step === 'AWAIT_PRODUCT_DETAILS') {
        const details = text.split(',').map(item => item.trim());
        if (details.length < 4) return sock.sendMessage(sender, { text: `Formato incorrecto. Inténtalo de nuevo o /cancel.` });
        
        const [product_name, duration_days, service_username, service_password, product_notes] = details;
        const duration = parseInt(duration_days, 10);
        if (isNaN(duration) || duration <= 0) return sock.sendMessage(sender, { text: `La duración debe ser un número positivo.` });

        const expiryDate = moment().add(duration, 'days');
        const newProductData = {
            client_id: currentState.client.id,
            product_name,
            contract_date: moment().format('YYYY-MM-DD'),
            expiry_date: expiryDate.format('YYYY-MM-DD'),
            notice_date: expiryDate.clone().subtract(2, 'days').format('YYYY-MM-DD'),
            status: PRODUCT_STATUS.ACTIVE,
            product_notes: product_notes || null,
            service_username: service_username || null,
            service_password: encrypt(service_password)
        };
        const userRes = await db.query('SELECT * FROM users WHERE whatsapp_id = $1', [sender.split('@')[0]]);
        await db.addClientProductDb(newProductData, userRes.rows[0].id);
        await sock.sendMessage(sender, { text: `✅ Producto *${escapeMarkdown(product_name)}* añadido a *${escapeMarkdown(currentState.client.name)}*.` });
        activeFlows.delete(sender);
    }
}

async function startDeleteProduct(sock, sender) {
    const whatsappId = sender.split('@')[0];
    try {
        const userRes = await db.query('SELECT * FROM users WHERE whatsapp_id = $1', [whatsappId]);
        const user = userRes.rows[0];
        if (!user || !await userHasRole(user.id, [ROLES.OWNER, ROLES.ADMIN, ROLES.MODERATOR])) {
            return sock.sendMessage(sender, { text: "❌ No tienes permiso para eliminar productos." });
        }
        const isOwner = user.role === ROLES.OWNER;
        const clients = await db.getAllClientsDb({}, isOwner ? null : user.id);
        if (clients.length === 0) return sock.sendMessage(sender, { text: "ℹ️ No tienes clientes." });

        let clientListMessage = `*Ok, vamos a eliminar un producto.* Primero, selecciona el cliente:\n\n`;
        const clientMap = {};
        clients.forEach((c, i) => { clientMap[i + 1] = c; clientListMessage += `*${i + 1}.* ${escapeMarkdown(c.name)}\n`; });
        
        activeFlows.set(sender, { name: 'deleteProduct', step: 'AWAIT_CLIENT_SELECTION', clientMap });
        await sock.sendMessage(sender, { text: clientListMessage });
    } catch (error) { console.error(error); sock.sendMessage(sender, { text: "Error al iniciar el proceso." }); }
}

async function handleDeleteProductStep(sock, msg) {
    const sender = msg.key.remoteJid;
    const currentState = activeFlows.get(sender);
    const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();

    if (currentState.step === 'AWAIT_CLIENT_SELECTION') {
        const client = currentState.clientMap[parseInt(text, 10)];
        if (!client) {
            await sock.sendMessage(sender, { text: "Selección inválida. Operación cancelada." });
            return activeFlows.delete(sender);
        }
        currentState.client = client;
        const userRes = await db.query('SELECT * FROM users WHERE whatsapp_id = $1', [sender.split('@')[0]]);
        const user = userRes.rows[0];
        const isOwner = user.role === ROLES.OWNER;
        const products = await db.getClientProductsDb(client.id, isOwner ? null : user.id);
        if (products.length === 0) {
            await sock.sendMessage(sender, { text: `El cliente *${escapeMarkdown(client.name)}* no tiene productos. Operación cancelada.` });
            return activeFlows.delete(sender);
        }
        
        let productList = `Cliente: *${escapeMarkdown(client.name)}*.\n\nAhora, selecciona el producto a eliminar:\n\n`;
        const productMap = {};
        products.forEach((p, i) => { productMap[i + 1] = p; productList += `*${i + 1}.* ${escapeMarkdown(p.product_name)}\n`; });
        
        currentState.productMap = productMap;
        currentState.step = 'AWAIT_PRODUCT_SELECTION';
        await sock.sendMessage(sender, { text: productList });

    } else if (currentState.step === 'AWAIT_PRODUCT_SELECTION') {
        const product = currentState.productMap[parseInt(text, 10)];
        if (!product) {
            await sock.sendMessage(sender, { text: "Selección inválida. Operación cancelada." });
            return activeFlows.delete(sender);
        }
        const userRes = await db.query('SELECT * FROM users WHERE whatsapp_id = $1', [sender.split('@')[0]]);
        const user = userRes.rows[0];
        const isOwner = user.role === ROLES.OWNER;
        await db.deleteClientProductDb(product.id, isOwner ? null : user.id);
        await sock.sendMessage(sender, { text: `✅ Producto *${escapeMarkdown(product.product_name)}* eliminado.` });
        activeFlows.delete(sender);
    }
}

async function startRenewProduct(sock, sender) {
    const whatsappId = sender.split('@')[0];
    try {
        const userRes = await db.query('SELECT * FROM users WHERE whatsapp_id = $1', [whatsappId]);
        const user = userRes.rows[0];
        if (!user || !await userHasRole(user.id, [ROLES.OWNER, ROLES.ADMIN, ROLES.MODERATOR])) {
            return sock.sendMessage(sender, { text: "❌ No tienes permiso para renovar productos." });
        }
        const isOwner = user.role === ROLES.OWNER;
        const clients = await db.getAllClientsDb({}, isOwner ? null : user.id);
        if (clients.length === 0) return sock.sendMessage(sender, { text: "ℹ️ No tienes clientes." });

        let clientListMessage = `*Ok, vamos a renovar un producto.* Primero, selecciona el cliente:\n\n`;
        const clientMap = {};
        clients.forEach((c, i) => { clientMap[i + 1] = c; clientListMessage += `*${i + 1}.* ${escapeMarkdown(c.name)}\n`; });
        
        activeFlows.set(sender, { name: 'renewProduct', step: 'AWAIT_CLIENT_SELECTION', clientMap });
        await sock.sendMessage(sender, { text: clientListMessage });
    } catch (error) { console.error(error); sock.sendMessage(sender, { text: "Error al iniciar el proceso." }); }
}

async function handleRenewProductStep(sock, msg) {
    const sender = msg.key.remoteJid;
    const currentState = activeFlows.get(sender);
    const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();

    if (currentState.step === 'AWAIT_CLIENT_SELECTION') {
        const client = currentState.clientMap[parseInt(text, 10)];
        if (!client) {
            await sock.sendMessage(sender, { text: "Selección inválida. Operación cancelada." });
            return activeFlows.delete(sender);
        }
        currentState.client = client;
        const userRes = await db.query('SELECT * FROM users WHERE whatsapp_id = $1', [sender.split('@')[0]]);
        const user = userRes.rows[0];
        const isOwner = user.role === ROLES.OWNER;
        const products = await db.getClientProductsDb(client.id, isOwner ? null : user.id);
        if (products.length === 0) {
            await sock.sendMessage(sender, { text: `El cliente *${escapeMarkdown(client.name)}* no tiene productos. Operación cancelada.` });
            return activeFlows.delete(sender);
        }
        
        let productList = `Cliente: *${escapeMarkdown(client.name)}*.\n\nAhora, selecciona el producto a renovar:\n\n`;
        const productMap = {};
        products.forEach((p, i) => { productMap[i + 1] = p; productList += `*${i + 1}.* ${escapeMarkdown(p.product_name)} (Vence: ${moment(p.expiry_date).format('DD/MM/YY')})\n`; });
        
        currentState.productMap = productMap;
        currentState.step = 'AWAIT_PRODUCT_SELECTION';
        await sock.sendMessage(sender, { text: productList });

    } else if (currentState.step === 'AWAIT_PRODUCT_SELECTION') {
        const product = currentState.productMap[parseInt(text, 10)];
        if (!product) {
            await sock.sendMessage(sender, { text: "Selección inválida. Operación cancelada." });
            return activeFlows.delete(sender);
        }
        currentState.product = product;
        currentState.step = 'AWAIT_DURATION';
        await sock.sendMessage(sender, { text: `Producto: *${escapeMarkdown(product.product_name)}*.\n¿Por cuántos días quieres renovar el servicio?` });

    } else if (currentState.step === 'AWAIT_DURATION') {
        const duration = parseInt(text, 10);
        if (isNaN(duration) || duration <= 0) {
            return sock.sendMessage(sender, { text: `La duración debe ser un número positivo.` });
        }
        const product = currentState.product;
        const newExpiryDate = moment(product.expiry_date).add(duration, 'days');
        const productDataToUpdate = {
            expiry_date: newExpiryDate.format('YYYY-MM-DD'),
            notice_date: newExpiryDate.clone().subtract(2, 'days').format('YYYY-MM-DD'),
            status: PRODUCT_STATUS.RENEWED
        };
        const userRes = await db.query('SELECT * FROM users WHERE whatsapp_id = $1', [sender.split('@')[0]]);
        const user = userRes.rows[0];
        const isOwner = user.role === ROLES.OWNER;
        await db.updateFullClientProductDb(product.id, productDataToUpdate, isOwner ? null : user.id);
        await sock.sendMessage(sender, { text: `✅ Producto renovado. Nuevo vencimiento: *${newExpiryDate.format('DD/MM/YYYY')}*.` });
        activeFlows.delete(sender);
    }
}

async function startUpdateClient(sock, sender) {
    const whatsappId = sender.split('@')[0];
    try {
        const userRes = await db.query('SELECT * FROM users WHERE whatsapp_id = $1', [whatsappId]);
        const user = userRes.rows[0];
        if (!user || !await userHasRole(user.id, [ROLES.OWNER, ROLES.ADMIN, ROLES.MODERATOR])) {
            return sock.sendMessage(sender, { text: "❌ No tienes permiso para actualizar." });
        }
        const isOwner = user.role === ROLES.OWNER;
        const clients = await db.getAllClientsDb({}, isOwner ? null : user.id);
        if (clients.length === 0) {
            return sock.sendMessage(sender, { text: "ℹ️ No tienes clientes registrados para actualizar." });
        }
        let clientListMessage = `*Ok, vamos a actualizar.* Primero, selecciona un cliente:\n\n`;
        const clientMap = {};
        clients.forEach((client, index) => {
            const rowNumber = index + 1;
            clientMap[rowNumber] = client;
            clientListMessage += `*${rowNumber}.* ${escapeMarkdown(client.name)}\n`;
        });
        activeFlows.set(sender, { name: 'updateClient', step: 'AWAIT_CLIENT_SELECTION', clientMap: clientMap });
        await sock.sendMessage(sender, { text: clientListMessage });
    } catch (error) {
        console.error("Error en startUpdateClient:", error);
        sock.sendMessage(sender, { text: "Ocurrió un error al iniciar el proceso." });
    }
}

async function handleUpdateClientStep(sock, msg) {
    const sender = msg.key.remoteJid;
    const currentState = activeFlows.get(sender);
    const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
    try {
        switch (currentState.step) {
            case 'AWAIT_CLIENT_SELECTION':
                const selection = parseInt(text, 10);
                const client = currentState.clientMap[selection];
                if (!client) {
                    await sock.sendMessage(sender, { text: "Selección inválida. Operación cancelada." });
                    return activeFlows.delete(sender);
                }
                currentState.client = client;
                currentState.step = 'AWAIT_UPDATE_TYPE';
                await sock.sendMessage(sender, { text: `Cliente seleccionado: *${escapeMarkdown(client.name)}*.\n\n¿Qué deseas actualizar?\n\n*1.* Información General del Cliente\n*2.* Un Producto Específico` });
                break;
            case 'AWAIT_UPDATE_TYPE':
                if (text === '1') {
                    currentState.updateType = 'client';
                    currentState.step = 'AWAIT_FIELD_SELECTION';
                    await sock.sendMessage(sender, { text: "Ok. ¿Qué campo quieres cambiar?\nResponde con: `name`, `whatsapp`, `email` o `general_notes`" });
                } else if (text === '2') {
                    currentState.updateType = 'product';
                    const userRes = await db.query('SELECT * FROM users WHERE whatsapp_id = $1', [sender.split('@')[0]]);
                    const user = userRes.rows[0];
                    const isOwner = user.role === ROLES.OWNER;
                    const products = await db.getClientProductsDb(currentState.client.id, isOwner ? null : user.id);
                    if (products.length === 0) {
                        await sock.sendMessage(sender, { text: "Este cliente no tiene productos para actualizar. Operación cancelada." });
                        return activeFlows.delete(sender);
                    }
                    let productList = "Selecciona el producto a modificar:\n\n";
                    const productMap = {};
                    products.forEach((p, i) => {
                        productMap[i + 1] = p;
                        productList += `*${i + 1}.* ${escapeMarkdown(p.product_name)} (Vence: ${moment(p.expiry_date).format('DD/MM/YY')})\n`;
                    });
                    currentState.productMap = productMap;
                    currentState.step = 'AWAIT_PRODUCT_SELECTION';
                    await sock.sendMessage(sender, { text: productList });
                } else {
                    await sock.sendMessage(sender, { text: "Opción inválida. Responde '1' o '2'. Intenta de nuevo." });
                }
                break;
            case 'AWAIT_PRODUCT_SELECTION':
                const prodSelection = parseInt(text, 10);
                const product = currentState.productMap[prodSelection];
                if (!product) {
                    await sock.sendMessage(sender, { text: "Selección de producto inválida. Operación cancelada." });
                    return activeFlows.delete(sender);
                }
                currentState.product = product;
                currentState.step = 'AWAIT_FIELD_SELECTION';
                await sock.sendMessage(sender, { text: "Ok. ¿Qué campo del producto quieres cambiar?\nResponde con: `product_name`, `expiry_date`, `status`, `service_username`, `service_password` o `product_notes`" });
                break;
            case 'AWAIT_FIELD_SELECTION':
                const field = text.toLowerCase();
                const allowedClientFields = ['name', 'whatsapp', 'email', 'general_notes'];
                const allowedProductFields = ['product_name', 'expiry_date', 'status', 'service_username', 'service_password', 'product_notes'];
                const isValid = (currentState.updateType === 'client' && allowedClientFields.includes(field)) || (currentState.updateType === 'product' && allowedProductFields.includes(field));
                if (!isValid) {
                    await sock.sendMessage(sender, { text: "Campo no válido. Por favor, elige uno de la lista. Operación cancelada." });
                    return activeFlows.delete(sender);
                }
                currentState.fieldToUpdate = field;
                currentState.step = 'AWAIT_NEW_VALUE';
                await sock.sendMessage(sender, { text: `Ingresa el nuevo valor para *${escapeMarkdown(field)}*: ` });
                break;
            case 'AWAIT_NEW_VALUE':
                let newValue = text;
                const userRes = await db.query('SELECT * FROM users WHERE whatsapp_id = $1', [sender.split('@')[0]]);
                const user = userRes.rows[0];
                const isOwner = user.role === ROLES.OWNER;
                if (currentState.updateType === 'client') {
                    await db.updateFullClientGeneralInfoDb(currentState.client.id, { [currentState.fieldToUpdate]: newValue }, isOwner ? null : user.id);
                } else {
                    if (currentState.fieldToUpdate === 'service_password') {
                        newValue = encrypt(newValue);
                    }
                    if (currentState.fieldToUpdate === 'expiry_date') {
                        newValue = moment(newValue, 'DD/MM/YYYY').format('YYYY-MM-DD');
                    }
                    await db.updateFullClientProductDb(currentState.product.id, { [currentState.fieldToUpdate]: newValue }, isOwner ? null : user.id);
                }
                await sock.sendMessage(sender, { text: `✅ ¡Campo *${escapeMarkdown(currentState.fieldToUpdate)}* actualizado correctamente!` });
                activeFlows.delete(sender);
                break;
        }
    } catch (error) {
        console.error("Error en handleUpdateClientStep:", error);
        await sock.sendMessage(sender, { text: "Ocurrió un error inesperado durante la actualización." });
        activeFlows.delete(sender);
    }
}

async function startDeleteClient(sock, sender) {
    const whatsappId = sender.split('@')[0];
    try {
        const userRes = await db.query('SELECT * FROM users WHERE whatsapp_id = $1', [whatsappId]);
        const user = userRes.rows[0];
        if (!user || !await userHasRole(user.id, [ROLES.OWNER, ROLES.ADMIN])) {
            return sock.sendMessage(sender, { text: "❌ No tienes permiso para eliminar clientes." });
        }
        const isOwner = user.role === ROLES.OWNER;
        const clients = await db.getAllClientsDb({}, isOwner ? null : user.id);
        if (clients.length === 0) {
            return sock.sendMessage(sender, { text: "ℹ️ No tienes clientes registrados para eliminar." });
        }
        let clientListMessage = `*Selecciona el cliente que deseas eliminar.*\n\n⚠️ *Atención:* Esta acción eliminará al cliente y todos sus productos de forma permanente.\n\nResponde con el número correspondiente:\n\n`;
        const clientMap = {};
        clients.forEach((client, index) => {
            const rowNumber = index + 1;
            clientMap[rowNumber] = client;
            clientListMessage += `*${rowNumber}.* ${escapeMarkdown(client.name)}\n`;
        });
        activeFlows.set(sender, { name: 'deleteClient', step: 'AWAIT_CLIENT_SELECTION_FOR_DELETION', clientMap: clientMap });
        await sock.sendMessage(sender, { text: clientListMessage });
    } catch (error) {
        console.error("Error en startDeleteClient:", error);
        sock.sendMessage(sender, { text: "Ocurrió un error al iniciar el proceso de eliminación." });
    }
}

async function handleDeleteClientStep(sock, msg) {
    const sender = msg.key.remoteJid;
    const currentState = activeFlows.get(sender);
    const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
    if (currentState.step === 'AWAIT_CLIENT_SELECTION_FOR_DELETION') {
        const selection = parseInt(text, 10);
        const clientToDelete = currentState.clientMap[selection];
        if (!clientToDelete) {
            await sock.sendMessage(sender, { text: "Selección inválida. Operación cancelada." });
            activeFlows.delete(sender);
            return;
        }
        currentState.clientToDelete = clientToDelete;
        currentState.step = 'AWAIT_CONFIRMATION_FOR_DELETION';
        await sock.sendMessage(sender, { text: `Has seleccionado a *${escapeMarkdown(clientToDelete.name)}*.\n\n¿Estás absolutamente seguro? Esta acción no se puede deshacer.\n\nEscribe *SI* para confirmar la eliminación.` });
    } else if (currentState.step === 'AWAIT_CONFIRMATION_FOR_DELETION') {
        if (text.toLowerCase() === 'si') {
            try {
                const userRes = await db.query('SELECT * FROM users WHERE whatsapp_id = $1', [sender.split('@')[0]]);
                const user = userRes.rows[0];
                const isOwner = user.role === ROLES.OWNER;
                await db.deleteClientDb(currentState.clientToDelete.id, isOwner ? null : user.id);
                await sock.sendMessage(sender, { text: `✅ Cliente *${escapeMarkdown(currentState.clientToDelete.name)}* ha sido eliminado exitosamente.` });
            } catch (error) {
                console.error("Error al eliminar cliente de la DB:", error);
                await sock.sendMessage(sender, { text: "Hubo un error al intentar eliminar el cliente." });
            }
        } else {
            await sock.sendMessage(sender, { text: "Confirmación no válida. Operación cancelada." });
        }
        activeFlows.delete(sender);
    }
}

async function viewClientDetails(sock, sender, query) {
    const whatsappId = sender.split('@')[0];
    try {
        const userRes = await db.query('SELECT * FROM users WHERE whatsapp_id = $1', [whatsappId]);
        const user = userRes.rows[0];
        if (!user) {
            return sock.sendMessage(sender, { text: "❌ Tu número no está vinculado." });
        }
        if (!await userHasRole(user.id, [ROLES.OWNER, ROLES.ADMIN, ROLES.MODERATOR])) {
            return sock.sendMessage(sender, { text: "❌ No tienes permiso para ver detalles de clientes." });
        }
        const isOwner = user.role === ROLES.OWNER;
        const client = await db.findClientGeneralInfoDb(query, isOwner ? null : user.id);
        if (!client) {
            return sock.sendMessage(sender, { text: `ℹ️ No se encontró ningún cliente que coincida con "${escapeMarkdown(query)}".` });
        }
        const whatsappLink = client.whatsapp ? `https://wa.me/${client.whatsapp.replace('+', '')}` : 'N/A';
        let clientDetailsMessage = `*Detalles del Cliente:*\n\n` + `*ID:* \`${escapeMarkdown(client.id)}\`\n` + `*Nombre:* ${escapeMarkdown(client.name)}\n` + `*WhatsApp:* ${escapeMarkdown(whatsappLink)}\n` + `*Correo:* ${escapeMarkdown(client.email || 'N/A')}\n` + `*Notas:* ${escapeMarkdown(client.general_notes || 'N/A')}`;
        await sock.sendMessage(sender, { text: clientDetailsMessage });
        const products = await db.getClientProductsDb(client.id, isOwner ? null : user.id);
        if (products.length > 0) {
            await sock.sendMessage(sender, { text: `*Productos Contratados (${products.length}):*` });
            for (const product of products) {
                const decryptedPassword = decrypt(product.service_password);
                let productDetailsMessage = `*Producto:* ${escapeMarkdown(product.product_name)}\n` + `  - *Estado:* ${escapeMarkdown(product.status)}\n` + `  - *Vence:* ${moment(product.expiry_date).format('DD-MM-YYYY')}\n` + `  - *Usuario:* \`${escapeMarkdown(product.service_username || 'N/A')}\`\n` + `  - *Contraseña:* \`${escapeMarkdown(decryptedPassword || 'N/A')}\`\n` + `  - *Notas:* ${escapeMarkdown(product.product_notes || 'N/A')}`;
                await sock.sendMessage(sender, { text: productDetailsMessage });
            }
        } else {
            await sock.sendMessage(sender, { text: `Este cliente no tiene productos registrados.` });
        }
    } catch (error) {
        console.error("Error en viewClientDetails:", error);
        sock.sendMessage(sender, { text: "Ocurrió un error al buscar el cliente." });
    }
}

async function listClients(sock, sender, page = 1) {
    const whatsappId = sender.split('@')[0];
    try {
        const userRes = await db.query('SELECT * FROM users WHERE whatsapp_id = $1', [whatsappId]);
        const user = userRes.rows[0];
        if (!user) {
            return sock.sendMessage(sender, { text: "❌ Tu número no está vinculado." });
        }
        if (!await userHasRole(user.id, [ROLES.OWNER, ROLES.ADMIN, ROLES.MODERATOR])) {
            return sock.sendMessage(sender, { text: "❌ No tienes permiso para listar clientes." });
        }
        const isOwner = user.role === ROLES.OWNER;
        const allClients = await db.getAllClientsDb({}, isOwner ? null : user.id);
        if (allClients.length === 0) {
            return sock.sendMessage(sender, { text: "ℹ️ No tienes clientes registrados. Usa /addclient para empezar." });
        }
        const pageSize = 5;
        const totalPages = Math.ceil(allClients.length / pageSize);
        const pageToShow = Math.max(1, Math.min(page, totalPages));
        const paginatedClients = allClients.slice((pageToShow - 1) * pageSize, pageToShow * pageSize);
        let responseMessage = `📋 *Tu Lista de Clientes* (Página ${pageToShow}/${totalPages})\n\n`;
        for (const client of paginatedClients) {
            const products = await db.getClientProductsDb(client.id, isOwner ? null : user.id);
            responseMessage += `*${escapeMarkdown(client.name)}* (ID: \`${client.id}\`)\n`;
            if (products.length > 0) {
                products.forEach(p => {
                    responseMessage += `  - ${escapeMarkdown(p.product_name)} (Vence: ${moment(p.expiry_date).format('DD/MM/YY')})\n`;
                });
            } else {
                responseMessage += `  - _Sin productos registrados_\n`;
            }
            responseMessage += `\n`;
        }
        if (totalPages > 1) {
            responseMessage += `----\n`;
            if (pageToShow < totalPages) {
                responseMessage += `Para ver la siguiente página, envía \`/listclients ${pageToShow + 1}\``;
            } else {
                responseMessage += `Estás en la última página.`;
            }
        }
        await sock.sendMessage(sender, { text: responseMessage });
    } catch (error) {
        console.error("Error en listClients de WhatsApp:", error);
        sock.sendMessage(sender, { text: "Ocurrió un error al listar los clientes." });
    }
}

async function startAddClient(sock, sender) {
    const whatsappId = sender.split('@')[0];
    const userRes = await db.query('SELECT * FROM users WHERE whatsapp_id = $1', [whatsappId]);
    const user = userRes.rows[0];
    if (!user || !await userHasRole(user.id, [ROLES.OWNER, ROLES.ADMIN, ROLES.MODERATOR])) {
        return sock.sendMessage(sender, { text: `❌ Lo siento, tu rol no te permite añadir clientes.` });
    }
    activeFlows.set(sender, { name: 'addClient', step: FLOW_STEPS.AWAIT_CLIENT_NAME, data: {} });
    await sock.sendMessage(sender, { text: `Ok, vamos a añadir un *nuevo cliente*.\n\nPara cancelar en cualquier momento, envía /cancel.\n\n*Paso 1:* Dime el *nombre* del cliente:` });
}

async function routeFlowMessage(sock, msg) {
    const sender = msg.key.remoteJid;
    const flow = activeFlows.get(sender);
    if (!flow) return;

    // El enrutador ahora también maneja el mini-flujo de 'viewClient'
    if (flow.name === 'viewClient' && flow.step === 'AWAIT_QUERY') {
        const query = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        await viewClientDetails(sock, sender, query);
        activeFlows.delete(sender);
        return;
    }
    
    // ... (resto del enrutador para flujos complejos)
    if (flow.name === 'addClient') await handleAddClientStep(sock, msg);
    else if (flow.name === 'deleteClient') await handleDeleteClientStep(sock, msg);
    else if (flow.name === 'updateClient') await handleUpdateClientStep(sock, msg);
    else if (flow.name === 'addProduct') await handleAddProductStep(sock, msg);
    else if (flow.name === 'deleteProduct') await handleDeleteProductStep(sock, msg);
    else if (flow.name === 'renewProduct') await handleRenewProductStep(sock, msg);
}

async function handleAddClientStep(sock, msg) {
    const sender = msg.key.remoteJid;
    const currentState = activeFlows.get(sender);
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
    switch (currentState.step) {
        case FLOW_STEPS.AWAIT_CLIENT_NAME:
            currentState.data.name = text.trim();
            currentState.step = FLOW_STEPS.AWAIT_CLIENT_WHATSAPP;
            await sock.sendMessage(sender, { text: `*Paso 2:* Ingresa el *WhatsApp* del cliente (o "no"):` });
            break;
        case FLOW_STEPS.AWAIT_CLIENT_WHATSAPP:
            currentState.data.whatsapp = text.trim().toLowerCase() === 'no' ? null : text.trim();
            currentState.step = FLOW_STEPS.AWAIT_CLIENT_EMAIL;
            await sock.sendMessage(sender, { text: `*Paso 3:* Ingresa el *correo* del cliente (o "no"):` });
            break;
        case FLOW_STEPS.AWAIT_CLIENT_EMAIL:
            currentState.data.email = text.trim().toLowerCase() === 'no' ? null : text.trim();
            currentState.step = FLOW_STEPS.AWAIT_CLIENT_NOTES;
            await sock.sendMessage(sender, { text: `*Paso 4:* ¿Alguna *nota general* sobre el cliente? (o "no"):` });
            break;
        case FLOW_STEPS.AWAIT_CLIENT_NOTES:
            currentState.data.generalNotes = text.trim().toLowerCase() === 'no' ? null : text.trim();
            currentState.data.id = `clt_${uuidv4().split('-')[0]}`;
            currentState.step = FLOW_STEPS.AWAIT_PRODUCT_NAME;
            await sock.sendMessage(sender, { text: `*Cliente "${currentState.data.name}"* listo. Ahora, su primer producto.\n\n*Paso 5:* ¿Qué *producto* vendiste?` });
            break;
        case FLOW_STEPS.AWAIT_PRODUCT_NAME:
            currentState.data.productName = text.trim();
            currentState.step = FLOW_STEPS.AWAIT_PRODUCT_DURATION;
            await sock.sendMessage(sender, { text: `*Paso 6:* ¿Cuántos *días* dura el servicio? (Ej: 30):` });
            break;
        case FLOW_STEPS.AWAIT_PRODUCT_DURATION:
            const durationDays = parseInt(text.trim(), 10);
            if (isNaN(durationDays) || durationDays <= 0) {
                await sock.sendMessage(sender, { text: `Duración inválida. Ingresa un número positivo de días.` });
                return;
            }
            currentState.data.durationDays = durationDays;
            currentState.step = FLOW_STEPS.AWAIT_PRODUCT_USERNAME;
            await sock.sendMessage(sender, { text: `*Paso 7:* Ahora, ingresa el *usuario/correo* para el servicio (o "no"):` });
            break;
        case FLOW_STEPS.AWAIT_PRODUCT_USERNAME:
            currentState.data.serviceUsername = text.trim().toLowerCase() === 'no' ? null : text.trim();
            currentState.step = FLOW_STEPS.AWAIT_PRODUCT_PASSWORD;
            await sock.sendMessage(sender, { text: `*Paso 8:* Finalmente, ingresa la *contraseña* para el servicio (o "no"):` });
            break;
        case FLOW_STEPS.AWAIT_PRODUCT_PASSWORD:
            const plainPassword = text.trim().toLowerCase() === 'no' ? null : text.trim();
            const expiryDate = moment().add(currentState.data.durationDays, 'days');
            const noticeDate = expiryDate.clone().subtract(2, 'days');
            const productData = {
                product_name: currentState.data.productName,
                contract_date: moment().format('YYYY-MM-DD'),
                expiry_date: expiryDate.format('YYYY-MM-DD'),
                notice_date: noticeDate.format('YYYY-MM-DD'),
                status: PRODUCT_STATUS.ACTIVE,
                product_notes: null,
                service_username: currentState.data.serviceUsername,
                service_password: encrypt(plainPassword)
            };
            const userRes = await db.query('SELECT * FROM users WHERE whatsapp_id = $1', [sender.split('@')[0]]);
            const ownerUserId = userRes.rows[0].id;
            await db.addClientWithFirstProductDb(currentState.data, productData, ownerUserId);
            await sock.sendMessage(sender, { text: `✅ *¡Cliente y producto añadidos exitosamente!*` });
            activeFlows.delete(sender);
            break;
    }
}

function cancelFlow(sock, sender) {
    if (activeFlows.has(sender)) {
        activeFlows.delete(sender);
        sock.sendMessage(sender, { text: `Operación cancelada.` });
    } else {
        sock.sendMessage(sender, { text: `No hay ninguna operación en curso para cancelar.` });
    }
}

module.exports = {
    startAddClient,
    routeFlowMessage,
    cancelFlow,
    listClients,
    viewClientDetails,
    startDeleteClient,
    startUpdateClient,
    startAddProduct,
    startDeleteProduct,
    startRenewProduct,
    activeFlows // <-- ¡CAMBIO CLAVE! Exportamos el mapa de flujos.
};
