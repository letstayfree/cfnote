import { ok, err } from '../_utils'
import type { Env } from '../../../src/types'

// GET /api/conversations - List conversations
export const onRequestGet: PagesFunction<Env> = async ({ env, data }) => {
  const user = (data as any).user
  try {
    const rows = await env.DB.prepare(
      'SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50'
    ).bind(user.id).all()
    return ok(rows.results)
  } catch (e: any) {
    return err('获取对话列表失败: ' + e.message, 500)
  }
}

// POST /api/conversations - Create new conversation
export const onRequestPost: PagesFunction<Env> = async ({ env, data }) => {
  const user = (data as any).user
  try {
    const result = await env.DB.prepare(
      'INSERT INTO conversations (user_id) VALUES (?)'
    ).bind(user.id).run()

    const conversation = await env.DB.prepare(
      'SELECT * FROM conversations WHERE id = ?'
    ).bind(result.meta.last_row_id).first()

    return ok(conversation)
  } catch (e: any) {
    return err('创建对话失败: ' + e.message, 500)
  }
}
