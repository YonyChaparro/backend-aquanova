-- ==========================================================
-- SISTEMA DE GESTIÓN DE FORMULARIOS DINÁMICOS - AQUANOVA
-- Motor: MySQL 8.0+ | Enfoque: JSON Híbrido + Relacional
-- ==========================================================

-- 1. CREACIÓN DEL ENTORNO
-- Se usa utf8mb4 para soportar emojis y caracteres especiales completos
CREATE DATABASE IF NOT EXISTS app_aquanova_bd
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE app_aquanova_bd;

-- ==========================================================
-- SECCIÓN 1: IDENTIDAD Y GEOGRAFÍA (CORE)
-- ==========================================================

-- TABLA: USERS
-- Usuarios del sistema (Admins, encuestadores, vecinos).
-- Se usa CHAR(36) para UUIDs porque es el estándar legible en MySQL.
CREATE TABLE `users` (
  `id` CHAR(36) NOT NULL,                    -- ID único universal (UUID v4)
  `name` VARCHAR(255) NOT NULL,              -- Nombre real
  `email` VARCHAR(255) NULL,                 -- Email para login/notificaciones
  `phone` VARCHAR(50) NULL,                  -- Teléfono (útil para auth por SMS)
  `password_hash` VARCHAR(255) NULL,         -- Hash seguro (Bcrypt/Argon2)
  `is_active` BOOLEAN DEFAULT TRUE,          -- "Soft Delete": nunca borramos, solo desactivamos
  `metadata` JSON NULL,                      -- JSON: Preferencias de UI, avatar, config extra
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `email_UNIQUE` (`email` ASC)
) ENGINE=InnoDB;

-- TABLA: ROLES
-- Definición de permisos (ej: 'ADMIN_GLOBAL', 'LIDER_BARRIAL').
CREATE TABLE `roles` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(50) NOT NULL,               -- Clave del rol para verificar en código
  `description` TEXT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `name_UNIQUE` (`name` ASC)
) ENGINE=InnoDB;

-- TABLA: NEIGHBORHOODS (BARRIOS)
-- El corazón geográfico. Soporta jerarquías (Sector -> Barrio).
CREATE TABLE `neighborhoods` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `code` VARCHAR(50) NOT NULL,               -- Código catastral o interno único
  `parent_id` CHAR(36) NULL,                 -- Recursividad: Un barrio puede pertenecer a una "Comuna"
  `geom` GEOMETRY NULL,                      -- Tipo espacial nativo: Puntos o Polígonos del barrio
  `metadata` JSON NULL,                      -- Datos extra: Población estimada, estrato, etc.
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `code_UNIQUE` (`code` ASC),
  CONSTRAINT `fk_neighborhood_parent`
    FOREIGN KEY (`parent_id`)
    REFERENCES `neighborhoods` (`id`)
    ON DELETE SET NULL                       -- Si borran el padre, el hijo queda huérfano (no se borra)
    ON UPDATE CASCADE
) ENGINE=InnoDB;

