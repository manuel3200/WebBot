// WebBot/index.js

require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const db = require('./utils/db');
const { loadInitialDataFromDb } = require('./data/dataHandlers');
const { setupEventHandlers } = require('./handlers/telegramEventHandlers');
const { startNotificationScheduler, checkAndSendExpiryNotices } = require('./handlers/notificationScheduler');

// Inicializamos el bot de Telegram
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

async function startApp() {
    await db.testDbConnection();
    await loadInitialDataFromDb();

    // Iniciamos tareas programadas
    startNotificationScheduler(bot, null);

    // Configuramos eventos de Telegram
    setupEventHandlers(bot);

    // Verificación inmediata de vencimientos
    console.log("Ejecutando verificación de notificaciones al inicio del bot de Telegram...");
    checkAndSendExpiryNotices(bot, null);

    console.log('🤖 ¡ClientesT1Bot iniciado correctamente (solo bots)!');
}

startApp();

// Captura de errores de polling
bot.on('polling_error', console.error);
