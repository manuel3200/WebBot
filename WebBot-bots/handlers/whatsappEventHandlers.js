// handlers/whatsappEventHandlers.js

const { sendWhatsAppStats } = require('./whatsappStatsFunctions');
const { 
    startAddClient, routeFlowMessage, cancelFlow, listClients, 
    viewClientDetails, startDeleteClient, startUpdateClient,
    startAddProduct, startDeleteProduct, startRenewProduct,
    activeFlows: clientFlows // Renombramos para evitar conflictos y lo importamos
} = require('./whatsappClientFunctions');
const { sendMainMenu, sendClientsMenu, activeMenus } = require('./whatsappMenuFunctions');
const { handleSetNombre, sendInfo, handlePresente, handleMisProductos, handleStart } = require('./whatsappCommandFunctions');
const { handleRestoreFile, handleRestoreConfirmation, backupRestoreFlows } = require('./whatsappBackupFunctions');
const { isBotActive, userHasRole } = require('../utils/helpers');
const { ROLES } = require('../config/constants');
const db = require('../utils/db');

function setupWhatsAppEventHandlers(sock) {

    const eventHandler = {
        handleUpsert: async (m) => {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const sender = msg.key.remoteJid;
            
            const whatsappId = sender.split('@')[0];
            const user = await db.findUserByWhatsappIdDb(whatsappId);
            const isOwner = user ? await userHasRole(user.id, [ROLES.OWNER]) : false;

            // Descomenta este bloque si quieres reactivar la restricción de horarios
            /*
            if (!isOwner && !isBotActive()) {
                const offHoursMessage = "Hola 👋. Nuestro horario de atención automática es de 8 AM a 10 PM. Tu mensaje ha sido recibido y será procesado en cuanto volvamos a estar activos. ¡Gracias por tu paciencia!";
                await sock.sendMessage(sender, { text: offHoursMessage });
                console.log(`Mensaje recibido fuera de horario de ${sender}. Respuesta automática enviada.`);
                return;
            }
            */

            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
            
            const messageContent = msg.message;
            const isRestoreFile = messageContent.documentMessage && backupRestoreFlows.has(sender) && backupRestoreFlows.get(sender).step === 'AWAIT_FILE';

            if (isRestoreFile) {
                return handleRestoreFile(sock, msg);
            }

            if (!text) return;

            // 1. Si es un comando, lo procesamos
            if (text.startsWith('/')) {
                console.log(`Comando recibido de [${sender}]: ${text}`);
                activeMenus.delete(sender);

                const [command, ...args] = text.split(/\s+/);
                const mainCommand = command.toLowerCase();
                
                if (mainCommand === '/start') return handleStart(sock, msg);
                if (mainCommand === '/listclients') {
                    const page = args[0] ? parseInt(args[0], 10) : 1;
                    return listClients(sock, sender, page);
                }
                if (mainCommand === '/client') {
                    const query = args.join(' ');
                    return viewClientDetails(sock, sender, query);
                }
                if (mainCommand === '/mimbre') {
                    const newName = args.join(' ');
                    return handleSetNombre(sock, sender, newName);
                }
                if (mainCommand === '/presente') {
                    const clientId = args[0];
                    return handlePresente(sock, sender, clientId);
                }

                await eventHandler.handleCommand(sender, mainCommand);

            // 2. Si es una respuesta a un menú activo
            } else if (activeMenus.has(sender)) {
                const menu = activeMenus.get(sender);
                const option = menu.options[text];

                if (option) {
                    activeMenus.delete(sender);
                    
                    if (option.command === 'clients_menu') {
                        sendClientsMenu(sock, sender);
                    } else if (option.command === 'main_menu') {
                        sendMainMenu(sock, sender);
                    } else if (option.command === '/client') {
                        // Inicia el mini-flujo para pedir el ID/nombre
                        clientFlows.set(sender, { name: 'viewClient', step: 'AWAIT_QUERY' });
                        await sock.sendMessage(sender, { text: "Por favor, dime el ID o nombre del cliente que quieres ver." });
                    } else {
                        // Ejecuta el comando asociado a la opción numérica
                        await eventHandler.handleCommand(sender, option.command);
                    }
                } else {
                    await sock.sendMessage(sender, { text: "Opción no válida. Por favor, responde con un número del menú o envía /cancel." });
                }
            // 3. Si es parte de un flujo interactivo
            } else {
                if (backupRestoreFlows.has(sender)) {
                    await handleRestoreConfirmation(sock, msg);
                } else if (clientFlows.has(sender)) {
                    // El enrutador general ahora maneja todos los flujos
                    await routeFlowMessage(sock, msg);
                }
            }
        },

        handleCommand: async (sender, command) => {
            switch (command) {
                case '/menu': await sendMainMenu(sock, sender); break;
                case '/info': await sendInfo(sock, sender); break;
                case '/stats': await sendWhatsAppStats(sock, sender); break;
                case '/listclients': await listClients(sock, sender, 1); break;
                case '/addclient': await startAddClient(sock, sender); break;
                case '/updateclient': await startUpdateClient(sock, sender); break;
                case '/addproduct': await startAddProduct(sock, sender); break;
                case '/renew': await startRenewProduct(sock, sender); break;
                case '/delproduct': await startDeleteProduct(sock, sender); break;
                case '/delclient': await startDeleteClient(sock, sender); break;
                case '/cancel':
                    cancelFlow(sock, sender);
                    backupRestoreFlows.delete(sender);
                    activeMenus.delete(sender);
                    break;
                case '/misproductos': await handleMisProductos(sock, sender); break;
                case '/backup': await sendClientBackup(sock, sender); break;
                case '/restore': await startRestore(sock, sender); break;
            }
        }
    };
    
    sock.ev.on('messages.upsert', eventHandler.handleUpsert);
}

module.exports = {
  setupWhatsAppEventHandlers
};