-- TABLA: USER_ROLES
-- Tabla pivote. Define QUE puede hacer un usuario y DÓNDE.
CREATE TABLE `user_roles` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` CHAR(36) NOT NULL,
  `role_id` INT NOT NULL,
  `neighborhood_id` CHAR(36) NULL,           -- CRUCIAL: Limita el rol a un barrio específico. NULL = Global.
  `assigned_by` CHAR(36) NULL,               -- Auditoría: ¿Quién le dio permisos?
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
) ENGINE=InnoDB;

-- ==========================================================
-- SECCIÓN 2: MOTOR DE FORMULARIOS (DEFINICIÓN)
-- ==========================================================

-- TABLA: FORMS
-- La entidad abstracta del formulario (ej: "Censo de Mascotas").
CREATE TABLE `forms` (
  `id` CHAR(36) NOT NULL,
  `key` VARCHAR(100) NOT NULL,               -- Slug legible para URLs (ej: censo-mascotas-2024)
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `created_by` CHAR(36) NOT NULL,
  `is_active` BOOLEAN DEFAULT TRUE,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `key_UNIQUE` (`key` ASC),
  CONSTRAINT `fk_forms_creator`
    FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- TABLA: FORM_VERSIONS
-- La "Foto" exacta del formulario en un momento del tiempo.
-- Aquí vive la estructura de preguntas.
CREATE TABLE `form_versions` (
  `id` CHAR(36) NOT NULL,
  `form_id` CHAR(36) NOT NULL,
  `version` INT NOT NULL,                    -- 1, 2, 3... Control de versiones secuencial
  `schema` JSON NOT NULL,                    -- LA MAGIA: Array de objetos definiendo inputs, selects, validaciones.
  `created_by` CHAR(36) NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `published_at` DATETIME NULL,
  `status` ENUM('draft', 'published', 'archived') DEFAULT 'draft',
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_fv_form`
    FOREIGN KEY (`form_id`) REFERENCES `forms` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fv_creator`
    FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ==========================================================
-- SECCIÓN 3: LOGÍSTICA DE CAMPO (PUBLICACIÓN)
-- ==========================================================

-- TABLA: FORM_PUBLICATIONS
-- Define la estrategia de despliegue: ¿Qué formulario va a qué barrio y cuándo?
CREATE TABLE `form_publications` (
  `id` CHAR(36) NOT NULL,
  `form_version_id` CHAR(36) NOT NULL,       -- Qué versión específica se va a usar
  `neighborhood_id` CHAR(36) NULL,           -- Si es NULL, aplica para TODA la ciudad.
  `start_at` DATETIME NOT NULL,              -- Fecha inicio de campaña
  `end_at` DATETIME NULL,                    -- Fecha fin (NULL = Indefinido)
  `is_active` BOOLEAN DEFAULT TRUE,          -- Interruptor de emergencia para apagar campaña
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_fp_version`
    FOREIGN KEY (`form_version_id`) REFERENCES `form_versions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fp_neighborhood`
    FOREIGN KEY (`neighborhood_id`) REFERENCES `neighborhoods` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- TABLA: FORM_LINKS
