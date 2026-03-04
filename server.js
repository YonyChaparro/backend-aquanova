// server.js (Actualizado)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

// Importar rutas de autenticación
const authRoutes = require('./src/routes/authRoutes');
const userRoutes = require('./src/routes/userRoutes');
const formRoutes = require('./src/routes/formRoutes');
const submissionRoutes = require('./src/routes/submissionRoutes');
const neighborhoodRoutes = require('./src/routes/neighborhoodRoutes');
const mapRoutes = require('./src/routes/mapRoutes');
const giveawayRoutes = require('./src/routes/giveawayRoutes');
const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('./src/config/swagger');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs, { swaggerOptions: { persistAuthorization: true } }));
console.log('📄 Documentación disponible en http://localhost:3000/api-docs');
app.use(express.urlencoded({ extended: false, limit: '50mb' }));


// --- RUTAS ---
app.use('/api/auth', authRoutes); // Prefijo para auth
app.use('/api/users', userRoutes); // <--- NUEVO (Prefijo /api/users)
app.use('/api/forms', formRoutes); // <--- NUEVO (Prefijo /api/forms)
app.use('/api/submissions', submissionRoutes); // <--- NUEVO (Prefijo /api/submissions)
app.use('/api/neighborhoods', neighborhoodRoutes); // <--- NUEVO (Prefijo /api/neighborhoods)
app.use('/api/map', mapRoutes);
app.use('/api/giveaways', giveawayRoutes);

// Ruta base
app.get('/', (req, res) => {
    res.json({ message: 'API Aquanova v1.0' });
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});