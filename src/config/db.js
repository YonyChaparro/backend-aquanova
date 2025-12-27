// src/config/db.js
require('dotenv').config();
const mysql = require('mysql2/promise'); // IMPORTANTE: Usar la versión /promise

// Crear el pool de conexiones
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'app_aquanova_bd',
    waitForConnections: true,
    connectionLimit: 10, // Máximo 10 conexiones simultáneas
    queueLimit: 0
});

// Probar conexión al iniciar (Opcional pero recomendado)
pool.getConnection()
    .then(connection => {
        pool.releaseConnection(connection);
        console.log('✅ Conexión a Base de Datos exitosa (SQL Nativo).');
    })
    .catch(err => {
        console.error('❌ Error conectando a la BD:', err.message);
    });

module.exports = pool;