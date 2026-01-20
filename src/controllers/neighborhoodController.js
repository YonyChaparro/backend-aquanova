// src/controllers/neighborhoodController.js
const NeighborhoodModel = require('../models/neighborhoodModel');
const { v4: uuidv4 } = require('uuid');

// CREAR BARRIO (ADMIN)
const createNeighborhood = async (req, res) => {
    try {
        const { name, code, parent_id, metadata } = req.body;

        // Validaciones
        if (!name || !code) {
            return res.status(400).json({
                ok: false,
                message: 'Faltan datos: name y code son obligatorios'
            });
        }

        // Verificar si el código ya existe
        const codeExists = await NeighborhoodModel.findByCode(code);
        if (codeExists) {
            return res.status(400).json({
                ok: false,
                message: 'Ya existe un barrio con ese código'
            });
        }

        // Si hay parent_id, verificar que existe
        if (parent_id) {
            const parentExists = await NeighborhoodModel.checkParentExists(parent_id);
            if (!parentExists) {
                return res.status(404).json({
                    ok: false,
                    message: 'El barrio padre especificado no existe'
                });
            }
        }

        // Crear barrio
        const neighborhoodId = uuidv4();
        await NeighborhoodModel.create({
            id: neighborhoodId,
            name,
            code,
            parent_id: parent_id || null,
            metadata: metadata || null
        });

        res.status(201).json({
            ok: true,
            message: 'Barrio creado exitosamente',
            data: {
                id: neighborhoodId,
                name,
                code,
                parent_id: parent_id || null,
                metadata: metadata || null
            }
        });

    } catch (error) {
        console.error('Error creando barrio:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({
                ok: false,
                message: 'Ya existe un barrio con ese código'
            });
        }
        res.status(500).json({
            ok: false,
            message: 'Error interno al crear barrio'
        });
    }
};

// LISTAR BARRIOS
const getNeighborhoods = async (req, res) => {
    try {
        const neighborhoods = await NeighborhoodModel.findAll();
        res.json({
            ok: true,
            neighborhoods
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            ok: false,
            message: 'Error al listar barrios'
        });
    }
};

// OBTENER DETALLE DE UN BARRIO
const getNeighborhoodDetail = async (req, res) => {
    try {
        const { id } = req.params;

        const neighborhood = await NeighborhoodModel.findById(id);

        if (!neighborhood) {
            return res.status(404).json({
                ok: false,
                message: 'Barrio no encontrado'
            });
        }

        res.json({
            ok: true,
            data: neighborhood
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            ok: false,
            message: 'Error al obtener barrio'
        });
    }
};

// BUSCAR BARRIOS
const searchNeighborhoods = async (req, res) => {
    try {
        const { query } = req.query; // ?query=termino
        if (!query) {
             return res.status(400).json({ ok: false, message: 'Debe enviar un parámetro de búsqueda "query"' });
        }
        
        const neighborhoods = await NeighborhoodModel.search(query);
        res.json({ ok: true, neighborhoods });
    } catch (error) {
        console.error('Error en búsqueda de barrios:', error);
        res.status(500).json({ ok: false, message: 'Error al buscar barrios' });
    }
};

module.exports = { createNeighborhood, getNeighborhoods, getNeighborhoodDetail, searchNeighborhoods };
