// WebBot/backend/utils/helpers.js
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const crypto = require('crypto');

const ALGORITHM = 'aes-256-ctr';
const IV_LENGTH = 16;

/**
 * Normaliza un número de WhatsApp a un formato consistente.
 * Elimina caracteres no numéricos y códigos de país comunes para Argentina.
 * @param {string} number - El número de teléfono en cualquier formato.
 * @returns {string|null} El número formateado o null si la entrada no es válida.
 */
function formatWhatsAppNumber(number) {
    if (!number || typeof number !== 'string') {
        return null;
    }
    // 1. Elimina todo lo que no sea un dígito.
    const digits = number.replace(/\D/g, '');

    // 2. Si el número resultante es más largo que 10 dígitos (típico de formatos internacionales),
    //    tomamos los últimos 10. Esto elimina eficazmente códigos como 54 o 549.
    if (digits.length > 10) {
        return digits.slice(-10);
    }

    return digits;
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

module.exports = {
  userHasRole,
  encrypt,
  decrypt,
  formatWhatsAppNumber, // <-- Aseguramos que se exporta
};
