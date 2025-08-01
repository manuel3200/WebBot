// WebBot/backend/server.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Importamos nuestras rutas
const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const statsRoutes = require('./routes/stats');
const productRoutes = require('./routes/products');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3001;

// =================================================================
// MIDDLEWARES - El orden aquí es MUY importante 1
// =================================================================

// 1. Habilita CORS para que tu futuro frontend pueda hablar con esta API.
app.use(cors());

// 2. ¡LA LÍNEA MÁS IMPORTANTE!
//    Este es el middleware que lee el JSON del body de la petición.
//    DEBE estar ANTES de que se definan las rutas.
app.use(express.json());

// =================================================================

// 3. Ahora que los middlewares están listos, definimos las rutas.
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/products', productRoutes);
app.use('/api/admin', adminRoutes);

app.listen(PORT, () => {
    console.log(`🚀 Servidor API corriendo en http://localhost:${PORT}`);
});