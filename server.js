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
const swaggerSpecs = require('./src/config/swagger');
const { seedDatabase } = require('./seed');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc:  ["'self'", "'unsafe-inline'", "https://unpkg.com"],
            styleSrc:   ["'self'", "'unsafe-inline'", "https://unpkg.com"],
            imgSrc:     ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "*"]
        }
    }
}));
// CORS restrictivo: solo permite el dominio de producción (y localhost en dev)
const allowedOrigins = [
    'https://aquavisor.co',
    'https://www.aquavisor.co',
    ...(process.env.NODE_ENV !== 'production'
        ? ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:4200']
        : [])
];
app.use(cors({
    origin: (origin, callback) => {
        // Permitir peticiones sin origen (ej: Postman, apps móviles) o del listado
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`Origen no permitido por CORS: ${origin}`));
        }
    },
    credentials: true
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '50mb' }));

// Swagger: spec JSON dinámico
app.get('/api-docs/swagger.json', (req, res) => {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    res.json({
        ...swaggerSpecs,
        servers: [{ url: `${protocol}://${host}/api`, description: 'Servidor' }]
    });
});

// Swagger: UI con assets desde CDN (evita problema de archivos estáticos en Hostinger)
app.get('/api-docs', (req, res) => {
    res.send(`<!DOCTYPE html>
<html>
  <head>
    <title>AquaNova API</title>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
    <script>
      window.onload = function() {
        SwaggerUIBundle({
          url: "/api-docs/swagger.json",
          dom_id: '#swagger-ui',
          presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
          layout: "StandaloneLayout",
          persistAuthorization: true
        });
      }
    </script>
  </body>
</html>`);
});
const docsBase = process.env.NODE_ENV === 'production' ? 'https://api.aquavisor.co' : `http://localhost:${PORT}`;
console.log(`📄 Documentación disponible en ${docsBase}/api-docs`);
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

const startServer = () => {
    app.listen(PORT, () => {
        const baseUrl = process.env.NODE_ENV === 'production'
            ? 'https://api.aquavisor.co'
            : `http://localhost:${PORT}`;
        console.log(`🚀 Servidor corriendo en ${baseUrl}`);
    });
};

if (process.env.NODE_ENV === 'production') {
    // En producción: arrancar directamente sin seed.
    // Ejecuta `npm run seed` manualmente una sola vez para poblar la BD.
    startServer();
} else {
    // En desarrollo: seed automático antes de arrancar
    seedDatabase()
        .then(startServer)
        .catch((err) => {
            console.error('⚠️  Seed falló, iniciando servidor de todas formas:', err.message);
            startServer();
        });
}