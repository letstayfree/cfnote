import { ok, err, contentHash } from '../_utils'
import { vectorizeArticle } from './index'
import type { Env } from '../../../src/types'

// POST /api/articles/import - Import article from URL via Jina Reader
export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = (data as any).user
  try {
    const { url, notebook_id } = await request.json<{ url: string; notebook_id: number }>()
    if (!url?.trim()) return err('URL 不能为空')
    if (!notebook_id) return err('请选择笔记本')

    // Verify notebook belongs to user
    const nb = await env.DB.prepare('SELECT id FROM notebooks WHERE id = ? AND user_id = ?')
      .bind(notebook_id, user.id).first()
    if (!nb) return err('笔记本不存在', 404)

    // Fetch article content via Jina Reader API
    const jinaHeaders: Record<string, string> = {
      'Accept': 'application/json',
      'X-Return-Format': 'markdown',
    }
    // Optional: use API key for higher rate limits
    const jinaKey = (env as any).JINA_API_KEY
    if (jinaKey) {
      jinaHeaders['Authorization'] = `Bearer ${jinaKey}`
    }

    const jinaUrl = `https://r.jina.ai/${url.trim()}`
    const jinaRes = await fetch(jinaUrl, { headers: jinaHeaders })

    if (!jinaRes.ok) {
      return err(`文章获取失败 (HTTP ${jinaRes.status})`, 502)
    }

    let articleTitle: string
    let articleContent: string

    const contentType = jinaRes.headers.get('Content-Type') || ''
    if (contentType.includes('application/json')) {
      // JSON response — parse structured data
      const jinaData = await jinaRes.json() as any
      articleTitle = jinaData.data?.title || jinaData.title || new URL(url).hostname
      articleContent = jinaData.data?.content || jinaData.content || ''
    } else {
      // Non-JSON (HTML/text) — Jina returned plain text/markdown directly
      const text = await jinaRes.text()
      if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
        return err('Jina Reader 无法抓取该页面（目标网站可能阻止了抓取）')
      }
      // Extract title from first markdown heading or use hostname
      const headingMatch = text.match(/^#\s+(.+)$/m)
      articleTitle = headingMatch?.[1]?.trim() || new URL(url).hostname
      articleContent = text
    }

    if (!articleContent.trim()) {
      return err('未能从该页面提取到有效内容')
    }

    // Create article
    const hash = await contentHash(articleContent)
    const result = await env.DB.prepare(
      'INSERT INTO articles (notebook_id, user_id, title, content, content_hash) VALUES (?, ?, ?, ?, ?)'
    ).bind(notebook_id, user.id, articleTitle.trim(), articleContent, hash).run()

    const articleId = result.meta.last_row_id

    // Update notebook count
    await env.DB.prepare(
      'UPDATE notebooks SET article_count = article_count + 1, updated_at = datetime(\'now\') WHERE id = ?'
    ).bind(notebook_id).run()

    // Vectorize
    let vectorize_error: string | null = null
    if (articleContent.trim().length > 0) {
      vectorize_error = await vectorizeArticle(env, articleId as number, user.id, notebook_id, articleTitle.trim(), articleContent)
    }

    // Fire-and-forget usage log
    env.DB.prepare('INSERT INTO usage_logs (user_id, action) VALUES (?, ?)').bind(user.id, 'import').run().catch(() => {})

    const article = await env.DB.prepare('SELECT * FROM articles WHERE id = ?').bind(articleId).first()
    return ok({ ...article as any, vectorize_error })
  } catch (e: any) {
    return err('导入失败: ' + e.message, 500)
  }
}
