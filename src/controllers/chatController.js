// src/controllers/chatController.js
// Chatbot Aquabot — Claude con herramientas: consulta SQL, gráficos y reportes descargables (PDF/XLSX).

const Anthropic = require('@anthropic-ai/sdk');
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MAX_ROWS = 200;
const MAX_REPORT_ROWS = 500;
const MAX_CHART_ROWS = 50;
const REPORT_TTL_MS = 60 * 60 * 1000; // 1 hora

const SAFE_SQL_RE = /^\s*SELECT\b/i;
const DANGEROUS_RE = /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|REPLACE|MERGE|EXEC|EXECUTE|CALL|GRANT|REVOKE|LOAD|OUTFILE)\b/i;

const CHART_COLORS = [
    '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
    '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#14b8a6'
];

// ─── Almacén de reportes en memoria ────────────────────────────────────────

const reportStore = new Map();

function storeReport(data) {
    const id = uuidv4();
    reportStore.set(id, { ...data, createdAt: Date.now() });
    for (const [k, v] of reportStore) {
        if (Date.now() - v.createdAt > REPORT_TTL_MS) reportStore.delete(k);
    }
    return id;
}

function getReport(id) {
    const r = reportStore.get(id);
    if (!r) return null;
    if (Date.now() - r.createdAt > REPORT_TTL_MS) { reportStore.delete(id); return null; }
    return r;
}

// ─── System prompt ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres **Aquabot**, el asistente de datos de **Aquanova**, una plataforma de gestión de acueducto comunitario para el Barrio Las Mercedes (Soacha, Colombia). Respondes preguntas sobre los datos del sistema en español claro y preciso.

## Herramientas disponibles

1. \`query_database\` — consulta la BD para responder preguntas en texto o complementar otros análisis.
2. \`generate_chart\` — crea visualizaciones gráficas (barras, líneas, pie, donut). Úsala cuando el usuario pida una gráfica, visualización o comparativa visual, o cuando los datos se presten para ello.
3. \`generate_report\` — genera un reporte descargable (PDF/Excel) con múltiples secciones de tablas y resúmenes. Úsala cuando el usuario pida un informe, reporte, o quiera exportar datos.

**Reglas de selección:**
- Pregunta puntual → \`query_database\`
- "muéstrame una gráfica / gráfico / visualización" → \`generate_chart\`
- "genera un reporte / informe / exporta los datos" → \`generate_report\` (con todas las secciones relevantes)
- Puedes llamar múltiples herramientas en el mismo turno si la respuesta las requiere (p.ej. texto + gráfico).
- Para reportes complejos: llama \`query_database\` primero para el resumen en texto, y \`generate_report\` para el archivo descargable.

**Al generar reportes:** Cuando \`generate_report\` retorne éxito, dile al usuario que el reporte está listo y que puede descargarlo en PDF o Excel. NO incluyas el ID del reporte en tu texto — el sistema lo gestiona automáticamente.

## Esquema de la base de datos

### Geografía
- **neighborhoods** (136 filas): Barrios, localidades, sectores. Campos: id, name, code, parent_id, is_active, metadata. El barrio del censo: code='SMCN-001' (Las Mercedes).
- **blocks** (1 fila): Manzanas del barrio. Campos: id, code, neighborhood_id, geom_path.
- **lots** (224 filas): Predios del mapa SVG. Campos: id, block_id, number, status (sin_informacion|censado|registrado), water_meter_code, cadastral_id, external_id, area_m2, owner_name, svg_path, centroid, metadata.

### Formularios y censo
- **forms** (11 filas): Formularios de recolección. Campos: id, key, title, description, metadata, is_active, created_by.
- **form_versions** (13 filas): Versiones con schema JSON de preguntas.
- **form_publications** (12 filas): Publicaciones activas de formularios en barrios.
- **submissions** (227 filas): Respuestas del censo. Campos: id, form_version_id, user_id, neighborhood_id, lot_id, responses (JSON), status, location_lat, location_lng, created_at.
  El campo \`responses\` contiene: manzana, direccion, tipo_punto, clase_uso, estado_predio, unidades_habitacionales, numero_habitantes, numero_familias, tiene_agua, horas_agua, observaciones, nombre_inspector, etc.
- **attachments** (567 filas): Fotos y firmas. Campos: id, submission_id, field_key, storage_path, filename.
- **data_consents** (158 filas): Autorizaciones de tratamiento de datos.

### Usuarios y roles
- **users** (4 filas): id, name, document_number, email, phone, is_active.
- **roles** (3 filas): 1=administrador, 2=operador, 3=usuario.
- **user_roles** (4 filas): Asignación de roles por barrio.

### Sorteos y referidos
- **giveaway_configs** (11 filas), **user_referral_profiles** (4), **submission_referrals** (3), **giveaway_points_ledger** (3).

## Consultas de referencia
\`\`\`sql
-- Predios censados por estado
SELECT status, COUNT(*) as total FROM lots GROUP BY status;

-- Acceso a agua por predios
SELECT JSON_UNQUOTE(JSON_EXTRACT(responses,'$.tiene_agua')) as tiene_agua, COUNT(*) as total
FROM submissions GROUP BY tiene_agua;

-- Predios por manzana
SELECT JSON_UNQUOTE(JSON_EXTRACT(responses,'$.manzana')) as mz, COUNT(DISTINCT lot_id) as predios
FROM submissions GROUP BY mz ORDER BY CAST(mz AS UNSIGNED);

-- Habitantes y familias por manzana
SELECT JSON_UNQUOTE(JSON_EXTRACT(responses,'$.manzana')) as manzana,
       SUM(CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(responses,'$.numero_habitantes')),'') AS UNSIGNED)) as habitantes,
       SUM(CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(responses,'$.numero_familias')),'') AS UNSIGNED)) as familias
FROM submissions GROUP BY manzana ORDER BY CAST(manzana AS UNSIGNED);
\`\`\`

## Instrucciones generales
- Responde siempre en español.
- Usa tablas markdown para datos tabulares en texto.
- Si una consulta no devuelve resultados, dilo claramente.
- Nunca reveles password_hash, tokens JWT ni datos sensibles de users.
- Limita respuestas de texto a lo esencial — no vuelques cientos de filas crudas.`;

