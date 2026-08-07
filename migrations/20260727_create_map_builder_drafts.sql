-- Migration: Crear tabla de borradores del Map Builder
-- Fecha: 2026-07-27

CREATE TABLE IF NOT EXISTS map_builder_drafts (
  id CHAR(36) PRIMARY KEY,
  neighborhood_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  canvas_state JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (neighborhood_id) REFERENCES neighborhoods(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_draft_per_neighborhood (neighborhood_id)
);
