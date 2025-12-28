require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true // IMPORTANTE: Para ejecutar múltiples queries a la vez
};

const DB_NAME = process.env.DB_NAME || 'app_aquanova_bd';

const SCHEMA_SQL = `
-- ==========================================================
-- SISTEMA DE GESTIÓN DE FORMULARIOS DINÁMICOS - AQUANOVA
-- Motor: MySQL 8.0+ | Enfoque: JSON Híbrido + Relacional
-- ==========================================================

-- 1. CREACIÓN DEL ENTORNO
CREATE DATABASE IF NOT EXISTS ${DB_NAME}
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE ${DB_NAME};

-- ==========================================================
-- SECCIÓN 1: IDENTIDAD Y GEOGRAFÍA (CORE)
-- ==========================================================

CREATE TABLE IF NOT EXISTS \`users\` (
  \`id\` CHAR(36) NOT NULL,
  \`name\` VARCHAR(255) NOT NULL,
  \`email\` VARCHAR(255) NULL,
  \`phone\` VARCHAR(50) NULL,
  \`password_hash\` VARCHAR(255) NULL,
  \`is_active\` BOOLEAN DEFAULT TRUE,
  \`metadata\` JSON NULL,
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE INDEX \`email_UNIQUE\` (\`email\` ASC)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS \`roles\` (
  \`id\` INT NOT NULL AUTO_INCREMENT,
  \`name\` VARCHAR(50) NOT NULL,
  \`description\` TEXT NULL,
  PRIMARY KEY (\`id\`),
  UNIQUE INDEX \`name_UNIQUE\` (\`name\` ASC)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS \`neighborhoods\` (
  \`id\` CHAR(36) NOT NULL,
  \`name\` VARCHAR(255) NOT NULL,
  \`code\` VARCHAR(50) NOT NULL,
  \`parent_id\` CHAR(36) NULL,
  \`geom\` GEOMETRY NULL,
  \`metadata\` JSON NULL,
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE INDEX \`code_UNIQUE\` (\`code\` ASC),
  CONSTRAINT \`fk_neighborhood_parent\`
    FOREIGN KEY (\`parent_id\`)
    REFERENCES \`neighborhoods\` (\`id\`)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS \`user_roles\` (
  \`id\` INT NOT NULL AUTO_INCREMENT,
  \`user_id\` CHAR(36) NOT NULL,
  \`role_id\` INT NOT NULL,
  \`neighborhood_id\` CHAR(36) NULL,
  \`assigned_by\` CHAR(36) NULL,
  \`assigned_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  CONSTRAINT \`fk_ur_user\`
    FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
  CONSTRAINT \`fk_ur_role\`
    FOREIGN KEY (\`role_id\`) REFERENCES \`roles\` (\`id\`) ON DELETE RESTRICT,
  CONSTRAINT \`fk_ur_neighborhood\`
    FOREIGN KEY (\`neighborhood_id\`) REFERENCES \`neighborhoods\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`fk_ur_assigner\`
    FOREIGN KEY (\`assigned_by\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ==========================================================
-- SECCIÓN 2: MOTOR DE FORMULARIOS (DEFINICIÓN)
-- ==========================================================

CREATE TABLE IF NOT EXISTS \`forms\` (
  \`id\` CHAR(36) NOT NULL,
  \`key\` VARCHAR(100) NOT NULL,
  \`title\` VARCHAR(255) NOT NULL,
  \`description\` TEXT NULL,
  \`created_by\` CHAR(36) NOT NULL,
  \`is_active\` BOOLEAN DEFAULT TRUE,
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE INDEX \`key_UNIQUE\` (\`key\` ASC),
  CONSTRAINT \`fk_forms_creator\`
    FOREIGN KEY (\`created_by\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS \`form_versions\` (
  \`id\` CHAR(36) NOT NULL,
  \`form_id\` CHAR(36) NOT NULL,
  \`version\` INT NOT NULL,
  \`schema\` JSON NOT NULL,
  \`created_by\` CHAR(36) NOT NULL,
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  \`published_at\` DATETIME NULL,
  \`status\` ENUM('draft', 'published', 'archived') DEFAULT 'draft',
  PRIMARY KEY (\`id\`),
  CONSTRAINT \`fk_fv_form\`
    FOREIGN KEY (\`form_id\`) REFERENCES \`forms\` (\`id\`) ON DELETE CASCADE,
  CONSTRAINT \`fk_fv_creator\`
    FOREIGN KEY (\`created_by\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ==========================================================
-- SECCIÓN 3: LOGÍSTICA DE CAMPO (PUBLICACIÓN)
-- ==========================================================

CREATE TABLE IF NOT EXISTS \`form_publications\` (
  \`id\` CHAR(36) NOT NULL,
  \`form_version_id\` CHAR(36) NOT NULL,
  \`neighborhood_id\` CHAR(36) NULL,
  \`start_at\` DATETIME NOT NULL,
  \`end_at\` DATETIME NULL,
  \`is_active\` BOOLEAN DEFAULT TRUE,
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  CONSTRAINT \`fk_fp_version\`
    FOREIGN KEY (\`form_version_id\`) REFERENCES \`form_versions\` (\`id\`) ON DELETE CASCADE,
  CONSTRAINT \`fk_fp_neighborhood\`
    FOREIGN KEY (\`neighborhood_id\`) REFERENCES \`neighborhoods\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS \`form_links\` (
  \`id\` CHAR(36) NOT NULL,
  \`form_publication_id\` CHAR(36) NOT NULL,
  \`code\` VARCHAR(50) NOT NULL,
  \`qr_payload\` TEXT NULL,
  \`created_by\` CHAR(36) NOT NULL,
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  \`closed_at\` DATETIME NULL,
  PRIMARY KEY (\`id\`),
  UNIQUE INDEX \`code_UNIQUE\` (\`code\` ASC),
  CONSTRAINT \`fk_fl_publication\`
    FOREIGN KEY (\`form_publication_id\`) REFERENCES \`form_publications\` (\`id\`) ON DELETE CASCADE,
  CONSTRAINT \`fk_fl_creator\`
    FOREIGN KEY (\`created_by\`) REFERENCES \`users\` (\`id\`)
) ENGINE=InnoDB;

-- ==========================================================
-- SECCIÓN 4: RECOLECCIÓN DE DATOS (RESPUESTAS)
-- ==========================================================

CREATE TABLE IF NOT EXISTS \`submissions\` (
  \`id\` CHAR(36) NOT NULL,
  \`form_version_id\` CHAR(36) NOT NULL,
  \`user_id\` CHAR(36) NULL,
  \`neighborhood_id\` CHAR(36) NOT NULL,
  \`responses\` JSON NOT NULL,
  \`status\` ENUM('submitted', 'draft', 'failed') DEFAULT 'submitted',
  \`device_info\` JSON NULL,
  \`location_lat\` DECIMAL(10, 8) NULL,
  \`location_lng\` DECIMAL(11, 8) NULL,
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  CONSTRAINT \`fk_sub_version\`
    FOREIGN KEY (\`form_version_id\`) REFERENCES \`form_versions\` (\`id\`) ON DELETE RESTRICT,
  CONSTRAINT \`fk_sub_user\`
    FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`fk_sub_neighborhood\`
    FOREIGN KEY (\`neighborhood_id\`) REFERENCES \`neighborhoods\` (\`id\`) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS \`attachments\` (
  \`id\` CHAR(36) NOT NULL,
  \`submission_id\` CHAR(36) NOT NULL,
  \`field_key\` VARCHAR(100) NOT NULL,
  \`storage_path\` VARCHAR(255) NOT NULL,
  \`filename\` VARCHAR(255) NOT NULL,
  \`mime_type\` VARCHAR(100) NULL,
  \`size_bytes\` BIGINT NULL,
  \`uploaded_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  CONSTRAINT \`fk_att_submission\`
    FOREIGN KEY (\`submission_id\`) REFERENCES \`submissions\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS \`drafts\` (
  \`id\` CHAR(36) NOT NULL,
  \`device_id\` VARCHAR(100) NOT NULL,
  \`user_id\` CHAR(36) NULL,
  \`form_version_id\` CHAR(36) NOT NULL,
  \`payload\` JSON NOT NULL,
  \`saved_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  \`sync_status\` VARCHAR(20) DEFAULT 'pending',
  PRIMARY KEY (\`id\`),
  CONSTRAINT \`fk_draft_user\`
    FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
  CONSTRAINT \`fk_draft_version\`
    FOREIGN KEY (\`form_version_id\`) REFERENCES \`form_versions\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ==========================================================
-- SECCIÓN 5: CUMPLIMIENTO Y SEGURIDAD
-- ==========================================================

CREATE TABLE IF NOT EXISTS \`data_consents\` (
  \`id\` CHAR(36) NOT NULL,
  \`user_id\` CHAR(36) NULL,
  \`submission_id\` CHAR(36) NOT NULL,
  \`policy_version\` VARCHAR(50) NOT NULL,
  \`accepted\` BOOLEAN DEFAULT FALSE,
  \`accepted_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  \`ip_address\` VARCHAR(45) NULL,
  PRIMARY KEY (\`id\`),
  CONSTRAINT \`fk_dc_user\`
    FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`fk_dc_submission\`
    FOREIGN KEY (\`submission_id\`) REFERENCES \`submissions\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS \`audit_logs\` (
  \`id\` CHAR(36) NOT NULL,
  \`actor_id\` CHAR(36) NOT NULL,
  \`action\` VARCHAR(100) NOT NULL,
  \`target_table\` VARCHAR(100) NOT NULL,
  \`target_id\` CHAR(36) NOT NULL,
  \`changes\` JSON NULL,
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  CONSTRAINT \`fk_log_actor\`
    FOREIGN KEY (\`actor_id\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ==========================================================
-- SECCIÓN 6: SEMILLA DE DATOS (ROLES)
-- ==========================================================

INSERT IGNORE INTO \`roles\` (\`id\`, \`name\`, \`description\`) VALUES
(1, 'administrador', 'Acceso total: Configuración del sistema y usuarios.'),
(2, 'operador', 'Gestión operativa: Revisión de envíos y reportes.'),
(3, 'usuario', 'Acceso básico: Llenado de formularios.');
`;

