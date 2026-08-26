-- ─────────────────────────────────────────────────────────────────
-- Rita Phase 7 — Backup Systems & Multi-Region Replication
--
-- Infraestructura para:
--   - Backups automáticos y manuales de datos críticos
--   - Replicación multi-región (Medellín, Bogotá, Cali, regional)
--   - Recuperación ante desastres (RTO/RPO targets)
--   - Sincronización eventual y consistencia de datos
--   - Monitoreo de salud de réplicas
-- ─────────────────────────────────────────────────────────────────

-- Tabla: Configuración de backups por región y entidad
CREATE TABLE IF NOT EXISTS backup_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_code VARCHAR(20) NOT NULL, -- 'MDE', 'BOG', 'CAL', 'NATIONAL'
  entity_type VARCHAR(50) NOT NULL, -- 'riders', 'motorcycles', 'sessions', 'transactions', 'all'

  -- Política de backup
  backup_frequency VARCHAR(50) DEFAULT 'daily', -- 'hourly', 'daily', 'weekly', 'monthly'
  retention_days INTEGER DEFAULT 90, -- cuántos días guardar backups
  backup_window_start TIME, -- ventana de backup (ej: 2:00 AM)
  backup_window_end TIME,

  -- Objetivos de recuperación
  rto_minutes INTEGER, -- Recovery Time Objective (ej: 4 horas = 240 min)
  rpo_minutes INTEGER, -- Recovery Point Objective (ej: 1 hora = 60 min)

  -- Almacenamiento
  storage_type VARCHAR(50) DEFAULT 'multi', -- 'local', 'cloud', 'multi'
  storage_locations TEXT[], -- ['AWS S3', 'GCS', 'Local NAS']
  encryption_enabled BOOLEAN DEFAULT true,

  -- Control
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Historial de backups ejecutados
CREATE TABLE IF NOT EXISTS backup_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES backup_configurations(id) ON DELETE CASCADE,
  region_code VARCHAR(20) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,

  -- Ejecución
  backup_type VARCHAR(50) NOT NULL, -- 'full', 'incremental', 'differential'
  triggered_by VARCHAR(50) NOT NULL, -- 'schedule', 'manual', 'disaster_recovery'
  triggered_by_user UUID REFERENCES auth.users(id),

  -- Resultado
  status VARCHAR(50) NOT NULL, -- 'pending', 'in_progress', 'completed', 'failed', 'partial'
  error_message TEXT,

  -- Métrica
  data_size_bytes BIGINT, -- tamaño de datos respaldados
  duration_seconds INTEGER, -- tiempo total de backup
  rows_processed BIGINT,
  rows_failed BIGINT,

  -- Ubicación del backup
  backup_location TEXT, -- s3://bucket/path/backup.tar.gz
  backup_checksum VARCHAR(255), -- SHA256 para verificación

  -- Timeline
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  verified_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Configuración de replicación multi-región
CREATE TABLE IF NOT EXISTS replication_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_region VARCHAR(20) NOT NULL, -- región primaria
  target_region VARCHAR(20) NOT NULL, -- región de réplica

  -- Datos a replicar
  entity_types TEXT[] NOT NULL, -- ['riders', 'motorcycles', 'sessions', 'transactions']

  -- Sincronización
  replication_type VARCHAR(50) DEFAULT 'eventual', -- 'strong', 'eventual', 'async'
  sync_interval_seconds INTEGER DEFAULT 300, -- sincronización cada 5 minutos
  max_lag_seconds INTEGER DEFAULT 600, -- máximo rezago aceptable (10 min)

  -- Failover
  enable_bidirectional BOOLEAN DEFAULT false, -- ¿bidireccional?
  enable_auto_failover BOOLEAN DEFAULT false, -- ¿failover automático?
  failover_threshold_seconds INTEGER DEFAULT 300, -- si no hay heartbeat en 5 min

  -- Control
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Estado de la replicación (health check)
CREATE TABLE IF NOT EXISTS replication_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES replication_configs(id) ON DELETE CASCADE,
  source_region VARCHAR(20) NOT NULL,
  target_region VARCHAR(20) NOT NULL,

  -- Health
  is_healthy BOOLEAN DEFAULT true,
  last_heartbeat TIMESTAMP DEFAULT NOW(),
  last_sync TIMESTAMP DEFAULT NOW(),
  lag_seconds INTEGER DEFAULT 0, -- rezago actual en segundos

  -- Métricas
  total_replicated_rows BIGINT DEFAULT 0,
  failed_replications BIGINT DEFAULT 0,
  average_lag_seconds NUMERIC(10, 2) DEFAULT 0,

  -- Estado actual
  status VARCHAR(50) DEFAULT 'synced', -- 'synced', 'syncing', 'lagging', 'failed'
  last_error TEXT,

  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Log de sincronización de datos
CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES replication_configs(id) ON DELETE CASCADE,
  source_region VARCHAR(20) NOT NULL,
  target_region VARCHAR(20) NOT NULL,

  -- Batch de sincronización
  batch_number INTEGER,
  entity_type VARCHAR(50), -- 'riders', 'motorcycles', 'sessions', etc

  -- Resultado
  status VARCHAR(50), -- 'success', 'partial', 'failed', 'retry'
  rows_synced INTEGER,
  rows_failed INTEGER,

  -- Timeline
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  duration_seconds INTEGER,

  -- Error tracking
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Eventos de recuperación ante desastres
CREATE TABLE IF NOT EXISTS disaster_recovery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Evento
  event_type VARCHAR(50) NOT NULL, -- 'region_down', 'data_corruption', 'failover_triggered', 'recovery_completed'
  severity VARCHAR(50) NOT NULL, -- 'critical', 'high', 'medium', 'low'
  affected_region VARCHAR(20),
  affected_entities TEXT[], -- ['riders', 'motorcycles']

  -- Detección y respuesta
  detected_at TIMESTAMP DEFAULT NOW(),
  detected_by VARCHAR(50), -- 'automated_check', 'manual_report', 'user_report'

  -- Acciones
  action_triggered VARCHAR(50), -- 'none', 'failover', 'manual_recovery', 'restore_from_backup'
  recovery_started_at TIMESTAMP,
  recovery_completed_at TIMESTAMP,
  data_loss_minutes INTEGER, -- minutos de datos perdidos (RPO actual)

  -- Resultado
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'resolved', 'unresolved'
  root_cause TEXT,
  remediation TEXT,

  -- Audit
  handled_by_user UUID REFERENCES auth.users(id),
  notes TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Verificación de consistencia de datos
