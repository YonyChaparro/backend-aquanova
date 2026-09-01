-- Migration: Soporte de captura offline de encuestas (módulo Offline Survey Capture)
-- Spec: specs/offline-encuestas.md — sección 3.4.1
-- Fecha: 2026-08-30
--
-- Idempotente: se puede ejecutar varias veces sin error (MySQL 8 no soporta
-- ADD COLUMN IF NOT EXISTS, así que se comprueba contra information_schema).
--
-- NOTA: `submission_referrals` YA tiene UNIQUE (submission_id) creado por
-- seed.js:346 (`submission_ref_UNIQUE`), así que aquí no se toca.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. submissions.captured_at
--    Fecha real de captura en campo, que puede ser días anterior a la de
--    sincronización. NO se toca `created_at`: sigue siendo la fecha de llegada
--    al servidor y el único rastro fiable de auditoría (los relojes de los
--    dispositivos de campo no son de fiar). Los reportes deben usar
--    COALESCE(captured_at, created_at).
-- ─────────────────────────────────────────────────────────────────────────────
SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'submissions'
    AND COLUMN_NAME  = 'captured_at'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `submissions`
     ADD COLUMN `captured_at` DATETIME NULL
     COMMENT ''Fecha de captura en campo; NULL si se envió online''',
  'SELECT ''captured_at ya existe, omitido'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'submissions'
    AND INDEX_NAME   = 'idx_sub_captured_at'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `submissions` ADD INDEX `idx_sub_captured_at` (`captured_at`)',
  'SELECT ''idx_sub_captured_at ya existe, omitido'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. user_roles: UNIQUE (user_id, role_id, neighborhood_id)
--    Permite `INSERT IGNORE INTO user_roles` al reutilizar un usuario que ya
--    existe durante el onboarding (ver spec 3.6.1, paso 4a). Sin este índice,
--    reencuestar a un ciudadano ya registrado duplicaría su asignación de rol.
--
--    OJO: en MySQL, un UNIQUE con una columna NULL (neighborhood_id) no impide
--    filas repetidas con NULL. Es aceptable: el caso que nos importa es el rol
--    ligado a un barrio concreto.
-- ─────────────────────────────────────────────────────────────────────────────
SET @exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'user_roles'
    AND INDEX_NAME   = 'uq_ur_user_role_hood'
);
SET @dups := (
  SELECT COUNT(*) FROM (
    SELECT user_id, role_id, neighborhood_id
    FROM user_roles
    WHERE neighborhood_id IS NOT NULL
    GROUP BY user_id, role_id, neighborhood_id
    HAVING COUNT(*) > 1
  ) d
);
-- Si ya hay duplicados previos, el índice no se puede crear: se avisa y se
-- deja el saneamiento al operador en vez de borrar filas automáticamente.
SET @sql := IF(@exists > 0,
  'SELECT ''uq_ur_user_role_hood ya existe, omitido'' AS info',
  IF(@dups > 0,
    'SELECT ''ABORTADO: hay duplicados en user_roles. Sanear antes de crear el indice.'' AS warning',
    'ALTER TABLE `user_roles`
       ADD UNIQUE KEY `uq_ur_user_role_hood` (`user_id`, `role_id`, `neighborhood_id`)'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificación
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'submissions'
      AND COLUMN_NAME = 'captured_at')            AS captured_at_ok,
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_roles'
      AND INDEX_NAME = 'uq_ur_user_role_hood')    AS user_roles_uq_ok,
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'submission_referrals'
      AND INDEX_NAME = 'submission_ref_UNIQUE')   AS sub_ref_uq_preexistente;
