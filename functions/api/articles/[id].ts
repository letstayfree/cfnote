import { ok, err, contentHash } from '../_utils'
import { vectorizeArticle } from './index'
import type { Env } from '../../../src/types'

// GET /api/articles/:id - Get article detail
export const onRequestGet: PagesFunction<Env> = async ({ params, env, data }) => {
  const user = (data as any).user
  const id = params.id as string
  try {
    const article = await env.DB.prepare('SELECT * FROM articles WHERE id = ? AND user_id = ?')
      .bind(id, user.id).first()
    if (!article) return err('文章不存在', 404)
    return ok(article)
  } catch (e: any) {
    return err('获取失败: ' + e.message, 500)
  }
}

// PUT /api/articles/:id - Update article
export const onRequestPut: PagesFunction<Env> = async ({ params, request, env, data }) => {
  const user = (data as any).user
  const id = params.id as string
  try {
    const { title, content, notebook_id } = await request.json<{
      title?: string; content?: string; notebook_id?: number
    }>()

    const article = await env.DB.prepare('SELECT * FROM articles WHERE id = ? AND user_id = ?')
      .bind(id, user.id).first<any>()
    if (!article) return err('文章不存在', 404)

    // If moving to another notebook, verify ownership
    if (notebook_id && notebook_id !== article.notebook_id) {
      const nb = await env.DB.prepare('SELECT id FROM notebooks WHERE id = ? AND user_id = ?')
        .bind(notebook_id, user.id).first()
      if (!nb) return err('目标笔记本不存在', 404)
      // Update counts
      await env.DB.batch([
        env.DB.prepare('UPDATE notebooks SET article_count = article_count - 1, updated_at = datetime(\'now\') WHERE id = ?').bind(article.notebook_id),
        env.DB.prepare('UPDATE notebooks SET article_count = article_count + 1, updated_at = datetime(\'now\') WHERE id = ?').bind(notebook_id),
      ])
    }

    const newTitle = title?.trim() || article.title
    const newContent = content ?? article.content
    const newNotebook = notebook_id || article.notebook_id
    const newHash = await contentHash(newContent)

    await env.DB.prepare(
      "UPDATE articles SET title = ?, content = ?, content_hash = ?, notebook_id = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(newTitle, newContent, newHash, newNotebook, id).run()

    // Re-vectorize if content changed
    if (newHash !== article.content_hash) {
      // Delete old vectors and chunks
      const { results: oldChunks } = await env.DB.prepare('SELECT vector_id FROM chunks WHERE article_id = ?')
        .bind(id).all<{ vector_id: string }>()
      if (oldChunks.length > 0) {
        await env.VECTORIZE.deleteByIds(oldChunks.map((c) => c.vector_id))
      }
      await env.DB.prepare('DELETE FROM chunks WHERE article_id = ?').bind(id).run()
      await env.DB.prepare('UPDATE articles SET is_vectorized = 0 WHERE id = ?').bind(id).run()

      if (newContent.trim().length > 0) {
        await vectorizeArticle(env, Number(id), user.id, newNotebook, newTitle, newContent)
      }
    }

    const updated = await env.DB.prepare('SELECT * FROM articles WHERE id = ?').bind(id).first()
    return ok(updated)
  } catch (e: any) {
    return err('更新失败: ' + e.message, 500)
  }
}

// DELETE /api/articles/:id - Delete article
export const onRequestDelete: PagesFunction<Env> = async ({ params, env, data }) => {
  const user = (data as any).user
  const id = params.id as string
  try {
    const article = await env.DB.prepare('SELECT * FROM articles WHERE id = ? AND user_id = ?')
      .bind(id, user.id).first<any>()
    if (!article) return err('文章不存在', 404)

    // Delete vectors
    const { results: chunks } = await env.DB.prepare('SELECT vector_id FROM chunks WHERE article_id = ?')
      .bind(id).all<{ vector_id: string }>()
    if (chunks.length > 0) {
      await env.VECTORIZE.deleteByIds(chunks.map((c) => c.vector_id))
    }

    // D1 cascade handles chunks
    await env.DB.prepare('DELETE FROM articles WHERE id = ?').bind(id).run()

    // Update notebook count
    await env.DB.prepare(
      "UPDATE notebooks SET article_count = article_count - 1, updated_at = datetime('now') WHERE id = ?"
    ).bind(article.notebook_id).run()

    return ok({ message: '已删除' })
  } catch (e: any) {
    return err('删除失败: ' + e.message, 500)
  }
}
