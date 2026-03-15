-- CFNote 增量迁移：系统日志表
-- 执行方式：wrangler d1 execute cfnote-db --remote --file=migrations/002_system_logs.sql

CREATE TABLE IF NOT EXISTS system_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT NOT NULL,
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  detail TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_system_logs_level_time ON system_logs(level, created_at);
