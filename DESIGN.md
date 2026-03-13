# CFNote - 私人知识库系统设计文档

## 1. 项目概述

基于 Cloudflare 全栈基础设施构建的私人知识库系统，支持笔记本管理、文章编辑、自动向量化和自然语言语义搜索。全程不依赖第三方 LLM API，所有 AI 能力均由 Cloudflare Workers AI 提供。

## 2. 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端框架 | React 18 + TypeScript | SPA 单页应用 |
| 样式 | Tailwind CSS 3 | 原子化 CSS |
| 构建工具 | Vite | 快速构建 |
| Markdown | marked | 轻量 Markdown 渲染 |
| 部署 | Cloudflare Pages | 静态资源 + Functions |
| 后端 API | Pages Functions | 基于 Workers 的 serverless 函数 |
| 数据库 | Cloudflare D1 | 边缘 SQLite 数据库 |
| 向量搜索 | Cloudflare Vectorize | 向量数据库 |
| AI 推理 | Cloudflare Workers AI | 嵌入 + 文本生成 |

### AI 模型选择

| 用途 | 模型 | 维度/参数 | 选择理由 |
|------|------|-----------|----------|
| 文本嵌入 | `@cf/baai/bge-m3` | 1024维 | 多语言专用，中文检索效果最佳 |
| 文本生成（AI问答） | `@cf/meta/llama-3.1-8b-instruct` | 8B | 支持中文，neuron消耗适中 |

> 备选嵌入模型：若需降低存储占用，可切换到 `@cf/baai/bge-base-en-v1.5`（768维，存储上限更高但中文效果较弱）。

## 3. 系统架构

```
┌─────────────────────────────────────────────┐
│              Cloudflare Pages               │
│  ┌───────────────────────────────────────┐  │
│  │     React SPA (Tailwind CSS)          │  │
│  │  ┌──────┐ ┌──────────┐ ┌──────────┐  │  │
│  │  │侧边栏│ │ 文章列表  │ │ 编辑/阅读 │  │  │
│  │  │笔记本│ │          │ │          │  │  │
│  │  └──────┘ └──────────┘ └──────────┘  │  │
│  └───────────────────────────────────────┘  │
│                     │ API 请求                │
│  ┌───────────────────────────────────────┐  │
│  │         Pages Functions (API)         │  │
│  └──────┬──────────┬──────────┬──────────┘  │
│         │          │          │              │
│    ┌────▼───┐ ┌────▼────┐ ┌──▼───────┐     │
│    │   D1   │ │Vectorize│ │Workers AI│     │
│    │ SQLite │ │ 向量索引 │ │ 嵌入+LLM │     │
│    └────────┘ └─────────┘ └──────────┘     │
└─────────────────────────────────────────────┘
```

### 核心流程

**文章保存 → 自动向量化：**
```
保存文章 → D1存储 → 文本分块(500字/块,100字重叠)
         → Workers AI 嵌入 → Vectorize 存储向量
```

**自然语言搜索：**
```
用户输入查询 → Workers AI 嵌入查询 → Vectorize 相似度检索
            → 返回匹配的文章片段（语义搜索模式）
            → [可选] LLM 生成摘要回答（AI问答模式）
```

## 4. Cloudflare 免费额度分析

### 4.1 各服务免费限额

| 服务 | 免费额度 | 说明 |
|------|---------|------|
| Workers AI | **10,000 neurons/天** | 超出后请求失败，每日UTC 0点重置 |
| Vectorize 存储 | **500万维度** | 总量限制 |
| Vectorize 查询 | **3000万维度/月** | 月度限制 |
| D1 读取 | **500万行/天** | 每日重置 |
| D1 写入 | **10万行/天** | 每日重置 |
| D1 存储 | **5 GB** | 总量限制 |
| Workers 请求 | **10万次/天** | Pages Functions 共享此限制 |
| Workers CPU | **10ms/次** | 仅计算CPU时间，I/O等待不计 |
| Pages 构建 | **500次/月** | 部署限制 |

### 4.2 目标场景适配分析（200篇3000字文章，100次/天搜索）

**向量存储：**
- 每篇文章 ≈ 7个分块（500字/块，100字重叠）
- 总分块数：200 × 7 = 1,400 个
- 存储维度：1,400 × 768 = 1,075,200 维度
- 占免费额度：**21.5%** ✅

**向量查询：**
- 100次/天 × 30天 = 3,000次/月
- 查询维度：3,000 × 768 = 2,304,000 维度/月
- 占免费额度：**7.7%** ✅

**Workers AI（每日消耗估算）：**