const seedDatabase = async () => {
    let connection;
    try {
        // 1. Conectar al servidor MySQL (sin seleccionar DB aún)
        connection = await mysql.createConnection(DB_CONFIG);
        console.log('🔌 Conectado al servidor MySQL.');

        // 2. Ejecutar Script de Creación de Esquema
        console.log('🏗️  Verificando/Creando base de datos y tablas...');
        await connection.query(SCHEMA_SQL);
        console.log('✅ Esquema de base de datos sincronizado.');

        // 3. Cambiar a la base de datos creada para las operaciones de datos
        await connection.changeUser({ database: DB_NAME });

        // ---------------------------------------------------------
        // 4. SEED BARRIOS
        // ---------------------------------------------------------
        console.log('\n🏘️  Procesando Barrios...');
        let neighborhoodId;
        
        const [existingNeighborhoods] = await connection.query(
            'SELECT id FROM neighborhoods WHERE code = ?', 
            ['B-001']
        );

        if (existingNeighborhoods.length > 0) {
            neighborhoodId = existingNeighborhoods[0].id;
            console.log(`⚠️  El barrio B-001 ya existe. ID: ${neighborhoodId}`);
        } else {
            neighborhoodId = uuidv4();
            const queryNeighborhood = `
                INSERT INTO neighborhoods (id, name, code, created_at) 
                VALUES (?, 'Barrio Central', 'B-001', NOW())
            `;
            await connection.query(queryNeighborhood, [neighborhoodId]);
            console.log(`✅ Barrio creado exitosamente. ID: ${neighborhoodId}`);
        }

        // ---------------------------------------------------------
        // 5. SEED ADMINISTRADOR
        // ---------------------------------------------------------
        console.log('\n👤 Procesando Administrador...');
        const adminData = {
            email: 'admin@aquanova.com',
            password: 'admin123', // ¡Cámbiala por una segura!
            name: 'Super Administrador'
        };

        const [existingUser] = await connection.query(
            'SELECT id FROM users WHERE email = ?', 
            [adminData.email]
        );

        if (existingUser.length > 0) {
            console.log(`⚠️  El usuario ${adminData.email} ya existe. No se realizaron cambios.`);
        } else {
            // Iniciar transacción para el usuario
            await connection.beginTransaction();
            try {
                const salt = await bcrypt.genSalt(10);
                const passwordHash = await bcrypt.hash(adminData.password, salt);
                const userId = uuidv4();

                // Insertar Usuario
                const userQuery = `
                    INSERT INTO users (id, name, email, password_hash, is_active, created_at) 
                    VALUES (?, ?, ?, ?, 1, NOW())
                `;
                await connection.query(userQuery, [userId, adminData.name, adminData.email, passwordHash]);

                // Asignar Rol de Administrador (ID 1, sin barrio específico)
                const roleQuery = `
                    INSERT INTO user_roles (user_id, role_id, neighborhood_id) 
                    VALUES (?, 1, NULL)
                `;
                await connection.query(roleQuery, [userId]);

                await connection.commit();
                console.log(`✅ Administrador creado correctamente.`);
            } catch (err) {
                await connection.rollback();
                console.error('❌ Error creando admin, revirtiendo cambios...', err);
                throw err;
            }
        }

        // ---------------------------------------------------------
        // 6. SEED FORMULARIO DE PRUEBA
        // ---------------------------------------------------------
        console.log('\n📝 Procesando Formulario de Prueba...');
        let formId;
        const formKey = 'censo-demo-v1';
        
        // Buscar si existe
        const [existingForms] = await connection.query(
            'SELECT id FROM forms WHERE `key` = ?', 
            [formKey]
        );

        if (existingForms.length > 0) {
            formId = existingForms[0].id;
            console.log(`⚠️  El formulario ${formKey} ya existe. ID: ${formId}`);
        } else {
            formId = uuidv4();
            // Recuperamos ID del admin para asignarle la creación
            const [admins] = await connection.query('SELECT id FROM users WHERE email = ?', [adminData.email]);
            const adminId = admins[0].id;

            const queryForm = `
                INSERT INTO forms (id, \`key\`, title, description, created_by, created_at) 
                VALUES (?, ?, 'Censo Demográfico 2025', 'Formulario de prueba generado por seed', ?, NOW())
            `;
            await connection.query(queryForm, [formId, formKey, adminId]);

            // Crear Versión 1 del formulario
            const versionId = uuidv4();
            // Esquema simple compatible con tu JSON de ejemplo
            const schema = {
                title: "Datos Básicos",
                fields: [
                    { key: "q1", type: "text", label: "Nombre Completo" },
                    { key: "q2", type: "text", label: "Apellido" },
                    { key: "q3", type: "number", label: "Habitantes" }
                ]
            };
            
            const queryVersion = `
                INSERT INTO form_versions (id, form_id, version, \`schema\`, created_by, status, published_at, created_at) 
                VALUES (?, ?, 1, ?, ?, 'published', NOW(), NOW())
            `;
            await connection.query(queryVersion, [versionId, formId, JSON.stringify(schema), adminId]);
            
            console.log(`✅ Formulario creado exitosamente. ID: ${formId}`);
        }

        console.log('\n=============================================');
        console.log('🎉  DATOS PARA PRUEBAS (COPIA ESTOS IDs)');
        console.log('=============================================');
        console.log(`🏙️  Barrio ID:      ${neighborhoodId}`);
        console.log(`📝  Formulario ID:  ${formId}`);
        console.log(`👤  Usuario:        ${adminData.email} / ${adminData.password}`);
        console.log('=============================================\n');

        console.log('\n✨ Proceso de inicialización completado exitosamente.');

    } catch (error) {
        console.error('❌ Error crítico en la inicialización:', error);
    } finally {
        if (connection) {
            await connection.end();
            console.log('🔌 Conexión cerrada.');
        }
    }
};

seedDatabase();