CREATE TABLE IF NOT EXISTS data_consistency_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Check
  check_type VARCHAR(50) NOT NULL, -- 'row_count', 'checksum', 'foreign_key', 'referential_integrity'
  entity_type VARCHAR(50) NOT NULL, -- tabla a verificar

  -- Regiones a comparar
  primary_region VARCHAR(20),
  compare_regions TEXT[], -- regiones a comparar contra primaria

  -- Resultado
  status VARCHAR(50), -- 'consistent', 'inconsistent', 'error'
  primary_row_count BIGINT,
  replica_row_counts JSONB, -- {BOG: 1000, CAL: 998, ...}
  primary_checksum VARCHAR(255),
  replica_checksums JSONB,

  -- Discrepancias
  discrepancies_found BOOLEAN DEFAULT false,
  discrepancy_details JSONB, -- {BOG: {missing_rows: 2, extra_rows: 0, checksum_mismatch: true}}

  -- Acción
  auto_repair_attempted BOOLEAN DEFAULT false,
  repair_status VARCHAR(50), -- 'not_attempted', 'succeeded', 'failed', 'manual_review_needed'

  -- Timeline
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE INDEX idx_backup_config_region ON backup_configurations(region_code, is_active);
CREATE INDEX idx_backup_config_entity ON backup_configurations(entity_type, is_active);

CREATE INDEX idx_backup_history_config ON backup_history(config_id, created_at DESC);
CREATE INDEX idx_backup_history_status ON backup_history(status, created_at DESC);
CREATE INDEX idx_backup_history_region ON backup_history(region_code, entity_type);

CREATE INDEX idx_replication_config_route ON replication_configs(source_region, target_region, is_active);
CREATE INDEX idx_replication_config_active ON replication_configs(is_active);

CREATE INDEX idx_replication_status_config ON replication_status(config_id);
CREATE INDEX idx_replication_status_health ON replication_status(is_healthy, status);
CREATE INDEX idx_replication_status_route ON replication_status(source_region, target_region);

CREATE INDEX idx_sync_logs_config ON sync_logs(config_id, created_at DESC);
CREATE INDEX idx_sync_logs_status ON sync_logs(status, created_at DESC);
CREATE INDEX idx_sync_logs_route ON sync_logs(source_region, target_region);

CREATE INDEX idx_disaster_events_severity ON disaster_recovery_events(severity, detected_at DESC);
CREATE INDEX idx_disaster_events_region ON disaster_recovery_events(affected_region, event_type);
CREATE INDEX idx_disaster_events_status ON disaster_recovery_events(status, detected_at DESC);

CREATE INDEX idx_consistency_checks_entity ON data_consistency_checks(entity_type, created_at DESC);
CREATE INDEX idx_consistency_checks_status ON data_consistency_checks(status, created_at DESC);

-- Activar Row Level Security
ALTER TABLE backup_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE replication_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE replication_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE disaster_recovery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_consistency_checks ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Backup (solo ops/admin)
CREATE POLICY "Admin ve backups" ON backup_configurations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM auth.users WHERE auth.users.id = auth.uid() AND auth.users.raw_user_meta_data->>'role' = 'admin')
  );

CREATE POLICY "Admin ve historial de backups" ON backup_history
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM auth.users WHERE auth.users.id = auth.uid() AND auth.users.raw_user_meta_data->>'role' = 'admin')
  );

-- RLS Policies: Replication (solo ops/admin)
CREATE POLICY "Admin ve replicación" ON replication_configs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM auth.users WHERE auth.users.id = auth.uid() AND auth.users.raw_user_meta_data->>'role' = 'admin')
  );

CREATE POLICY "Admin ve estado de replicación" ON replication_status
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM auth.users WHERE auth.users.id = auth.uid() AND auth.users.raw_user_meta_data->>'role' = 'admin')
  );

CREATE POLICY "Admin ve logs de sincronización" ON sync_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM auth.users WHERE auth.users.id = auth.uid() AND auth.users.raw_user_meta_data->>'role' = 'admin')
  );

-- RLS Policies: Disaster Recovery (ops/admin + audit)
CREATE POLICY "Admin ve eventos DR" ON disaster_recovery_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM auth.users WHERE auth.users.id = auth.uid() AND auth.users.raw_user_meta_data->>'role' IN ('admin', 'ops'))
  );

CREATE POLICY "Admin registra eventos DR" ON disaster_recovery_events
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM auth.users WHERE auth.users.id = auth.uid() AND auth.users.raw_user_meta_data->>'role' IN ('admin', 'ops'))
  );

-- RLS Policies: Consistency Checks (ops/admin)
CREATE POLICY "Admin ve verificaciones de consistencia" ON data_consistency_checks
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM auth.users WHERE auth.users.id = auth.uid() AND auth.users.raw_user_meta_data->>'role' IN ('admin', 'ops'))
  );