| 操作 | 频率 | tokens | neurons估算 |
|------|------|--------|------------|
| 新文章嵌入 | 2-3篇/天×7块 | ~10,500 | ~50 |
| 搜索查询嵌入 | 100次/天 | ~3,000 | ~15 |
| AI问答（可选） | 20次/天 | ~12,000输入+4,000输出 | ~150 |
| **日合计** | | | **~215 neurons** |

- 占每日免费额度：**2.15%** ✅
- 即使100次全部使用AI问答：~620 neurons/天 = **6.2%** ✅

**D1 数据库：**
- 每日读取：页面浏览+搜索 ≈ 2,000-5,000 行 → 占比 <0.1% ✅
- 每日写入：新文章+分块 ≈ 50-100 行 → 占比 <0.1% ✅
- 存储：200篇 × 3000字 ≈ 1.2MB → 占比 <0.1% ✅

**结论：该场景下所有指标均在免费额度的 25% 以内，有充足余量。**

## 5. 数据库设计（D1）

```sql
-- 用户表
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 笔记本表
CREATE TABLE notebooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  color TEXT DEFAULT '#10B981',
  article_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 文章表
CREATE TABLE articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notebook_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT,
  is_vectorized INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 文章分块表（用于向量化追踪）
CREATE TABLE chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  vector_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_articles_notebook ON articles(notebook_id);
CREATE INDEX idx_articles_user ON articles(user_id);
CREATE INDEX idx_chunks_article ON chunks(article_id);
CREATE INDEX idx_notebooks_user ON notebooks(user_id);
```

## 6. API 接口设计

### 6.1 系统初始化与认证

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/status` | 检查系统是否已初始化（users表是否存在） |
| POST | `/api/init` | 创建数据库表结构 |
| POST | `/api/auth/register` | 注册用户（仅初始化后首次可用） |
| POST | `/api/auth/login` | 登录，返回JWT token |

### 6.2 笔记本 CRUD

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/notebooks` | 获取用户所有笔记本 |
| POST | `/api/notebooks` | 创建笔记本 |
| PUT | `/api/notebooks/:id` | 更新笔记本信息 |
| DELETE | `/api/notebooks/:id` | 删除笔记本（级联删除文章和向量） |

### 6.3 文章 CRUD

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/notebooks/:id/articles` | 获取笔记本下的文章列表 |
| GET | `/api/articles/:id` | 获取文章详情 |
| POST | `/api/articles` | 创建文章（自动触发向量化） |
| PUT | `/api/articles/:id` | 更新文章（内容变化时重新向量化） |
| DELETE | `/api/articles/:id` | 删除文章（同时删除向量） |

### 6.4 搜索

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/search` | 语义搜索（仅向量检索，不消耗LLM neurons） |
| POST | `/api/search/ai` | AI问答（向量检索 + LLM生成回答） |

### 认证机制

- 密码使用 PBKDF2-SHA256 哈希（Web Crypto API），100,000次迭代
- JWT（HMAC-SHA256）用于会话管理，有效期7天
- JWT密钥存储为 Pages 环境变量/Secret
- 所有 API（除 status/init/register/login）需携带 `Authorization: Bearer <token>` 头

## 7. 前端页面设计（Evernote风格）

### 7.1 页面路由

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | 主页 | 根据状态重定向 |
| `/setup` | 初始化 | 首次使用，创建数据库+注册 |
| `/login` | 登录 | 用户登录 |
| `/app` | 主应用 | 三栏布局知识库界面 |

### 7.2 主应用布局（三栏式 Evernote 风格）

```
┌─────────────────────────────────────────────────────────┐
│  🔍 搜索栏                              用户名  ⚙️设置  │
├────────┬───────────────┬────────────────────────────────┤
│        │               │                                │
│ 笔记本  │   文章列表     │      文章内容 / 编辑器          │
│        │               │                                │
│ 📓全部  │ ┌───────────┐ │  标题: _______________         │
│ 📓工作  │ │ 文章标题    │ │                                │
│ 📓学习  │ │ 摘要预览... │ │  内容:                         │
│ 📓生活  │ │ 2024-03-13 │ │  (Markdown编辑/预览)           │
│        │ └───────────┘ │                                │
│        │ ┌───────────┐ │                                │
│ ──────  │ │ 文章标题    │ │                                │
│ + 新建  │ │ 摘要预览... │ │           ┌──────┐            │
│        │ └───────────┘ │           │ 保存  │            │
│        │               │           └──────┘            │
├────────┴───────────────┴────────────────────────────────┤
│  状态栏: 已向量化 ✓ | 共200篇文章 | neurons: 215/10000   │
└─────────────────────────────────────────────────────────┘
```

### 7.3 搜索界面

