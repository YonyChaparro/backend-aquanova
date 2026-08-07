// src/routes/chatRoutes.js
const express = require('express');
const router = express.Router();
const { chat, downloadReport } = require('../controllers/chatController');

/**
 * @swagger
 * tags:
 *   name: Chat
 *   description: Aquabot — asistente de datos con Claude, gráficos y reportes descargables
 */

/**
 * @swagger
 * /chat:
 *   post:
 *     summary: Enviar un mensaje a Aquabot
 *     description: |
 *       Endpoint del chatbot. Acepta un mensaje en lenguaje natural y devuelve la respuesta del asistente.
 *
 *       **Capacidades:**
 *       - Consultas en lenguaje natural sobre el censo (predios, manzanas, agua, habitantes, etc.)
 *       - Gráficos: si el usuario pide una visualización, la respuesta incluye el campo `charts[]`
 *         con datos compatibles con Chart.js listos para renderizar en el frontend.
 *       - Reportes: si el usuario pide un reporte/informe, la respuesta incluye el campo `report`
 *         con el `id` del reporte. Usa ese ID para descargar el archivo:
 *         - `GET /api/chat/report/{id}/pdf` → descarga en PDF
 *         - `GET /api/chat/report/{id}/xlsx` → descarga en Excel
 *
 *       **Historial:** El campo `history` es opcional. El cliente debe almacenar y reenviar
 *       el `history` devuelto en cada respuesta para sostener la conversación (máx 20 turnos).
 *     tags: [Chat]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 example: "Genera un reporte completo del censo con estadísticas por manzana"
 *               history:
 *                 type: array
 *                 description: Historial previo devuelto por la respuesta anterior
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, assistant]
 *                     content:
 *                       type: string
 *     responses:
 *       200:
 *         description: Respuesta del asistente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 answer:
 *                   type: string
 *                   description: Respuesta en markdown
 *                 charts:
 *                   type: array
 *                   description: Presente solo si se generaron gráficos. Datos compatibles con Chart.js.
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                         enum: [bar, line, pie, doughnut]
 *                       title:
 *                         type: string
 *                       labels:
 *                         type: array
 *                         items:
 *                           type: string
 *                       datasets:
 *                         type: array
 *                 report:
 *                   type: object
 *                   description: Presente solo si se generó un reporte descargable.
 *                   properties:
 *                     id:
 *                       type: string
 *                       description: UUID del reporte. Válido por 1 hora.
 *                     title:
 *                       type: string
 *                 history:
 *                   type: array
 *                   description: Historial actualizado. Almacenar y reenviar en la próxima petición.
 *                 usage:
 *                   type: object
 *                   properties:
 *                     input_tokens:
 *                       type: integer
 *                     output_tokens:
 *                       type: integer
 *       400:
 *         description: Campo "message" faltante o vacío
 *       429:
 *         description: Límite de uso de Claude alcanzado
 *       503:
 *         description: ANTHROPIC_API_KEY no configurada
 *       500:
 *         description: Error interno
 */
router.post('/', chat);

/**
 * @swagger
 * /chat/report/{id}/{format}:
 *   get:
 *     summary: Descargar un reporte generado
 *     description: |
 *       Descarga el reporte generado por Aquabot en PDF o Excel.
 *       El `id` se obtiene del campo `report.id` de la respuesta del chat.
 *       Los reportes expiran **1 hora** después de ser generados.
 *     tags: [Chat]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: UUID del reporte (del campo report.id en la respuesta del chat)
 *       - in: path
 *         name: format
 *         required: true
 *         schema:
 *           type: string
 *           enum: [pdf, xlsx]
 *         description: Formato de descarga
 *     responses:
 *       200:
 *         description: Archivo descargable
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Formato no válido
 *       404:
 *         description: Reporte no encontrado o expirado
 *       500:
 *         description: Error al generar el archivo
 */
router.get('/report/:id/:format', downloadReport);

module.exports = router;
