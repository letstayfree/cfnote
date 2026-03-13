import { ok, err } from '../_utils'

// PUT /api/notebooks/:id - Update notebook
export const onRequestPut: PagesFunction<{ DB: D1Database }> = async ({ params, request, env, data }) => {
  const user = (data as any).user
  const id = params.id as string
  try {
    const { name, description, color } = await request.json<{ name?: string; description?: string; color?: string }>()
    const notebook = await env.DB.prepare('SELECT * FROM notebooks WHERE id = ? AND user_id = ?')
      .bind(id, user.id).first()
    if (!notebook) return err('笔记本不存在', 404)

    await env.DB.prepare(
      "UPDATE notebooks SET name = COALESCE(?, name), description = COALESCE(?, description), color = COALESCE(?, color), updated_at = datetime('now') WHERE id = ?"
    ).bind(name || null, description ?? null, color || null, id).run()

    const updated = await env.DB.prepare('SELECT * FROM notebooks WHERE id = ?').bind(id).first()
    return ok(updated)
  } catch (e: any) {
    return err('更新失败: ' + e.message, 500)
  }
}

// DELETE /api/notebooks/:id - Delete notebook (cascade delete articles + vectors)
export const onRequestDelete: PagesFunction<{ DB: D1Database; VECTORIZE: VectorizeIndex }> = async ({ params, env, data }) => {
  const user = (data as any).user
  const id = params.id as string
  try {
    const notebook = await env.DB.prepare('SELECT * FROM notebooks WHERE id = ? AND user_id = ?')
      .bind(id, user.id).first()
    if (!notebook) return err('笔记本不存在', 404)

    // Get all vector IDs for articles in this notebook
    const { results: chunks } = await env.DB.prepare(
      'SELECT c.vector_id FROM chunks c INNER JOIN articles a ON c.article_id = a.id WHERE a.notebook_id = ?'
    ).bind(id).all<{ vector_id: string }>()

    // Delete vectors from Vectorize in batches
    if (chunks.length > 0) {
      const vectorIds = chunks.map((c) => c.vector_id)
      for (let i = 0; i < vectorIds.length; i += 100) {
        await env.VECTORIZE.deleteByIds(vectorIds.slice(i, i + 100))
      }
    }

    // D1 cascade will handle articles and chunks
    await env.DB.prepare('DELETE FROM notebooks WHERE id = ?').bind(id).run()
    return ok({ message: '已删除' })
  } catch (e: any) {
    return err('删除失败: ' + e.message, 500)
  }
}
