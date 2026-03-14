# 实现计划：设置页面 + AI 模型切换 + 统计增强

## 背景

CFNote 目前硬编码使用 `@cf/meta/llama-3.1-8b-instruct`（8B 参数），该模型中文能力弱、指令遵循差。Cloudflare Workers AI 现已提供更强的模型。用户希望：
1. 新增设置页面，可自由切换 AI 模型
2. 统计报表中增加每个模型的使用情况

## 可选模型

| 模型 ID | 显示名 | 类型 | 每次约消耗 |
|---|---|---|---|
| `@cf/meta/llama-3.1-8b-instruct` | Llama 3.1 8B | 通用 | ~15 neurons |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | Llama 3.3 70B | 通用 | ~88 neurons |
| `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b` | DeepSeek R1 32B | 推理 | ~178 neurons |
| `@cf/qwen/qwq-32b` | QwQ 32B | 推理 | ~87 neurons |

**注意**：推理模型（DeepSeek R1、QwQ）的输出会包含 `<think>...</think>` 思维链标签，需要在返回前端之前过滤掉。

---

## 改动内容

### 一、数据库：新增 `settings` 表

**文件**：`schema.sql`、`functions/api/init.ts`

```sql
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

- 通用 key-value 结构，单用户系统无需 user_id
- 后续任何设置都可直接新增 key，无需改表结构
- 当前 key：`llm_model`，默认值 `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
- 未来扩展示例：`openai_api_key`、`openai_base_url`、`openai_model` 等

同时为 `usage_logs` 表新增 `model` 列（用于按模型统计）：
- 在 `init.ts` 中尝试 `ALTER TABLE usage_logs ADD COLUMN model TEXT`，用 try/catch 忽略已存在的情况

### 二、工具函数

**文件**：`functions/api/_utils.ts`

新增：
- `ALLOWED_MODELS` — 模型列表常量，包含 ID、显示名、类型（通用/推理）、描述
- `getSettingValue(env, key, defaultValue)` — 通用设置读取函数，查询 `settings` 表
- `stripThinkTags(text)` — 移除推理模型输出中的 `<think>...</think>` 标签

### 三、设置 API

**新文件**：`functions/api/settings.ts`

- `GET /api/settings` — 返回所有设置（key-value 对象）
- `PUT /api/settings` — 批量更新设置，校验 `llm_model` 值是否在允许列表中

### 四、后端：动态模型调用

**文件**：`functions/api/conversations/[id]/messages.ts`、`functions/api/search/ai.ts`

改动：
1. 调用 `getSettingValue(env, 'llm_model', DEFAULT_MODEL)` 获取用户选择的模型
2. 将硬编码的模型名替换为动态值：`env.AI.run(userModel, ...)`
3. 若模型为推理类型，对 LLM 输出调用 `stripThinkTags()` 过滤思维链
4. 记录 usage_log 时附带模型名

### 五、统计增强

**文件**：`functions/api/stats.ts`、`src/components/StatsPanel.tsx`、`src/types.ts`

**后端**：
- 在使用量统计中增加 `ai_chat`（AI 对话）的今日/7天/累计统计（当前只统计了 `ai_qa`，遗漏了 `ai_chat`）
- 新增按模型聚合的本地统计（从 `usage_logs` 的 `model` 列查询，不依赖 CF API Token）

**前端**：
- `StatsPanel.tsx` 使用量表格中增加"AI 对话"行
- 新增"模型使用分布"区域，展示每个模型的调用次数（来自本地 usage_logs）

### 六、设置 UI

**新文件**：`src/components/SettingsPanel.tsx`

- 模态弹窗，UI 风格与 `StatsPanel.tsx` 一致（遮罩 + 居中卡片 + Escape 关闭）
- "AI 模型"区域：
  - 4 个模型选项卡片（radio 风格），每个显示：
    - 模型名称
    - 中文描述（一句话）
    - 类型标签（通用 / 推理）
    - 成本指示（neurons/次）
  - 当前选中项高亮（emerald 边框）
  - 点击"保存"发送 PUT 请求并关闭弹窗

### 七、布局集成

**文件**：`src/components/Layout.tsx`

- 新增 `showSettings` 状态
- 顶栏增加齿轮图标按钮（位于统计按钮和 AI 助手按钮之间）
- `showSettings` 为 true 时渲染 `SettingsPanel`

### 八、类型定义

**文件**：`src/types.ts`

- 新增 `Settings` 接口：`{ llm_model: string; [key: string]: string }`
- `StatsUsage` 新增 `ai_chat_today`、`ai_chat_7d`、`ai_chat_total` 字段

---

## 文件改动汇总

| 文件 | 操作 | 说明 |
|---|---|---|
| `schema.sql` | 修改 | 新增 `settings` 表 |
| `functions/api/init.ts` | 修改 | SCHEMA 新增建表 + model 列迁移 |
| `functions/api/_utils.ts` | 修改 | 新增模型列表、`getSettingValue()`、`stripThinkTags()` |
| `functions/api/settings.ts` | **新增** | GET/PUT 设置接口 |
| `functions/api/conversations/[id]/messages.ts` | 修改 | 动态模型、过滤思维链、日志附带模型 |
| `functions/api/search/ai.ts` | 修改 | 动态模型、过滤思维链、日志附带模型 |
| `functions/api/stats.ts` | 修改 | 增加 ai_chat 统计 + 按模型聚合 |
| `src/types.ts` | 修改 | 新增 `Settings`、更新 `StatsUsage` |
| `src/components/SettingsPanel.tsx` | **新增** | 设置弹窗（模型选择卡片） |
| `src/components/Layout.tsx` | 修改 | 新增设置按钮 + 状态 |
| `src/components/StatsPanel.tsx` | 修改 | 显示 AI 对话统计 + 模型使用分布 |

## 实施顺序

1. 数据库 + 类型（schema.sql → init.ts → types.ts）
2. 工具函数（_utils.ts：模型列表、getSettingValue、stripThinkTags）
3. 设置 API（settings.ts）
4. 后端集成（messages.ts、search/ai.ts 改用动态模型）
5. 统计增强（stats.ts → StatsPanel.tsx）
6. 设置 UI（SettingsPanel.tsx）
7. 布局集成（Layout.tsx）
8. 类型检查 + 构建 + 部署验证

## 验证方式

1. `npx tsc --noEmit` — 类型检查通过
2. `npx vite build` — 构建通过
3. 部署后 POST `/api/init` → 创建新表
4. 打开设置 → 看到 4 个模型选项 → 选择一个 → 保存
5. 打开 AI 对话 → 发送问题 → 确认使用了选中的模型
6. 选择推理模型 → 回答中不出现 `<think>` 标签
7. 打开统计 → 看到"AI 对话"行 + 模型使用分布