// ─── Definición de herramientas ─────────────────────────────────────────────

const DB_TOOL = {
    name: 'query_database',
    description: 'Ejecuta una consulta SQL SELECT de solo lectura en la BD de Aquanova. Úsala para obtener datos concretos.',
    input_schema: {
        type: 'object',
        properties: {
            sql: {
                type: 'string',
                description: 'SQL SELECT válido para MySQL 8. Incluye siempre LIMIT ≤ 200.'
            },
            explanation: {
                type: 'string',
                description: 'Una frase explicando qué datos busca esta consulta.'
            }
        },
        required: ['sql', 'explanation']
    }
};

const CHART_TOOL = {
    name: 'generate_chart',
    description: 'Genera los datos estructurados para renderizar un gráfico en el frontend (Chart.js). Úsala cuando el usuario pida una gráfica, visualización o comparativa visual.',
    input_schema: {
        type: 'object',
        properties: {
            chart_type: {
                type: 'string',
                enum: ['bar', 'line', 'pie', 'doughnut'],
                description: 'Tipo de gráfico. Usa bar para comparativas categóricas, line para tendencias temporales, pie/doughnut para distribuciones porcentuales.'
            },
            title: { type: 'string', description: 'Título descriptivo del gráfico.' },
            sql: {
                type: 'string',
                description: 'SELECT que retorna exactamente 2 columnas: etiqueta y valor numérico. Máx 50 filas. Ejemplo: SELECT manzana, COUNT(*) as total FROM submissions GROUP BY manzana ORDER BY CAST(manzana AS UNSIGNED) LIMIT 50'
            },
            label_field: { type: 'string', description: 'Nombre de la columna de etiquetas (eje X o segmentos de pie/doughnut).' },
            value_field: { type: 'string', description: 'Nombre de la columna de valores numéricos.' },
            x_label: { type: 'string', description: 'Etiqueta legible del eje X (para bar/line).' },
            y_label: { type: 'string', description: 'Etiqueta legible del eje Y (para bar/line).' }
        },
        required: ['chart_type', 'title', 'sql', 'label_field', 'value_field']
    }
};

