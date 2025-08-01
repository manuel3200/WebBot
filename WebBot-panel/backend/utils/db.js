// WebBot/backend/utils/db.js
const { Pool } = require('pg');
const moment = require('moment-timezone');
const { PRODUCT_STATUS } = require('../config/constants');
const { decrypt } = require('./helpers');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function query(text, params) {
    try {
        console.log('Ejecutando consulta SQL:', text, params || '');
        const res = await pool.query(text, params);
        return res;
    } catch (error) {
        console.error('Error al ejecutar la consulta a la base de datos:', error.message);
        throw error;
    }
}

// --- FUNCIÓN AUXILIAR PARA CONSTRUIR CONSULTAS DE CLIENTES ---
// Esto centraliza la lógica de filtrado para reutilizarla.
const buildClientQueryComponents = (filters = {}, ownerUserId = null) => {
    let queryParams = [];
    let conditions = [];
    let joins = '';

    if (ownerUserId) {
        conditions.push(`c.owner_user_id = $${queryParams.length + 1}`);
        queryParams.push(ownerUserId);
    }

    if (filters.status || filters.product || filters.search) {
        joins += ` JOIN client_products p ON c.id = p.client_id`;
    }

    if (filters.search) {
        const searchTerm = `%${filters.search}%`;
        if (!joins.includes('client_products')) {
            joins += ` JOIN client_products p ON c.id = p.client_id`;
        }
        conditions.push(`(c.name ILIKE $${queryParams.length + 1} OR p.product_name ILIKE $${queryParams.length + 1})`);
        queryParams.push(searchTerm);
    }
    
    if (filters.status === 'Vencida') {
        conditions.push(`(p.status = $${queryParams.length + 1} OR p.expiry_date < CURRENT_DATE)`);
        queryParams.push(filters.status);
    } else if (filters.status === 'upcoming') {
        conditions.push(`(p.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days' AND p.status != 'Vencida')`);
    } else if (filters.status) {
        conditions.push(`p.status = $${queryParams.length + 1}`);
        queryParams.push(filters.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    return { joins, whereClause, queryParams };
}

// --- FUNCIÓN DE OBTENER CLIENTES ACTUALIZADA CON PAGINACIÓN ---
async function getAllClientsDb(filters = {}, ownerUserId = null, page = 1, limit = 15) {
    const { joins, whereClause, queryParams } = buildClientQueryComponents(filters, ownerUserId);
    const offset = (page - 1) * limit;

    // LIMIT y OFFSET deben ser los últimos parámetros y tener la posición correcta en el SQL
    queryParams.push(limit);
    queryParams.push(offset);

    const limitParamIndex = queryParams.length - 1;  // penúltimo parámetro
    const offsetParamIndex = queryParams.length;     // último parámetro

    const queryText = `
        SELECT DISTINCT c.*
        FROM clients c
        ${joins}
        ${whereClause}
        ORDER BY c.name
        LIMIT $${limitParamIndex}
        OFFSET $${offsetParamIndex}
    `;

    // Log para debug
    console.log('Ejecutando consulta SQL:', queryText, queryParams);

    // DECLARA res AQUÍ y luego úsalo:
    const res = await query(queryText, queryParams);

    return res.rows; // <-- SOLO después de haber declarado y obtenido res
}

// --- NUEVA FUNCIÓN PARA CONTAR CLIENTES ---
async function countClientsDb(filters = {}, ownerUserId = null) {
    const { joins, whereClause, queryParams } = buildClientQueryComponents(filters, ownerUserId);

    let queryText = `SELECT COUNT(DISTINCT c.id) FROM clients c ${joins} ${whereClause}`;
    
    const res = await query(queryText, queryParams);
    return parseInt(res.rows[0].count, 10);
}


// --- RESTO DE FUNCIONES DE LA BASE DE DATOS (YA LAS TENÍAS) ---

async function findClientGeneralInfoDb(clientId, ownerUserId = null) {
    let queryText = 'SELECT * FROM clients WHERE id = $1';
    const queryParams = [clientId];
    if (ownerUserId) {
        queryText += ' AND owner_user_id = $2';
        queryParams.push(ownerUserId);
    }
    const res = await query(queryText, queryParams);
    return res.rows[0];
}

async function addClientGeneralInfoDb(clientData, ownerUserId) {
    const { id, name, whatsapp, email, generalNotes } = clientData;
    const res = await query(
        'INSERT INTO clients (id, name, whatsapp, email, general_notes, owner_user_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [id, name, whatsapp, email, generalNotes, ownerUserId]
    );
    return res.rows[0];
}

async function updateFullClientGeneralInfoDb(clientId, clientData, ownerUserId = null) {
    const { name, whatsapp, email, general_notes } = clientData;
    let queryText = 'UPDATE clients SET name = $1, whatsapp = $2, email = $3, general_notes = $4 WHERE id = $5';
    const queryParams = [name, whatsapp, email, general_notes, clientId];
    if (ownerUserId) {
        queryText += ' AND owner_user_id = $6';
        queryParams.push(ownerUserId);
    }
    queryText += ' RETURNING *';
    const res = await query(queryText, queryParams);
    return res.rows[0];
}

async function deleteClientDb(clientId, ownerUserId = null) {
    let queryText = 'DELETE FROM clients WHERE id = $1';
    const queryParams = [clientId];
    if (ownerUserId) {
        queryText += ' AND owner_user_id = $2';
        queryParams.push(ownerUserId);
    }
    const res = await query(queryText, queryParams);
    return res.rowCount > 0;
}

async function getClientProductsDb(clientId, ownerUserId = null, page = 1, limit = 15) {
    const offset = (page - 1) * limit;
    let queryText = 'SELECT p.* FROM client_products p JOIN clients c ON p.client_id = c.id WHERE p.client_id = $1';
    const queryParams = [clientId];

    if (ownerUserId) {
        queryText += ' AND c.owner_user_id = $2';
        queryParams.push(ownerUserId);
    }

    // Agrega paginación al final
    queryParams.push(limit, offset);

    const limitIndex = queryParams.length - 1; // penúltimo
    const offsetIndex = queryParams.length;    // último

    queryText += ` ORDER BY p.expiry_date ASC LIMIT $${limitIndex} OFFSET $${offsetIndex}`;

    const res = await query(queryText, queryParams);

    const products = res.rows.map(p => ({
        ...p,
        service_password: p.service_password ? decrypt(p.service_password) : null,
    }));

    // Cuenta total de productos para paginación
    let countQuery = 'SELECT COUNT(*) FROM client_products WHERE client_id = $1';
    let countParams = [clientId];
    if (ownerUserId) {
        countQuery += ' AND EXISTS (SELECT 1 FROM clients WHERE id = $1 AND owner_user_id = $2)';
        countParams.push(ownerUserId);
    }
    const countRes = await query(countQuery, countParams);
    const totalProducts = parseInt(countRes.rows[0].count, 10);
    const totalPages = Math.ceil(totalProducts / limit);

    return {
        products,      // ¡Aquí es lo importante!
        totalPages,
        currentPage: page
    };
}

async function addClientProductDb(productData, ownerUserId) {
    const { client_id, product_name, contract_date, expiry_date, notice_date, status, product_notes, service_username, service_password } = productData;
    const res = await query(
        'INSERT INTO client_products (client_id, product_name, contract_date, expiry_date, notice_date, status, product_notes, service_username, service_password, added_by_user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
        [client_id, product_name, contract_date, expiry_date, notice_date, status, product_notes, service_username, service_password, ownerUserId]
    );
    return res.rows[0];
}

async function findClientProductByIdDb(productId, ownerUserId = null) {
    let queryText = 'SELECT p.* FROM client_products p JOIN clients c ON p.client_id = c.id WHERE p.id = $1';
    const queryParams = [productId];
    if (ownerUserId) {
        queryText += ' AND c.owner_user_id = $2';
        queryParams.push(ownerUserId);
    }
    const res = await query(queryText, queryParams);
    return res.rows[0];
}

async function updateFullClientProductDb(productId, productData, ownerUserId = null, changedByUserId = null) {
    // Verificamos primero si el usuario tiene permiso sobre este producto
    const existingProduct = await findClientProductByIdDb(productId, ownerUserId);
    if (!existingProduct) {
        return null; // No encontrado o sin permisos
    }

    // 1. Guardar el historial SOLO si cambia usuario o contraseña
    if (
        productData.service_username !== undefined && 
        (productData.service_username !== existingProduct.service_username ||
         productData.service_password !== existingProduct.service_password)
    ) {
        await query(
            `INSERT INTO product_changes (
                product_id, client_id,
                old_service_username, old_service_password,
                new_service_username, new_service_password,
                changed_by_user_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                productId,
                existingProduct.client_id,
                existingProduct.service_username,
                existingProduct.service_password,
                productData.service_username,
                productData.service_password,
                changedByUserId || ownerUserId // Usa el que recibas (user id actual)
            ]
        );
    }

    // Usamos los datos existentes como base y sobreescribimos con los nuevos datos
    const finalData = { ...existingProduct, ...productData };

    const res = await query(
        'UPDATE client_products SET product_name = $1, expiry_date = $2, status = $3, service_username = $4, service_password = $5, product_notes = $6, notice_date = $7 WHERE id = $8 RETURNING *',
        [finalData.product_name, finalData.expiry_date, finalData.status, finalData.service_username, finalData.service_password, finalData.product_notes, finalData.notice_date, productId]
    );
    return res.rows[0];
}

async function deleteClientProductDb(productId, ownerUserId = null) {
    const clientProduct = await findClientProductByIdDb(productId, ownerUserId);
    if (!clientProduct) return false;
    
    const res = await query('DELETE FROM client_products WHERE id = $1', [productId]);
    return res.rowCount > 0;
}

async function getStatsDb(ownerUserId = null) {
    let clientCondition = '';
    const params = [];

    if (ownerUserId) {
        params.push(ownerUserId);
        clientCondition = `WHERE owner_user_id = $1`;
    }

    const totalClientsQuery = `SELECT COUNT(*) FROM clients ${clientCondition}`;
    const activeProductsQuery = `SELECT COUNT(*) FROM client_products p JOIN clients c ON p.client_id = c.id WHERE p.status = 'Activa' ${ownerUserId ? 'AND c.owner_user_id = $1' : ''}`;
    
    const upcomingExpiryParams = [moment().format('YYYY-MM-DD'), moment().add(7, 'days').format('YYYY-MM-DD')];
    let upcomingExpiriesQuery = `SELECT c.name as client_name, p.product_name, p.expiry_date FROM client_products p JOIN clients c ON p.client_id = c.id WHERE p.expiry_date BETWEEN $1 AND $2 AND p.status = 'Activa'`;
    if (ownerUserId) {
        upcomingExpiriesQuery += ` AND c.owner_user_id = $3`;
        upcomingExpiryParams.push(ownerUserId);
    }
    upcomingExpiriesQuery += ' ORDER BY p.expiry_date ASC';

    const [totalClientsRes, activeProductsRes, upcomingExpiriesRes] = await Promise.all([
        query(totalClientsQuery, ownerUserId ? [ownerUserId] : []),
        query(activeProductsQuery, ownerUserId ? [ownerUserId] : []),
        query(upcomingExpiriesQuery, upcomingExpiryParams)
    ]);

    return {
        totalClients: parseInt(totalClientsRes.rows[0].count, 10),
        activeProducts: parseInt(activeProductsRes.rows[0].count, 10),
        upcomingExpiries: upcomingExpiriesRes.rows,
    };
}

async function getProductChangeHistory(productId) {
    const queryText = `
        SELECT
            id,
            product_id,
            client_id,
            old_service_username,
            old_service_password,
            new_service_username,
            new_service_password,
            changed_at,
            changed_by_user_id
        FROM product_changes
        WHERE product_id = $1
        ORDER BY changed_at DESC
    `;
    const res = await query(queryText, [productId]);
    // Desencriptar las contraseñas antes de devolverlas
    return res.rows.map(row => ({
        ...row,
        old_service_password: row.old_service_password ? decrypt(row.old_service_password) : '',
        new_service_password: row.new_service_password ? decrypt(row.new_service_password) : ''
    }));
}

// --- EXPORTACIONES ---
module.exports = {
    query,
    getAllClientsDb,
    countClientsDb,
    findClientGeneralInfoDb,
    addClientGeneralInfoDb,
    updateFullClientGeneralInfoDb,
    deleteClientDb,
    getClientProductsDb,
    addClientProductDb,
    findClientProductByIdDb,
    updateFullClientProductDb,
    deleteClientProductDb,
    getStatsDb,
    getProductChangeHistory,
};
