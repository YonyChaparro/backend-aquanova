// seed.js
require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { parseInteractiveLotsFromSvgFile } = require('./src/helpers/svgMapParser');
const censoMasivoCatastroFormSeed = require('./seed-censo-form');

const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true // IMPORTANTE: Para ejecutar múltiples queries a la vez
};

const DB_NAME = process.env.DB_NAME || 'app_aquanova_bd';

// ESQUEMA ACTUALIZADO: GEMELO DIGITAL + MOTOR DE SORTEOS Y REFERIDOS
const SCHEMA_SQL = `
-- ==========================================================
-- SISTEMA DE GESTIÓN DE FORMULARIOS DINÁMICOS - AQUANOVA
-- Motor: MySQL 8.0+ | Enfoque: JSON Híbrido + Relacional
-- ==========================================================

-- 1. CREACIÓN DEL ENTORNO
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE \`${DB_NAME}\`;

-- ==========================================================
-- SECCIÓN 1: IDENTIDAD Y GEOGRAFÍA (CORE)
-- ==========================================================

CREATE TABLE IF NOT EXISTS \`users\` (
  \`id\` CHAR(36) NOT NULL,
  \`name\` VARCHAR(255) NOT NULL,
  \`document_number\` VARCHAR(50) NULL,
  \`email\` VARCHAR(255) NULL,
  \`phone\` VARCHAR(50) NULL,
  \`password_hash\` VARCHAR(255) NULL,
  \`is_active\` BOOLEAN DEFAULT TRUE,
  \`metadata\` JSON NULL,
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE INDEX \`email_UNIQUE\` (\`email\` ASC),
  UNIQUE INDEX \`document_UNIQUE\` (\`document_number\` ASC)
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
  \`is_active\` BOOLEAN DEFAULT TRUE,
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
  \`metadata\` JSON NULL,
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
  \`lot_id\` CHAR(36) NULL COMMENT 'Lote/predio asociado al censo (opcional)',
  \`responses\` JSON NOT NULL,
  \`status\` ENUM('submitted', 'draft', 'failed') DEFAULT 'submitted',
  \`device_info\` JSON NULL,
  \`location_lat\` DECIMAL(10, 8) NULL,
  \`location_lng\` DECIMAL(11, 8) NULL,
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  INDEX \`idx_submissions_lot\` (\`lot_id\`),
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
-- SECCIÓN 6: SEMILLA DE DATOS (ESTÁTICA Y SEGURA)
-- ==========================================================

SET SQL_SAFE_UPDATES = 0;
SET FOREIGN_KEY_CHECKS = 0;

DELETE FROM \`roles\`; 
ALTER TABLE \`roles\` AUTO_INCREMENT = 1;

INSERT INTO \`roles\` (\`id\`, \`name\`, \`description\`) VALUES
(1, 'administrador', 'Acceso total: Configuración del sistema y usuarios.'),
(2, 'operador', 'Gestión operativa: Revisión de envíos y reportes.'),
(3, 'usuario', 'Acceso básico: Llenado de formularios.');

SET FOREIGN_KEY_CHECKS = 1;
SET SQL_SAFE_UPDATES = 1;

-- ==========================================================
-- SECCIÓN 7: GEMELO DIGITAL (CATASTRO / ACUEDUCTO)
-- ==========================================================

CREATE TABLE IF NOT EXISTS \`blocks\` (
  \`id\` CHAR(36) NOT NULL,
  \`code\` VARCHAR(50) NOT NULL,
  \`neighborhood_id\` CHAR(36) NOT NULL,
  \`geom_path\` TEXT NOT NULL,
  \`label_position\` JSON NULL,
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  CONSTRAINT \`fk_block_neigh\`
    FOREIGN KEY (\`neighborhood_id\`) REFERENCES \`neighborhoods\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS \`lots\` (
  \`id\` CHAR(36) NOT NULL,
  \`block_id\` CHAR(36) NOT NULL,
  \`number\` VARCHAR(20) NOT NULL,
  \`status\` ENUM('sin_informacion', 'censado', 'registrado') DEFAULT 'sin_informacion',
  \`water_meter_code\` VARCHAR(50) NULL COMMENT 'Código del medidor de agua',
  \`cadastral_id\` VARCHAR(50) NULL COMMENT 'Ficha Catastral o Matrícula',
  \`area_m2\` DECIMAL(10, 2) NULL,
  \`owner_name\` VARCHAR(255) NULL,
  \`svg_path\` TEXT NOT NULL,
  \`centroid\` JSON NULL,
  \`metadata\` JSON NULL,
  \`parent_ids\` JSON NULL,
  \`version\` INT NOT NULL DEFAULT 1,
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE INDEX \`unique_lot_block\` (\`block_id\`, \`number\`),
  CONSTRAINT \`fk_lot_block\`
    FOREIGN KEY (\`block_id\`) REFERENCES \`blocks\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ==========================================================
-- SECCIÓN 8: MOTOR DE SORTEOS Y REFERIDOS
-- ==========================================================

-- Configuración de un sorteo asociado a un formulario (1:1)
CREATE TABLE IF NOT EXISTS \`giveaway_configs\` (
  \`id\` CHAR(36) NOT NULL,
  \`form_id\` CHAR(36) NOT NULL,
  \`points_per_referral\` INT DEFAULT 10,
  \`max_points_per_user\` INT NULL,
  \`is_active\` BOOLEAN DEFAULT TRUE,
  \`start_date\` DATETIME NULL,
  \`end_date\` DATETIME NULL,
  \`metadata\` JSON NULL,
  PRIMARY KEY (\`id\`),
  UNIQUE INDEX \`giveaway_form_UNIQUE\` (\`form_id\` ASC),
  CONSTRAINT \`fk_gc_form\`
    FOREIGN KEY (\`form_id\`) REFERENCES \`forms\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Perfil de referido por usuario (1:1 con users, lazy-created)
CREATE TABLE IF NOT EXISTS \`user_referral_profiles\` (
  \`user_id\` CHAR(36) NOT NULL,
  \`referral_code\` VARCHAR(20) NOT NULL,
  \`total_accumulated_points\` INT DEFAULT 0,
  PRIMARY KEY (\`user_id\`),
  UNIQUE INDEX \`referral_code_UNIQUE\` (\`referral_code\` ASC),
  CONSTRAINT \`fk_urp_user\`
    FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Registro de atribución: qué submission llegó por qué referido
CREATE TABLE IF NOT EXISTS \`submission_referrals\` (
  \`id\` CHAR(36) NOT NULL,
  \`submission_id\` CHAR(36) NOT NULL,
  \`referrer_user_id\` CHAR(36) NOT NULL,
  \`referred_user_id\` CHAR(36) NULL,
  \`is_processed\` BOOLEAN DEFAULT FALSE,
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE INDEX \`submission_ref_UNIQUE\` (\`submission_id\` ASC),
  CONSTRAINT \`fk_sr_submission\`
    FOREIGN KEY (\`submission_id\`) REFERENCES \`submissions\` (\`id\`) ON DELETE CASCADE,
  CONSTRAINT \`fk_sr_referrer\`
    FOREIGN KEY (\`referrer_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT,
  CONSTRAINT \`fk_sr_referred\`
    FOREIGN KEY (\`referred_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Libro mayor de puntos: historial inmutable de puntos otorgados
CREATE TABLE IF NOT EXISTS \`giveaway_points_ledger\` (
  \`id\` BIGINT NOT NULL AUTO_INCREMENT,
  \`user_id\` CHAR(36) NOT NULL,
  \`giveaway_id\` CHAR(36) NOT NULL,
  \`submission_referral_id\` CHAR(36) NOT NULL,
  \`points_earned\` INT NOT NULL,
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  CONSTRAINT \`fk_gpl_user\`
    FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT,
  CONSTRAINT \`fk_gpl_giveaway\`
    FOREIGN KEY (\`giveaway_id\`) REFERENCES \`giveaway_configs\` (\`id\`) ON DELETE RESTRICT,
  CONSTRAINT \`fk_gpl_referral\`
    FOREIGN KEY (\`submission_referral_id\`) REFERENCES \`submission_referrals\` (\`id\`) ON DELETE RESTRICT
) ENGINE=InnoDB;
`;