const REPORT_TOOL = {
    name: 'generate_report',
    description: 'Genera un reporte descargable (PDF/Excel) con múltiples secciones. Úsala cuando el usuario pida un informe, reporte o quiera exportar datos estructurados.',
    input_schema: {
        type: 'object',
        properties: {
            title: { type: 'string', description: 'Título principal del reporte.' },
            subtitle: { type: 'string', description: 'Descripción breve o alcance del reporte.' },
            sections: {
                type: 'array',
                description: 'Secciones del reporte. Orden importante: resumen ejecutivo primero, luego tablas detalladas.',
                items: {
                    type: 'object',
                    properties: {
                        heading: { type: 'string', description: 'Título de la sección.' },
                        type: {
                            type: 'string',
                            enum: ['table', 'summary'],
                            description: 'table = tabla de datos con SQL; summary = párrafo de texto.'
                        },
                        sql: {
                            type: 'string',
                            description: 'Para type=table: consulta SELECT (máx 500 filas automáticamente).'
                        },
                        columns: {
                            type: 'array',
                            description: 'Para type=table: columnas a mostrar. Si se omite, se usan todos los campos del resultado SQL.',
                            items: {
                                type: 'object',
                                properties: {
                                    key: { type: 'string', description: 'Nombre del campo en el resultado SQL.' },
                                    header: { type: 'string', description: 'Encabezado legible para la columna.' }
                                },
                                required: ['key', 'header']
                            }
                        },
                        text: { type: 'string', description: 'Para type=summary: contenido del párrafo.' }
                    },
                    required: ['heading', 'type']
                }
            }
        },
        required: ['title', 'sections']
    }
};

// ─── Helpers de consulta SQL ────────────────────────────────────────────────

async function runSafeQuery(sql, limit = MAX_ROWS) {
    if (!SAFE_SQL_RE.test(sql)) return { error: 'Solo se permiten consultas SELECT.' };
    if (DANGEROUS_RE.test(sql)) return { error: 'Consulta rechazada por política de seguridad.' };

    const hasLimit = /\bLIMIT\s+\d+/i.test(sql);
    const safeSql = hasLimit ? sql : `${sql.trimEnd().replace(/;$/, '')} LIMIT ${limit}`;

    try {
        const [rows] = await db.execute(safeSql);
        const capped = rows.slice(0, limit);
        return { rows: capped, count: capped.length, truncated: rows.length >= limit };
    } catch (err) {
        return { error: `Error en la consulta: ${err.message}` };
    }
}

// ─── Handlers de herramientas ───────────────────────────────────────────────

async function handleGenerateChart(input) {
    const result = await runSafeQuery(input.sql, MAX_CHART_ROWS);
    if (result.error) return { error: result.error };
    if (!result.rows.length) return { error: 'La consulta no retornó datos para el gráfico.' };

    const labels = result.rows.map(r => String(r[input.label_field] ?? ''));
    const values = result.rows.map(r => Number(r[input.value_field] ?? 0));
    const isPie = ['pie', 'doughnut'].includes(input.chart_type);

    const chart = {
        type: input.chart_type,
        title: input.title,
        x_label: input.x_label,
        y_label: input.y_label,
        labels,
        datasets: [{
            label: input.y_label || input.value_field,
            data: values,
            backgroundColor: isPie
                ? labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length])
                : CHART_COLORS[0],
            borderColor: input.chart_type === 'line' ? CHART_COLORS[0] : undefined,
            fill: input.chart_type === 'line' ? false : undefined,
            borderWidth: input.chart_type === 'line' ? 2 : undefined
        }]
    };

    return { ok: true, chart };
}

async function handleGenerateReport(input) {
    const sections = [];

    for (const s of input.sections) {
        if (s.type === 'summary') {
            sections.push({ heading: s.heading, type: 'summary', text: s.text || '' });
        } else if (s.type === 'table') {
            if (!s.sql) {
                sections.push({ heading: s.heading, type: 'summary', text: 'No se proporcionó consulta SQL para esta sección.' });
                continue;
            }
            const result = await runSafeQuery(s.sql, MAX_REPORT_ROWS);
            if (result.error) {
                sections.push({ heading: s.heading, type: 'summary', text: `Error al obtener datos: ${result.error}` });
            } else {
                const cols = s.columns?.length
                    ? s.columns
                    : Object.keys(result.rows[0] || {}).map(k => ({ key: k, header: k }));
                sections.push({
                    heading: s.heading,
                    type: 'table',
                    columns: cols,
                    rows: result.rows,
                    truncated: result.truncated
                });
            }
        }
    }

    const reportId = storeReport({
        title: input.title,
        subtitle: input.subtitle || '',
        sections,
        generatedAt: new Date().toISOString()
    });

    return { ok: true, reportId, title: input.title, sectionCount: sections.length };
}

