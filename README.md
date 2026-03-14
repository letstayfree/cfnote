# CFNote - 私人知识库系统

基于 Cloudflare 全栈基础设施构建的私人知识库，支持笔记本管理、Markdown 文章编辑、自动向量化和自然语言语义搜索。全程不依赖第三方 LLM API，所有 AI 能力由 Cloudflare Workers AI 提供，设计在免费额度内运行。

## 技术架构

```
┌──────────────────────────────────────────────┐
│              Cloudflare Pages                │
│                                              │
│   React + Tailwind CSS (SPA)                 │
│   ┌────────┐ ┌──────────┐ ┌──────────────┐  │
│   │ 笔记本  │ │ 文章列表  │ │ Markdown编辑 │  │
│   │ 侧边栏  │ │          │ │ / 预览       │  │
│   └────────┘ └──────────┘ └──────────────┘  │
│                    │                         │
│         Pages Functions (API)                │
│                    │                         │
│      ┌─────────┬───┴────┬────────────┐       │
│      │   D1    │Vectorize│ Workers AI │       │
│      │ SQLite  │ 向量索引 │ 嵌入 + LLM │       │
│      └─────────┴────────┴────────────┘       │
└──────────────────────────────────────────────┘
```

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + TypeScript + Tailwind CSS 4 + Vite 6 |
| 后端 | Cloudflare Pages Functions |
| 数据库 | Cloudflare D1 (边缘 SQLite) |
| 向量搜索 | Cloudflare Vectorize (1024维, cosine) |
| 嵌入模型 | `@cf/baai/bge-m3` (多语言) |
| 文本生成 | `@cf/meta/llama-3.1-8b-instruct` |

## 核心功能

- **笔记本管理**：创建/删除笔记本，每个笔记本包含多篇文章
- **Markdown 编辑**：编辑模式 + 预览模式切换，3秒无操作自动保存
- **自动向量化**：文章保存后自动分块（500字/块）→ 嵌入 → 存入 Vectorize
- **语义搜索**：基于向量相似度的自然语言搜索，不消耗 LLM 额度
- **AI 问答**：可选功能，基于检索内容由 LLM 生成回答
- **URL 导入**：通过 Jina Reader 抓取网页内容并自动向量化入库
- **统计仪表盘**：实时查看知识库规模、Workers AI 额度消耗、向量存储使用率和调用次数趋势
- **首次初始化引导**：自动检测系统状态，引导创建数据库和用户

## 免费额度适配

以 200 篇 3000 字文章、每日 100 次搜索为基准：

| 资源 | 消耗 | 免费额度 | 占比 |
|------|------|---------|------|
| 向量存储 | 1,433,600 维 | 5,000,000 维 | 28.7% |
| 向量查询 | 3,072,000 维/月 | 30,000,000 维/月 | 10.2% |
| Workers AI | ~215 neurons/天 | 10,000 neurons/天 | 2.15% |
| D1 读写 | <5,000 行/天 | 5,000,000 读 + 100,000 写/天 | <0.1% |

## 部署

### 前置要求

- [Node.js](https://nodejs.org/) >= 20
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`npm install -g wrangler`)
- Cloudflare 账号（免费即可）

### 第一步：登录 Cloudflare

```bash
wrangler login
```

浏览器会打开授权页面，点击允许即可。

### 第二步：创建云端资源

```bash
# 创建 D1 数据库
wrangler d1 create cfnote-db
```

命令输出会包含 `database_id`，将其填入 `wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "cfnote-db"
database_id = "<这里替换为实际的 database_id>"
```

```bash
# 创建 Vectorize 向量索引
wrangler vectorize create cfnote-index --dimensions=1024 --metric=cosine
```

```bash
# 设置 JWT 密钥（输入一个随机字符串作为密钥）
wrangler pages secret put JWT_SECRET
```

### 第三步：安装依赖并部署

```bash
npm install
npm run deploy
```

`npm run deploy` 会依次执行 TypeScript 编译 → Vite 构建 → 部署到 Cloudflare Pages。

部署成功后会输出访问地址（形如 `https://cfnote.pages.dev`）。

### 第四步：首次访问

打开部署地址，系统会自动检测到未初始化状态，引导你完成：

1. 点击「初始化系统」—— 自动创建数据库表
2. 填写用户名和密码 —— 创建管理员账户
3. 自动登录进入主界面

