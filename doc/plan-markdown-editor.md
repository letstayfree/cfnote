# 实现计划：Markdown 编辑器增强 + URL 导入文章

## 背景

当前编辑器是一个纯 textarea + 独立预览 tab，缺少格式化工具栏和 URL 导入功能。

## 改动内容

### 一、Markdown 格式化工具栏

在编辑模式的 textarea 上方添加一行工具栏按钮：

| 按钮 | 功能 | 插入的 Markdown |
|------|------|----------------|
| **B** | 加粗 | `**文本**` |
| *I* | 斜体 | `*文本*` |
| ~~S~~ | 删除线 | `~~文本~~` |
| H1 / H2 / H3 | 标题 | `# ` / `## ` / `### ` |
| 无序列表 | 列表 | `- 列表项` |
| 有序列表 | 列表 | `1. 列表项` |
| 链接 | 插入链接 | `[文本](url)` |
| 代码 | 行内代码 | `` `代码` `` |
| 代码块 | 代码围栏 | ` ```\n代码\n``` ` |
| 引用 | 块引用 | `> 文本` |
| 分割线 | 水平线 | `---` |

实现方式：编写 `insertMarkdown(textarea, prefix, suffix)` 工具函数，获取当前光标选区，包裹选中文本或插入默认文本，更新 React state 后恢复光标位置。无需新增依赖。

修改文件：`src/components/ArticleEditor.tsx`

### 二、优化 Markdown 预览样式

补充代码块（深色背景+圆角）、表格（边框+条纹行）、引用（左边框+灰色背景）、行内代码（浅色背景）等样式。

修改文件：`src/index.css`

### 三、粘贴 HTML 自动转 Markdown

监听 textarea 的 paste 事件，检查剪贴板 `text/html`，使用 Turndown（~30KB）转换为 Markdown 插入。

新增依赖：`turndown`
修改文件：`src/components/ArticleEditor.tsx`

### 四、URL 导入文章

使用 Jina Reader API（`r.jina.ai`），免费额度充足（无 Key 20 RPM，注册 Key 200 RPM + 100万 tokens）。

- 后端：`POST /api/articles/import` 调用 Jina → 创建文章 → 向量化
- 前端：文章列表新增「导入」按钮，弹出对话框输入 URL

新增文件：`functions/api/articles/import.ts`、`src/components/ImportDialog.tsx`
修改文件：`src/components/ArticleList.tsx`、`src/components/Layout.tsx`

## 文件改动汇总

| 文件 | 操作 |
|------|------|
| `src/components/ArticleEditor.tsx` | 修改 — 工具栏 + 粘贴转换 |
| `src/index.css` | 修改 — 预览样式增强 |
| `src/components/ArticleList.tsx` | 修改 — 添加导入按钮 |
| `src/components/ImportDialog.tsx` | 新增 — URL 导入对话框 |
| `src/components/Layout.tsx` | 修改 — 导入文章处理函数 |
| `functions/api/articles/import.ts` | 新增 — 后端导入接口 |
| `package.json` | 修改 — 新增 turndown 依赖 |
