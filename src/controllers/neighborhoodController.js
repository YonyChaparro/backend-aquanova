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

        // Recuperar jerarquía (Barrio actual -> Padre -> Abuelo ...)
        const hierarchy = await NeighborhoodModel.findHierarchy(id);

        if (!hierarchy || hierarchy.length === 0) {
            return res.status(404).json({
                ok: false,
                message: 'Barrio no encontrado'
            });
        }

        // El primer elemento es el barrio solicitado
        const neighborhood = hierarchy[0];
        
        // Calcular el tipo basado en la profundidad de ancestros (hierarchy.length - 1)
        // 0 padres -> Ciudad
        // 1 padre -> Localidad
        // 2+ padres -> Barrio
        const parentsCount = hierarchy.length - 1;
        let type = 'Otro';
        if (parentsCount === 0) type = 'Ciudad';
        else if (parentsCount === 1) type = 'Localidad';
        else if (parentsCount >= 2) type = 'Barrio';

        neighborhood.type = type;

        // Construir la estructura anidada del parent
        // hierarchy[0] -> parent = hierarchy[1] -> parent = hierarchy[2] ...
        let currentLevel = neighborhood;
        for (let i = 1; i < hierarchy.length; i++) {
            const parent = hierarchy[i];
            
            // Calculamos también el tipo del padre (opcional, pero útil)
            const parentDepth = (hierarchy.length - 1) - i; // Profundidad inversa relativa
            // O simplemente usamos la regla absoluta:
            // SI el padre es el último de la lista (índice hierarchy.length-1), es Ciudad.
            // Pero para simplificar, solo anidamos los datos crudos o agregamos el tipo también si queremos
            
            let parentType = 'Otro';
            if (i === hierarchy.length - 1) parentType = 'Ciudad'; // El más alto es Ciudad
            else if (i === hierarchy.length - 2) parentType = 'Localidad';
            
            parent.type = parentType;

            currentLevel.parent = parent; // Asignamos el objeto completo como "parent"
            currentLevel = parent;        // Bajamos un nivel para la siguiente iteración
        }

        // Limpiamos el parent_id plano para evitar confusión, ya que ahora tenemos el objeto parent
        // O lo dejamos por compatibilidad. El requerimiento dice: "el parentid debe traer un json..."
        // Así que reemplazaremos o complementaremos. 
        // Para ser limpios, dejaremos 'parent' como la estructura rica.

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
