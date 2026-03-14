import { ok, err } from '../_utils'
import type { Env } from '../../../src/types'

// GET /api/conversations/:id - Get conversation with messages
export const onRequestGet: PagesFunction<Env> = async ({ params, env, data }) => {
  const user = (data as any).user
  const id = Number(params.id)
  try {
    const conversation = await env.DB.prepare(
      'SELECT * FROM conversations WHERE id = ? AND user_id = ?'
    ).bind(id, user.id).first()

    if (!conversation) return err('对话不存在', 404)

    const rows = await env.DB.prepare(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
    ).bind(id).all()

    const messages = rows.results.map((m: any) => ({
      ...m,
      sources: m.sources ? JSON.parse(m.sources) : null,
    }))

    return ok({ conversation, messages })
  } catch (e: any) {
    return err('获取对话失败: ' + e.message, 500)
  }
}

// DELETE /api/conversations/:id - Delete conversation
export const onRequestDelete: PagesFunction<Env> = async ({ params, env, data }) => {
  const user = (data as any).user
  const id = Number(params.id)
  try {
    const conversation = await env.DB.prepare(
      'SELECT id FROM conversations WHERE id = ? AND user_id = ?'
    ).bind(id, user.id).first()

    if (!conversation) return err('对话不存在', 404)

    await env.DB.batch([
      env.DB.prepare('DELETE FROM messages WHERE conversation_id = ?').bind(id),
      env.DB.prepare('DELETE FROM conversations WHERE id = ?').bind(id),
    ])

    return ok()
  } catch (e: any) {
    return err('删除对话失败: ' + e.message, 500)
  }
}
