// utils/helpers.js

const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const crypto = require('crypto');
const { BOT_ACTIVE_HOURS } = require('../config/botConfig');
const moment = require('moment-timezone');

// --- CORRECCIÓN #1: Aseguramos que el algoritmo de encriptación sea el correcto. ---
const ALGORITHM = 'aes-256-ctr';
const IV_LENGTH = 16;

let userNamesGlobal = {};

function setUserDataInHelpers(data) {
  userNamesGlobal = data;
}

// --- ¡FUNCIÓN CORREGIDA Y MEJORADA! ---
// Esta versión es más simple y solo escapa los caracteres que son
// realmente especiales en el modo 'Markdown' antiguo de Telegram.
function escapeMarkdown(text) {
  if (typeof text !== 'string') return text;
  // Los caracteres especiales para el parse_mode 'Markdown' son *, _, `, [
  return text.replace(/[_*`[]/g, '\\$&');
}

// --- CORRECCIÓN #2: La solución definitiva al problema de formato. ---
// Ahora, esta función escapa el nombre del usuario ANTES de devolver el saludo.
// Esto soluciona el error en todos los menús y mensajes que la usen.
function getPersonalizedGreeting(userId, userNamesData) {
  if (userNamesData[userId] && userNamesData[userId].name) {
    // Escapamos el nombre aquí, en el origen.
    const escapedName = escapeMarkdown(userNamesData[userId].name);
    return `¡Hola ${escapedName}!`;
  }
  return '¡Hola!';
}


async function userHasRole(userId, allowedRoles) {
    try {
        const user = await db.getUserByIdDb(userId);
        const userRole = user?.role || 'usuario';
        return allowedRoles.includes(userRole);
    } catch (error) {
        console.error('Error al verificar el rol del usuario desde la DB:', error);
        return false;
    }
}

function encrypt(text) {
    if (!text) return null;
    const key = Buffer.from(process.env.ENCRYPTION_KEY);
    if (key.length !== 32) {
        throw new Error('La ENCRYPTION_KEY en el archivo .env debe tener exactamente 32 caracteres.');
    }
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(String(text)), cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    if (!text) return null;
    try {
        const key = Buffer.from(process.env.ENCRYPTION_KEY);
        if (key.length !== 32) {
            throw new Error('La ENCRYPTION_KEY en el archivo .env debe tener exactamente 32 caracteres.');
        }
        const textParts = text.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
        return decrypted.toString();
    } catch (error) {
        console.error("Error al desencriptar:", error);
        return "Error al desencriptar";
    }
}

async function handleError(error, bot, chatId) {
    const errorId = uuidv4().split('-')[0];
    console.error(`\n--- ERROR CAPTURADO ---`);
    console.error(`ID del Error: ${errorId}`);
    console.error(`Fecha/Hora: ${new Date().toISOString()}`);
    console.error(error);
    console.error(`-----------------------\n`);
    const userMessage = `Lo siento, ocurrió un error inesperado. 🛠️\n\n` +
                        `Si el problema persiste, por favor contacta al administrador y proporciónale este código:\n` +
                        `*Código de Error:* \`${errorId}\``;
    try {
        await bot.sendMessage(chatId, userMessage, { parse_mode: 'Markdown' });
    } catch (sendMessageError) {
        console.error(`[Fallo Crítico] No se pudo ni siquiera enviar el mensaje de error al usuario ${chatId}:`, sendMessageError);
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isBotActive() {
    const now = moment().tz(BOT_ACTIVE_HOURS.TIMEZONE);
    const currentHour = now.hour();
    return currentHour >= BOT_ACTIVE_HOURS.START && currentHour < BOT_ACTIVE_HOURS.END;
}

module.exports = {
  getPersonalizedGreeting,
  escapeMarkdown,
  userHasRole,
  encrypt,
  decrypt,
  handleError,
  delay,
  isBotActive,
  setUserDataInHelpers
};
