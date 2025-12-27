// server.js (Actualizado)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

// Importar rutas de autenticación
const authRoutes = require('./src/routes/authRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json()); 
app.use(express.urlencoded({ extended: false }));

// --- RUTAS ---
app.use('/api/auth', authRoutes); // Prefijo para auth

// Ruta base
app.get('/', (req, res) => {
    res.json({ message: 'API Aquanova v1.0' });
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});