-- Puntos de entrada para compartir (QRs, Links cortos).
CREATE TABLE `form_links` (
  `id` CHAR(36) NOT NULL,
  `form_publication_id` CHAR(36) NOT NULL,
  `code` VARCHAR(50) NOT NULL,               -- Código corto único (ej: aq.com/Xy9Z)
  `qr_payload` TEXT NULL,                    -- Datos para generar el QR nuevamente
  `created_by` CHAR(36) NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `closed_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `code_UNIQUE` (`code` ASC),
  CONSTRAINT `fk_fl_publication`
    FOREIGN KEY (`form_publication_id`) REFERENCES `form_publications` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fl_creator`
    FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB;

-- ==========================================================
-- SECCIÓN 4: RECOLECCIÓN DE DATOS (RESPUESTAS)
-- ==========================================================

-- TABLA: SUBMISSIONS
-- Cada formulario llenado por un usuario.
CREATE TABLE `submissions` (
  `id` CHAR(36) NOT NULL,
  `form_version_id` CHAR(36) NOT NULL,       -- Vincula a la estructura EXACTA que respondió el usuario
  `user_id` CHAR(36) NULL,                   -- NULL permite encuestas anónimas
  `neighborhood_id` CHAR(36) NOT NULL,       -- Barrio reportado (puede diferir de la publicación si es GPS)
  `responses` JSON NOT NULL,                 -- JSON: {"pregunta_1": "respuesta", "pregunta_2": 5}
  `status` ENUM('submitted', 'draft', 'failed') DEFAULT 'submitted',
  `device_info` JSON NULL,                   -- UserAgent, OS, Marca del celular
  `location_lat` DECIMAL(10, 8) NULL,        -- Coordenadas GPS de donde se llenó
  `location_lng` DECIMAL(11, 8) NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, -- Clave para ediciones posteriores
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_sub_version`
    FOREIGN KEY (`form_version_id`) REFERENCES `form_versions` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_sub_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sub_neighborhood`
    FOREIGN KEY (`neighborhood_id`) REFERENCES `neighborhoods` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- TABLA: ATTACHMENTS
-- Manejo de archivos subidos (fotos, pdfs) dentro del formulario.
CREATE TABLE `attachments` (
  `id` CHAR(36) NOT NULL,
  `submission_id` CHAR(36) NOT NULL,
  `field_key` VARCHAR(100) NOT NULL,         -- ID del campo input tipo 'file' en el JSON Schema
  `storage_path` VARCHAR(255) NOT NULL,      -- Ruta en S3 / Cloudinary / Local
  `filename` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(100) NULL,
  `size_bytes` BIGINT NULL,
  `uploaded_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_att_submission`
    FOREIGN KEY (`submission_id`) REFERENCES `submissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- TABLA: DRAFTS
-- Persistencia local/nube temporal para cuando no hay internet o se pausa el llenado.
CREATE TABLE `drafts` (
  `id` CHAR(36) NOT NULL,
  `device_id` VARCHAR(100) NOT NULL,         -- Para recuperar borrador en el mismo cel sin login
  `user_id` CHAR(36) NULL,
  `form_version_id` CHAR(36) NOT NULL,
  `payload` JSON NOT NULL,                   -- Respuestas parciales
  `saved_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `sync_status` VARCHAR(20) DEFAULT 'pending', -- pending -> synced
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_draft_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_draft_version`
    FOREIGN KEY (`form_version_id`) REFERENCES `form_versions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ==========================================================
-- SECCIÓN 5: CUMPLIMIENTO Y SEGURIDAD
-- ==========================================================

-- TABLA: DATA_CONSENTS
-- Registro legal de aceptación de tratamiento de datos (Habeas Data).
CREATE TABLE `data_consents` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NULL,
  `submission_id` CHAR(36) NOT NULL,
  `policy_version` VARCHAR(50) NOT NULL,     -- Qué versión de tyc aceptó (ej: v2024.1)
  `accepted` BOOLEAN DEFAULT FALSE,
  `accepted_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `ip_address` VARCHAR(45) NULL,             -- IP v4 o v6 para trazabilidad legal
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_dc_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_dc_submission`
    FOREIGN KEY (`submission_id`) REFERENCES `submissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- TABLA: AUDIT_LOGS
-- Historial de "Quién hizo qué" para seguridad.
CREATE TABLE `audit_logs` (
  `id` CHAR(36) NOT NULL,
  `actor_id` CHAR(36) NOT NULL,              -- Usuario que ejecutó la acción
  `action` VARCHAR(100) NOT NULL,            -- ej: UPDATE_SUBMISSION, PUBLISH_FORM
  `target_table` VARCHAR(100) NOT NULL,      -- Tabla afectada
  `target_id` CHAR(36) NOT NULL,             -- ID del registro afectado
  `changes` JSON NULL,                       -- Diff: { "antes": "A", "despues": "B" }
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_log_actor`
    FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ==========================================================
-- SECCIÓN 6: SEMILLA DE DATOS (ESTÁTICA Y SEGURA)
-- ==========================================================

-- 1. Desactivamos temporalmente las protecciones
SET SQL_SAFE_UPDATES = 0;       -- Permite borrar sin WHERE
SET FOREIGN_KEY_CHECKS = 0;     -- Permite borrar aunque existan relaciones (cuidado)

-- 2. Limpiamos la tabla para evitar duplicados
DELETE FROM `roles`; 

-- 3. Reiniciamos el contador de IDs para que empiece en 1
ALTER TABLE `roles` AUTO_INCREMENT = 1;

-- 4. Insertamos los roles fijos (1, 2, 3)
INSERT INTO `roles` (`id`, `name`, `description`) VALUES
(1, 'administrador', 'Acceso total: Configuración del sistema y usuarios.'),
(2, 'operador', 'Gestión operativa: Revisión de envíos y reportes.'),
(3, 'usuario', 'Acceso básico: Llenado de formularios.');

-- 5. Reactivamos las protecciones (Buenas prácticas)
SET FOREIGN_KEY_CHECKS = 1;
SET SQL_SAFE_UPDATES = 1;