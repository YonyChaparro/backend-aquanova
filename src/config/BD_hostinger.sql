-- ==========================================================
-- SISTEMA DE GESTIÓN DE FORMULARIOS DINÁMICOS - AQUANOVA
-- Motor: MySQL 8.0+ | Enfoque: JSON Híbrido + Relacional
-- ----------------------------------------------------------
-- ⚠️  VERSIÓN PARA HOSTINGER / phpMyAdmin
-- Antes de importar este archivo:
--   1. Crea la BD desde el panel de Hostinger → Databases
--   2. Selecciona esa BD en phpMyAdmin (menú izquierdo)
--   3. Importa este archivo (sin CREATE DATABASE ni USE)
-- ==========================================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET FOREIGN_KEY_CHECKS = 0;

-- ==========================================================
-- SECCIÓN 1: IDENTIDAD Y GEOGRAFÍA (CORE)
-- ==========================================================

-- TABLA: USERS
CREATE TABLE IF NOT EXISTS `users` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `document_number` VARCHAR(50) NULL,
  `email` VARCHAR(255) NULL,
  `phone` VARCHAR(50) NULL,
  `password_hash` VARCHAR(255) NULL,
  `is_active` BOOLEAN DEFAULT TRUE,
  `token_version` INT NOT NULL DEFAULT 1,
  `metadata` JSON NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `email_UNIQUE` (`email` ASC),
  UNIQUE INDEX `document_UNIQUE` (`document_number` ASC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- TABLA: ROLES
CREATE TABLE IF NOT EXISTS `roles` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(50) NOT NULL,
  `description` TEXT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `name_UNIQUE` (`name` ASC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- TABLA: NEIGHBORHOODS (BARRIOS)
CREATE TABLE IF NOT EXISTS `neighborhoods` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `code` VARCHAR(50) NOT NULL,
  `parent_id` CHAR(36) NULL,
  `is_active` BOOLEAN DEFAULT TRUE,
  `geom` GEOMETRY NULL,
  `metadata` JSON NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `code_UNIQUE` (`code` ASC),
  CONSTRAINT `fk_neighborhood_parent`
    FOREIGN KEY (`parent_id`)
    REFERENCES `neighborhoods` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- TABLA: USER_ROLES
CREATE TABLE IF NOT EXISTS `user_roles` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` CHAR(36) NOT NULL,
  `role_id` INT NOT NULL,
  `neighborhood_id` CHAR(36) NULL,
  `assigned_by` CHAR(36) NULL,
  `assigned_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_ur_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ur_role`
    FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_ur_neighborhood`
    FOREIGN KEY (`neighborhood_id`) REFERENCES `neighborhoods` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ur_assigner`
    FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================================
-- SECCIÓN 2: MOTOR DE FORMULARIOS (DEFINICIÓN)
-- ==========================================================

-- TABLA: FORMS
CREATE TABLE IF NOT EXISTS `forms` (
  `id` CHAR(36) NOT NULL,
  `key` VARCHAR(100) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `metadata` JSON NULL,
  `created_by` CHAR(36) NOT NULL,
  `is_active` BOOLEAN DEFAULT TRUE,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `key_UNIQUE` (`key` ASC),
  CONSTRAINT `fk_forms_creator`
    FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- TABLA: FORM_VERSIONS
CREATE TABLE IF NOT EXISTS `form_versions` (
  `id` CHAR(36) NOT NULL,
  `form_id` CHAR(36) NOT NULL,
  `version` INT NOT NULL,
  `schema` JSON NOT NULL,
  `created_by` CHAR(36) NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `published_at` DATETIME NULL,
  `status` ENUM('draft', 'published', 'archived') DEFAULT 'draft',
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_fv_form`
    FOREIGN KEY (`form_id`) REFERENCES `forms` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fv_creator`
    FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================================
-- SECCIÓN 3: LOGÍSTICA DE CAMPO (PUBLICACIÓN)
-- ==========================================================

-- TABLA: FORM_PUBLICATIONS
CREATE TABLE IF NOT EXISTS `form_publications` (
  `id` CHAR(36) NOT NULL,
  `form_version_id` CHAR(36) NOT NULL,
  `neighborhood_id` CHAR(36) NULL,
  `start_at` DATETIME NOT NULL,
  `end_at` DATETIME NULL,
  `is_active` BOOLEAN DEFAULT TRUE,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_fp_version`
    FOREIGN KEY (`form_version_id`) REFERENCES `form_versions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fp_neighborhood`
    FOREIGN KEY (`neighborhood_id`) REFERENCES `neighborhoods` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- TABLA: FORM_LINKS
CREATE TABLE IF NOT EXISTS `form_links` (
  `id` CHAR(36) NOT NULL,
  `form_publication_id` CHAR(36) NOT NULL,
  `code` VARCHAR(50) NOT NULL,
  `qr_payload` TEXT NULL,
  `created_by` CHAR(36) NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `closed_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `code_UNIQUE` (`code` ASC),
  CONSTRAINT `fk_fl_publication`
    FOREIGN KEY (`form_publication_id`) REFERENCES `form_publications` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fl_creator`
    FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================================
-- SECCIÓN 4: RECOLECCIÓN DE DATOS (RESPUESTAS)
-- ==========================================================

-- TABLA: SUBMISSIONS
CREATE TABLE IF NOT EXISTS `submissions` (
  `id` CHAR(36) NOT NULL,
  `form_version_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NULL,
  `neighborhood_id` CHAR(36) NOT NULL,
  `responses` JSON NOT NULL,
  `status` ENUM('submitted', 'draft', 'failed') DEFAULT 'submitted',
  `device_info` JSON NULL,
  `location_lat` DECIMAL(10, 8) NULL,
  `location_lng` DECIMAL(11, 8) NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_sub_version`
    FOREIGN KEY (`form_version_id`) REFERENCES `form_versions` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_sub_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sub_neighborhood`
    FOREIGN KEY (`neighborhood_id`) REFERENCES `neighborhoods` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- TABLA: ATTACHMENTS
CREATE TABLE IF NOT EXISTS `attachments` (
  `id` CHAR(36) NOT NULL,
  `submission_id` CHAR(36) NOT NULL,
  `field_key` VARCHAR(100) NOT NULL,
  `storage_path` VARCHAR(255) NOT NULL,
  `filename` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(100) NULL,
  `size_bytes` BIGINT NULL,
  `uploaded_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_att_submission`
    FOREIGN KEY (`submission_id`) REFERENCES `submissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- TABLA: DRAFTS
CREATE TABLE IF NOT EXISTS `drafts` (
  `id` CHAR(36) NOT NULL,
  `device_id` VARCHAR(100) NOT NULL,
  `user_id` CHAR(36) NULL,
  `form_version_id` CHAR(36) NOT NULL,
  `payload` JSON NOT NULL,
  `saved_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `sync_status` VARCHAR(20) DEFAULT 'pending',
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_draft_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_draft_version`
    FOREIGN KEY (`form_version_id`) REFERENCES `form_versions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================================
-- SECCIÓN 5: CUMPLIMIENTO Y SEGURIDAD
-- ==========================================================

-- TABLA: DATA_CONSENTS
CREATE TABLE IF NOT EXISTS `data_consents` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NULL,
  `submission_id` CHAR(36) NOT NULL,
  `policy_version` VARCHAR(50) NOT NULL,
  `accepted` BOOLEAN DEFAULT FALSE,
  `accepted_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `ip_address` VARCHAR(45) NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_dc_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_dc_submission`
    FOREIGN KEY (`submission_id`) REFERENCES `submissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- TABLA: AUDIT_LOGS
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` CHAR(36) NOT NULL,
  `actor_id` CHAR(36) NOT NULL,
  `action` VARCHAR(100) NOT NULL,
  `target_table` VARCHAR(100) NOT NULL,
  `target_id` CHAR(36) NOT NULL,
  `changes` JSON NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_log_actor`
    FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================================
-- SECCIÓN 6: GEMELO DIGITAL (CATASTRO / ACUEDUCTO)
-- ==========================================================

-- TABLA: BLOCKS (Manzanas)
CREATE TABLE IF NOT EXISTS `blocks` (
  `id` CHAR(36) NOT NULL,
  `code` VARCHAR(50) NOT NULL,
  `neighborhood_id` CHAR(36) NOT NULL,
  `geom_path` TEXT NOT NULL,
  `label_position` JSON NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_block_neigh`
    FOREIGN KEY (`neighborhood_id`) REFERENCES `neighborhoods` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- TABLA: LOTS (Predios)
CREATE TABLE IF NOT EXISTS `lots` (
  `id` CHAR(36) NOT NULL,
  `block_id` CHAR(36) NOT NULL,
  `number` VARCHAR(20) NOT NULL,
  `status` ENUM('sin_informacion', 'censado', 'registrado') DEFAULT 'sin_informacion',
  `water_meter_code` VARCHAR(50) NULL COMMENT 'Código del medidor de agua',
  `cadastral_id` VARCHAR(50) NULL COMMENT 'Ficha Catastral o Matrícula',
  `area_m2` DECIMAL(10, 2) NULL,
  `owner_name` VARCHAR(255) NULL,
  `svg_path` TEXT NOT NULL,
  `centroid` JSON NULL,
  `metadata` JSON NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `unique_lot_block` (`block_id`, `number`),
  CONSTRAINT `fk_lot_block`
    FOREIGN KEY (`block_id`) REFERENCES `blocks` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================================
-- SECCIÓN 7: DATOS INICIALES (ROLES)
-- ==========================================================

INSERT IGNORE INTO `roles` (`id`, `name`, `description`) VALUES
(1, 'administrador', 'Acceso total: Configuración del sistema y usuarios.'),
(2, 'operador',      'Gestión operativa: Revisión de envíos y reportes.'),
(3, 'usuario',       'Acceso básico: Llenado de formularios.');

-- ==========================================================
SET FOREIGN_KEY_CHECKS = 1;
-- ✅ Importación completada. Ahora ejecuta: npm run seed
-- ==========================================================