// ─── Generación de PDF ──────────────────────────────────────────────────────

async function generatePdf(res, report) {
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });

    const filename = `reporte-aquanova-${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    const usableW = doc.page.width - 80;
    const locale = 'es-CO';
    const tz = { timeZone: 'America/Bogota' };

    // ── Encabezado del documento ──
    doc.fontSize(22).fillColor('#0ea5e9').font('Helvetica-Bold')
       .text(report.title, 40, 40, { align: 'center', width: usableW });
    let cy = doc.y + 4;

    if (report.subtitle) {
        doc.fontSize(12).fillColor('#64748b').font('Helvetica')
           .text(report.subtitle, 40, cy, { align: 'center', width: usableW });
        cy = doc.y + 4;
    }

    doc.fontSize(9).fillColor('#94a3b8')
       .text(`Generado el ${new Date(report.generatedAt).toLocaleString(locale, tz)} — Aquanova`, 40, cy, { align: 'center', width: usableW });
    cy = doc.y + 12;

    doc.strokeColor('#e2e8f0').lineWidth(1)
       .moveTo(40, cy).lineTo(doc.page.width - 40, cy).stroke();
    cy += 16;

    // ── Secciones ──
    for (const section of report.sections) {
        if (cy > doc.page.height - 80) { doc.addPage(); cy = 40; }

        doc.fontSize(13).fillColor('#1e40af').font('Helvetica-Bold')
           .text(section.heading, 40, cy, { width: usableW });
        cy = doc.y + 6;
        doc.font('Helvetica');

        if (section.type === 'summary') {
            doc.fontSize(10).fillColor('#334155')
               .text(section.text || '', 40, cy, { width: usableW });
            cy = doc.y + 12;
        } else if (section.type === 'table') {
            cy = drawPdfTable(doc, section, cy, usableW);
            cy += 12;
            if (section.truncated) {
                doc.fontSize(8).fillColor('#94a3b8')
                   .text('* Se muestran los primeros 500 resultados.', 40, cy, { width: usableW });
                cy = doc.y + 8;
            }
        }
    }

    doc.end();
}

function drawPdfTable(doc, section, startY, tableW) {
    const { columns, rows } = section;
    if (!rows || rows.length === 0) {
        doc.fontSize(10).fillColor('#64748b').text('Sin datos disponibles.', 40, startY);
        return doc.y + 8;
    }

    const colW = tableW / columns.length;
    const rowH = 18;
    const maxChars = Math.max(6, Math.floor(colW / 5.5));
    const startX = 40;

    const trunc = (val, max) => {
        const s = String(val ?? '');
        return s.length > max ? `${s.substring(0, max - 1)}…` : s;
    };

    const drawHeader = (y) => {
        doc.rect(startX, y, tableW, rowH).fill('#0ea5e9');
        columns.forEach((col, i) => {
            doc.fillColor('white').font('Helvetica-Bold').fontSize(8)
               .text(trunc(col.header, maxChars), startX + i * colW + 4, y + 5, { width: colW - 8, lineBreak: false });
        });
        return y + rowH;
    };

    let y = drawHeader(startY);

    rows.forEach((row, ri) => {
        if (y + rowH > doc.page.height - 40) {
            doc.addPage();
            y = 40;
            y = drawHeader(y);
        }

        const bg = ri % 2 === 0 ? '#f0f9ff' : '#ffffff';
        doc.rect(startX, y, tableW, rowH).fill(bg);
        columns.forEach((col, i) => {
            doc.fillColor('#334155').font('Helvetica').fontSize(8)
               .text(trunc(row[col.key], maxChars), startX + i * colW + 4, y + 5, { width: colW - 8, lineBreak: false });
        });
        y += rowH;
    });

    doc.strokeColor('#cbd5e1').lineWidth(0.5)
       .rect(startX, startY, tableW, y - startY).stroke();

    return y;
}

// ─── Generación de XLSX ─────────────────────────────────────────────────────

async function generateXlsx(res, report) {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Aquanova';
    workbook.created = new Date();

    const locale = 'es-CO';
    const tz = { timeZone: 'America/Bogota' };

    // ── Hoja de información / resúmenes ──
    const infoSheet = workbook.addWorksheet('Información');
    infoSheet.getColumn('A').width = 80;

    const t1 = infoSheet.getCell('A1');
    t1.value = report.title;
    t1.font = { bold: true, size: 18, color: { argb: 'FF0ea5e9' } };
    infoSheet.getRow(1).height = 32;

    if (report.subtitle) {
        const t2 = infoSheet.getCell('A2');
        t2.value = report.subtitle;
        t2.font = { size: 12, color: { argb: 'FF64748b' } };
    }

    infoSheet.getCell('A3').value = `Generado: ${new Date(report.generatedAt).toLocaleString(locale, tz)}`;
    infoSheet.getCell('A3').font = { size: 9, italic: true, color: { argb: 'FF94a3b8' } };

    let infoRow = 5;
    for (const section of report.sections) {
        if (section.type === 'summary') {
            const hCell = infoSheet.getCell(`A${infoRow}`);
            hCell.value = section.heading;
            hCell.font = { bold: true, size: 12 };
            infoRow++;
            const tCell = infoSheet.getCell(`A${infoRow}`);
            tCell.value = section.text || '';
            tCell.font = { size: 10 };
            tCell.alignment = { wrapText: true };
            infoRow += 2;
        }
    }

    // ── Una hoja por cada sección de tipo tabla ──
    const usedNames = new Set(['Información']);

    for (const section of report.sections) {
        if (section.type !== 'table' || !section.columns || !section.rows) continue;

        let sheetName = section.heading.replace(/[\\/?*[\]:]/g, '').substring(0, 28).trim() || 'Datos';
        let finalName = sheetName;
        let counter = 2;
        while (usedNames.has(finalName)) {
            finalName = `${sheetName.substring(0, 25)} ${counter}`;
            counter++;
        }
        usedNames.add(finalName);

        const sheet = workbook.addWorksheet(finalName);

        // Fila de título de sección
        sheet.mergeCells(1, 1, 1, section.columns.length);
        const titleCell = sheet.getRow(1).getCell(1);
        titleCell.value = section.heading;
        titleCell.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0ea5e9' } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(1).height = 28;

        // Fila de encabezados
        const headerRow = sheet.getRow(2);
        headerRow.height = 22;
        section.columns.forEach((col, i) => {
            const cell = headerRow.getCell(i + 1);
            cell.value = col.header;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1e40af' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = { bottom: { style: 'thin', color: { argb: 'FF0ea5e9' } } };
        });

        // Filas de datos
        section.rows.forEach((row, ri) => {
            const dataRow = sheet.getRow(ri + 3);
            const bg = ri % 2 === 0 ? 'FFf0f9ff' : 'FFFFFFFF';
            section.columns.forEach((col, i) => {
                const cell = dataRow.getCell(i + 1);
                const raw = row[col.key];
                cell.value = raw === null || raw === undefined ? '' : raw;
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
                cell.alignment = { vertical: 'middle' };
            });
        });

        // Ancho automático de columnas
        section.columns.forEach((col, i) => {
            const colObj = sheet.getColumn(i + 1);
            let maxLen = col.header.length;
            section.rows.forEach(r => {
                const v = String(r[col.key] ?? '');
                if (v.length > maxLen) maxLen = v.length;
            });
            colObj.width = Math.min(maxLen + 4, 50);
        });

        if (section.truncated) {
            const noteRow = sheet.getRow(section.rows.length + 3);
            noteRow.getCell(1).value = '* Se muestran los primeros 500 resultados.';
            noteRow.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF94a3b8' } };
        }
    }

    const filename = `reporte-aquanova-${Date.now()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
}

