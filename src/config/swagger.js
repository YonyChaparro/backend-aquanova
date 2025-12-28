// src/config/swagger.js
const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AquaNova API',
      version: '1.0.0',
      description: 'API para la recolección de datos en campo del proyecto aquanova.',
    },
    servers: [
      {
        url: 'http://localhost:3000/api',
        description: 'Servidor de Desarrollo'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  // 👇 2. AQUÍ ESTÁ EL CAMBIO CLAVE 👇
  // Usamos path.join para salir de 'config' (..) y entrar a 'routes'
  apis: [path.join(__dirname, '../routes/*.js')], 
};

const swaggerSpecs = swaggerJsdoc(options);
module.exports = swaggerSpecs;