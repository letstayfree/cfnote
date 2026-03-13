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
│   │   ├── init.ts            # POST /api/init
│   │   ├── auth/
│   │   │   ├── register.ts    # POST /api/auth/register
│   │   │   └── login.ts       # POST /api/auth/login
│   │   ├── notebooks/
│   │   │   ├── index.ts       # GET/POST /api/notebooks
│   │   │   ├── [id].ts        # PUT/DELETE /api/notebooks/:id
│   │   │   └── [id]/
│   │   │       └── articles.ts # GET /api/notebooks/:id/articles
│   │   ├── articles/
│   │   │   ├── index.ts       # POST /api/articles（含向量化）
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
│   │   └── SearchPanel.tsx    # 搜索面板
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
