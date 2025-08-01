// utils/db.js
// Módulo para manejar la conexión y operaciones con la base de datos PostgreSQL.
// Incluye lógica multiusuario para clientes y sus productos.

const { Pool } = require('pg');
const moment = require('moment-timezone');
const { PRODUCT_STATUS } = require('../config/constants');

// Configuración de la conexión a la base de datos (ahora desde .env)
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
        return res; // Retorna el objeto 'res' completo
    } catch (error) {
        console.error('Error al ejecutar la consulta a la base de datos:', error.message);
        throw error;
    }
}

async function testDbConnection() {
    try {
        await query('SELECT NOW()');
        console.log('Conexión a PostgreSQL exitosa.');
    } catch (error) {
        console.error('Error al conectar a PostgreSQL:', error.message);
        console.error('Asegúrate de que PostgreSQL esté corriendo y las credenciales en .env y utils/db.js sean correctas.');
        process.exit(1);
    }
}

// --- Funciones para la tabla 'clients' (información general del cliente) ---

/**
 * Inserta un nuevo cliente en la tabla 'clients'.
 * @param {object} clientData - Objeto con los datos generales del cliente (id, name, whatsapp, email, generalNotes).
 * @param {bigint} ownerUserId - El ID de Telegram del usuario que es dueño de este cliente.
 * @returns {Promise<object>} El cliente insertado.
 */
