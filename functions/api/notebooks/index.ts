import { ok, err } from '../_utils'

// GET /api/notebooks - List user's notebooks
export const onRequestGet: PagesFunction<{ DB: D1Database }> = async ({ env, data }) => {
  const user = (data as any).user
  try {
    const { results } = await env.DB.prepare(
      'SELECT * FROM notebooks WHERE user_id = ? ORDER BY updated_at DESC'
    ).bind(user.id).all()
    return ok(results)
  } catch (e: any) {
    return err('获取笔记本失败: ' + e.message, 500)
  }
}

// POST /api/notebooks - Create notebook
export const onRequestPost: PagesFunction<{ DB: D1Database }> = async ({ request, env, data }) => {
  const user = (data as any).user
  try {
    const { name, description, color } = await request.json<{ name: string; description?: string; color?: string }>()
    if (!name?.trim()) return err('笔记本名称不能为空')

    const result = await env.DB.prepare(
      'INSERT INTO notebooks (user_id, name, description, color) VALUES (?, ?, ?, ?)'
    ).bind(user.id, name.trim(), description || '', color || '#10B981').run()

    const notebook = await env.DB.prepare('SELECT * FROM notebooks WHERE id = ?')
      .bind(result.meta.last_row_id)
      .first()
    return ok(notebook)
  } catch (e: any) {
    return err('创建笔记本失败: ' + e.message, 500)
  }
}
