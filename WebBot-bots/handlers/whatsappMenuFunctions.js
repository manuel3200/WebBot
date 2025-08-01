// handlers/whatsappMenuFunctions.js

const { userHasRole } = require('../utils/helpers');
const { ROLES } = require('../config/constants');
const db = require('../utils/db');

// Almacena el menú activo para cada usuario
const activeMenus = new Map();

async function sendMainMenu(sock, sender) {
    const whatsappId = sender.split('@')[0];
    const userRes = await db.query('SELECT * FROM users WHERE whatsapp_id = $1', [whatsappId]);
    const user = userRes.rows[0];

    let message = "Bienvenido al Menú Principal. Responde con el número de la opción que deseas:\n\n";
    const menuOptions = {};

    // Opciones para todos
    menuOptions['1'] = { text: 'Información y Ayuda', command: '/info' };
    message += `*1.* Información y Ayuda\n`;

    // Opciones para roles de gestión
    if (user && await userHasRole(user.id, [ROLES.OWNER, ROLES.ADMIN, ROLES.MODERATOR])) {
        menuOptions['2'] = { text: 'Gestionar Clientes', command: 'clients_menu' };
        message += `*2.* Gestionar Clientes\n`;
    }
    if (user && await userHasRole(user.id, [ROLES.OWNER, ROLES.ADMIN])) {
        menuOptions['3'] = { text: 'Ver Estadísticas', command: '/stats' };
         message += `*3.* Ver Estadísticas\n`;
    }

    activeMenus.set(sender, { name: 'main', options: menuOptions });
    await sock.sendMessage(sender, { text: message });
}

// --- CAMBIO CLAVE: Añadimos 'async' ---
async function sendClientsMenu(sock, sender) {
    const message = "Menú de Clientes. Responde con el número de la opción:\n\n" +
                    "*1.* Listar Clientes\n" +
                    "*2.* Ver Detalles de un Cliente\n" +
                    "*3.* Añadir Nuevo Cliente\n" +
                    "*4.* Actualizar Cliente/Producto\n" +
                    "*5.* Añadir Producto a Cliente\n" +
                    "*6.* Renovar Producto\n" +
                    "*7.* Eliminar Producto\n" +
                    "*8.* Eliminar Cliente\n" +
                    "*9.* Volver al Menú Principal";

    const menuOptions = {
        '1': { command: '/listclients' },
        '2': { command: '/client' }, // Este iniciará un mini-flujo
        '3': { command: '/addclient' },
        '4': { command: '/updateclient' },
        '5': { command: '/addproduct' },
        '6': { command: '/renew' },
        '7': { command: '/delproduct' },
        '8': { command: '/delclient' },
        '9': { command: 'main_menu' }
    };

    activeMenus.set(sender, { name: 'clients', options: menuOptions });
    await sock.sendMessage(sender, { text: message });
}

module.exports = {
    sendMainMenu,
    sendClientsMenu,
    activeMenus
};