async function addClientGeneralInfoDb(clientData, ownerUserId) { // CAMBIO: Nueva función para info general del cliente
    const { id, name, whatsapp, email, generalNotes } = clientData;
    const res = await query(
        `INSERT INTO clients (id, name, whatsapp, email, general_notes, owner_user_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [id, name, whatsapp, email, generalNotes, ownerUserId]
    );
    return res.rows[0];
}

/**
 * Obtiene clientes de la tabla 'clients', con soporte para filtros y por owner_user_id.
 * NO trae detalles de productos.
 * @param {object} filters - Objeto con los filtros a aplicar. Ej: { status: 'Activa' }
 * @param {bigint|null} ownerUserId - El ID de Telegram del usuario dueño de los clientes. Si es null, trae todos (solo para Owner/SuperAdmin).
 * @returns {Array<object>} Un array de objetos cliente (info general).
 */

async function getAllClientsDb(filters = {}, ownerUserId = null, limit = null, offset = null) {
    let queryText = `SELECT DISTINCT c.* FROM clients c`;
    const queryParams = [];
    let paramIndex = 1;

    if (filters.search) {
        queryText += ` LEFT JOIN client_products p ON c.id = p.client_id`;
    }
    queryText += ` WHERE 1=1`;

    if (ownerUserId !== null) {
        queryText += ` AND c.owner_user_id = $${paramIndex++}`;
        queryParams.push(ownerUserId);
    }
    if (filters.search) {
        queryText += ` AND (c.name ILIKE $${paramIndex} OR p.product_name ILIKE $${paramIndex})`;
        queryParams.push(`%${filters.search}%`);
        paramIndex++;
    }

    queryText += ' ORDER BY c.name';

    if (limit !== null) {
        queryText += ` LIMIT $${paramIndex++}`;
        queryParams.push(limit);
    }
    if (offset !== null) {
        queryText += ` OFFSET $${paramIndex++}`;
        queryParams.push(offset);
    }

    const res = await query(queryText, queryParams);
    return res.rows;
}

/**
 * Busca un cliente por su ID o nombre en la tabla 'clients', limitado por owner_user_id o client_id si es usuario final.
 * NO trae detalles de productos en esta función.
 * @param {string} queryValue - El ID o nombre del cliente a buscar.
 * @param {bigint|null} ownerUserId - ID del admin/moderador (para buscar clientes propios). Null para Owner.
 * @param {string|null} linkedClientId - ID del cliente si el usuario es un consumidor final vinculado.
 * @returns {Promise<object|null>} El cliente (información general) encontrado o null.
 */
async function findClientGeneralInfoDb(queryValue, ownerUserId = null, linkedClientId = null) { // CAMBIO: Renombrada para info general
    let queryText = `SELECT * FROM clients WHERE (id = $1 OR lower(name) ILIKE $2)`;
    const queryParams = [queryValue, `%${queryValue.toLowerCase()}%`];
    let paramIndex = 3;

    if (ownerUserId !== null) {
        queryText += ` AND owner_user_id = $${paramIndex++}`;
        queryParams.push(ownerUserId);
    } else if (linkedClientId !== null) {
        queryText += ` AND id = $${paramIndex++}`; // Si es usuario final, busca por su propio client_id
        queryParams.push(linkedClientId);
    }
    queryText += ` LIMIT 1`;

    const res = await query(queryText, queryParams);
    return res.rows[0] || null;
}

/**
 * Elimina un cliente general y todos sus productos asociados (CASCADE).
 * @param {string} clientId - El ID del cliente a eliminar.
 * @param {bigint|null} ownerUserId - El ID de Telegram del usuario dueño del cliente. Si es null, permite eliminar a Owner.
 * @returns {Promise<boolean>} True si se eliminó, false si no se encontró o no pertenece al owner.
 */
async function deleteClientDb(clientId, ownerUserId = null) {
    let queryText = 'DELETE FROM clients WHERE id = $1'; // La eliminación aquí, con ON DELETE CASCADE, borrará los productos.
    const queryParams = [clientId];
    let paramIndex = 2;

    if (ownerUserId !== null) {
        queryText += ` AND owner_user_id = $${paramIndex++}`;
        queryParams.push(ownerUserId);
    }

    const res = await query(queryText, queryParams);
    return res.rowCount > 0;
}

/**
 * Actualiza un campo de un cliente general, limitado por owner_user_id.
 * NOTA: No actualiza campos de producto.
 * @param {string} clientId - El ID del cliente a actualizar.
 * @param {string} field - El nombre de la columna a actualizar ('name', 'whatsapp', 'email', 'general_notes').
 * @param {*} newValue - El nuevo valor.
 * @param {bigint|null} ownerUserId - El ID de Telegram del usuario dueño del cliente. Si es null, permite actualizar a Owner.
 * @returns {Promise<boolean>} True si se actualizó, false si no se encontró o no pertenece al owner.
 */
async function updateClientGeneralInfoDb(clientId, field, newValue, ownerUserId = null) { // CAMBIO: Nueva función para info general
    const columnMap = {
        'name': 'name', 'whatsapp': 'whatsapp', 'email': 'email', 'general_notes': 'general_notes'
    };

    const columnName = columnMap[field];
    if (!columnName) {
        console.error(`Campo '${field}' no es un campo de información general de cliente actualizable válido.`);
        return false;
    }

    let queryText = `UPDATE clients SET ${columnName} = $1 WHERE id = $2`;
    const queryParams = [newValue, clientId];
    let paramIndex = 3;

    if (ownerUserId !== null) {
        queryText += ` AND owner_user_id = $${paramIndex++}`;
        queryParams.push(ownerUserId);
    }
    queryText += ` RETURNING *;`;

    try {
        const res = await query(queryText, queryParams);
        return res.rowCount > 0;
    } catch (error) {
        console.error(`Error al actualizar el cliente general ${clientId} en el campo ${field}:`, error);
        throw error;
    }
}


// --- NUEVAS Funciones para la tabla 'client_products' (productos de un cliente) ---

/**
 * Inserta un nuevo producto para un cliente existente.
 * @param {object} productData - Objeto con los datos del producto (client_id, product_name, contract_date, expiry_date, notice_date, status, product_notes).
 * @param {bigint} addedByUserId - El ID de Telegram del usuario (admin/moderador) que añadió este producto.
 * @returns {Promise<object>} El producto insertado.
 */
// En utils/db.js

async function addClientProductDb(productData, addedByUserId) {
    const { client_id, product_name, contract_date, expiry_date, notice_date, status, product_notes, service_username, service_password } = productData;
    const res = await query(
        `INSERT INTO client_products (client_id, product_name, contract_date, expiry_date, notice_date, status, product_notes, added_by_user_id, service_username, service_password)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [client_id, product_name, contract_date, expiry_date, notice_date, status, product_notes, addedByUserId, service_username, service_password]
    );
    return res.rows[0];
}