```
┌─────────────────────────────────────────────────────────┐
│  🔍 [输入自然语言搜索...]        [语义搜索] [AI问答]     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  AI回答（AI问答模式）:                                    │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 根据您的知识库，关于xxx的信息如下：               │    │
│  │ 1. ...                                          │    │
│  │ 2. ...                                          │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  相关文章:                                               │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 📄 文章标题 | 笔记本名 | 相关度 95%              │    │
│  │ "...匹配的文本片段高亮显示..."                     │    │
│  └─────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 📄 文章标题 | 笔记本名 | 相关度 87%              │    │
│  │ "...匹配的文本片段高亮显示..."                     │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### 7.4 配色方案

```
主色调:   #10B981 (Emerald 绿，类似 Evernote)
背景色:   #FFFFFF (主内容) / #F9FAFB (侧边栏)
文字色:   #111827 (标题) / #6B7280 (次要文字)
边框色:   #E5E7EB
强调色:   #3B82F6 (链接/搜索)
危险色:   #EF4444 (删除)
```

### 7.5 响应式设计

- **桌面 (≥1024px)**: 三栏布局
- **平板 (768-1023px)**: 双栏（侧边栏可折叠）
- **手机 (<768px)**: 单栏，底部导航

## 8. 向量化与搜索方案

### 8.1 文本分块策略

```
分块大小: 500 字符
重叠区域: 100 字符
步进: 400 字符

示例（3000字文章）:
  块1: [0, 500]
  块2: [400, 900]
  块3: [800, 1300]
  ...
  块7: [2400, 2900]
  块8: [2800, 3000]  ← 最后一块可能较短
```

- 重叠确保跨分块的语义信息不会丢失
- 每块附带元数据：`{ article_id, notebook_id, user_id, chunk_index }`

### 8.2 向量化流程（保存文章时自动触发）

```
1. 文章保存到 D1
2. 计算 content_hash（SHA-256）
3. 对比已有 hash，内容未变则跳过（节省 neurons）
4. 删除该文章旧的向量（Vectorize）和分块记录（D1）
5. 文本分块
6. 批量调用 Workers AI 嵌入模型
7. 批量上传向量到 Vectorize（附带元数据）
8. 保存分块记录到 D1
9. 更新文章 is_vectorized = 1
```

### 8.3 搜索流程

**语义搜索（默认，低消耗）：**
```
1. 将搜索查询文本发送到 Workers AI 嵌入模型
2. 用嵌入向量查询 Vectorize（topK=10）
3. 根据返回的 article_id 从 D1 获取文章信息
4. 返回匹配文章列表及相关度分数和匹配片段
```

**AI问答（可选，消耗 LLM neurons）：**
```
1-3. 同语义搜索
4. 获取 top 5 匹配分块的原文
5. 构造 prompt：系统提示 + 上下文分块 + 用户问题
6. 调用 Workers AI LLM 生成回答
7. 返回 AI 回答 + 参考文章列表
```

### 8.4 LLM Prompt 设计（最小化 token 消耗）

```
System: 你是知识库助手。根据以下参考内容简洁回答问题。仅使用参考内容中的信息，不要编造。若无法回答请说明。

参考内容:
[1] {chunk_text_1}
[2] {chunk_text_2}
...

问题: {user_query}
```

- 系统提示固定且简短（约30 tokens）
- 仅传递 top 5 相关分块作为上下文
- 限制 LLM 回答 `max_tokens: 300`

## 9. 项目结构

```
cfnote/
├── public/
│   └── favicon.ico
├── src/                          # React 前端
│   ├── components/
│   │   ├── Layout.tsx            # 三栏主布局
│   │   ├── Sidebar.tsx           # 左侧笔记本列表
│   │   ├── ArticleList.tsx       # 中间文章列表
│   │   ├── ArticleEditor.tsx     # 右侧编辑/阅读
│   │   ├── SearchPanel.tsx       # 搜索界面
│   │   ├── SetupPage.tsx         # 初始化页面
│   │   └── LoginPage.tsx         # 登录页面
│   ├── hooks/
│   │   ├── useAuth.ts            # 认证状态管理
│   │   └── useApi.ts             # API 请求封装
│   ├── types.ts                  # TypeScript 类型定义
│   ├── App.tsx                   # 路由和全局状态
│   ├── main.tsx                  # 入口
│   └── index.css                 # Tailwind 引入
├── functions/                    # Cloudflare Pages Functions (API)
│   └── api/
│       ├── _middleware.ts        # 认证中间件
│       ├── status.ts             # GET /api/status
│       ├── init.ts               # POST /api/init
│       ├── auth/
│       │   ├── register.ts       # POST /api/auth/register
│       │   └── login.ts          # POST /api/auth/login
│       ├── notebooks/
│       │   ├── index.ts          # GET/POST /api/notebooks
│       │   └── [id].ts           # PUT/DELETE /api/notebooks/:id
│       ├── articles/
│       │   ├── index.ts          # POST /api/articles
│       │   └── [id].ts           # GET/PUT/DELETE /api/articles/:id
│       ├── notebooks/
│       │   └── [id]/
│       │       └── articles.ts   # GET /api/notebooks/:id/articles
│       └── search/
│           ├── index.ts          # POST /api/search（语义搜索）
│           └── ai.ts             # POST /api/search/ai（AI问答）
├── schema.sql                    # 数据库建表脚本
├── package.json
├── wrangler.toml                 # Cloudflare 配置
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── .gitignore
```

## 10. Cloudflare 资源配置（wrangler.toml）

```toml
name = "cfnote"
compatibility_date = "2024-09-23"
pages_build_output_dir = "dist"

