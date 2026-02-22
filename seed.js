// seed.js
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

// HEMOS ACTUALIZADO EL ESQUEMA PARA INCLUIR LAS TABLAS DE GEMELO DIGITAL
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
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE INDEX \`unique_lot_block\` (\`block_id\`, \`number\`),
  CONSTRAINT \`fk_lot_block\`
    FOREIGN KEY (\`block_id\`) REFERENCES \`blocks\` (\`id\`) ON DELETE CASCADE
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
        console.log('✅ Esquema de base de datos sincronizado con Gemelo Digital.');

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
                localidad: { name: 'Usaquén', code: 'LOC-01' },
                barrios: [
                    { name: 'Usaquén',       code: 'BAR-0101' },
                    { name: 'Santa Bárbara', code: 'BAR-0102' },
                    { name: 'Country Club',  code: 'BAR-0103' },
                    { name: 'La Calleja',    code: 'BAR-0104' },
                    { name: 'Cedritos',      code: 'BAR-0105' },
                    { name: 'San Patricio',  code: 'BAR-0106' },
                    { name: 'Toberín',       code: 'BAR-0107' },
                ]
            },
            {
                localidad: { name: 'Chapinero', code: 'LOC-02' },
                barrios: [
                    { name: 'El Lago',          code: 'BAR-0201' },
                    { name: 'Chapinero Central', code: 'BAR-0202' },
                    { name: 'Rosales',           code: 'BAR-0203' },
                    { name: 'El Retiro',         code: 'BAR-0204' },
                    { name: 'Quinta Camacho',    code: 'BAR-0205' },
                    { name: 'Belén',             code: 'BAR-0206' },
                ]
            },
            {
                localidad: { name: 'Santa Fe', code: 'LOC-03' },
                barrios: [
                    { name: 'Las Aguas',    code: 'BAR-0301' },
                    { name: 'La Concordia', code: 'BAR-0302' },
                    { name: 'Egipto',       code: 'BAR-0303' },
                    { name: 'Lourdes',      code: 'BAR-0304' },
                    { name: 'Veracruz',     code: 'BAR-0305' },
                ]
            },
            {
                localidad: { name: 'San Cristóbal', code: 'LOC-04' },
                barrios: [
                    { name: '20 de Julio',   code: 'BAR-0401' },
                    { name: 'La Victoria',   code: 'BAR-0402' },
                    { name: 'San Blas',      code: 'BAR-0403' },
                    { name: 'Sosiego',       code: 'BAR-0404' },
                    { name: 'Montebello',    code: 'BAR-0405' },
                    { name: 'El Triángulo',  code: 'BAR-0406' },
                ]
            },
            {
                localidad: { name: 'Usme', code: 'LOC-05' },
                barrios: [
                    { name: 'Usme Centro',    code: 'BAR-0501' },
                    { name: 'Gran Yomasa',    code: 'BAR-0502' },
                    { name: 'Alfonso López',  code: 'BAR-0503' },
                    { name: 'La Flora',       code: 'BAR-0504' },
                    { name: 'Ciudad de Usme', code: 'BAR-0505' },
                    { name: 'Comuneros',      code: 'BAR-0506' },
                ]
            },
            {
                localidad: { name: 'Tunjuelito', code: 'LOC-06' },
                barrios: [
                    { name: 'Tunjuelito',      code: 'BAR-0601' },
                    { name: 'Abraham Lincoln', code: 'BAR-0602' },
                    { name: 'Venecia',         code: 'BAR-0603' },
                    { name: 'San Benito',      code: 'BAR-0604' },
                    { name: 'El Tunal',        code: 'BAR-0605' },
                ]
            },
            {
                localidad: { name: 'Bosa', code: 'LOC-07' },
                barrios: [
                    { name: 'Bosa Centro',    code: 'BAR-0701' },
                    { name: 'El Porvenir',    code: 'BAR-0702' },
                    { name: 'Apogeo',         code: 'BAR-0703' },
                    { name: 'San Bernardino', code: 'BAR-0704' },
                    { name: 'El Recreo',      code: 'BAR-0705' },
                    { name: 'San José',       code: 'BAR-0706' },
                ]
            },
            {
                localidad: { name: 'Kennedy', code: 'LOC-08' },
                barrios: [
                    { name: 'Kennedy Central', code: 'BAR-0801' },
                    { name: 'Américas',        code: 'BAR-0802' },
                    { name: 'Castilla',        code: 'BAR-0803' },
                    { name: 'Timiza',          code: 'BAR-0804' },
                    { name: 'Britalia',        code: 'BAR-0805' },
                    { name: 'Patio Bonito',    code: 'BAR-0806' },
                    { name: 'Tintal',          code: 'BAR-0807' },
                ]
            },
            {
                localidad: { name: 'Fontibón', code: 'LOC-09' },
                barrios: [
                    { name: 'Fontibón Centro',  code: 'BAR-0901' },
                    { name: 'Modelia',          code: 'BAR-0902' },
                    { name: 'Capellanía',       code: 'BAR-0903' },
                    { name: 'Granjas de Techo', code: 'BAR-0904' },
                    { name: 'Zona Franca',      code: 'BAR-0905' },
                    { name: 'Ciudad Salitre',   code: 'BAR-0906' },
                ]
            },
            {
                localidad: { name: 'Engativá', code: 'LOC-10' },
                barrios: [
                    { name: 'Engativá Centro', code: 'BAR-1001' },
                    { name: 'Boyacá Real',     code: 'BAR-1002' },
                    { name: 'La Española',     code: 'BAR-1003' },
                    { name: 'Minuto de Dios',  code: 'BAR-1004' },
                    { name: 'Santa Cecilia',   code: 'BAR-1005' },
                    { name: 'Álamos',          code: 'BAR-1006' },
                ]
            },
            {
                localidad: { name: 'Suba', code: 'LOC-11' },
                barrios: [
                    { name: 'Suba Centro',  code: 'BAR-1101' },
                    { name: 'Niza',         code: 'BAR-1102' },
                    { name: 'La Floresta',  code: 'BAR-1103' },
                    { name: 'El Rincón',    code: 'BAR-1104' },
                    { name: 'Tibabuyes',    code: 'BAR-1105' },
                    { name: 'Lisboa',       code: 'BAR-1106' },
                    { name: 'Casablanca',   code: 'BAR-1107' },
                ]
            },
            {
                localidad: { name: 'Barrios Unidos', code: 'LOC-12' },
                barrios: [
                    { name: 'Doce de Octubre', code: 'BAR-1201' },
                    { name: 'Los Andes',       code: 'BAR-1202' },
                    { name: 'Alcázares',       code: 'BAR-1203' },
                    { name: 'Polo Club',       code: 'BAR-1204' },
                    { name: 'Siete de Agosto', code: 'BAR-1205' },
                ]
            },
            {
                localidad: { name: 'Teusaquillo', code: 'LOC-13' },
                barrios: [
                    { name: 'Teusaquillo',          code: 'BAR-1301' },
                    { name: 'Palermo',              code: 'BAR-1302' },
                    { name: 'Galerías',             code: 'BAR-1303' },
                    { name: 'La Soledad',           code: 'BAR-1304' },
                    { name: 'Nicolás de Federmann', code: 'BAR-1305' },
                    { name: 'Armenia',              code: 'BAR-1306' },
                ]
            },
            {
                localidad: { name: 'Los Mártires', code: 'LOC-14' },
                barrios: [
                    { name: 'Santa Isabel',  code: 'BAR-1401' },
                    { name: 'La Favorita',   code: 'BAR-1402' },
                    { name: 'El Listón',     code: 'BAR-1403' },
                    { name: 'Ricaurte',      code: 'BAR-1404' },
                    { name: 'Eduardo Santos', code: 'BAR-1405' },
                ]
            },
            {
                localidad: { name: 'Antonio Nariño', code: 'LOC-15' },
                barrios: [
                    { name: 'Antonio Nariño',   code: 'BAR-1501' },
                    { name: 'Restrepo',         code: 'BAR-1502' },
                    { name: 'Ciudad Jardín Sur', code: 'BAR-1503' },
                    { name: 'Muzú',             code: 'BAR-1504' },
                    { name: 'La Fragua',        code: 'BAR-1505' },
                ]
            },
            {
                localidad: { name: 'Puente Aranda', code: 'LOC-16' },
                barrios: [
                    { name: 'Puente Aranda',  code: 'BAR-1601' },
                    { name: 'Cundinamarca',   code: 'BAR-1602' },
                    { name: 'Ciudad Montes',  code: 'BAR-1603' },
                    { name: 'Galán',          code: 'BAR-1604' },
                    { name: 'Pradera',        code: 'BAR-1605' },
                    { name: 'Salazar Gómez',  code: 'BAR-1606' },
                ]
            },
            {
                localidad: { name: 'La Candelaria', code: 'LOC-17' },
                barrios: [
                    { name: 'La Catedral',          code: 'BAR-1701' },
                    { name: 'La Concordia Sur',     code: 'BAR-1702' },
                    { name: 'Centro Administrativo', code: 'BAR-1703' },
                    { name: 'Las Aguas Sur',        code: 'BAR-1704' },
                ]
            },
            {
                localidad: { name: 'Rafael Uribe Uribe', code: 'LOC-18' },
                barrios: [
                    { name: 'Marco Fidel Suárez', code: 'BAR-1801' },
                    { name: 'Quiroga',            code: 'BAR-1802' },
                    { name: 'San José Sur',       code: 'BAR-1803' },
                    { name: 'Claret',             code: 'BAR-1804' },
                    { name: 'Lomas',              code: 'BAR-1805' },
                    { name: 'Diana Turbay',       code: 'BAR-1806' },
                ]
            },
            {
                localidad: { name: 'Ciudad Bolívar', code: 'LOC-19' },
                barrios: [
                    { name: 'El Tesoro',      code: 'BAR-1901' },
                    { name: 'Lucero',         code: 'BAR-1902' },
                    { name: 'El Paraíso',     code: 'BAR-1903' },
                    { name: 'San Francisco',  code: 'BAR-1904' },
                    { name: 'Ismael Perdomo', code: 'BAR-1905' },
                    { name: 'Jerusalem',      code: 'BAR-1906' },
                    { name: 'Arborizadora',   code: 'BAR-1907' },
                ]
            },
            {
                localidad: { name: 'Sumapaz', code: 'LOC-20' },
                barrios: [
                    { name: 'San Juan',  code: 'BAR-2001' },
                    { name: 'Nazareth', code: 'BAR-2002' },
                    { name: 'Betania',  code: 'BAR-2003' },
                ]
            },
        ];

        // Imágenes genéricas de barrios bogotanos (Unsplash — rotación por índice)
// Ampliado a 25 imágenes representativas de entornos urbanos, calles y arquitectura de ladrillo.
const BARRIO_IMAGES = [
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1564769662533-4f00a87b4056?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1583001931096-959e9a1a6223?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1599946347371-68eb71b16afc?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1573843981267-be1999ff37cd?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1613979741226-5c4b6d7c8e6a?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1518098268026-4e89f1a2cd8e?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1523950269098-900508a8e104?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1543857778-c4a1a3e0b2eb?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1555658636-6e4a36210b15?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1601002821102-efcf4a7b520b?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1580646152018-9c59f0f98e72?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1596401057633-54a8fe8ef647?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1517009572053-93fd56623696?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1449844908441-8829872d2607?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1506505051061-f09c1fa41893?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1544644181-1484b3fdfc62?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1511215162718-ac4ce5686d14?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1460317442991-0ec209397118?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1584467735815-f778f274e296?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1582283084366-281ce1c518ad?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1621511674400-0585671151ba?auto=format&fit=crop&w=600&q=80'
];

// Descripciones genéricas para barrios bogotanos (rotación por índice)
// Ampliado a 30 descripciones con contexto muy local.
const BARRIO_DESCRIPCIONES = [
    'Barrio residencial con amplia oferta de servicios comunitarios, parques y vías pavimentadas. Cuenta con acceso a transporte público y comercio local.',
    'Sector urbano consolidado con presencia de vivienda de interés social y equipamientos comunitarios como colegios, centros de salud y canchas deportivas.',
    'Zona residencial de estrato medio con calles arboladas, plazoletas y una activa vida comercial en su eje principal.',
    'Barrio tradicional bogotano con historia y cultura propias. Reconocido por sus festividades locales y la organización de su Junta de Acción Comunal.',
    'Sector en proceso de consolidación urbana con proyectos de mejoramiento de vivienda e infraestructura vial en desarrollo.',
    'Barrio popular con fuerte tejido comunitario. Cuenta con mercado local, iglesia, colegio distrital y acceso a la red de ciclovías.',
    'Zona urbana con alta densidad residencial, comercio de proximidad y conectividad al sistema de transporte masivo TransMilenio.',
    'Barrio con características residenciales y presencia de microempresas familiares. Integrado a la malla vial local con acceso a rutas de buses zonales y paraderos del SITP.',
    'Sector urbano con patrimonio arquitectónico de mediados del siglo XX. Reconocido por su paisaje de casas de dos pisos y antejardines.',
    'Barrio con diversidad socioeconómica, infraestructura educativa y deportiva, y participación activa en programas distritales de agua y saneamiento.',
    'Zona de uso mixto residencial-comercial con presencia de talleres, tiendas de barrio y servicios personales. Integrado a la red de acueducto del Distrito.',
    'Barrio consolidado con cobertura total de servicios públicos domiciliarios. Activo programa de recolección de residuos sólidos y gestión del espacio público.',
    'Sector ubicado al pie de los Cerros Orientales, ofreciendo una vista panorámica de la sabana y proximidad a senderos ecológicos.',
    'Zona dinámica caracterizada por sus fachadas de ladrillo a la vista, típicas de la arquitectura bogotana, con parques de bolsillo ideales para mascotas.',
    'Barrio de alta actividad comercial, conocido por albergar una de las plazas de mercado más tradicionales, donde se consiguen frutas y verduras frescas de la región.',
    'Área residencial tranquila que destaca por sus panaderías de esquina, donde los vecinos se reúnen cada mañana para el tradicional tinto y pandebono.',
    'Sector con una fuerte vocación universitaria; sus calles están llenas de estudiantes, cafés, papelerías y espacios de coworking adaptados en casas antiguas.',
    'Barrio periférico en constante crecimiento, conectado al resto de la ciudad mediante rutas alimentadoras y con una fuerte identidad cultural de sus habitantes.',
    'Zona de desarrollo reciente con modernos conjuntos cerrados, zonas verdes comunales y cercanía a centros comerciales de gran formato.',
    'Sector tradicional que aún conserva sus calles adoquinadas y casas de conservación histórica, siendo un punto de interés tanto para residentes como para turistas.',
    'Barrio obrero con gran actividad durante el día. Destaca por sus polideportivos, donde cada fin de semana se realizan torneos de microfútbol.',
    'Zona residencial rodeada de importantes humedales de la ciudad, ofreciendo a sus habitantes espacios para la observación de aves y la conexión con la naturaleza.',
    'Barrio de vocación industrial y comercial, con amplias bodegas conviviendo con sectores residenciales de larga data y excelente acceso a las principales avenidas.',
    'Sector de estrato alto con amplios bulevares, restaurantes de gastronomía internacional y estricta seguridad privada en sus inmediaciones.',
    'Barrio emblemático por sus murales y arte urbano, que refleja las expresiones de los jóvenes de la localidad en cada una de sus cuadras.',
    'Zona residencial que se beneficia enormemente de la red de ciclorrutas de Bogotá, fomentando la movilidad sostenible entre sus habitantes.',
    'Barrio con una vida nocturna vibrante, zonas de restaurantes y bares que atraen a un público joven y diverso durante los fines de semana.',
    'Sector conocido por sus amplias zonas verdes y parques metropolitanos cercanos, ideales para el tradicional "picnic" bogotano de los domingos.',
    'Barrio que ha sido objeto de renovación urbana, donde antiguas fábricas se han convertido en modernos lofts y centros culturales.',
    'Comunidad unida que destaca por sus bazares comunitarios, ferias de emprendimiento local y un fuerte sentido de pertenencia barrial.'
];

        let locInserted = 0;
        let barInserted = 0;
        let barMetaIndex = 0;

        for (const entry of BOGOTA_DATA) {
            const { localidad, barrios } = entry;

            // Verificar si la localidad ya existe
            const [existingLoc] = await connection.query(
                'SELECT id FROM neighborhoods WHERE code = ?',
                [localidad.code]
            );

            let localidadId;
            if (existingLoc.length > 0) {
                localidadId = existingLoc[0].id;
            } else {
                localidadId = uuidv4();
                await connection.query(
                    'INSERT INTO neighborhoods (id, name, code, created_at) VALUES (?, ?, ?, NOW())',
                    [localidadId, localidad.name, localidad.code]
                );
                locInserted++;
            }

            // Insertar barrios de esta localidad
            for (const barrio of barrios) {
                const imagen      = BARRIO_IMAGES[barMetaIndex % BARRIO_IMAGES.length];
                const descripcion = BARRIO_DESCRIPCIONES[barMetaIndex % BARRIO_DESCRIPCIONES.length];
                barMetaIndex++;

                const barrioMetadata = JSON.stringify({ imagen, descripcion });

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
                    // Actualizar siempre la metadata con imagen y descripción
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
        // 7. SEED FORMULARIO DE PRUEBA
        // ---------------------------------------------------------
        console.log('\n📝 Procesando Formulario de Prueba...');
        let formId;
        const formKey = 'censo-demo-v1';
        
        const [existingForms] = await connection.query(
            'SELECT id FROM forms WHERE `key` = ?', 
            [formKey]
        );

        if (existingForms.length > 0) {
            formId = existingForms[0].id;
            console.log(`⚠️  El formulario ${formKey} ya existe. ID: ${formId}`);
        } else {
            formId = uuidv4();
            const [admins] = await connection.query('SELECT id FROM users WHERE email = ?', [adminData.email]);
            const adminId = admins[0].id;

            const queryForm = `
                INSERT INTO forms (id, \`key\`, title, description, created_by, created_at) 
                VALUES (?, ?, 'Censo Demográfico 2025', 'Formulario de prueba generado por seed', ?, NOW())
            `;
            await connection.query(queryForm, [formId, formKey, adminId]);

            const versionId = uuidv4();
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
