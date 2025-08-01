// data/dataHandlers.js
// Contiene la lógica para cargar los datos iniciales desde la base de datos a la memoria.

const db = require('../utils/db');
const { setUserDataInHelpers } = require('../utils/helpers');

// dataStore se mantiene como una caché en memoria para acceso rápido.
const dataStore = {
  userNames: {},
  // salesData y clientsData ya no son necesarios aquí.
};

/**
 * Carga los datos de todos los usuarios desde la base de datos a la caché en memoria (dataStore).
 * Se ejecuta una sola vez al iniciar el bot.
 */
async function loadInitialDataFromDb() {
  try {
    console.log('Cargando datos iniciales desde la base de datos...');
    const res = await db.query('SELECT id, name, authorization_date, role, client_id FROM users');
    
    if (res.rows.length > 0) {
      res.rows.forEach(user => {
        dataStore.userNames[user.id] = {
          name: user.name,
          authorizationDate: user.authorization_date,
          role: user.role,
          client_id: user.client_id
        };
      });
      console.log(`${res.rows.length} usuarios cargados en la caché desde la base de datos.`);
    } else {
      console.log('No se encontraron usuarios en la base de datos para cargar en la caché.');
    }
    
    // Pasa la referencia de los datos de usuario al módulo de helpers.
    setUserDataInHelpers(dataStore.userNames);

  } catch (error) {
    console.error('Error fatal al cargar los datos iniciales desde la DB:', error);
    // Es crítico que el bot no inicie si no puede cargar estos datos.
    process.exit(1);
  }
}

// Ya no necesitamos las funciones saveUserData, loadUserData, etc.

module.exports = {
  dataStore,
  loadInitialDataFromDb // Exportamos la nueva función
};