/**
 * Obtiene todos los productos de uno o varios clientes específicos.
 * @param {string|string[]} clientIds - Un ID de cliente o un array de IDs de cliente.
 * @param {bigint|null} ownerUserId - El ID de Telegram del dueño del cliente. Null para Owner.
 * @returns {Promise<Array<object>>} Un array de productos de esos clientes.
 */
async function getClientProductsDb(clientIds, ownerUserId = null) {
    // Aseguramos que clientIds sea siempre un array para la consulta.
    const ids = Array.isArray(clientIds) ? clientIds : [clientIds];
    if (ids.length === 0) return [];

    let queryText = `
        SELECT cp.* FROM client_products cp 
        JOIN clients c ON cp.client_id = c.id 
        WHERE cp.client_id = ANY($1::text[])
    `;
    const queryParams = [ids];
    let paramIndex = 2;

    if (ownerUserId !== null) {
        queryText += ` AND c.owner_user_id = $${paramIndex++}`;
        queryParams.push(ownerUserId);
    }
    queryText += ` ORDER BY cp.expiry_date`;

    const res = await query(queryText, queryParams);
    return res.rows;
}

/**
 * Busca un producto específico por su ID de producto.
 * @param {bigint} productId - El ID del producto (SERIAL de client_products).
 * @param {bigint|null} ownerUserId - El ID de Telegram del usuario dueño del cliente. Si es null, permite Owner.
 * @returns {Promise<object|null>} El producto encontrado o null.
 */
async function findClientProductByIdDb(productId, ownerUserId = null) { // Nueva función
    let queryText = `SELECT cp.* FROM client_products cp JOIN clients c ON cp.client_id = c.id WHERE cp.id = $1`;
    const queryParams = [productId];
    let paramIndex = 2;

    if (ownerUserId !== null) { // Si no es Owner, filtra por owner_user_id del cliente principal
        queryText += ` AND c.owner_user_id = $${paramIndex++}`;
        queryParams.push(ownerUserId);
    }
    queryText += ` LIMIT 1`;

    const res = await query(queryText, queryParams);
    return res.rows[0] || null;
}

/**
 * Actualiza un campo de un producto específico, limitado por owner_user_id del cliente.
 * @param {bigint} productId - El ID del producto a actualizar.
 * @param {string} field - El nombre de la columna a actualizar.
 * @param {*} newValue - El nuevo valor.
 * @param {bigint|null} ownerUserId - El ID de Telegram del usuario dueño del cliente. Si es null, permite Owner.
 * @returns {Promise<boolean>} True si se actualizó, false si no se encontró o no pertenece al owner.
 */
async function updateClientProductDb(productId, field, newValue, ownerUserId = null) {
    const columnMap = {
        'product_name': 'product_name', 'contract_date': 'contract_date',
        'expiry_date': 'expiry_date', 'notice_date': 'notice_date', 'status': 'status',
        'product_notes': 'product_notes',
        'service_username': 'service_username', // <-- Campo añadido
        'service_password': 'service_password'  // <-- Campo añadido
    };

    const columnName = columnMap[field];
    if (!columnName) {
        console.error(`Campo '${field}' no es un campo de producto actualizable válido.`);
        return false;
    }

    let queryText = `UPDATE client_products cp SET ${columnName} = $1 WHERE cp.id = $2`;
    const queryParams = [newValue, productId];
    let paramIndex = 3;

    if (ownerUserId !== null) {
        queryText += ` AND cp.client_id IN (SELECT id FROM clients WHERE owner_user_id = $${paramIndex++})`;
        queryParams.push(ownerUserId);
    }
    queryText += ` RETURNING *;`;

    try {
        const res = await query(queryText, queryParams);
        return res.rowCount > 0;
    } catch (error) {
        console.error(`Error al actualizar el producto ${productId} en el campo ${field}:`, error);
        throw error;
    }
}