const seedDatabase = async () => {
    let connection;
    try {
        // 1. Conectar al servidor MySQL
        connection = await mysql.createConnection(DB_CONFIG);
        console.log('🔌 Conectado al servidor MySQL.');

        // 2. Ejecutar Script de Creación de Esquema
        console.log('🏗️  Verificando/Creando base de datos y tablas...');
        await connection.query(SCHEMA_SQL);
        console.log('✅ Esquema de base de datos sincronizado (Gemelo Digital + Motor de Referidos).');

        // 3. Cambiar a la base de datos
        await connection.changeUser({ database: DB_NAME });

        // 3b. Migración segura: agregar is_active a neighborhoods si no existía
        try {
            await connection.query(
                'ALTER TABLE `neighborhoods` ADD COLUMN `is_active` BOOLEAN DEFAULT TRUE'
            );
            console.log('✅ Columna is_active agregada a neighborhoods.');
        } catch (e) {
            if (e.errno === 1060) {
                console.log('⚠️  Columna is_active ya existe en neighborhoods. Continuando...');
            } else {
                throw e;
            }
        }

        // 3c. Migración segura: agregar metadata a forms si no existía
        try {
            await connection.query(
                'ALTER TABLE `forms` ADD COLUMN `metadata` JSON NULL'
            );
            console.log('✅ Columna metadata agregada a forms.');
        } catch (e) {
            if (e.errno === 1060) {
                console.log('⚠️  Columna metadata ya existe en forms. Continuando...');
            } else {
                throw e;
            }
        }

        // 3d. Migración: agregar lot_id a submissions si no existía
        try {
            await connection.query(
                'ALTER TABLE `submissions` ADD COLUMN `lot_id` CHAR(36) NULL AFTER `neighborhood_id`'
            );
            // Agregar índice
            await connection.query(
                'CREATE INDEX `idx_submissions_lot` ON `submissions` (`lot_id`)'
            );
            console.log('✅ Columna lot_id agregada a submissions.');
        } catch (e) {
            if (e.errno === 1060) {
                console.log('⚠️  Columna lot_id ya existe en submissions. Continuando...');
            } else {
                throw e;
            }
        }

        // 3e. Migración: agregar FK de submissions.lot_id -> lots (si no existe)
        try {
            await connection.query(
                'ALTER TABLE `submissions` ADD CONSTRAINT `fk_sub_lot` FOREIGN KEY (`lot_id`) REFERENCES `lots` (`id`) ON DELETE SET NULL'
            );
            console.log('✅ FK fk_sub_lot agregada a submissions.');
        } catch (e) {
            // errno 1061 = Duplicate key name, errno 1826 = Duplicate FK name
            if (e.errno === 1061 || e.errno === 1826 || e.code === 'ER_DUP_KEYNAME' || e.code === 'ER_FK_DUP_NAME') {
                console.log('⚠️  FK fk_sub_lot ya existe en submissions. Continuando...');
            } else {
                console.log('⚠️  No se pudo agregar FK fk_sub_lot (puede que ya exista):', e.code || e.errno);
            }
        }

        // 3f. Migración: agregar parent_ids y version a lots para soporte de topología
        try {
            await connection.query(
                'ALTER TABLE `lots` ADD COLUMN `parent_ids` JSON NULL, ADD COLUMN `version` INT NOT NULL DEFAULT 1'
            );
            console.log('✅ Columnas parent_ids y version agregadas a lots.');
        } catch (e) {
            if (e.errno === 1060) {
                console.log('⚠️  Columnas parent_ids y version ya existen en lots. Continuando...');
            } else {
                console.log('⚠️  Error al agregar parent_ids/version a lots:', e.code || e.errno);
                // Si falla porque version existe pero parent_ids no, o viceversa, lo intentamos individualmente
                try {
                    await connection.query('ALTER TABLE `lots` ADD COLUMN `parent_ids` JSON NULL');
                } catch(err){}
                try {
                    await connection.query('ALTER TABLE `lots` ADD COLUMN `version` INT NOT NULL DEFAULT 1');
                } catch(err){}
            }
        }

        // ---------------------------------------------------------
        // 4. SEED BARRIOS (Ajustado al nuevo mapa)
        // ---------------------------------------------------------
        console.log('\n🏘️  Procesando Barrios...');
        let neighborhoodId;
        const neighborhoodCode = 'SMC-001';
        const neighborhoodName = 'San Miguel de la Cañada';
        
        const [existingNeighborhoods] = await connection.query(
            'SELECT id FROM neighborhoods WHERE code = ?', 
            [neighborhoodCode]
        );

        if (existingNeighborhoods.length > 0) {
            neighborhoodId = existingNeighborhoods[0].id;
            console.log(`⚠️  El barrio ${neighborhoodCode} ya existe. ID: ${neighborhoodId}`);
        } else {
            neighborhoodId = uuidv4();
            const queryNeighborhood = `
                INSERT INTO neighborhoods (id, name, code, created_at) 
                VALUES (?, ?, ?, NOW())
            `;
            await connection.query(queryNeighborhood, [neighborhoodId, neighborhoodName, neighborhoodCode]);
            console.log(`✅ Barrio creado exitosamente: ${neighborhoodName} (ID: ${neighborhoodId})`);
        }

        // ---------------------------------------------------------
        // 5. SEED LOCALIDADES Y BARRIOS DE BOGOTÁ
        // ---------------------------------------------------------
        console.log('\n🏙️  Procesando Localidades y Barrios de Bogotá...');

        const BOGOTA_DATA = [
            {
                localidad: { name: 'Usaquén', code: 'LOC-01', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772333719/descarga_dq3qip.jpg', descripcion: 'Localidad del norte de Bogotá con ambiente histórico y colonial. Reconocida por el Mercado de las Pulgas dominical, la Hacienda Santa Bárbara y sus exclusivos restaurantes.' },
                barrios: [
                    { name: 'Usaquén',       code: 'BAR-0101', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772333847/images_jkdzwf.jpg', descripcion: 'Centro histórico de la localidad con calles empedradas, casas coloniales restauradas y un animado mercado de pulgas dominical. Epicentro gastronómico y cultural del norte de Bogotá.' },
                    { name: 'Santa Bárbara', code: 'BAR-0102', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772334218/Santa_Barbara_f19kdb.jpg', descripcion: 'Sector exclusivo de estrato alto con el centro comercial Hacienda Santa Bárbara como ícono. Zona residencial con amplios bulevares, restaurantes de alta cocina y embajadas.' },
                    { name: 'Country Club',  code: 'BAR-0103', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772334281/usaquen-bogota_j94clo.jpg', descripcion: 'Barrio residencial de estrato 6 con amplias zonas verdes y proximidad al Country Club de Bogotá. Reconocido por su tranquilidad, seguridad privada y arquitectura de casas señoriales.' },
                    { name: 'La Calleja',    code: 'BAR-0104', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772334351/1200x630_La-Calleja_3_ginnzk.jpg', descripcion: 'Zona comercial y residencial de estrato alto con el Centro Comercial Unicentro como referente. Amplia oferta de servicios financieros, restaurantes y oficinas corporativas.' },
                    { name: 'Cedritos',      code: 'BAR-0105', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772334412/bogota-cedritos-hero_ukrcgl.png', descripcion: 'Barrio residencial de clase media-alta con alta densidad de apartamentos modernos. Conocido por su activa vida nocturna en la zona de bares y restaurantes sobre la calle 140.' },
                    { name: 'San Patricio',  code: 'BAR-0106', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772334499/vivir-en-san-patricio-bogota-scaled_c11b6o.jpg', descripcion: 'Sector residencial tranquilo de estrato 5, cercano al Club El Nogal. Caracterizado por sus casas amplias con antejardines y una comunidad consolidada de familias tradicionales.' },
                    { name: 'Toberín',       code: 'BAR-0107', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772334556/presentation3_1_fpc82g.jpg', descripcion: 'Zona de desarrollo urbanístico con estación de TransMilenio. Mezcla de conjuntos residenciales nuevos y barrios tradicionales, con acceso a la Autopista Norte y comercio local activo.' },
                ]
            },
            {
                localidad: { name: 'Chapinero', code: 'LOC-02', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772334751/descarga_vs41fx.avif', descripcion: 'Localidad cosmopolita y diversa en el centro-oriente de Bogotá. Centro financiero y universitario con vibrante vida cultural, gastronómica y nocturna.' },
                barrios: [
                    { name: 'El Lago',          code: 'BAR-0201', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772334820/KSTN2NUNEFDZZPHBCYDNVYIPTY_bjefhc.jpg', descripcion: 'Sector comercial consolidado alrededor del Parque El Lago. Concentra oficinas, bancos, clínicas y una intensa actividad diurna con acceso directo a la Carrera Séptima.' },
                    { name: 'Chapinero Central', code: 'BAR-0202', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772334861/descarga_1_rwmvam.avif', descripcion: 'Corazón de Chapinero con la Iglesia de Lourdes como ícono. Zona de alta densidad comercial, universidades, librerías y cafés. Reconocido por su diversidad cultural y movimiento LGBTQ+.' },
                    { name: 'Rosales',           code: 'BAR-0203', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772334921/6XCVYKUCHJHMFI7PQEUXTLK2PU_vruohk.avif', descripcion: 'Barrio de estrato 6 al pie de los cerros orientales con vista panorámica de la ciudad. Zona de embajadas, residencias de lujo y restaurantes exclusivos sobre la Carrera 5.' },
                    { name: 'El Retiro',         code: 'BAR-0204', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772335010/entornoAID-arquitectura-diseno-inmobiliario-Edificio_Retiro_84-6_h2pvr5.jpg', descripcion: 'Sector financiero y comercial de alto nivel con el Centro Comercial Andino y El Retiro. Zona de oficinas corporativas, boutiques de lujo y gastronomía internacional.' },
                    { name: 'Quinta Camacho',    code: 'BAR-0205', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772335063/diseno-sin-titulo-2024-10-25t151355.595_mi95yy.jpg', descripcion: 'Barrio con encanto bohemio y arquitectura inglesa de los años 40. Calles arboladas con casas de conservación convertidas en restaurantes gourmet, cafés artesanales y galerías de arte.' },
                    { name: 'Belén',             code: 'BAR-0206', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772335119/images_1_mk91rz.jpg', descripcion: 'Sector residencial al borde de los cerros orientales con ambiente tranquilo. Comunidad consolidada con acceso a senderos ecológicos del cerro y proximidad al eje universitario de Chapinero.' },
                ]
            },
            {
                localidad: { name: 'Santa Fe', code: 'LOC-03', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772335294/unnamed_drqn6b.jpg', descripcion: 'Localidad del centro de Bogotá con gran riqueza histórica y cultural. Alberga las Torres del Parque, el Eje Ambiental y la Carrera Séptima peatonal.' },
                barrios: [
                    { name: 'Las Aguas',    code: 'BAR-0301', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772335352/Bogot%C3%A1_barrio_Las_Aguas_carrera_2_Gonzalo_Jim%C3%A9nez_de_Quesada_agznua.jpg', descripcion: 'Barrio universitario icónico con la Universidad de los Andes y el Eje Ambiental. Zona de librerías, cafés estudiantiles y patrimonio colonial al pie del cerro de Monserrate.' },
                    { name: 'La Concordia', code: 'BAR-0302', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772335419/Barrio_La_Concordia__Bogot%C3%A1_ece1c2.jpg', descripcion: 'Barrio tradicional en los cerros orientales con calles empinadas y casas de arquitectura popular. Comunidad arraigada con murales coloridos y una vista privilegiada del centro histórico.' },
                    { name: 'Egipto',       code: 'BAR-0303', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772335469/Iglesia_de_Egipto1_xh6lrz.jpg', descripcion: 'Barrio popular en la ladera del cerro de Guadalupe con fuerte identidad barrial. Calles estrechas y empinadas, casas de ladrillo visto y una comunidad resiliente con proyectos de renovación urbana.' },
                    { name: 'Lourdes',      code: 'BAR-0304', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772335530/IglesiaLourdes12_RicardoBa%CC%81ez_650_kb_pghxb2.jpg', descripcion: 'Sector con la emblemática Iglesia de Nuestra Señora de Lourdes. Zona de uso mixto con comercio tradicional, talleres artesanales y residencias antiguas en proceso de renovación.' },
                    { name: 'Veracruz',     code: 'BAR-0305', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772335570/Avenida_Jim%C3%A9nez_Eje_Ambiental_wvbe6c.jpg', descripcion: 'Barrio céntrico cercano al Parque Santander y la Iglesia de la Veracruz. Zona de oficinas públicas, comercio popular y conexión peatonal con el centro histórico de Bogotá.' },
                ]
            },
            {
                localidad: { name: 'San Cristóbal', code: 'LOC-04', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772335804/Parroquia_El_Divino_Ni%C3%B1o__Bogot%C3%A1_Cund_-_Colombia_oet5os.jpg', descripcion: 'Localidad del suroriente bogotano al pie de los cerros orientales. Reconocida por el Santuario del 20 de Julio y una fuerte identidad obrera y religiosa.' },
                barrios: [
                    { name: '20 de Julio',   code: 'BAR-0401', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772335856/58c4a060a302c_jcyrld.jpg', descripcion: 'Barrio emblemático de la devoción al Divino Niño Jesús. Su santuario atrae miles de peregrinos cada semana. Zona de alta actividad comercial con el Sanandresito del Sur y mercados populares.' },
                    { name: 'La Victoria',   code: 'BAR-0402', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772335856/58c4a060a302c_jcyrld.jpg', descripcion: 'Barrio residencial popular en los cerros orientales con fuerte tejido comunitario. Cuenta con colegios distritales, canchas deportivas y acceso a rutas alimentadoras del SITP.' },
                    { name: 'San Blas',      code: 'BAR-0403', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772335954/7740935_3feadffd891f7ffe_awfdrw.jpg', descripcion: 'Uno de los barrios más antiguos de la localidad, ubicado en la ladera del cerro. Comunidad tradicional con vocación obrera, iglesia parroquial y activa Junta de Acción Comunal.' },
                    { name: 'Sosiego',       code: 'BAR-0404', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772336030/35508701_3fe676af94fdc46b_fe8qxe.jpg', descripcion: 'Sector residencial consolidado de estrato 3 con buena cobertura de servicios públicos. Proximidad al Hospital San Blas y a la Avenida Primero de Mayo para conectividad vial.' },
                    { name: 'Montebello',    code: 'BAR-0405', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772336100/eef_176314318216_plana_jcrgxs.jpg', descripcion: 'Barrio en la parte alta de los cerros con vista panorámica de la ciudad. Zona residencial con casas de ladrillo, parques vecinales y programas de mejoramiento integral de barrios.' },
                    { name: 'El Triángulo',  code: 'BAR-0406', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772336149/Sur_de_la_Localidad_de_Usme__Bogot%C3%A1_wgatwf.jpg', descripcion: 'Sector popular con acceso a la Avenida de los Cerros. Barrio en proceso de consolidación con proyectos de vivienda de interés social y participación en programas distritales de acueducto.' },
                ]
            },
            {
                localidad: { name: 'Usme', code: 'LOC-05', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772336442/turismo-en-bogota_-conoce-usme-pueblo-la-puerta-al-area-rural_smpzap.jpg', descripcion: 'Localidad del sur de Bogotá con extensas zonas rurales y urbanas. Puerta de entrada al páramo de Sumapaz con una comunidad campesina y urbana en constante crecimiento.' },
                barrios: [
                    { name: 'Usme Centro',    code: 'BAR-0501', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772336589/turismo-en-bogota_-conoce-usme-pueblo-la-puerta-al-area-rural-1_vlvsrf.jpg', descripcion: 'Centro histórico del antiguo municipio de Usme con plaza principal, iglesia y alcaldía local. Punto de transición entre lo urbano y lo rural, con mercado campesino los fines de semana.' },
                    { name: 'Gran Yomasa',    code: 'BAR-0502', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772336538/10012601_3fb8f014139c06f0_sn0plf.jpg', descripcion: 'Uno de los sectores más poblados de Usme con fuerte identidad comunitaria. Barrio popular con comercio local activo, colegios distritales y programas de legalización de predios.' },
                    { name: 'Alfonso López',  code: 'BAR-0503', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772336637/Barrio_Alfonso_L%C3%B3pez_Bogot%C3%A1_kr_23_cl_52_enxej3.jpg', descripcion: 'Sector residencial de vivienda de interés social con conjuntos multifamiliares. Cuenta con parques vecinales, centros de salud CAMI y rutas del SITP para conectividad al centro de la ciudad.' },
                    { name: 'La Flora',       code: 'BAR-0504', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772336697/unnamed_iyj4zf.png', descripcion: 'Barrio en la zona de transición urbano-rural de Usme. Rodeado de áreas verdes y con cercanía a quebradas naturales, combina vivienda popular con actividades agropecuarias periurbanas.' },
                    { name: 'Ciudad de Usme', code: 'BAR-0505', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772336761/Cuatro_barrios_de_Usme_Suba_y_Kennedy_ingresaron_a_la_formalidad_dlgh4i.jpg', descripcion: 'Proyecto de expansión urbana planificada al sur de Bogotá. Zona de desarrollo con nuevos conjuntos residenciales, infraestructura educativa y vías de acceso en construcción.' },
                    { name: 'Comuneros',      code: 'BAR-0506', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772336805/2017_Bogot%C3%A1_Comuneros__estaci%C3%B3n_de_Transmilenio_b9qm40.jpg', descripcion: 'Barrio popular con fuerte organización comunitaria y presencia activa de Juntas de Acción Comunal. Cuenta con colegio distrital, parque vecinal y programas de acueducto comunitario.' },
                ]
            },
            {
                localidad: { name: 'Tunjuelito', code: 'LOC-06', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772337080/unnamed_1_geuwip.jpg', descripcion: 'Localidad del sur de Bogotá a orillas del río Tunjuelo. Zona industrial y residencial con el Parque El Tunal y la Biblioteca Pública El Tunal como referentes culturales.' },
                barrios: [
                    { name: 'Tunjuelito',      code: 'BAR-0601', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772337303/137202905_1303146970050914_1187379141254261498_o_vmhyp0.jpg', descripcion: 'Barrio que da nombre a la localidad, ubicado junto al río Tunjuelo. Sector obrero tradicional con fábricas de curtiembres, viviendas de ladrillo y un fuerte sentido de identidad barrial.' },
                    { name: 'Abraham Lincoln', code: 'BAR-0602', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772337367/Localidad_Rafael_Uribe_Uribe_xjpmdu.jpg', descripcion: 'Barrio residencial consolidado de estrato 3 con calles pavimentadas y buena cobertura de servicios. Reconocido por su cercanía a la zona industrial y su parque vecinal.' },
                    { name: 'Venecia',         code: 'BAR-0603', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772337522/vene_nlseow.jpg', descripcion: 'Sector comercial dinámico con el Centro Comercial Ciudad Tunal y amplia oferta de servicios. Barrio de estrato medio con conjuntos residenciales y excelente acceso a TransMilenio.' },
                    { name: 'San Benito',      code: 'BAR-0604', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772337729/donde-los-bogotanos-vamos-a-volvernos-verdes-body-image-1481321370_2_vyo25s.webp', descripcion: 'Histórico sector de curtiembres y procesamiento de cuero al sur de Bogotá. Zona industrial en transición con proyectos de renovación ambiental del río Tunjuelo.' },
                    { name: 'El Tunal',        code: 'BAR-0605', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772337796/9512_opt_bsua58.jpg', descripcion: 'Barrio insignia del sur de Bogotá con el Parque Metropolitano El Tunal, la Biblioteca Pública y el centro comercial. Zona residencial y cultural de referencia para toda la localidad.' },
                ]
            },
            {
                localidad: { name: 'Bosa', code: 'LOC-07', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772337945/images_2_vfb0ih.jpg', descripcion: 'Localidad del suroccidente de Bogotá con raíces indígenas Muiscas. Zona de rápido crecimiento urbano con proyectos de vivienda y una comunidad diversa y emprendedora.' },
                barrios: [
                    { name: 'Bosa Centro',    code: 'BAR-0701', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772338009/obras_viales_en_bosa_1_aysfin.jpg', descripcion: 'Centro histórico de Bosa con la plaza fundacional y la iglesia colonial. Zona de comercio tradicional, mercado campesino y vestigios de la herencia indígena Muisca del territorio.' },
                    { name: 'El Porvenir',    code: 'BAR-0702', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772338049/hq720_rnsbcd.jpg', descripcion: 'Sector de desarrollo reciente con grandes proyectos de vivienda de interés social y prioritario. Conjuntos residenciales modernos con zonas comunales, parques y colegios nuevos.' },
                    { name: 'Apogeo',         code: 'BAR-0703', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772338110/bogota-gana-convocatoria-para-renaturalizar-la-zuma-bosa-apogeo-2-1_seyivh.jpg', descripcion: 'Barrio residencial popular con calles comerciales activas. Comunidad organizada con Junta de Acción Comunal participativa, colegio distrital y canchas deportivas de uso comunitario.' },
                    { name: 'San Bernardino', code: 'BAR-0704', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772338212/LWIF5H4JRVF37ILFF4LELZPD6A_lmf04l.jpg', descripcion: 'Barrio con herencia del antiguo asentamiento Muisca de Bosa. Zona residencial consolidada con el humedal Tibanica cercano, ofreciendo espacios verdes para la comunidad.' },
                    { name: 'El Recreo',      code: 'BAR-0705', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772338275/304-1815_241_x_z5vyrx.jpg', descripcion: 'Desarrollo urbanístico planificado con conjuntos cerrados de vivienda social. Cuenta con el Centro Comercial El Recreo, estación de TransMilenio y equipamiento deportivo moderno.' },
                    { name: 'San José',       code: 'BAR-0706', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772338321/Ptm_Bog_oct_2019_dwlosr.jpg', descripcion: 'Barrio tradicional de Bosa con vocación residencial y comercio de proximidad. Tiendas de barrio, panaderías artesanales y una comunidad unida por festividades religiosas y culturales.' },
                ]
            },
            {
                localidad: { name: 'Kennedy', code: 'LOC-08', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772338453/Avenida_de_Las_Am%C3%A9ricas_estaci%C3%B3n_Mundo_Aventura_de_Transmilenio_mavlpn.jpg', descripcion: 'La localidad más poblada de Bogotá, fundada con apoyo del presidente estadounidense John F. Kennedy. Hub comercial e industrial del suroccidente con una vibrante identidad popular.' },
                barrios: [
                    { name: 'Kennedy Central', code: 'BAR-0801', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772338567/casas-en-kennedy_rjolft.jpg', descripcion: 'Centro neurálgico de la localidad con el monumento a Kennedy y el parque central. Zona de comercio intenso, bancos, oficinas públicas y la estación de TransMilenio de la Calle 38 Sur.' },
                    { name: 'Américas',        code: 'BAR-0802', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772338629/av.-americas_gwrqmx.jpg', descripcion: 'Sector residencial y comercial sobre la Avenida de las Américas. Zona de centros comerciales, concesionarios y restaurantes, con acceso directo a la ciclovía más importante de Bogotá.' },
                    { name: 'Castilla',        code: 'BAR-0803', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772338668/Aralia---DJI_0105_1_zqe89e.jpg', descripcion: 'Barrio residencial consolidado de estrato 3 con tradición obrera. Reconocido por sus parques vecinales, polideportivos y una sólida red de comercio local sobre la Avenida Primera de Mayo.' },
                    { name: 'Timiza',          code: 'BAR-0804', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772338947/hq720_2_fbd7ty.jpg', descripcion: 'Barrio emblemático con el Parque Metropolitano Timiza, uno de los más grandes del sur. Zona residencial con lago artificial, canchas, pista de atletismo y programas deportivos distritales.' },
                    { name: 'Britalia',        code: 'BAR-0805', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772338770/Parque_vecinal_en_Britalia_uyrzq4.jpg', descripcion: 'Sector residencial de desarrollo medio con conjuntos multifamiliares y casas de dos pisos. Comunidad activa con ferias de emprendimiento y comercio local sobre las vías principales.' },
                    { name: 'Patio Bonito',    code: 'BAR-0806', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772339151/DJI_0972_tfsxwb.jpg', descripcion: 'Barrio popular densamente poblado con una de las plazas de mercado más grandes de Bogotá. Comunidad multicultural con fuerte presencia de población migrante y comercio informal vibrante.' },
                    { name: 'Tintal',          code: 'BAR-0807', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772339019/maxresdefault_m0ljrz.jpg', descripcion: 'Zona de expansión urbana moderna con la Biblioteca Pública El Tintal como referente cultural. Desarrollo de conjuntos cerrados, parques lineales y nueva infraestructura educativa.' },
                ]
            },
            {
                localidad: { name: 'Fontibón', code: 'LOC-09', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772339273/Fontibon_Plaza_se1spz.jpg', descripcion: 'Localidad estratégica del occidente de Bogotá con el Aeropuerto El Dorado. Centro logístico e industrial con barrios residenciales como Modelia y Ciudad Salitre.' },
                barrios: [
                    { name: 'Fontibón Centro',  code: 'BAR-0901', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772339332/fontibon_recorrido_odiaz-19_g6kcbb.jpg', descripcion: 'Centro histórico de Fontibón con la plaza fundacional y la iglesia colonial de Santiago Apóstol. Zona de comercio tradicional, restaurantes típicos y antigua estación del ferrocarril.' },
                    { name: 'Modelia',          code: 'BAR-0902', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772339377/bogota-modelia-hero_p55fx7.png', descripcion: 'Barrio residencial de estrato 4 con amplios parques y alamedas arboladas. Reconocido por su calidad urbanística, ciclorruta sobre el Canal de los Ángeles y cercanía al aeropuerto.' },
                    { name: 'Capellanía',       code: 'BAR-0903', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772339423/RtcMxd_ACzRTeRHEyajBHmWLpbUMxazCJFIGVygogTobRd_VJPSBRqCgHLnIaFYgSZOaLmWoItRwpToGAmesPGhcAn172235478468_plana_q2lfww.jpg', descripcion: 'Sector industrial y comercial con bodegas logísticas y centros empresariales. Estratégicamente ubicado cerca del aeropuerto El Dorado y la Zona Franca de Fontibón.' },
                    { name: 'Granjas de Techo', code: 'BAR-0904', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772339480/Bogot%C3%A1_carrera_23_calle_26_wf3fjo.jpg', descripcion: 'Zona mixta de bodegas industriales y vivienda popular. En proceso de renovación urbana con proyectos de vivienda y mejoramiento del espacio público sobre la Avenida Centenario.' },
                    { name: 'Zona Franca',      code: 'BAR-0905', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772339564/zona-franca-de-bogota_r3cmz5.jpg', descripcion: 'Principal zona franca de Bogotá con más de 400 empresas. Hub logístico e industrial con modernas bodegas, centros de distribución y parques empresariales de alto nivel.' },
                    { name: 'Ciudad Salitre',   code: 'BAR-0906', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772339627/ciudad-salitre-oriental_fafq4i.jpg', descripcion: 'Desarrollo urbanístico modelo de Bogotá con amplias avenidas, parques y arquitectura moderna. Alberga el Centro de Alto Rendimiento y edificios gubernamentales como el Ministerio de Defensa.' },
                ]
            },
            {
                localidad: { name: 'Engativá', code: 'LOC-10', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772340276/engativa_plf4yb.jpg', descripcion: 'Localidad del noroccidente de Bogotá con importantes humedales como Juan Amarillo y Jaboque. Zona residencial y comercial con el Jardín Botánico y la ciclovía de la Avenida El Dorado.' },
                barrios: [
                    { name: 'Engativá Centro', code: 'BAR-1001', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772340331/engativa_1_d0izgr.jpg', descripcion: 'Antiguo centro del municipio de Engativá con iglesia colonial y plaza fundacional. Zona de transición entre lo urbano y los humedales, con comercio local y tradiciones culturales vivas.' },
                    { name: 'Boyacá Real',     code: 'BAR-1002', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772340380/cual-es-el-estrato-de-engativa_yyvacz.jpg', descripcion: 'Barrio residencial consolidado de estrato 3 sobre la Avenida Boyacá. Zona de conjuntos cerrados, comercio de proximidad y buena conectividad vial hacia el norte y el occidente de Bogotá.' },
                    { name: 'La Española',     code: 'BAR-1003', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772340440/th.outside384x275.6990b4a1d0ebb_infocdn__5046-1-1761411464jpg_aiphko.jpg', descripcion: 'Sector residencial con casas tradicionales de dos pisos y antejardines. Barrio tranquilo con parques vecinales, tiendas de barrio y acceso a la ciclorruta de la Avenida 68.' },
                    { name: 'Minuto de Dios',  code: 'BAR-1004', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772340514/Parada_2_mdD_Bt%C3%A1_may_2018_gj6u6j.jpg', descripcion: 'Barrio modelo fundado por el padre Rafael García Herreros con vocación social. Sede de la Universidad Minuto de Dios, el Museo de Arte Contemporáneo y una comunidad con fuerte tejido solidario.' },
                    { name: 'Santa Cecilia',   code: 'BAR-1005', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772340562/Ciclorruta_calle_111_alameda_r%C3%ADo_Molinos_pyd9ed.jpg', descripcion: 'Barrio residencial de estrato 3 con calles arborizadas y pequeños parques. Zona con cobertura total de servicios públicos, colegio distrital y acceso a la Avenida Calle 68.' },
                    { name: 'Álamos',          code: 'BAR-1006', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772340615/Bogot%C3%A1__sendero_en_el_Jard%C3%ADn_Bot%C3%A1nico_o1i5sp.jpg', descripcion: 'Zona industrial y comercial estratégica con cercanía al aeropuerto El Dorado. Bodegas logísticas conviviendo con sectores residenciales de larga data y excelente acceso a la Avenida Calle 26.' },
                ]
            },
            {
                localidad: { name: 'Suba', code: 'LOC-11', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772340739/localidad_suba_i2uno6.jpg', descripcion: 'Localidad del noroccidente de Bogotá con gran diversidad socioeconómica. Alberga importantes humedales como Córdoba y La Conejera, y barrios que van desde estrato 1 hasta estrato 6.' },
                barrios: [
                    { name: 'Suba Centro',  code: 'BAR-1101', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772340797/zonas-y-barrios-de-suba-1400x788_v8qzj8.jpg', descripcion: 'Centro histórico del antiguo municipio de Suba con plaza fundacional e iglesia colonial. Zona de comercio local, restaurantes típicos y punto de partida para recorridos por los cerros de Suba.' },
                    { name: 'Niza',         code: 'BAR-1102', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772340855/Niza-20_gh1b2d.jpg', descripcion: 'Barrio residencial de estrato 4-5 con amplias zonas verdes y cercanía al Humedal Córdoba. Reconocido por su calidad de vida, centros comerciales cercanos y acceso a la Autopista Norte.' },
                    { name: 'La Floresta',  code: 'BAR-1103', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772340907/puentesubir-_qlz5uz.jpg', descripcion: 'Sector residencial tranquilo de estrato 4 con casas amplias y jardines. Barrio familiar con buena arborización, panaderías artesanales y proximidad al Club Los Lagartos.' },
                    { name: 'El Rincón',    code: 'BAR-1104', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772340957/av.-el-rincon-1_ifjdfo.jpg', descripcion: 'Uno de los sectores más poblados de Suba con vivienda de interés social y comercio popular. Comunidad diversa con colegios distritales, parques vecinales y acceso a las rutas del SITP.' },
                    { name: 'Tibabuyes',    code: 'BAR-1105', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772341007/Gaviotas_2_imagen_icuiev.jpg', descripcion: 'Sector popular al noroccidente de Suba con cercanía al Humedal Juan Amarillo. Barrio en constante crecimiento con proyectos de mejoramiento integral y organización comunitaria activa.' },
                    { name: 'Lisboa',       code: 'BAR-1106', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772341055/suba-lisboa_tfgrnq.jpg', descripcion: 'Barrio residencial consolidado de estrato 3 con buena infraestructura vial. Zona de conjuntos cerrados, comercio local activo y cercanía al Portal de Suba de TransMilenio.' },
                    { name: 'Casablanca',   code: 'BAR-1107', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772341105/CasaBlanca-Render-1_spknxz.webp', descripcion: 'Sector residencial con mezcla de casas y apartamentos de estrato 3. Parques vecinales, supermercados de cadena y acceso a la ciclovía de la Avenida Suba para movilidad sostenible.' },
                ]
            },
            {
                localidad: { name: 'Barrios Unidos', code: 'LOC-12', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772341234/Barrios_Unidos_bcflr1.jpg', descripcion: 'Localidad del centro-norte de Bogotá con vocación comercial e industrial. Reconocida por sus ferias empresariales en Corferias y una tradición barrial de clase media trabajadora.' },
                barrios: [
                    { name: 'Doce de Octubre', code: 'BAR-1201', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772341290/La_Castellana_kr_49_cl_92_Bogot%C3%A1_f9wnky.jpg', descripcion: 'Barrio obrero tradicional con calles comerciales y talleres artesanales. Comunidad consolidada con iglesia parroquial, colegio distrital y activa participación en torneos deportivos de microfútbol.' },
                    { name: 'Los Andes',       code: 'BAR-1202', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772341338/av_55083_efo8y1.webp', descripcion: 'Sector residencial de estrato 4 cercano a la Universidad Nacional. Zona de restaurantes universitarios, librerías y una vida cultural activa influenciada por la comunidad académica.' },
                    { name: 'Alcázares',       code: 'BAR-1203', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772341412/Bogot%C3%A1_Av.Caracas_Calle_76_estaci%C3%B3n_Transmilenio_yypny2.jpg', descripcion: 'Barrio con patrimonio arquitectónico de casas de los años 50 y calles arboladas. Sector de estrato 4 con comercio de proximidad, talleres mecánicos históricos y proximidad a la Carrera 30.' },
                    { name: 'Polo Club',       code: 'BAR-1204', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772341634/renovacion_del_polo._dc_gmnebv.jpg', descripcion: 'Sector residencial exclusivo cercano al antiguo Polo Club de Bogotá. Barrio de estrato 5 con casas amplias, restaurantes de alto nivel y acceso a la Avenida NQS y la Carrera Séptima.' },
                    { name: 'Siete de Agosto', code: 'BAR-1205', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772341697/6219ab8d5901d_dsbqaw.jpg', descripcion: 'Histórico barrio comercial especializado en repuestos automotrices y muebles. Epicentro del comercio popular del norte con una tradición de más de 70 años de actividad mercantil ininterrumpida.' },
                ]
            },
            {
                localidad: { name: 'Teusaquillo', code: 'LOC-13', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772341969/1_2_q8utfk.jpg', descripcion: 'Localidad del centro de Bogotá con gran valor arquitectónico y cultural. Alberga el Parque Simón Bolívar, la Universidad Nacional, Corferias y barrios de conservación histórica.' },
                barrios: [
                    { name: 'Teusaquillo',          code: 'BAR-1301', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772342127/teusa_d10w0q.jpg', descripcion: 'Barrio de conservación arquitectónica con casas de estilo inglés y republicano de los años 30-40. Calles arboladas, plazoletas y una comunidad que preserva activamente su patrimonio urbanístico.' },
                    { name: 'Palermo',              code: 'BAR-1302', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772342085/artworks-PEymKGfoEMrXoXEz-bsLIgw-t1080x1080_waajlk.jpg', descripcion: 'Sector bohemio y cultural con galerías de arte, talleres de artistas y cafés independientes. Barrio universitario con fuerte influencia de la Escuela de Artes de la Universidad Nacional.' },
                    { name: 'Galerías',             code: 'BAR-1303', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772342200/Oferta-inmobiliaria-en-Galerias-Teusaquillo_ts5qpd.jpg', descripcion: 'Zona comercial y de oficinas consolidada con el Centro Comercial Galerías como referente. Sector de uso mixto con restaurantes, clínicas odontológicas y una activa vida urbana diurna.' },
                    { name: 'La Soledad',           code: 'BAR-1304', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772342243/patrimonio-opt_v6cjch.jpg', descripcion: 'Barrio residencial exclusivo de estrato 4 con casas de arquitectura republicana bien conservadas. Zona de embajadas menores, consultorios médicos y restaurantes de cocina gourmet colombiana.' },
                    { name: 'Nicolás de Federmann', code: 'BAR-1305', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772342331/PARQUE_NICOLAS_DE_FEDERMAN-2_jygenk.jpg', descripcion: 'Sector residencial tranquilo cercano al Parque Simón Bolívar. Barrio de estrato 4 con casas de dos pisos, antejardines y una comunidad familiar que disfruta de los espacios verdes del parque.' },
                    { name: 'Armenia',              code: 'BAR-1306', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772342379/images_3_n3fvzc.jpg', descripcion: 'Barrio tradicional de clase media con calles residenciales y comercio local. Cercanía a Corferias y al Centro de Convenciones, lo que dinamiza la actividad económica durante ferias y eventos.' },
                ]
            },
            {
                localidad: { name: 'Los Mártires', code: 'LOC-14', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772342550/iglesia-del-voto-nacional_wtbddx.jpg', descripcion: 'Localidad del centro de Bogotá con fuerte vocación comercial. Zona de la Plaza España, el Sanandresito y el sector de San Victorino, epicentros del comercio popular bogotano.' },
                barrios: [
                    { name: 'Santa Isabel',  code: 'BAR-1401', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772342592/20859-M6139958_41_x_ra51bd.jpg', descripcion: 'Barrio residencial de estrato 3 con calles tranquilas y casas tradicionales. Cercanía al Hospital de la Misericordia y al Parque El Renacimiento, un oasis verde en medio del centro de la ciudad.' },
                    { name: 'La Favorita',   code: 'BAR-1402', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772342640/2019_Bogot%C3%A1_-_Barrio_La_Favorita_-_Calle_20_hacia_la_carrera_17_uqxvqo.jpg', descripcion: 'Sector de comercio popular con talleres de confección, zapaterías y almacenes de telas. Barrio de tradición obrera con una comunidad de comerciantes arraigados al territorio.' },
                    { name: 'El Listón',     code: 'BAR-1403', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772342640/2019_Bogot%C3%A1_-_Barrio_La_Favorita_-_Calle_20_hacia_la_carrera_17_uqxvqo.jpg', descripcion: 'Barrio céntrico con uso mixto residencial y comercial. Zona de talleres, pequeñas industrias y vivienda popular, en proceso de renovación urbana por el proyecto del Metro de Bogotá.' },
                    { name: 'Ricaurte',      code: 'BAR-1404', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772342749/U2CC5RKWOZFCFDBKOXHYVIUUYI_yzdrxq.avif', descripcion: 'Sector comercial especializado en tecnología, electrónica y repuestos. El Sanandresito de San José es su principal atractivo, ofreciendo productos importados a precios competitivos.' },
                    { name: 'Eduardo Santos', code: 'BAR-1405', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772342820/images_4_woerg4.jpg', descripcion: 'Barrio histórico de clase media baja con arquitectura de mediados del siglo XX. Comunidad organizada con Junta de Acción Comunal activa, colegio distrital y cercanía al Estadio El Campín.' },
                ]
            },
            {
                localidad: { name: 'Antonio Nariño', code: 'LOC-15', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772342925/images_5_ytqnrt.jpg', descripcion: 'Una de las localidades más pequeñas de Bogotá, en el centro-sur. Reconocida por el barrio Restrepo, epicentro de la industria del calzado y el cuero en Colombia.' },
                barrios: [
                    { name: 'Antonio Nariño',   code: 'BAR-1501', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772342968/Bogot%C3%A1__estaci%C3%B3n_Transmilenio_Poilicarpa_syvbjk.jpg', descripcion: 'Barrio que da nombre a la localidad con calles residenciales y comercio de proximidad. Sector de estrato 3 con colegios, parques vecinales y acceso a la Avenida Caracas y la NQS.' },
                    { name: 'Restrepo',         code: 'BAR-1502', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772343052/restrepo_njoagi.jpg', descripcion: 'Epicentro de la industria del calzado y marroquinería en Bogotá. Barrio comercial vibrante con cientos de zapaterías, restaurantes tradicionales y la famosa Feria del Cuero que se celebra anualmente.' },
                    { name: 'Ciudad Jardín Sur', code: 'BAR-1503', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772343094/Portada_58_vcyrdt.jpg', descripcion: 'Sector residencial que conserva su vocación de barrio jardín con casas de antejardines floridos. Zona tranquila de estrato 3 con vecinos de larga data y una atmósfera de pueblo dentro de la ciudad.' },
                    { name: 'Muzú',             code: 'BAR-1504', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772343134/59eebc32800017.Y3JvcCwxMjI4LDk1OSwxMDksMTU2_shn5vu.png', descripcion: 'Barrio obrero planificado de los años 50 con casas uniformes de ladrillo. Comunidad unida con tradición deportiva, parque central y cercanía al Centro Comercial del Sur y la Avenida 68.' },
                    { name: 'La Fragua',        code: 'BAR-1505', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772343177/Photo-14-02-25-10-23-54-AM_b82agz.jpg', descripcion: 'Sector residencial consolidado con casas de ladrillo y pequeños talleres artesanales. Barrio conocido por su panadería esquinera tradicional y la cercanía al Canal del Río Fucha para caminatas.' },
                ]
            },
            {
                localidad: { name: 'Puente Aranda', code: 'LOC-16', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772343275/puente-aranda_ggha5k.jpg', descripcion: 'Principal zona industrial de Bogotá con fábricas, bodegas y centros de distribución. Localidad en transición con proyectos de renovación urbana y desarrollo de vivienda.' },
                barrios: [
                    { name: 'Puente Aranda',  code: 'BAR-1601', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772343309/Av._30_Cl_13_Bogot%C3%A1_eosv7p.jpg', descripcion: 'Centro de la localidad con el tradicional puente sobre el río San Francisco. Zona de uso mixto industrial y residencial, con bodegas históricas y proyectos de reconversión a vivienda.' },
                    { name: 'Cundinamarca',   code: 'BAR-1602', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772343345/Los_M%C3%A1rtires_yuxsf8.jpg', descripcion: 'Sector industrial y comercial con bodegas de distribución y talleres manufactureros. Zona en transformación con nuevos desarrollos inmobiliarios sobre la Avenida de las Américas.' },
                    { name: 'Ciudad Montes',  code: 'BAR-1603', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772343390/Colegio_Ciudad_Montes_-_panoramio_okxdnd.jpg', descripcion: 'Barrio residencial obrero con canchas deportivas y polideportivos activos. Reconocido por sus torneos de microfútbol de fin de semana y una comunidad solidaria con fuerte sentido barrial.' },
                    { name: 'Galán',          code: 'BAR-1604', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772343427/maxresdefault_1_m4rf9b.jpg', descripcion: 'Barrio tradicional de clase media-baja con vocación comercial sobre la Avenida 68. Tiendas de barrio, ferreterías y talleres conviviendo con viviendas familiares de dos y tres pisos.' },
                    { name: 'Pradera',        code: 'BAR-1605', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772343466/Pradera_TM_Bogot%C3%A1_mrz_2019_-_3_uiayzr.jpg', descripcion: 'Sector residencial y comercial con cercanía a la zona industrial. Barrio consolidado de estrato 3 con parque vecinal, colegio distrital y acceso a las principales avenidas de la ciudad.' },
                    { name: 'Salazar Gómez',  code: 'BAR-1606', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772343523/35488340_8d708cebd39dbd42_bl8ebl.jpg', descripcion: 'Zona industrial en proceso de renovación urbana con proyectos de vivienda y oficinas. Antiguas fábricas transformándose en lofts modernos y espacios de coworking para emprendedores.' },
                ]
            },
            {
                localidad: { name: 'La Candelaria', code: 'LOC-17', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772343627/la_candelaria-1_mqvasa.jpg', descripcion: 'Centro histórico de Bogotá y cuna de la independencia colombiana. Localidad con calles empedradas, museos, teatros, universidades y una rica vida cultural y bohemia.' },
                barrios: [
                    { name: 'La Catedral',          code: 'BAR-1701', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772343701/2021_Bogot%C3%A1_-_Catedral_Primada_de_Colombia_m4nxrr.jpg', descripcion: 'Corazón del centro histórico con la Plaza de Bolívar, la Catedral Primada, el Capitolio Nacional y el Palacio de Justicia. Epicentro del poder político y religioso de Colombia.' },
                    { name: 'La Concordia Sur',     code: 'BAR-1702', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772344001/Barrio_La_Concordia__calle_12_carre_1_E_Bogota_quknyg.jpg', descripcion: 'Barrio bohemio en la ladera del cerro con hostales, cafés artesanales y galerías de arte callejero. Punto de encuentro de artistas, estudiantes y viajeros que exploran el Bogotá auténtico.' },
                    { name: 'Centro Administrativo', code: 'BAR-1703', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772343786/3695-M4617253_1_x_rlssbe.jpg', descripcion: 'Zona de edificios gubernamentales, ministerios y entidades del Estado. Alberga las icónicas Torres del Parque de Rogelio Salmona y el Centro Internacional de negocios.' },
                    { name: 'Las Aguas Sur',        code: 'BAR-1704', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772343823/istockphoto-1399646345-612x612_ziwneh.jpg', descripcion: 'Sector universitario al pie de Monserrate con la Universidad de los Andes y la Jorge Tadeo Lozano. Eje cultural con el Teatro Colón, la Biblioteca Luis Ángel Arango y el Museo de Arte del Banco de la República.' },
                ]
            },
            {
                localidad: { name: 'Rafael Uribe Uribe', code: 'LOC-18', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772344069/Localidad_Rafael_Uribe_Uribe_1_a9gpxb.jpg', descripcion: 'Localidad del suroriente de Bogotá con barrios populares y una fuerte identidad comunitaria. Zona residencial obrera con activa participación en programas de mejoramiento barrial.' },
                barrios: [
                    { name: 'Marco Fidel Suárez', code: 'BAR-1801', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772344109/hq720_3_nd7znc.jpg', descripcion: 'Barrio residencial popular con comercio local sobre las vías principales. Sector de estrato 2-3 con colegios distritales, canchas deportivas y una comunidad que participa activamente en ferias barriales.' },
                    { name: 'Quiroga',            code: 'BAR-1802', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772344389/Quiroga_tm_Bogot%C3%A1_kweitd.jpg', descripcion: 'Barrio tradicional de clase obrera con una de las plazas de mercado más concurridas del sur. Reconocido por sus panaderías esquineras, tiendas de barrio y el Parque Quiroga para la recreación familiar.' },
                    { name: 'San José Sur',       code: 'BAR-1803', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772344186/images_6_s0mug3.jpg', descripcion: 'Sector residencial consolidado de estrato 2 con casas de ladrillo y pequeños negocios familiares. Comunidad unida con festividades religiosas, bazar comunitario y activa Junta de Acción Comunal.' },
                    { name: 'Claret',             code: 'BAR-1804', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772344215/images_7_pbe2e7.jpg', descripcion: 'Barrio popular con iglesia claretiana como referente. Zona residencial de estrato 2 con colegio religioso, parque vecinal y cercanía a la Avenida Caracas para conectividad al centro de la ciudad.' },
                    { name: 'Lomas',              code: 'BAR-1805', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772344258/images_8_g4ihhz.jpg', descripcion: 'Sector en la parte alta de la localidad con vista de la sabana de Bogotá. Barrio de ladera con calles empinadas, casas de autoconstrucción y una comunidad resiliente con proyectos de mejoramiento vial.' },
                    { name: 'Diana Turbay',       code: 'BAR-1806', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772344291/maxresdefault_2_rjjxqo.jpg', descripcion: 'Barrio popular en los cerros del suroriente con fuerte organización comunitaria. Zona de vivienda informal legalizada con programas de acueducto, pavimentación y mejoramiento integral de barrios.' },
                ]
            },
            {
                localidad: { name: 'Ciudad Bolívar', code: 'LOC-19', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772344527/transmicable1_foto-tomada-de-banco-de-imagenes-visitbogota_crwglt.jpg', descripcion: 'Localidad del sur de Bogotá con una de las poblaciones más grandes de la ciudad. Zona de contrastes entre barrios populares y áreas rurales, con una comunidad resiliente y emprendedora.' },
                barrios: [
                    { name: 'El Tesoro',      code: 'BAR-1901', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772344599/colegio-ciudad-bolivar_hewhcd.jpg', descripcion: 'Barrio popular en la parte alta de Ciudad Bolívar con vista panorámica de toda la ciudad. Comunidad emprendedora con proyectos de arte urbano, huertas comunitarias y programas juveniles de formación.' },
                    { name: 'Lucero',         code: 'BAR-1902', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772344634/IA7NMVBPU5DMJC66LZP4GQOG4E_cc6478.jpg', descripcion: 'Uno de los barrios más emblemáticos de Ciudad Bolívar con calles empinadas y escaleras públicas. Comunidad con fuerte identidad cultural, murales artísticos y programas de biblioteca comunitaria.' },
                    { name: 'El Paraíso',     code: 'BAR-1903', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772344664/145_l3cvfn.jpg', descripcion: 'Sector residencial popular con desarrollo de vivienda de interés social. Barrio en consolidación con nuevos conjuntos, colegio mega y acceso al cable aéreo TransMiCable de Ciudad Bolívar.' },
                    { name: 'San Francisco',  code: 'BAR-1904', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772344698/7OSML74UTZFNBHRP7NVPFCW4TQ_otqrcm.avif', descripcion: 'Barrio tradicional de Ciudad Bolívar con iglesia parroquial y plaza de mercado local. Zona residencial con tiendas de barrio, microempresas familiares y acceso a las rutas del SITP provisional.' },
                    { name: 'Ismael Perdomo', code: 'BAR-1905', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772344784/4785_27_1731708313_i4zrsw.jpg', descripcion: 'Sector de rápido desarrollo con proyectos de vivienda de interés prioritario. Zona con centros comerciales populares, colegios distritales nuevos y conectividad vial hacia el centro por la Autopista Sur.' },
                    { name: 'Jerusalem',      code: 'BAR-1906', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772344823/Portal_El_Tunal_de_Bogot%C3%A1.jpeg_ztvx2n.jpg', descripcion: 'Barrio periférico en la ladera sur con organización comunitaria destacada. Zona de vivienda popular con programas de acueducto comunitario, huertas urbanas y centros culturales juveniles.' },
                    { name: 'Arborizadora',   code: 'BAR-1907', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772344873/images_9_qiclgw.jpg', descripcion: 'Sector residencial con proyectos de vivienda pública y zonas verdes. Alberga el Centro de Desarrollo Comunitario y programas de reforestación que le dan su nombre al barrio.' },
                ]
            },
            {
                localidad: { name: 'Sumapaz', code: 'LOC-20', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772345011/P%C3%A1ramo_de_Sumapaz_2_mw3obq.jpg', descripcion: 'La localidad más grande y rural de Bogotá, hogar del páramo más grande del mundo. Zona de conservación ecológica con comunidades campesinas dedicadas a la agricultura y ganadería de alta montaña.' },
                barrios: [
                    { name: 'San Juan',  code: 'BAR-2001', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772345067/hospital-sjdd_dbdjg6.jpg', descripcion: 'Corregimiento rural en el corazón del páramo de Sumapaz. Comunidad campesina dedicada a la agricultura de papa y hortalizas, con escuela rural y centro comunitario como ejes de la vida social.' },
                    { name: 'Nazareth', code: 'BAR-2002', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772345128/20028-C0001-03_1_V2_x_uzduge.jpg', descripcion: 'Vereda del páramo de Sumapaz con paisajes de frailejones y lagunas glaciares. Zona de importancia hídrica para Bogotá con senderos ecológicos y una comunidad campesina guardiana del ecosistema.' },
                    { name: 'Betania',  code: 'BAR-2003', imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772345224/images_10_mtanl2.jpg', descripcion: 'Pequeña vereda en las estribaciones del páramo con actividades agropecuarias. Comunidad rural con tradición de mingas campesinas, cultivo de arveja y fríjol, y cercanía a fuentes de agua cristalina.' },
                ]
            },
        ];

        let locInserted = 0;
        let barInserted = 0;

        for (const entry of BOGOTA_DATA) {
            const { localidad, barrios } = entry;

            // Verificar si la localidad ya existe
            const [existingLoc] = await connection.query(
                'SELECT id FROM neighborhoods WHERE code = ?',
                [localidad.code]
            );

            let localidadId;
            const localidadMetadata = JSON.stringify({ imagen: localidad.imagen, descripcion: localidad.descripcion });
            if (existingLoc.length > 0) {
                localidadId = existingLoc[0].id;
                // Actualizar metadata de la localidad con su imagen y descripción asignadas
                await connection.query(
                    'UPDATE neighborhoods SET metadata = ? WHERE code = ?',
                    [localidadMetadata, localidad.code]
                );
            } else {
                localidadId = uuidv4();
                await connection.query(
                    'INSERT INTO neighborhoods (id, name, code, metadata, created_at) VALUES (?, ?, ?, ?, NOW())',
                    [localidadId, localidad.name, localidad.code, localidadMetadata]
                );
                locInserted++;
            }

            // Insertar barrios de esta localidad
            for (const barrio of barrios) {
                const barrioMetadata = JSON.stringify({ imagen: barrio.imagen, descripcion: barrio.descripcion });

                const [existingBarrio] = await connection.query(
                    'SELECT id FROM neighborhoods WHERE code = ?',
                    [barrio.code]
                );
                if (existingBarrio.length === 0) {
                    await connection.query(
                        'INSERT INTO neighborhoods (id, name, code, parent_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
                        [uuidv4(), barrio.name, barrio.code, localidadId, barrioMetadata]
                    );
                    barInserted++;
                } else {
                    // Actualizar siempre la metadata con imagen y descripción asignadas
                    await connection.query(
                        'UPDATE neighborhoods SET metadata = ? WHERE code = ?',
                        [barrioMetadata, barrio.code]
                    );
                }
            }
        }

        console.log(`✅ Bogotá: ${locInserted} localidades y ${barInserted} barrios insertados (${BOGOTA_DATA.length} localidades procesadas).`);

        // ---------------------------------------------------------
        // 6. SEED ADMINISTRADOR
        // ---------------------------------------------------------
        console.log('\n👤 Procesando Administrador...');
        const adminData = {
            email: 'admin@aquanova.com',
            document_number: '1000000000', 
            password: 'admin123', 
            name: 'Super Administrador'
        };

        const [existingUser] = await connection.query(
            'SELECT id FROM users WHERE document_number = ?', 
            [adminData.document_number]
        );

        if (existingUser.length > 0) {
            console.log(`⚠️  El usuario con documento ${adminData.document_number} ya existe. No se realizaron cambios.`);
        } else {
            const [userByEmail] = await connection.query(
                'SELECT id FROM users WHERE email = ?', 
                [adminData.email]
            );

            if (userByEmail.length > 0) {
                console.log(`🔄 Usuario encontrado por email (${adminData.email}) pero sin documento. Actualizando...`);
                await connection.query(
                    'UPDATE users SET document_number = ? WHERE id = ?',
                    [adminData.document_number, userByEmail[0].id]
                );
                console.log(`✅ Documento actualizado para el admin.`);
            } else {
                await connection.beginTransaction();
                try {
                    const salt = await bcrypt.genSalt(10);
                    const passwordHash = await bcrypt.hash(adminData.password, salt);
                    const userId = uuidv4();

                    const userQuery = `
                        INSERT INTO users (id, name, document_number, email, password_hash, is_active, created_at) 
                        VALUES (?, ?, ?, ?, ?, 1, NOW())
                    `;
                    await connection.query(userQuery, [userId, adminData.name, adminData.document_number, adminData.email, passwordHash]);

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
        }

        // ---------------------------------------------------------
        // 7. SEED FORMULARIOS
        // ---------------------------------------------------------
        console.log('\n📝 Procesando Formularios...');
        const [admins] = await connection.query('SELECT id FROM users WHERE email = ?', [adminData.email]);
        const adminId = admins[0].id;

        const FORMS_SEED = [
            {
                key: 'censo-demografico-2026',
                title: 'Censo Demográfico 2026',
                description: 'Recolección de datos poblacionales de los hogares del barrio.',
                metadata: { imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772497665/aquanova/forms/h8g43jmkpwo7g3nx7s4a.jpg', imagen_public_id: 'aquanova/forms/h8g43jmkpwo7g3nx7s4a' },
                schema: [
                    { key: 'nombre_jefe',    type: 'text',     label: 'Nombre del jefe de hogar',             required: true,  placeholder: 'Ej: María López' },
                    { key: 'documento',      type: 'text',     label: 'Número de documento de identidad',     required: true,  placeholder: 'Cédula o NIT' },
                    { key: 'fecha_nac',      type: 'date',     label: 'Fecha de nacimiento',                  required: true  },
                    { key: 'genero',         type: 'radio',    label: 'Género',                               required: true,  options: ['Masculino', 'Femenino', 'No binario', 'Prefiero no decir'] },
                    { key: 'estado_civil',   type: 'select',   label: 'Estado civil',                         required: true,  options: ['Soltero/a', 'Casado/a', 'Unión libre', 'Divorciado/a', 'Viudo/a'] },
                    { key: 'nivel_educativo',type: 'select',   label: 'Nivel educativo alcanzado',            required: true,  options: ['Ninguno', 'Primaria', 'Secundaria', 'Técnico', 'Tecnólogo', 'Universitario', 'Posgrado'] },
                    { key: 'num_personas',   type: 'number',   label: 'Número de personas en el hogar',       required: true,  min: 1, max: 20 },
                    { key: 'num_menores',    type: 'number',   label: 'Número de menores de 18 años',         required: false, min: 0 },
                    { key: 'num_adultos_may',type: 'number',   label: 'Número de adultos mayores (>60 años)', required: false, min: 0 },
                    { key: 'tipo_hogar',     type: 'radio',    label: 'Tipo de hogar',                        required: true,  options: ['Unipersonal', 'Nuclear', 'Monoparental', 'Extendido'] },
                    { key: 'estrato',        type: 'select',   label: 'Estrato socioeconómico',               required: true,  options: ['1', '2', '3', '4', '5', '6'] },
                    { key: 'ingresos',       type: 'select',   label: 'Rango de ingresos mensuales',          required: false, options: ['Menos de 1 SMMLV', '1-2 SMMLV', '2-4 SMMLV', '4-6 SMMLV', 'Más de 6 SMMLV'] },
                    { key: 'observaciones',  type: 'textarea', label: 'Observaciones adicionales',            required: false, placeholder: 'Información relevante del hogar...' },
                ]
            },
            {
                key: 'encuesta-servicios-publicos-2026',
                title: 'Encuesta de Servicios Públicos Domiciliarios',
                description: 'Verificación de cobertura y calidad de servicios públicos en el hogar.',
                metadata: { imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772497699/aquanova/forms/hqsuw4mqn9nvrd4s64oy.png', imagen_public_id: 'aquanova/forms/hqsuw4mqn9nvrd4s64oy' },
                schema: [
                    { key: 'direccion',       type: 'text',     label: 'Dirección del predio',                         required: true,  placeholder: 'Ej: Calle 12 # 5-34' },
                    { key: 'tiene_agua',      type: 'radio',    label: '¿Cuenta con servicio de agua potable?',         required: true,  options: ['Sí', 'No'] },
                    { key: 'horas_agua',      type: 'select',   label: 'Horas de suministro de agua al día',            required: false, options: ['Menos de 8h', '8-16h', '16-20h', '24h continuas'] },
                    { key: 'calidad_agua',    type: 'radio',    label: 'Calidad percibida del agua',                    required: false, options: ['Buena', 'Regular', 'Mala'] },
                    { key: 'tiene_alcant',    type: 'radio',    label: '¿Cuenta con red de alcantarillado?',            required: true,  options: ['Sí', 'No'] },
                    { key: 'tiene_energia',   type: 'radio',    label: '¿Cuenta con servicio de energía eléctrica?',    required: true,  options: ['Sí', 'No'] },
                    { key: 'fallas_energia',  type: 'select',   label: 'Frecuencia de cortes de energía',               required: false, options: ['Nunca', 'Rara vez', 'Mensual', 'Semanal', 'Diario'] },
                    { key: 'tiene_gas',       type: 'radio',    label: '¿Cuenta con servicio de gas natural?',          required: true,  options: ['Sí', 'No', 'Usa cilindro'] },
                    { key: 'tiene_internet',  type: 'radio',    label: '¿Cuenta con acceso a Internet?',                required: true,  options: ['Sí, banda ancha', 'Sí, móvil (datos)', 'No'] },
                    { key: 'tiene_aseo',      type: 'radio',    label: '¿Recibe servicio de recolección de basuras?',   required: true,  options: ['Sí', 'No'] },
                    { key: 'frecuencia_aseo', type: 'select',   label: 'Frecuencia de recolección de basuras',          required: false, options: ['Diaria', '3 veces por semana', 'Semanal', 'Quincenal', 'No hay servicio'] },
                    { key: 'satisfaccion',    type: 'range',    label: 'Satisfacción general con los servicios (1-10)', required: true,  min: 1, max: 10 },
                    { key: 'reclamos',        type: 'checkbox', label: '¿Ha presentado reclamos por servicios?',        required: false, options: ['Agua', 'Energía', 'Gas', 'Internet', 'Aseo'] },
                    { key: 'comentarios',     type: 'textarea', label: 'Comentarios sobre los servicios',               required: false },
                ]
            },
            {
                key: 'registro-predios-vivienda-2026',
                title: 'Registro de Predios y Condiciones de Vivienda',
                description: 'Levantamiento catastral y condiciones estructurales de la vivienda.',
                metadata: { imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772497639/aquanova/forms/ffoxdlqxa0bdzahqnhaw.jpg', imagen_public_id: 'aquanova/forms/ffoxdlqxa0bdzahqnhaw' },
                schema: [
                    { key: 'matricula',       type: 'text',     label: 'Matrícula inmobiliaria / Ficha catastral', required: false, placeholder: 'Ej: 50C-12345' },
                    { key: 'tipo_predio',     type: 'radio',    label: 'Tipo de predio',                           required: true,  options: ['Residencial', 'Comercial', 'Mixto', 'Lote'] },
                    { key: 'tenencia',        type: 'select',   label: 'Tenencia del predio',                      required: true,  options: ['Propietario', 'Arrendatario', 'Usufructo', 'Invasión', 'Otro'] },
                    { key: 'tipo_vivienda',   type: 'select',   label: 'Tipo de vivienda',                         required: true,  options: ['Casa', 'Apartamento', 'Cuarto', 'Rancho', 'Otro'] },
                    { key: 'material_paredes',type: 'select',   label: 'Material predominante de paredes',         required: true,  options: ['Ladrillo/Bloque', 'Adobe/Tapia', 'Madera', 'Zinc/Lata', 'Sin paredes'] },
                    { key: 'material_piso',   type: 'select',   label: 'Material predominante del piso',           required: true,  options: ['Cerámica/Baldosa', 'Cemento', 'Madera', 'Tierra', 'Otro'] },
                    { key: 'num_pisos',       type: 'number',   label: 'Número de pisos de la construcción',       required: true,  min: 1, max: 10 },
                    { key: 'num_habitaciones',type: 'number',   label: 'Número de habitaciones',                   required: true,  min: 1 },
                    { key: 'num_banos',       type: 'number',   label: 'Número de baños',                          required: true,  min: 0 },
                    { key: 'area_aprox',      type: 'number',   label: 'Área aproximada del predio (m²)',          required: false, min: 1 },
                    { key: 'anno_construccion',type:'number',   label: 'Año aproximado de construcción',           required: false, min: 1900, max: 2026 },
                    { key: 'estado_estructural',type:'radio',   label: 'Estado estructural general',               required: true,  options: ['Bueno', 'Regular', 'Malo', 'Riesgo alto'] },
                    { key: 'riesgo',          type: 'checkbox', label: '¿El predio presenta algún riesgo?',        required: false, options: ['Deslizamiento', 'Inundación', 'Falla geológica', 'Ninguno'] },
                    { key: 'foto_fachada',    type: 'file',     label: 'Foto de la fachada del predio',            required: false, accept: 'image/*' },
                    { key: 'notas',           type: 'textarea', label: 'Notas del inspector',                      required: false },
                ]
            },
            {
                key: 'encuesta-seguridad-ciudadana-2026',
                title: 'Encuesta de Percepción de Seguridad Ciudadana',
                description: 'Medición de la percepción de seguridad y convivencia en el sector.',
                metadata: { imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772497488/aquanova/forms/zhnvyyggqosmmabpecwb.jpg', imagen_public_id: 'aquanova/forms/zhnvyyggqosmmabpecwb' },
                schema: [
                    { key: 'edad',              type: 'number',   label: 'Edad del encuestado',                                required: true,  min: 18, max: 100 },
                    { key: 'genero',            type: 'radio',    label: 'Género',                                             required: true,  options: ['Masculino', 'Femenino', 'Otro'] },
                    { key: 'tiempo_residencia', type: 'select',   label: '¿Cuánto tiempo lleva viviendo en el barrio?',        required: true,  options: ['Menos de 1 año', '1-3 años', '3-5 años', '5-10 años', 'Más de 10 años'] },
                    { key: 'percepcion_dia',    type: 'radio',    label: 'Percepción de seguridad en el barrio durante el día', required: true,  options: ['Muy seguro', 'Seguro', 'Inseguro', 'Muy inseguro'] },
                    { key: 'percepcion_noche',  type: 'radio',    label: 'Percepción de seguridad en el barrio de noche',      required: true,  options: ['Muy seguro', 'Seguro', 'Inseguro', 'Muy inseguro'] },
                    { key: 'victima',           type: 'radio',    label: '¿Ha sido víctima de algún delito en el último año?',  required: true,  options: ['Sí', 'No'] },
                    { key: 'tipo_delito',       type: 'checkbox', label: '¿Qué tipo de delito? (si aplica)',                   required: false, options: ['Hurto', 'Lesiones', 'Amenazas', 'Violencia intrafamiliar', 'Vandalismo', 'Otro'] },
                    { key: 'denuncia',          type: 'radio',    label: '¿Denunció el hecho ante las autoridades?',           required: false, options: ['Sí', 'No', 'No aplica'] },
                    { key: 'problemas_barrio',  type: 'checkbox', label: 'Principales problemas de convivencia en el barrio',  required: true,  options: ['Ruido excesivo', 'Expendio de drogas', 'Riñas', 'Graffiti', 'Basuras', 'Ninguno'] },
                    { key: 'confia_policia',    type: 'range',    label: 'Nivel de confianza en la Policía Nacional (1-10)',   required: true,  min: 1, max: 10 },
                    { key: 'conoce_jac',        type: 'radio',    label: '¿Conoce la Junta de Acción Comunal de su barrio?',  required: true,  options: ['Sí', 'No'] },
                    { key: 'participa_jac',     type: 'radio',    label: '¿Participa activamente en la JAC?',                 required: false, options: ['Sí', 'No', 'A veces'] },
                    { key: 'sugerencias',       type: 'textarea', label: 'Sugerencias para mejorar la seguridad del barrio',   required: false },
                ]
            },
            {
                key: 'censo-mascotas-2026',
                title: 'Censo de Tenencia de Mascotas',
                description: 'Registro de animales de compañía y condiciones de tenencia responsable.',
                metadata: { imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772497424/aquanova/forms/vb4fbkav8mlsrftdmyv1.jpg', imagen_public_id: 'aquanova/forms/vb4fbkav8mlsrftdmyv1' },
                schema: [
                    { key: 'tiene_mascotas',   type: 'radio',    label: '¿Tiene mascotas en el hogar?',                     required: true,  options: ['Sí', 'No'] },
                    { key: 'tipo_mascota',     type: 'checkbox', label: 'Tipo de mascota(s)',                               required: false, options: ['Perro', 'Gato', 'Ave', 'Reptil', 'Roedor', 'Pez', 'Otro'] },
                    { key: 'num_perros',       type: 'number',   label: 'Número de perros',                                 required: false, min: 0 },
                    { key: 'num_gatos',        type: 'number',   label: 'Número de gatos',                                  required: false, min: 0 },
                    { key: 'perro_esterilizado',type:'radio',    label: '¿Sus perros están esterilizados?',                 required: false, options: ['Todos', 'Algunos', 'Ninguno', 'No aplica'] },
                    { key: 'gato_esterilizado', type:'radio',    label: '¿Sus gatos están esterilizados?',                  required: false, options: ['Todos', 'Algunos', 'Ninguno', 'No aplica'] },
                    { key: 'vacunacion',       type: 'radio',    label: '¿Sus mascotas tienen vacunas al día?',             required: false, options: ['Sí, todas', 'Algunas', 'No', 'No sabe'] },
                    { key: 'tiene_carnet',     type: 'radio',    label: '¿Sus mascotas tienen carnet de vacunación?',       required: false, options: ['Sí', 'No'] },
                    { key: 'lugar_necesidades',type: 'radio',    label: '¿Dónde hace sus necesidades su mascota?',          required: false, options: ['En casa', 'En la calle recogiendo', 'En la calle sin recoger', 'No aplica'] },
                    { key: 'conoce_normas',    type: 'radio',    label: '¿Conoce la Ley de Tenencia Responsable de Mascotas?', required: true, options: ['Sí', 'No'] },
                    { key: 'problema_vecinos', type: 'radio',    label: '¿Ha tenido problemas con vecinos por su mascota?', required: false, options: ['Sí', 'No'] },
                    { key: 'descripcion',      type: 'text',     label: 'Descripción de la mascota principal (nombre, raza)', required: false, placeholder: 'Ej: Max, Golden Retriever, 3 años' },
                    { key: 'observaciones',    type: 'textarea', label: 'Observaciones del encuestador',                   required: false },
                ]
            },
            {
                key: 'encuesta-movilidad-2026',
                title: 'Encuesta de Movilidad y Transporte',
                description: 'Caracterización de hábitos de movilidad y uso de transporte de los habitantes.',
                metadata: { imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772497338/aquanova/forms/joqklotkky62bxdynemu.jpg', imagen_public_id: 'aquanova/forms/joqklotkky62bxdynemu' },
                schema: [
                    { key: 'trabaja_estudia',   type: 'radio',    label: '¿Trabaja o estudia fuera del barrio?',                  required: true,  options: ['Trabaja', 'Estudia', 'Ambos', 'Ninguno'] },
                    { key: 'destino_principal', type: 'text',     label: 'Destino principal de desplazamiento',                   required: false, placeholder: 'Ej: Centro, Chapinero, Suba...' },
                    { key: 'medio_principal',   type: 'select',   label: 'Medio de transporte principal',                         required: true,  options: ['TransMilenio/SITP', 'Bus tradicional', 'Metro (Línea 1)', 'Automóvil propio', 'Moto propia', 'Taxi/Uber', 'Bicicleta', 'A pie', 'Otro'] },
                    { key: 'tiempo_viaje',      type: 'select',   label: 'Tiempo promedio del viaje al destino',                  required: true,  options: ['Menos de 15 min', '15-30 min', '30-60 min', '1-2 horas', 'Más de 2 horas'] },
                    { key: 'gasto_transporte',  type: 'select',   label: 'Gasto mensual en transporte',                           required: false, options: ['Menos de $50.000', '$50.000-$150.000', '$150.000-$300.000', 'Más de $300.000'] },
                    { key: 'usa_bicicleta',     type: 'radio',    label: '¿Usa bicicleta habitualmente?',                         required: true,  options: ['Sí', 'No'] },
                    { key: 'acceso_ciclovía',   type: 'radio',    label: '¿Tiene acceso a ciclovía desde su barrio?',             required: true,  options: ['Sí, cerca', 'Sí, lejos', 'No'] },
                    { key: 'satisf_transporte', type: 'range',    label: 'Satisfacción con el transporte público del sector (1-10)', required: true, min: 1, max: 10 },
                    { key: 'problemas_movi',    type: 'checkbox', label: 'Principales problemas de movilidad en el barrio',       required: false, options: ['Calles sin pavimentar', 'Falta de andenes', 'Sin ciclovía', 'Congestión', 'Inseguridad en vía', 'Falta de rutas'] },
                    { key: 'tiene_vehiculo',    type: 'radio',    label: '¿El hogar tiene vehículo propio?',                      required: true,  options: ['Sí, carro', 'Sí, moto', 'Ambos', 'No'] },
                    { key: 'parqueadero',       type: 'radio',    label: '¿Cuenta con parqueadero?',                              required: false, options: ['Sí, propio', 'Sí, arrendado', 'No'] },
                    { key: 'sugerencias_movi',  type: 'textarea', label: 'Sugerencias para mejorar la movilidad del sector',      required: false },
                ]
            },
            {
                key: 'registro-establecimientos-2026',
                title: 'Registro de Establecimientos Comerciales',
                description: 'Inventario de comercios y actividades económicas en el barrio.',
                metadata: { imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772497530/aquanova/forms/ikj4p2nnr7x9gpqeuwj6.png', imagen_public_id: 'aquanova/forms/ikj4p2nnr7x9gpqeuwj6' },
                schema: [
                    { key: 'nombre_establec',   type: 'text',     label: 'Nombre o razón social del establecimiento',   required: true,  placeholder: 'Ej: Tienda El Sol' },
                    { key: 'nombre_propietario',type: 'text',     label: 'Nombre del propietario o representante',      required: true },
                    { key: 'documento_prop',    type: 'text',     label: 'Documento de identidad del propietario',      required: true },
                    { key: 'telefono',          type: 'phone',    label: 'Teléfono de contacto',                        required: true,  placeholder: '3001234567' },
                    { key: 'email_negocio',     type: 'email',    label: 'Correo electrónico del negocio',              required: false, placeholder: 'negocio@ejemplo.com' },
                    { key: 'tipo_actividad',    type: 'select',   label: 'Tipo de actividad económica',                 required: true,  options: ['Comercio al por menor', 'Alimentos y bebidas', 'Servicios personales', 'Salud', 'Educación', 'Manufactura', 'Construcción', 'Otro'] },
                    { key: 'tiene_registro',    type: 'radio',    label: '¿Cuenta con registro de Cámara y Comercio?',  required: true,  options: ['Sí', 'No', 'En trámite'] },
                    { key: 'tiene_rut',         type: 'radio',    label: '¿Tiene RUT activo?',                          required: true,  options: ['Sí', 'No'] },
                    { key: 'num_empleados',     type: 'number',   label: 'Número de empleados',                         required: true,  min: 0 },
                    { key: 'horario_apertura',  type: 'text',     label: 'Horario de atención',                         required: false, placeholder: 'Ej: Lun-Vie 8am-6pm' },
                    { key: 'antig_negocio',     type: 'select',   label: 'Antigüedad del negocio en el barrio',         required: false, options: ['Menos de 1 año', '1-3 años', '3-5 años', '5-10 años', 'Más de 10 años'] },
                    { key: 'usa_datafono',      type: 'radio',    label: '¿Acepta pagos electrónicos?',                 required: true,  options: ['Sí, datáfono', 'Sí, transferencias', 'Ambos', 'Solo efectivo'] },
                    { key: 'problemas_negocio', type: 'checkbox', label: 'Principales dificultades del negocio',       required: false, options: ['Inseguridad', 'Falta de clientes', 'Competencia', 'Falta de capital', 'Trámites', 'Otro'] },
                    { key: 'foto_fachada',      type: 'file',     label: 'Foto de la fachada del establecimiento',     required: false, accept: 'image/*' },
                    { key: 'observaciones',     type: 'textarea', label: 'Observaciones del inspector',                required: false },
                ]
            },
            {
                key: 'encuesta-salud-comunitaria-2026',
                title: 'Encuesta de Salud Comunitaria',
                description: 'Diagnóstico del estado de salud y acceso a servicios médicos de la comunidad.',
                metadata: { imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772497388/aquanova/forms/kkduefitqfpgnklxm4i4.jpg', imagen_public_id: 'aquanova/forms/kkduefitqfpgnklxm4i4' },
                schema: [
                    { key: 'regimen_salud',     type: 'radio',    label: 'Régimen de salud al que pertenece',                   required: true,  options: ['Contributivo', 'Subsidiado (Sisbén)', 'Especial', 'No tiene'] },
                    { key: 'eps',               type: 'text',     label: 'Nombre de la EPS o aseguradora',                      required: false, placeholder: 'Ej: Sura, Compensar, Nueva EPS...' },
                    { key: 'discapacidad',      type: 'radio',    label: '¿Algún miembro del hogar tiene discapacidad?',         required: true,  options: ['Sí', 'No'] },
                    { key: 'tipo_discapacidad', type: 'checkbox', label: 'Tipo de discapacidad (si aplica)',                    required: false, options: ['Visual', 'Auditiva', 'Motriz', 'Cognitiva', 'Psicosocial', 'Múltiple'] },
                    { key: 'enf_cronicas',      type: 'checkbox', label: 'Enfermedades crónicas presentes en el hogar',        required: false, options: ['Hipertensión', 'Diabetes', 'Asma', 'Obesidad', 'Cáncer', 'Ninguna'] },
                    { key: 'acceso_centro_salud',type:'radio',    label: '¿Tiene acceso a un centro de salud cercano?',         required: true,  options: ['Sí, a pie', 'Sí, en transporte', 'No'] },
                    { key: 'dist_centro_salud', type: 'select',   label: 'Distancia aproximada al centro de salud más cercano', required: false, options: ['Menos de 500m', '500m-1km', '1km-3km', 'Más de 3km'] },
                    { key: 'ultima_consulta',   type: 'select',   label: '¿Cuándo fue la última consulta médica?',              required: false, options: ['Hace menos de 1 mes', '1-6 meses', '6-12 meses', 'Hace más de 1 año', 'Nunca'] },
                    { key: 'vacunacion_inf',    type: 'radio',    label: '¿Los niños del hogar tienen esquema de vacunación?',  required: false, options: ['Completo', 'Incompleto', 'No aplica'] },
                    { key: 'agua_segura',       type: 'radio',    label: '¿Consume agua de acueducto sin hervir?',              required: true,  options: ['Sí', 'No, la hiervo', 'No, compro botellón'] },
                    { key: 'manejo_residuos',   type: 'select',   label: '¿Cómo maneja los residuos del hogar?',                required: true,  options: ['Los clasifica y recicla', 'Solo los bota en la basura', 'Los quema', 'Los entierra', 'Los arroja en fuente de agua'] },
                    { key: 'satisfaccion_salud',type: 'range',    label: 'Satisfacción con el sistema de salud (1-10)',         required: true,  min: 1, max: 10 },
                    { key: 'observaciones',     type: 'textarea', label: 'Observaciones adicionales de salud',                  required: false },
                ]
            },
            {
                key: 'inventario-espacio-publico-2026',
                title: 'Inventario de Parques y Espacio Público',
                description: 'Levantamiento del estado y uso de parques, zonas verdes y espacio público del barrio.',
                metadata: { imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772497250/aquanova/forms/kitrvcanb50wdvvsgyne.jpg', imagen_public_id: 'aquanova/forms/kitrvcanb50wdvvsgyne' },
                schema: [
                    { key: 'nombre_parque',      type: 'text',     label: 'Nombre o identificación del parque/espacio',       required: true,  placeholder: 'Ej: Parque Central, Cancha La Esperanza' },
                    { key: 'tipo_espacio',        type: 'radio',    label: 'Tipo de espacio público',                          required: true,  options: ['Parque zonal', 'Parque de bolsillo', 'Cancha deportiva', 'Zona verde', 'Plazoleta', 'Separador vial'] },
                    { key: 'area_aprox',          type: 'number',   label: 'Área aproximada (m²)',                             required: false, min: 1 },
                    { key: 'estado_general',      type: 'radio',    label: 'Estado general del espacio',                       required: true,  options: ['Bueno', 'Regular', 'Malo', 'Abandonado'] },
                    { key: 'equipamiento',        type: 'checkbox', label: 'Equipamiento presente',                            required: false, options: ['Juegos infantiles', 'Bancas', 'Iluminación', 'Cancha múltiple', 'Zona de ejercicio', 'Baños públicos', 'Ninguno'] },
                    { key: 'iluminacion',         type: 'radio',    label: 'Estado de la iluminación nocturna',                required: true,  options: ['Buena', 'Deficiente', 'No tiene'] },
                    { key: 'accesibilidad',       type: 'radio',    label: '¿Tiene accesibilidad para personas con movilidad reducida?', required: true, options: ['Sí', 'Parcialmente', 'No'] },
                    { key: 'usos_predominantes',  type: 'checkbox', label: 'Usos predominantes del espacio',                  required: false, options: ['Recreación infantil', 'Deporte', 'Descanso', 'Reuniones comunales', 'Actividades ilícitas', 'Comercio informal'] },
                    { key: 'mantenimiento',       type: 'select',   label: 'Frecuencia de mantenimiento visible',              required: true,  options: ['Semanal', 'Mensual', 'Esporádico', 'Nunca'] },
                    { key: 'responsable_mant',    type: 'radio',    label: '¿Quién realiza el mantenimiento?',                 required: false, options: ['IDRD/Alcaldía', 'JAC', 'Vecinos voluntarios', 'Empresa privada', 'Nadie / No se sabe'] },
                    { key: 'problemas',           type: 'checkbox', label: 'Principales problemas del espacio',               required: false, options: ['Basuras', 'Grafiti / Vandalismo', 'Inseguridad', 'Encharcamiento', 'Falta de vegetación', 'Ninguno'] },
                    { key: 'foto_espacio',        type: 'file',     label: 'Fotografía del espacio público',                  required: false, accept: 'image/*' },
                    { key: 'sugerencias',         type: 'textarea', label: 'Sugerencias de mejora',                           required: false },
                ]
            },
            {
                key: 'encuesta-conectividad-digital-2026',
                title: 'Encuesta de Conectividad y Acceso Digital',
                description: 'Medición del acceso a tecnologías digitales y brecha tecnológica en el hogar.',
                metadata: { imagen: 'https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772497570/aquanova/forms/ewvzpr0vu6atylclvxbo.jpg', imagen_public_id: 'aquanova/forms/ewvzpr0vu6atylclvxbo' },
                schema: [
                    { key: 'tiene_computador',   type: 'radio',    label: '¿El hogar cuenta con computador o portátil?',          required: true,  options: ['Sí, propio', 'Sí, compartido', 'No'] },
                    { key: 'num_smartphones',    type: 'number',   label: 'Número de smartphones en el hogar',                    required: true,  min: 0 },
                    { key: 'tiene_internet',     type: 'radio',    label: '¿Cuenta con Internet en casa?',                        required: true,  options: ['Sí, banda ancha (fibra/cable)', 'Sí, internet móvil (datos)', 'No'] },
                    { key: 'operador_internet',  type: 'select',   label: 'Operador de Internet',                                 required: false, options: ['Claro', 'Movistar', 'ETB', 'Tigo', 'WOM', 'Otro', 'No tiene'] },
                    { key: 'velocidad_percibida',type: 'radio',    label: 'Velocidad percibida del Internet',                     required: false, options: ['Rápida', 'Aceptable', 'Lenta', 'Muy lenta', 'No aplica'] },
                    { key: 'gasto_internet',     type: 'select',   label: 'Gasto mensual en Internet/datos',                      required: false, options: ['Menos de $30.000', '$30.000-$60.000', '$60.000-$100.000', 'Más de $100.000', 'No paga (wifi comunitario)'] },
                    { key: 'usos_internet',      type: 'checkbox', label: 'Principales usos del Internet en el hogar',           required: false, options: ['Trabajo remoto', 'Estudio/Tareas', 'Redes sociales', 'Entretenimiento', 'Trámites en línea', 'Comercio electrónico'] },
                    { key: 'adultos_usan_celular',type:'radio',    label: '¿Los adultos mayores del hogar usan smartphone?',      required: false, options: ['Sí, con ayuda', 'Sí, solos', 'No', 'No aplica'] },
                    { key: 'ninos_educacion_dig', type:'radio',    label: '¿Los niños recibieron clases virtuales en algún momento?', required: false, options: ['Sí', 'No', 'No aplica'] },
                    { key: 'conoce_tramites_dig', type:'radio',    label: '¿Conoce los servicios digitales de la Alcaldía de Bogotá?', required: true, options: ['Sí, los usa', 'Sí, pero no los usa', 'No'] },
                    { key: 'brecha_digital',     type: 'checkbox', label: '¿Qué dificultades tiene con la tecnología?',          required: false, options: ['No sabe usarla', 'No tiene dispositivo', 'No tiene Internet', 'Alto costo', 'Ninguna'] },
                    { key: 'satisfaccion_digital',type:'range',    label: 'Satisfacción con el acceso a tecnología del hogar (1-10)', required: true, min: 1, max: 10 },
                    { key: 'sugerencias',        type: 'textarea', label: 'Sugerencias para mejorar el acceso digital en el barrio', required: false },
                ]
            },
            censoMasivoCatastroFormSeed,
        ];

        // Insertar los formularios de forma idempotente
        let formsInserted = 0;
        let firstFormId = null;
        for (const formDef of FORMS_SEED) {
            const [existing] = await connection.query(
                'SELECT id FROM forms WHERE `key` = ?', [formDef.key]
            );
            if (existing.length > 0) {
                if (!firstFormId) firstFormId = existing[0].id;
                console.log(`⚠️  Formulario "${formDef.key}" ya existe.`);
                continue;
            }
            const fId = uuidv4();
            if (!firstFormId) firstFormId = fId;

            await connection.query(
                'INSERT INTO forms (id, `key`, title, description, created_by, is_active, metadata, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, NOW())',
                [fId, formDef.key, formDef.title, formDef.description, adminId, formDef.metadata ? JSON.stringify(formDef.metadata) : null]
            );
            const vId = uuidv4();
            await connection.query(
                'INSERT INTO form_versions (id, form_id, version, `schema`, created_by, status, published_at, created_at) VALUES (?, ?, 1, ?, ?, "published", NOW(), NOW())',
                [vId, fId, JSON.stringify(formDef.schema), adminId]
            );
            // Publicar en el barrio SMC-001
            await connection.query(
                'INSERT INTO form_publications (id, form_version_id, neighborhood_id, start_at, is_active) VALUES (?, ?, ?, NOW(), 1)',
                [uuidv4(), vId, neighborhoodId]
            );
            formsInserted++;
        }
        console.log(`✅ Formularios: ${formsInserted} insertados, ${FORMS_SEED.length - formsInserted} ya existían.`);
        const formId = firstFormId;

        // ---------------------------------------------------------
        // 8. MIGRACIÓN: Crear giveaway_configs para formularios sin config
        // ---------------------------------------------------------
        console.log('\n🎰 Sincronizando configuraciones de sorteo...');
        const [formsWithoutConfig] = await connection.query(`
            SELECT f.id FROM forms f
            LEFT JOIN giveaway_configs gc ON gc.form_id = f.id
            WHERE gc.id IS NULL
        `);

        if (formsWithoutConfig.length > 0) {
            for (const form of formsWithoutConfig) {
                await connection.query(
                    'INSERT INTO giveaway_configs (id, form_id, points_per_referral, is_active) VALUES (?, ?, 10, TRUE)',
                    [uuidv4(), form.id]
                );
            }
            console.log(`✅ giveaway_configs creados para ${formsWithoutConfig.length} formulario(s).`);
        } else {
            console.log('✅ Todos los formularios ya tienen configuración de sorteo.');
        }

        // ---------------------------------------------------------
        // 9. SEED GEMELO DIGITAL (MAPA SVG - BLOCKS & LOTS)
        // ---------------------------------------------------------
        console.log('\n🗺️  Procesando Gemelo Digital (Mapa)...');

        // Cargar mapa preferentemente desde el SVG de Las Mercedes
        const fs = require('fs');
        const path = require('path');
        const lasMercedesSvgPath = path.resolve(__dirname, './src/legacy/Mapa Barrio Las Mercedes.svg');
        const mapDataPath = path.resolve(__dirname, './map-data-seed.json');

        let mapData = null;

        if (fs.existsSync(lasMercedesSvgPath)) {
            try {
                mapData = parseInteractiveLotsFromSvgFile(lasMercedesSvgPath);
                console.log(`✅ SVG de Las Mercedes procesado: ${mapData.lots.length} lotes.`);
            } catch (svgError) {
                console.log(`⚠️  Error procesando SVG de Las Mercedes: ${svgError.message}`);
            }
        }

        if (!mapData && fs.existsSync(mapDataPath)) {
            mapData = JSON.parse(fs.readFileSync(mapDataPath, 'utf-8'));
            console.log('⚠️  Usando fallback map-data-seed.json para poblar el gemelo digital.');
        }

        if (mapData && Array.isArray(mapData.lots) && mapData.lots.length > 0) {
            const { viewBox, lots } = mapData;

            // Crear el barrio hijo con el mapa (SMCN-001)
            const mapNeighborhoodCode = 'SMCN-001';
            const mapNeighborhoodName = 'Barrio Las Mercedes';
            const mapMetadata = JSON.stringify({ viewBox });

            const [existingMapNeighborhood] = await connection.query(
                'SELECT id FROM neighborhoods WHERE code = ?',
                [mapNeighborhoodCode]
            );

            let mapNeighborhoodId;
            if (existingMapNeighborhood.length > 0) {
                mapNeighborhoodId = existingMapNeighborhood[0].id;
                // Actualizar nombre, metadata y jerarquía para mantener el mapa sincronizado
                await connection.query(
                    'UPDATE neighborhoods SET name = ?, metadata = ?, parent_id = ? WHERE id = ?',
                    [mapNeighborhoodName, mapMetadata, neighborhoodId, mapNeighborhoodId]
                );
                console.log(`⚠️  Barrio mapa ${mapNeighborhoodCode} ya existe. Metadata actualizada.`);
            } else {
                mapNeighborhoodId = uuidv4();
                await connection.query(
                    'INSERT INTO neighborhoods (id, name, code, parent_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
                    [mapNeighborhoodId, mapNeighborhoodName, mapNeighborhoodCode, neighborhoodId, mapMetadata]
                );
                console.log(`✅ Barrio mapa creado: ${mapNeighborhoodName} (código: ${mapNeighborhoodCode})`);
            }

            // Crear el block M-01
            const blockCode = 'M-01';
            const [existingBlock] = await connection.query(
                'SELECT id FROM blocks WHERE neighborhood_id = ? AND code = ?',
                [mapNeighborhoodId, blockCode]
            );

            let blockId;
            if (existingBlock.length > 0) {
                blockId = existingBlock[0].id;
                console.log(`⚠️  Block ${blockCode} ya existe.`);
            } else {
                blockId = uuidv4();
                await connection.query(
                    'INSERT INTO blocks (id, code, neighborhood_id, geom_path, created_at) VALUES (?, ?, ?, ?, NOW())',
                    [blockId, blockCode, mapNeighborhoodId, 'M0,0 Z']
                );
                console.log(`✅ Block creado: ${blockCode}`);
            }

            // Limpiar lotes existentes solo si se solicita o si está vacío
            const [currentLots] = await connection.query('SELECT COUNT(*) as count FROM lots WHERE block_id = ?', [blockId]);
            const shouldSeedLots = process.env.FORCE_SEED === 'true' || currentLots[0].count === 0;

            if (!shouldSeedLots) {
                console.log(`ℹ️  El bloque ${blockCode} ya tiene ${currentLots[0].count} predios. Saltando inserción inicial (Usa FORCE_SEED=true para resetear).`);
            } else {
                console.log(`🧹 Limpiando y recargando predios para el bloque ${blockCode}...`);
                await connection.query('DELETE FROM lots WHERE block_id = ?', [blockId]);

                // Insertar lotes en lotes de 50 para mejor rendimiento
                const batchSize = 50;
                let lotsInserted = 0;

                for (let i = 0; i < lots.length; i += batchSize) {
                    const batch = lots.slice(i, i + batchSize);
                    const values = batch.map(lot => [
                        uuidv4(),
                        blockId,
                        lot.number,
                        lot.status || 'sin_informacion',
                        null, // water_meter_code
                        Number.isFinite(Number(lot.area_m2)) ? Number(lot.area_m2) : 0,
                        lot.svg_path,
                        JSON.stringify(lot.centroid || null)
                    ]);

                    const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
                    const flatValues = values.flat();

                    await connection.query(
                        `INSERT INTO lots (id, block_id, number, status, water_meter_code, area_m2, svg_path, centroid) VALUES ${placeholders}`,
                        flatValues
                    );
                    lotsInserted += batch.length;
                }
                console.log(`✅ Gemelo Digital: ${lotsInserted} predios insertados en el mapa.`);
            }
        } else {
            console.log('⚠️  No se encontró información de mapa válida (ni SVG de Las Mercedes ni map-data-seed.json).');
        }

        console.log('\n=============================================');
        console.log('🎉  DATOS PARA PRUEBAS (COPIA ESTOS IDs)');
        console.log('=============================================');
        console.log(`🏙️  Barrio ID:      ${neighborhoodId}`);
        console.log(`📝  Formulario ID:  ${formId}`);
        console.log(`👤  Usuario (Doc):  ${adminData.document_number}`);
        console.log(`🔑  Contraseña:     ${adminData.password}`);
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
