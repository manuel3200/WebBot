// config/botConfig.js
// Contiene la configuración global del bot.
const moment = require('moment-timezone');

// --- CONFIGURACIÓN DE TU BOT Y API KEYS (ahora leídas de .env) ---
const TOKEN = process.env.TELEGRAM_BOT_TOKEN; // Lee del .env
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY; // Lee del .env (si la usas)

// --- NOMBRES DE ARCHIVOS DE DATOS (JSON) ---
const USER_DATA_FILE = 'user_data.json';
const SALES_DATA_FILE = 'sales_data.json';
const CLIENTS_DATA_FILE = 'data/clients_data.json';

// --- CONFIGURACIÓN DE ROLES Y PERMISOS (ID de Admin leído de .env) ---
// El ADMIN_USER_IDS puede ser un array si tienes varios IDs en .env separados por comas
const ADMIN_USER_IDS = process.env.ADMIN_USER_IDS ? process.env.ADMIN_USER_IDS.split(',').map(id => parseInt(id.trim(), 10)) : [];

// --- DEFINICIÓN DEL MENÚ PRINCIPAL INLINE (¡FLOTANTE!) ---
const MAIN_MENU_INLINE_KEYBOARD = {
  inline_keyboard: [
    [{ text: '👥 Clientes', callback_data: 'cmd_clients_menu' }],
    [{ text: '📊 Estadísticas', callback_data: 'cmd_stats' }], // <-- BOTÓN AÑADIDO
    [{ text: 'ℹ️ Info', callback_data: 'cmd_info' }]
  ]
};

// --- DEFINICIÓN DEL MENÚ DE CLIENTES INLINE ---
const CLIENTS_MENU_INLINE_KEYBOARD = {
    reply_markup: {
        inline_keyboard: [
            [
                { text: '➕ Añadir Cliente', callback_data: 'clients_add' },
                { text: '➖ Eliminar Cliente', callback_data: 'clients_delete' }
            ],
            [
                { text: '🔄 Actualizar Cliente', callback_data: 'clients_update' },
                { text: '♻️ Renovar Producto', callback_data: 'clients_renew' } // <-- BOTÓN AÑADIDO
            ],
            [
                { text: '📋 Listar Clientes', callback_data: 'clients_list' },
                { text: '🔍 Ver Detalles', callback_data: 'clients_view' }
            ],
            [
                { text: '🗑️ Eliminar Producto', callback_data: 'clients_delete_product' },
                { text: '🆙 Agregar Producto', callback_data: 'clients_add_product' }
            ],
            [
                { text: '↩️ Volver al Menú Principal', callback_data: 'show_main_menu' }
            ]
        ]
    }
};

// --- CONTACTO Y MENSAJES GENERALES (ahora desde .env para ID de contacto) ---
const CONTACT_INFO = {
    PHONE: process.env.CONTACT_PHONE || '+5493705021874', // Lee de .env o usa default
    TELEGRAM_USER: process.env.CONTACT_TELEGRAM_USER || 'TheJOIF_arg', // Lee de .env o usa default
    HUB_LINK: process.env.CONTACT_HUB_LINK || 'https://hub.juanortiz.online/informacion' // Lee de .env o usa default
};

const BOT_ACTIVE_HOURS = {
    START: 8,  // El bot empieza a las 8:00 AM
    END: 22,   // El bot termina a las 22:00 PM (10 PM)
    TIMEZONE: 'America/Argentina/Cordoba'
};

// Exporta todas las configuraciones
module.exports = {
  TOKEN,
  USER_DATA_FILE,
  SALES_DATA_FILE,
  CLIENTS_DATA_FILE,
  ADMIN_USER_IDS, // Ahora se lee del .env
  moment,
  MAIN_MENU_INLINE_KEYBOARD,
  CLIENTS_MENU_INLINE_KEYBOARD,
  CONTACT_INFO,
  BOT_ACTIVE_HOURS
};