## 统计仪表盘

点击顶栏右侧的柱状图图标打开统计面板，可查看：

- **概览卡片**：笔记本数、文章数、已索引文章数、向量存储使用率
- **Workers AI 额度**：今日 neurons 消耗进度条、按模型细分、近7天趋势图
- **使用量统计**：搜索/AI问答 的今日/7天/累计调用次数，以及向量化、导入次数
- **7天趋势**：纯 CSS 柱状图，展示近7天搜索和AI问答的调用走势

### 环境变量（可选）

统计面板中的 Workers AI 额度数据来自 Cloudflare GraphQL Analytics API，需配置以下环境变量才能显示，未配置时面板其余部分仍可正常工作：

| 变量 | 必需 | 说明 |
|------|------|------|
| `CF_API_TOKEN` | 可选 | Cloudflare API Token，需包含 `Account Analytics: Read` 权限 |
| `CF_ACCOUNT_ID` | 可选 | Cloudflare 账户 ID（在仪表盘首页 URL 中可找到） |

设置方式：

```bash
wrangler pages secret put CF_API_TOKEN
wrangler pages secret put CF_ACCOUNT_ID
```

### 统计接口 `GET /api/stats`

需认证（Bearer Token），无请求参数。返回结构如下：

```jsonc
{
  // ---- 内容统计 ----
  "notebooks": 5,               // 笔记本总数
  "articles": 42,               // 文章总数
  "articles_vectorized": 38,    // 已向量化文章数

  // ---- 向量存储 ----
  "vectors_count": 156,         // 当前存储的向量数（来自 Vectorize.describe()）
  "vectors_limit": 4882,        // 免费额度上限（5,000,000 维 ÷ 1024 维/向量）
  "vector_usage_percent": 3.2,  // 使用百分比

  // ---- Workers AI 用量（CF GraphQL API，未配置时为 null）----
  "ai_usage": {
    "neurons_today": 215,       // 今日已消耗 neurons
    "neurons_limit": 10000,     // 每日免费上限
    "models": [                 // 按模型细分
      {
        "modelId": "@cf/baai/bge-m3",
        "count": 12,            // 调用次数
        "neurons": 80,          // 消耗 neurons
        "inputTokens": 5600,    // 输入 token 数
        "outputTokens": 0       // 输出 token 数
      }
    ],
    "daily": [                  // 近7天每日趋势
      { "date": "2026-03-08", "neurons": 180, "count": 10 }
    ]
  },

  // ---- 调用次数统计（D1 usage_logs 自行追踪）----
  "usage": {
    "search_today": 8,          // 语义搜索 — 今日
    "search_7d": 45,            // 语义搜索 — 近7天
    "search_total": 320,        // 语义搜索 — 累计
    "ai_qa_today": 3,           // AI问答 — 今日
    "ai_qa_7d": 18,             // AI问答 — 近7天
    "ai_qa_total": 95,          // AI问答 — 累计
    "vectorize_total": 42,      // 向量化 — 累计
    "import_total": 6           // URL导入 — 累计
  },

  // ---- 7天趋势 ----
  "daily_trend": [
    { "date": "2026-03-08", "search": 5, "ai_qa": 2 },
    { "date": "2026-03-09", "search": 8, "ai_qa": 1 }
    // ...共7天
  ]
}
```

#### TypeScript 类型定义

```typescript
interface Stats {
  notebooks: number
  articles: number
  articles_vectorized: number
  vectors_count: number
  vectors_limit: number
  vector_usage_percent: number
  ai_usage: StatsAiUsage | null
  usage: StatsUsage
  daily_trend: { date: string; search: number; ai_qa: number }[]
}

interface StatsAiUsage {
  neurons_today: number
  neurons_limit: number
  models: StatsAiModel[]
  daily: { date: string; neurons: number; count: number }[]
}

interface StatsAiModel {
  modelId: string
  count: number
  neurons: number
  inputTokens: number
  outputTokens: number
}

interface StatsUsage {
  search_today: number
  search_7d: number
  search_total: number
  ai_qa_today: number
  ai_qa_7d: number
  ai_qa_total: number
  vectorize_total: number
  import_total: number
}
```

### 数据库表 `usage_logs`