async function upsertUserDb(userData) {
    // Añadimos la nueva propiedad authorization_end_date
    const { id, name, authorizationDate, role, client_id, whatsapp_id, authorization_end_date } = userData;
    const dbAuthDate = authorizationDate ? moment(authorizationDate, 'YYYY-MM-DD').toISOString() : null;
    // Manejamos la nueva fecha de finalización
    const dbAuthEndDate = authorization_end_date ? moment(authorization_end_date, 'YYYY-MM-DD').toISOString() : null;

    const res = await query(
        `INSERT INTO users (id, name, authorization_date, role, client_id, whatsapp_id, authorization_end_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name,
             authorization_date = EXCLUDED.authorization_date,
             role = EXCLUDED.role,
             client_id = EXCLUDED.client_id,
             whatsapp_id = EXCLUDED.whatsapp_id,
             authorization_end_date = EXCLUDED.authorization_end_date,
             updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        // Añadimos el nuevo parámetro a la consulta
        [id, name, dbAuthDate, role, client_id, whatsapp_id, dbAuthEndDate]
    );
    return res.rows[0];
}

async function getUserByIdDb(userId) {
    const res = await query('SELECT * FROM users WHERE id = $1', [userId]);
    return res.rows[0] || null;
}

// --- Funciones para la tabla 'sales' ---

async function addSaleDb(saleData) {
    const { clientId, productSold, saleDate, amount, paymentMethod, notes, soldByUserId } = saleData;
    const dbSaleDate = moment(saleDate, 'DD-MM-YYYY').format('YYYY-MM-DD');

    const res = await query(
        `INSERT INTO sales (client_id, product_sold, sale_date, amount, payment_method, notes, sold_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [clientId, productSold, dbSaleDate, amount, paymentMethod, notes, soldByUserId]
    );
    return res.rows[0];
}

async function getAllSalesDb() {
    const res = await query('SELECT * FROM sales ORDER BY sale_date DESC, created_at DESC');
    return res.rows;
}

/**
 * Elimina un producto específico por su ID de producto.
 * @param {bigint} productId - El ID del producto a eliminar.
 * @param {bigint|null} ownerUserId - El ID de Telegram del usuario dueño del cliente. Si es null, permite eliminar a Owner.
 * @returns {Promise<boolean>} True si se eliminó, false si no se encontró o no pertenece al owner.
 */
async function deleteClientProductDb(productId, ownerUserId = null) { // Nueva función
    let queryText = `DELETE FROM client_products cp WHERE cp.id = $1`;
    const queryParams = [productId];
    let paramIndex = 2;

    if (ownerUserId !== null) { // Solo si no es Owner, verifica la propiedad del cliente principal
        queryText += ` AND cp.client_id IN (SELECT id FROM clients WHERE owner_user_id = $${paramIndex++})`;
        queryParams.push(ownerUserId);
    }
    queryText += ` RETURNING *;`;

    try {
        const res = await query(queryText, queryParams);
        return res.rowCount > 0;
    } catch (error) {
        console.error(`Error al eliminar el producto ${productId}:`, error);
        throw error;
    }
}

/**
 * Obtiene todos los productos que están por vencer y que NO han recibido un aviso hoy.
 * Trae la información del producto junto con los detalles del cliente asociado.
 * @returns {Promise<Array<object>>} Un array de productos con detalles del cliente.
 */
async function getProductsNearingExpiryDb() {
    const today = moment().tz('America/Argentina/Cordoba').format('YYYY-MM-DD');
    const queryText = `
        SELECT 
            cp.id AS product_id,
            cp.product_name,
            cp.expiry_date,
            cp.status,
            c.id AS client_id,
            c.name AS client_name,
            c.whatsapp,
            c.owner_user_id
        FROM client_products cp
        JOIN clients c ON cp.client_id = c.id
        WHERE 
            cp.status = ANY($1::text[]) AND
            cp.notice_date <= $2 AND
            (cp.last_notice_sent_at IS NULL OR cp.last_notice_sent_at != $2)
    `;
    const statuses = [PRODUCT_STATUS.ACTIVE, PRODUCT_STATUS.NOTICE, PRODUCT_STATUS.RENEWED];
    const res = await query(queryText, [statuses, today]);
    return res.rows;
}

/**
 * Marca un producto como notificado, actualizando la fecha del último aviso.
 * @param {number} productId - El ID del producto a marcar.
 * @returns {Promise<void>}
 */
async function markProductAsNotifiedDb(productId) {
    const today = moment().tz('America/Argentina/Cordoba').format('YYYY-MM-DD');
    await query(
        'UPDATE client_products SET last_notice_sent_at = $1 WHERE id = $2',
        [today, productId]
    );
}

/**
 * Obtiene estadísticas agregadas sobre clientes y productos.
 * @param {bigint|null} ownerUserId - El ID del usuario para filtrar las estadísticas. Si es null (owner), cuenta todo.
 * @returns {Promise<object>} Un objeto con las estadísticas.
 */
async function getStatsDb(ownerUserId = null) {
    const stats = {};
    let clientWhereClause = '';
    let productWhereClause = 'WHERE p.status = $1';
    const clientParams = [];
    const productParams = ['Activa'];

    if (ownerUserId !== null) {
        clientWhereClause = 'WHERE owner_user_id = $1';
        clientParams.push(ownerUserId);
        productWhereClause += ` AND c.owner_user_id = $2`;
        productParams.push(ownerUserId);
    }

    // 1. Total de clientes
    const totalClientsRes = await query(`SELECT COUNT(*) FROM clients ${clientWhereClause}`, clientParams);
    stats.totalClients = totalClientsRes.rows[0].count;

    // 2. Total de productos activos
    const activeProductsRes = await query(`
        SELECT COUNT(*) 
        FROM client_products p 
        JOIN clients c ON p.client_id = c.id 
        ${productWhereClause}`, productParams);
    stats.activeProducts = activeProductsRes.rows[0].count;

    // 3. Productos que vencen en los próximos 7 días
    const upcomingExpiryParams = [moment().format('YYYY-MM-DD'), moment().add(7, 'days').format('YYYY-MM-DD')];
    let upcomingExpiryWhere = `WHERE p.expiry_date BETWEEN $1 AND $2 AND p.status = 'Activa'`;
    if (ownerUserId !== null) {
        upcomingExpiryWhere += ` AND c.owner_user_id = $3`;
        upcomingExpiryParams.push(ownerUserId);
    }
    const upcomingExpiryRes = await query(`
        SELECT c.name as client_name, p.product_name, p.expiry_date 
        FROM client_products p 
        JOIN clients c ON p.client_id = c.id 
        ${upcomingExpiryWhere}
        ORDER BY p.expiry_date ASC`, upcomingExpiryParams);
    stats.upcomingExpiries = upcomingExpiryRes.rows;

    return stats;
}

/**
 * Obtiene una copia de seguridad completa de todos los clientes y sus productos de forma eficiente.
 * @param {bigint|null} ownerUserId - Si se proporciona, filtra los clientes de ese dueño. Si es null, trae todos.
 * @returns {Promise<Array<object>>} Un array de clientes, cada uno con una propiedad 'products'.
 */
async function getFullClientBackupDb(ownerUserId = null) {
    // 1. PRIMERA CONSULTA: Obtener todos los clientes que necesitamos de una sola vez.
    const clients = await getAllClientsDb({}, ownerUserId);
    if (clients.length === 0) {
        return []; // No hay clientes, no hay nada más que hacer.
    }

    // Extraemos los IDs de los clientes obtenidos.
    const clientIds = clients.map(c => c.id);

    // 2. SEGUNDA CONSULTA: Obtener TODOS los productos para ESOS clientes de una sola vez.
    const productsRes = await query(
        // Usamos '= ANY($1)' que es una forma eficiente de decir "donde el ID esté en esta lista".
        `SELECT * FROM client_products WHERE client_id = ANY($1::text[]) ORDER BY expiry_date`,
        [clientIds]
    );
    const allProducts = productsRes.rows;

    // 3. ORGANIZACIÓN EN MEMORIA: Agrupamos los productos por el ID de su cliente (esto es muy rápido).
    const productsByClientId = new Map();
    allProducts.forEach(product => {
        // Si el mapa aún no tiene una entrada para este cliente, la creamos.
        if (!productsByClientId.has(product.client_id)) {
            productsByClientId.set(product.client_id, []);
        }
        // Agregamos el producto al array de su cliente.
        productsByClientId.get(product.client_id).push(product);
    });

    // 4. FINALMENTE: Asignamos el array de productos a cada cliente.
    clients.forEach(client => {
        client.products = productsByClientId.get(client.id) || [];
    });

    return clients;
}

/**
 * Restaura clientes y sus productos desde un backup usando una transacción.
 * @param {Array<object>} clientsToRestore - El array de clientes (con sus productos) a insertar.
 * @param {bigint} ownerUserId - El ID del owner que está realizando la restauración.
 * @returns {Promise<number>} El número de clientes insertados exitosamente.
 */
async function restoreClientsFromBackupDb(clientsToRestore, ownerUserId) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // Inicia la transacción

        let insertedCount = 0;
        for (const clientData of clientsToRestore) {
            const { products, ...clientInfo } = clientData;

            // Insertar el cliente
            await client.query(
                `INSERT INTO clients (id, name, whatsapp, email, general_notes, owner_user_id) VALUES ($1, $2, $3, $4, $5, $6)`,
                [clientInfo.id, clientInfo.name, clientInfo.whatsapp, clientInfo.email, clientInfo.general_notes, ownerUserId]
            );

            // Insertar sus productos
            if (products && products.length > 0) {
                for (const product of products) {
                    await client.query(
                        `INSERT INTO client_products (client_id, product_name, contract_date, expiry_date, notice_date, status, product_notes, added_by_user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                        [product.client_id, product.product_name, product.contract_date, product.expiry_date, product.notice_date, product.status, product.product_notes, ownerUserId]
                    );
                }
            }
            insertedCount++;
        }

        await client.query('COMMIT'); // Confirma todos los cambios si no hubo errores
        return insertedCount;
    } catch (error) {
        await client.query('ROLLBACK'); // Deshace todos los cambios si algo falló
        console.error('Error en la transacción de restauración, se revirtieron los cambios.', error);
        throw error; // Propaga el error para que el manejador principal lo capture
    } finally {
        client.release(); // Libera la conexión a la base de datos
    }
}

/**
 * Obtiene una lista de clientes y sus productos que coinciden con los filtros aplicados, de forma eficiente.
 * @param {object} filters - Objeto con filtros (ej: { product: 'Netflix', status: 'Activa' }).
 * @param {bigint|null} ownerUserId - El ID del usuario para filtrar. Null para el owner.
 * @returns {Promise<Array<object>>} Un array de clientes con sus productos.
 */
async function getFilteredClientsDb(filters = {}, ownerUserId = null) {
    // 1. PRIMERA CONSULTA: Encontrar los clientes únicos que coinciden con los filtros.
    let findClientsQuery = `
        SELECT DISTINCT c.*
        FROM clients c
        JOIN client_products p ON c.id = p.client_id
        WHERE 1=1
    `;
    const queryParams = [];
    let paramIndex = 1;

    if (ownerUserId) {
        findClientsQuery += ` AND c.owner_user_id = $${paramIndex++}`;
        queryParams.push(ownerUserId);
    }
    if (filters.product) {
        findClientsQuery += ` AND p.product_name ILIKE $${paramIndex++}`;
        queryParams.push(`%${filters.product}%`);
    }
    if (filters.status) {
        findClientsQuery += ` AND p.status = $${paramIndex++}`;
        queryParams.push(filters.status);
    }
    if (filters.month) {
        findClientsQuery += ` AND EXTRACT(MONTH FROM p.expiry_date) = $${paramIndex++}`;
        queryParams.push(filters.month);
    }
    if (filters.year) {
        findClientsQuery += ` AND EXTRACT(YEAR FROM p.expiry_date) = $${paramIndex++}`;
        queryParams.push(filters.year);
    }

    findClientsQuery += ' ORDER BY c.name';

    const clientsRes = await query(findClientsQuery, queryParams);
    const clients = clientsRes.rows;

    if (clients.length === 0) {
        return [];
    }

    // 2. SEGUNDA CONSULTA: Obtener todos los productos para los clientes encontrados.
    const clientIds = clients.map(c => c.id);
    const products = await getClientProductsDb(clientIds, ownerUserId); // Usamos una versión modificada de getClientProductsDb

    // 3. ORGANIZACIÓN Y UNIÓN EN MEMORIA.
    const productsByClientId = new Map();
    products.forEach(product => {
        if (!productsByClientId.has(product.client_id)) {
            productsByClientId.set(product.client_id, []);
        }
        productsByClientId.get(product.client_id).push(product);
    });

    clients.forEach(client => {
        client.products = productsByClientId.get(client.id) || [];
    });

    return clients;
}

/**
 * Actualiza múltiples campos de un producto específico en una sola consulta.
 * @param {bigint} productId - El ID del producto a actualizar.
 * @param {object} productData - Un objeto con los campos y nuevos valores. ej: { product_name: 'Nuevo Nombre', status: 'Activa' }.
 * @param {bigint|null} ownerUserId - El ID del dueño del cliente para verificación de permisos.
 * @returns {Promise<object|null>} El producto actualizado o null si no se encontró.
 */
async function updateFullClientProductDb(productId, productData, ownerUserId = null) {
    const fields = Object.keys(productData);
    if (fields.length === 0) {
        // No hay nada que actualizar, devolvemos el producto actual.
        return findClientProductByIdDb(productId, ownerUserId);
    }

    // Construcción dinámica de la consulta SET
    // ej: SET product_name = $1, status = $2, ...
    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
    const values = Object.values(productData);

    let queryText = `UPDATE client_products SET ${setClause} WHERE id = $${fields.length + 1}`;
    const queryParams = [...values, productId];

    if (ownerUserId !== null) {
        queryText += ` AND client_id IN (SELECT id FROM clients WHERE owner_user_id = $${fields.length + 2})`;
        queryParams.push(ownerUserId);
    }

    queryText += ` RETURNING *;`;

    try {
        const res = await query(queryText, queryParams);
        return res.rows[0] || null;
    } catch (error) {
        console.error(`Error en la actualización masiva del producto ${productId}:`, error);
        throw error;
    }
}

/**
 * Actualiza múltiples campos de la información general de un cliente en una sola consulta.
 * @param {string} clientId - El ID del cliente a actualizar.
 * @param {object} clientData - Un objeto con los campos y nuevos valores a actualizar.
 * @param {bigint|null} ownerUserId - El ID del dueño para la verificación de permisos.
 * @returns {Promise<object|null>} El cliente actualizado o null si no se encontró.
 */
async function updateFullClientGeneralInfoDb(clientId, clientData, ownerUserId = null) {
    const fields = Object.keys(clientData);
    if (fields.length === 0) return null;

    // Construcción dinámica de la cláusula SET (ej: name = $1, whatsapp = $2)
    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
    const values = Object.values(clientData);

    let queryText = `UPDATE clients SET ${setClause} WHERE id = $${fields.length + 1}`;
    const queryParams = [...values, clientId];

    if (ownerUserId !== null) {
        queryText += ` AND owner_user_id = $${fields.length + 2}`;
        queryParams.push(ownerUserId);
    }

    queryText += ` RETURNING *;`;

    try {
        const res = await query(queryText, queryParams);
        return res.rows[0] || null;
    } catch (error) {
        console.error(`Error en la actualización masiva del cliente ${clientId}:`, error);
        throw error;
    }
}

/**
 * Añade un nuevo cliente y su primer producto dentro de una única transacción para garantizar la integridad de los datos.
 * @param {object} clientData - Objeto con los datos del cliente (id, name, whatsapp, etc.).
 * @param {object} productData - Objeto con los datos del producto (product_name, expiry_date, etc.).
 * @param {bigint} ownerUserId - El ID del usuario que realiza la operación.
 * @returns {Promise<boolean>} Devuelve true si la transacción fue exitosa.
 */
async function addClientWithFirstProductDb(clientData, productData, ownerUserId) {
    const client = await pool.connect(); // Obtenemos una conexión directa del pool
    try {
        await client.query('BEGIN'); // 1. Iniciar la transacción

        // 2. Insertar el cliente
        await client.query(
            `INSERT INTO clients (id, name, whatsapp, email, general_notes, owner_user_id)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [clientData.id, clientData.name, clientData.whatsapp, clientData.email, clientData.generalNotes, ownerUserId]
        );

        // 3. Insertar el producto
        await client.query(
            `INSERT INTO client_products (client_id, product_name, contract_date, expiry_date, notice_date, status, product_notes, service_username, service_password, added_by_user_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [clientData.id, productData.product_name, productData.contract_date, productData.expiry_date, productData.notice_date, productData.status, productData.product_notes, productData.service_username, productData.service_password, ownerUserId]
        );

        await client.query('COMMIT'); // 4. Si todo fue bien, confirmar los cambios
        return true;
    } catch (error) {
        await client.query('ROLLBACK'); // 5. Si algo falló, revertir todos los cambios
        console.error('Error en la transacción de añadir cliente, se revirtieron los cambios.', error);
        throw error; // Propagar el error para que el manejador principal lo capture
    } finally {
        client.release(); // 6. Liberar la conexión para que vuelva al pool
    }
}

async function getClientsCountDb(filters = {}, ownerUserId = null) {
    let queryText = `SELECT COUNT(DISTINCT c.id) FROM clients c`;
    const queryParams = [];
    let paramIndex = 1;

    if (filters.search) {
        queryText += ` LEFT JOIN client_products p ON c.id = p.client_id`;
    }
    queryText += ` WHERE 1=1`;

    if (ownerUserId !== null) {
        queryText += ` AND c.owner_user_id = $${paramIndex++}`;
        queryParams.push(ownerUserId);
    }
    if (filters.search) {
        queryText += ` AND (c.name ILIKE $${paramIndex} OR p.product_name ILIKE $${paramIndex})`;
        queryParams.push(`%${filters.search}%`);
    }

    const res = await query(queryText, queryParams);
    return parseInt(res.rows[0].count, 10);
}

async function linkWhatsAppIdDb(telegramId, whatsappId) {
    const res = await query(
        'UPDATE users SET whatsapp_id = $1 WHERE id = $2 RETURNING *',
        [whatsappId, telegramId]
    );
    return res.rows[0];
}

async function findUserByWhatsappIdDb(whatsappId) {
    const res = await query('SELECT * FROM users WHERE whatsapp_id = $1', [whatsappId]);
    return res.rows[0] || null;
}

async function findUserByClientIdDb(clientId) {
    const res = await query('SELECT * FROM users WHERE client_id = $1', [clientId]);
    return res.rows[0] || null;
}

// Exporta todas las funciones de la DB
module.exports = {
    query,
    testDbConnection,
    addClientGeneralInfoDb,
    getAllClientsDb,
    findClientGeneralInfoDb,
    deleteClientDb,
    updateClientGeneralInfoDb,
    updateFullClientGeneralInfoDb,
    addClientProductDb,
    getClientProductsDb,
    findClientProductByIdDb,
    updateClientProductDb,
    updateFullClientProductDb,
    deleteClientProductDb,
    upsertUserDb,
    getUserByIdDb,
    addSaleDb,
    getAllSalesDb,
    getProductsNearingExpiryDb,
    getStatsDb,
    getFullClientBackupDb,
    restoreClientsFromBackupDb,
    getFilteredClientsDb,
    addClientWithFirstProductDb,
    linkWhatsAppIdDb,
    findUserByWhatsappIdDb,
    getProductsNearingExpiryDb,
    markProductAsNotifiedDb,
    findUserByClientIdDb,
    getClientsCountDb
};