// ─── Handler principal: POST /api/chat ─────────────────────────────────────

const chat = async (req, res) => {
    try {
        const { message, history = [] } = req.body;

        if (!message || typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ ok: false, message: 'El campo "message" es requerido.' });
        }
        if (!process.env.ANTHROPIC_API_KEY) {
            return res.status(503).json({ ok: false, message: 'El chatbot no está configurado (ANTHROPIC_API_KEY faltante).' });
        }

        const safeHistory = Array.isArray(history)
            ? history
                .filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')
                .slice(-20)
            : [];

        const messages = [
            ...safeHistory,
            { role: 'user', content: message.trim() }
        ];

        const chartsGenerated = [];
        let reportGenerated = null;

        let response;
        let iterations = 0;
        const MAX_ITERATIONS = 8;

        while (iterations < MAX_ITERATIONS) {
            iterations++;

            response = await client.messages.create({
                model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001',
                max_tokens: 4096,
                system: SYSTEM_PROMPT,
                tools: [DB_TOOL, CHART_TOOL, REPORT_TOOL],
                messages
            });

            if (response.stop_reason !== 'tool_use') break;

            const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
            const toolResults = [];

            for (const toolUse of toolUseBlocks) {
                let result;
                let claudeResult; // Lo que Claude ve como resultado (puede ser más compacto)

                if (toolUse.name === 'query_database') {
                    result = await runSafeQuery(toolUse.input.sql);
                    claudeResult = result;

                } else if (toolUse.name === 'generate_chart') {
                    result = await handleGenerateChart(toolUse.input);
                    if (result.ok && result.chart) chartsGenerated.push(result.chart);
                    claudeResult = result.ok
                        ? { ok: true, message: `Gráfico "${result.chart.title}" generado con ${result.chart.labels.length} puntos de datos. El frontend lo renderizará automáticamente.` }
                        : result;

                } else if (toolUse.name === 'generate_report') {
                    result = await handleGenerateReport(toolUse.input);
                    if (result.ok) reportGenerated = { id: result.reportId, title: result.title };
                    claudeResult = result.ok
                        ? { ok: true, message: `Reporte "${result.title}" generado exitosamente con ${result.sectionCount} sección(es). El sistema mostrará los botones de descarga automáticamente.` }
                        : result;

                } else {
                    result = { error: `Herramienta desconocida: ${toolUse.name}` };
                    claudeResult = result;
                }

                toolResults.push({
                    type: 'tool_result',
                    tool_use_id: toolUse.id,
                    content: JSON.stringify(claudeResult)
                });
            }

            messages.push({ role: 'assistant', content: response.content });
            messages.push({ role: 'user', content: toolResults });
        }

        const textBlocks = (response.content || []).filter(b => b.type === 'text');
        const answerText = textBlocks.map(b => b.text).join('\n').trim();

        const updatedHistory = [
            ...safeHistory,
            { role: 'user', content: message.trim() },
            { role: 'assistant', content: answerText }
        ];

        const payload = {
            ok: true,
            answer: answerText,
            history: updatedHistory,
            usage: {
                input_tokens: response.usage?.input_tokens,
                output_tokens: response.usage?.output_tokens
            }
        };

        if (chartsGenerated.length > 0) payload.charts = chartsGenerated;
        if (reportGenerated) payload.report = reportGenerated;

        res.json(payload);

    } catch (err) {
        console.error('Error en Aquabot:', err);
        if (err.status === 401) return res.status(503).json({ ok: false, message: 'API key de Claude inválida.' });
        if (err.status === 429) return res.status(429).json({ ok: false, message: 'Límite de uso de Claude alcanzado. Intenta en un momento.' });
        res.status(500).json({ ok: false, message: 'Error interno del chatbot.' });
    }
};

// ─── Handler de descarga de reportes ────────────────────────────────────────

const downloadReport = async (req, res) => {
    const { id, format } = req.params;
    const report = getReport(id);

    if (!report) {
        return res.status(404).json({ ok: false, message: 'Reporte no encontrado o expirado. Los reportes expiran en 1 hora.' });
    }

    try {
        if (format === 'pdf') {
            await generatePdf(res, report);
        } else if (format === 'xlsx') {
            await generateXlsx(res, report);
        } else {
            res.status(400).json({ ok: false, message: 'Formato no válido. Use "pdf" o "xlsx".' });
        }
    } catch (err) {
        console.error('Error generando archivo de reporte:', err);
        if (!res.headersSent) {
            res.status(500).json({ ok: false, message: 'Error al generar el archivo.' });
        }
    }
};

module.exports = { chat, downloadReport };