统计面板中的调用次数数据来自 `usage_logs` 表，各接口在成功执行后自动写入日志（fire-and-forget，不影响主请求性能）：

| 接口 | action 值 | 触发时机 |
|------|----------|---------|
| `POST /api/search` | `search` | 语义搜索成功返回结果后 |
| `POST /api/search/ai` | `ai_qa` | AI问答成功生成回答后 |
| `POST /api/articles` 向量化 | `vectorize` | 文章向量化成功写入 Vectorize 后 |
| `POST /api/articles/import` | `import` | URL导入文章成功后 |

建表语句（已包含在 `POST /api/init` 初始化流程中）：

```sql
CREATE TABLE IF NOT EXISTS usage_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  action TEXT NOT NULL,       -- 'search' | 'ai_qa' | 'vectorize' | 'import'
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_action ON usage_logs(user_id, action, created_at);
```

## 开发与调试

### 前端开发（仅 UI，无后端）

```bash
npm run dev
```

启动 Vite 开发服务器（默认 `http://localhost:5173`），支持 HMR 热更新。适合纯 UI 调试，API 请求需要后端运行。

### 全栈本地开发（推荐）

```bash
npm run build
npm run preview
```

`npm run preview` 实际执行 `wrangler pages dev dist`，会在本地模拟完整的 Cloudflare Pages 环境，包括 D1、Vectorize、Workers AI 绑定。默认地址 `http://localhost:8788`。

> 注意：本地 D1 使用 `.wrangler/` 目录下的 SQLite 文件，与线上数据库独立。本地环境下 Vectorize 和 Workers AI 需要联网访问 Cloudflare 服务。

### 类型检查

```bash
npx tsc --noEmit
```

### 构建

```bash
npm run build
```

输出到 `dist/` 目录。

## 项目结构

```
cfnote/
├── functions/                  # 后端 Pages Functions
│   ├── api/
│   │   ├── _middleware.ts      # JWT 认证中间件
│   │   ├── _utils.ts          # 工具函数（JWT/哈希/分块）
│   │   ├── status.ts          # GET  /api/status
│   │   ├── init.ts            # POST /api/init（建表，含 usage_logs）
│   │   ├── auth/
│   │   │   ├── register.ts    # POST /api/auth/register
│   │   │   └── login.ts       # POST /api/auth/login
│   │   ├── notebooks/
│   │   │   ├── index.ts       # GET/POST /api/notebooks
│   │   │   ├── [id].ts        # PUT/DELETE /api/notebooks/:id
│   │   │   └── [id]/
│   │   │       └── articles.ts # GET /api/notebooks/:id/articles
│   │   ├── stats.ts           # GET  /api/stats（统计仪表盘）
│   │   ├── articles/
│   │   │   ├── index.ts       # POST /api/articles（含向量化）
│   │   │   ├── import.ts      # POST /api/articles/import（URL导入）
│   │   │   └── [id].ts        # GET/PUT/DELETE /api/articles/:id
│   │   └── search/
│   │       ├── index.ts       # POST /api/search（语义搜索）
│   │       └── ai.ts          # POST /api/search/ai（AI问答）
├── src/                        # 前端 React SPA
│   ├── components/
│   │   ├── SetupPage.tsx      # 初始化 + 注册引导
│   │   ├── LoginPage.tsx      # 登录页
│   │   ├── Layout.tsx         # 三栏主布局
│   │   ├── Sidebar.tsx        # 笔记本侧边栏
│   │   ├── ArticleList.tsx    # 文章列表
│   │   ├── ArticleEditor.tsx  # Markdown 编辑/预览
│   │   ├── SearchPanel.tsx    # 搜索面板
│   │   ├── StatsPanel.tsx     # 统计仪表盘面板
│   │   └── ImportDialog.tsx   # URL导入对话框
│   ├── hooks/
│   │   ├── useAuth.ts         # 登录状态管理
│   │   └── useApi.ts          # API 请求封装
│   ├── types.ts               # TypeScript 类型
│   ├── App.tsx                # 应用入口 + 路由
│   ├── main.tsx               # React 挂载
│   └── index.css              # Tailwind 入口
├── schema.sql                  # D1 建表脚本（参考）
├── wrangler.toml               # Cloudflare 绑定配置
├── vite.config.ts
├── tsconfig.json
└── package.json
```
