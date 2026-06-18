// src/models/mapModel.js
const db = require('../config/db'); // Ajusta a la ruta de tu conexión a MySQL

const getBlocksAndLots = async (neighborhoodId) => {
    let query = `
        SELECT
            b.id AS block_id, b.code AS block_code, b.geom_path AS block_geom, b.label_position,
            l.id AS lot_id, l.number, l.status, l.water_meter_code, l.cadastral_id,
            l.external_id, l.area_m2, l.svg_path, l.centroid,
            n.metadata AS neighborhood_metadata
        FROM blocks b
        INNER JOIN neighborhoods n ON b.neighborhood_id = n.id AND n.is_active = 1
        LEFT JOIN lots l ON b.id = l.block_id
    `;
    const params = [];

    if (neighborhoodId) {
        query += ` WHERE b.neighborhood_id = ?`;
        params.push(neighborhoodId);
    }

    const [rows] = await db.execute(query, params);
    return rows;
};

const updateLot = async (lotId, updateData) => {
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updateData)) {
        fields.push(`${key} = ?`);
        values.push(value);
    }

    if (fields.length === 0) return null;

    const query = `UPDATE lots SET ${fields.join(', ')} WHERE id = ?`;
    values.push(lotId);

    const [result] = await db.execute(query, values);
    return result;
};

// Traer solo los barrios activos
const getAllNeighborhoods = async () => {
    const [rows] = await db.execute('SELECT id, name, code FROM neighborhoods WHERE is_active = 1 ORDER BY name ASC');
    return rows;
};

// Datos del censo por barrio para el gemelo digital
const getCensusByNeighborhood = async (neighborhoodId) => {
    const [rows] = await db.execute(`
        SELECT
            s.id                                                                AS id_respuesta,
            -- lot_id resuelto: FK directa > external_id mapping > UUID legado del formulario
            COALESCE(
                s.lot_id,
                lot_ext.id,
                JSON_UNQUOTE(JSON_EXTRACT(s.responses, '$.predio_id'))
            )                                                                   AS lot_id,
            s.lot_id                                                            AS lot_id_directo,
            lot_ext.id                                                          AS lot_id_via_external,
            JSON_UNQUOTE(JSON_EXTRACT(s.responses, '$.predio_id'))              AS predio_id_legado,
            s.created_at                                                        AS fecha_creacion,
            n.name                                                              AS barrio,
            JSON_EXTRACT(s.responses, '$.manzana')                             AS manzana,
            JSON_UNQUOTE(JSON_EXTRACT(s.responses, '$.direccion'))              AS direccion,
            JSON_UNQUOTE(JSON_EXTRACT(s.responses, '$.tipo_punto'))             AS tipo_punto,
            JSON_UNQUOTE(JSON_EXTRACT(s.responses, '$.clase_uso'))              AS clase_uso,
            JSON_UNQUOTE(JSON_EXTRACT(s.responses, '$.estado_predio'))          AS estado_predio,
            JSON_EXTRACT(s.responses, '$.unidades_habitacionales')             AS unidades_habitacionales,
            JSON_EXTRACT(s.responses, '$.numero_habitantes')                   AS numero_habitantes,
            JSON_EXTRACT(s.responses, '$.numero_familias')                     AS numero_familias,
            JSON_UNQUOTE(JSON_EXTRACT(s.responses, '$.tiene_agua'))             AS tiene_agua,
            JSON_EXTRACT(s.responses, '$.horas_agua')                          AS horas_agua,
            JSON_UNQUOTE(JSON_EXTRACT(s.responses, '$.registro_inspector'))     AS registro,
            JSON_UNQUOTE(JSON_EXTRACT(s.responses, '$.plano'))                  AS plano,
            JSON_UNQUOTE(JSON_EXTRACT(s.responses, '$.observaciones'))          AS observaciones,
            JSON_UNQUOTE(JSON_EXTRACT(s.responses, '$.nombre_inspector'))       AS inspector_nombre,
            JSON_UNQUOTE(JSON_EXTRACT(s.responses, '$.nombre_atiende'))         AS atendio_nombre,
            JSON_UNQUOTE(JSON_EXTRACT(s.responses, '$.rol_atiende'))            AS atendio_rol,
            (SELECT a.storage_path
             FROM attachments a
             WHERE a.submission_id = s.id AND a.field_key = 'foto_fachada'
             LIMIT 1)                                                           AS foto_fachada,
            (SELECT a.storage_path
             FROM attachments a
             WHERE a.submission_id = s.id AND a.field_key = 'firma_digital'
             LIMIT 1)                                                           AS firma_digital
        FROM submissions s
        JOIN form_versions fv ON fv.id = s.form_version_id
        JOIN forms f          ON f.id  = fv.form_id
        JOIN neighborhoods n  ON n.id  = s.neighborhood_id
        -- Intenta resolver el predio por external_id cuando no hay FK directa
        LEFT JOIN lots lot_ext ON lot_ext.external_id = JSON_UNQUOTE(JSON_EXTRACT(s.responses, '$.predio_id'))
        WHERE s.neighborhood_id = ?
          AND f.key = 'censo-masivo-catastro-v2'
        ORDER BY s.created_at DESC
    `, [neighborhoodId]);

    return rows;
};

module.exports = { getBlocksAndLots, updateLot, getAllNeighborhoods, getCensusByNeighborhood };