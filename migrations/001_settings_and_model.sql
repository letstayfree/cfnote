-- CFNote 增量迁移：设置页面 + AI 模型切换
-- 适用于已有数据库，在线上环境通过 wrangler d1 execute 执行
-- 执行方式：wrangler d1 execute cfnote-db --remote --file=migrations/001_settings_and_model.sql

-- 1. 新建 settings 表（通用 key-value 结构）
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 2. 为 usage_logs 表新增 model 列（记录 AI 请求使用的模型）
-- SQLite 的 ALTER TABLE ADD COLUMN 在列已存在时会报错，无法用 IF NOT EXISTS
-- 如果已执行过此迁移，此语句会失败，可忽略该错误
ALTER TABLE usage_logs ADD COLUMN model TEXT;
