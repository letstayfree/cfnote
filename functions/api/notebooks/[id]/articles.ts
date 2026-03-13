import { ok, err } from '../../_utils'

// GET /api/notebooks/:id/articles - List articles in a notebook
export const onRequestGet: PagesFunction<{ DB: D1Database }> = async ({ params, env, data }) => {
  const user = (data as any).user
  const notebookId = params.id as string
  try {
    // Verify notebook belongs to user
    const nb = await env.DB.prepare('SELECT id FROM notebooks WHERE id = ? AND user_id = ?')
      .bind(notebookId, user.id).first()
    if (!nb) return err('笔记本不存在', 404)

    const { results } = await env.DB.prepare(
      `SELECT id, notebook_id, title,
              SUBSTR(content, 1, 150) as summary,
              is_vectorized, created_at, updated_at
       FROM articles WHERE notebook_id = ? ORDER BY updated_at DESC`
    ).bind(notebookId).all()
    return ok(results)
  } catch (e: any) {
    return err('获取文章列表失败: ' + e.message, 500)
  }
}