[[d1_databases]]
binding = "DB"
database_name = "cfnote-db"
database_id = "<创建后填入>"

[[vectorize]]
binding = "VECTORIZE"
index_name = "cfnote-index"

[ai]
binding = "AI"
```

需要通过 CLI 创建的资源：
```bash
# 创建 D1 数据库
wrangler d1 create cfnote-db

# 创建 Vectorize 索引（768维，cosine相似度）
wrangler vectorize create cfnote-index --dimensions=768 --metric=cosine
```

## 11. 实施步骤

### 第一阶段：项目初始化
1. 初始化项目：`npm create cloudflare@latest -- cfnote --framework=react`
2. 安装依赖：`tailwindcss`, `marked`, `react-router-dom`
3. 配置 Tailwind CSS
4. 配置 `wrangler.toml`
5. 创建 Cloudflare 资源（D1 数据库、Vectorize 索引）

### 第二阶段：后端 API 开发
1. 编写 TypeScript 类型定义和工具函数（JWT、密码哈希、分块）
2. 实现系统初始化 API（`/api/status`, `/api/init`）
3. 实现认证 API（注册、登录、中间件）
4. 实现笔记本 CRUD API
5. 实现文章 CRUD API + 自动向量化
6. 实现搜索 API（语义搜索 + AI问答）

### 第三阶段：前端开发
1. 实现路由和全局状态管理
2. 开发初始化/注册页面
3. 开发登录页面
4. 开发三栏主布局（Evernote 风格）
5. 开发笔记本侧边栏
6. 开发文章列表
7. 开发文章编辑器（Markdown 编辑/预览）
8. 开发搜索界面

### 第四阶段：集成与部署
1. 本地联调测试（`wrangler pages dev`）
2. 修复问题，优化体验
3. 部署到 Cloudflare Pages
4. 配置自定义域名（可选）

## 12. 初始化流程

```
用户首次访问
  │
  ▼
GET /api/status ──→ 检查 users 表是否存在
  │
  ├─ 未初始化 ──→ 显示"欢迎使用"页面
  │                  │
  │                  ▼
  │              点击"初始化系统"
  │                  │
  │                  ▼
  │              POST /api/init ──→ 创建所有表
  │                  │
  │                  ▼
  │              显示注册表单
  │                  │
  │                  ▼
  │              POST /api/auth/register
  │                  │
  │                  ▼
  │              自动登录 ──→ 进入主界面
  │
  └─ 已初始化 ──→ 检查登录状态
                    │
                    ├─ 未登录 ──→ 登录页面
                    └─ 已登录 ──→ 主界面
```

## 13. 注意事项

1. **Workers CPU 10ms 限制**：所有 AI/DB 调用都是 I/O 等待，不计入 CPU 时间，实际 CPU 操作（JSON 解析、字符串处理）远低于 10ms，无需担心。

2. **内容哈希去重**：保存文章时计算 content_hash，仅内容实际变化时才重新向量化，避免重复消耗 neurons。

3. **批量嵌入**：Workers AI 支持批量文本嵌入（一次传入多个文本），减少请求次数。

4. **搜索模式分离**：默认使用语义搜索（仅消耗嵌入 neurons），AI问答为可选功能，用户主动触发才消耗 LLM neurons。

5. **安全性**：
   - 密码使用 PBKDF2 + 随机盐值哈希存储
   - JWT secret 存储为 Cloudflare Secret，不硬编码
   - 所有 API 通过中间件验证 JWT
   - 私人系统，注册功能在初始化后可关闭

6. **删除级联**：删除笔记本时级联删除文章、分块记录，并清除 Vectorize 中的对应向量。
