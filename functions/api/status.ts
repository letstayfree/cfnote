import { ok, err } from './_utils'

// GET /api/status - Check if system is initialized
export const onRequestGet: PagesFunction<{ DB: D1Database }> = async ({ env }) => {
  try {
    const result = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    ).first()
    if (!result) {
      return ok({ initialized: false, hasUser: false })
    }
    const userCount = await env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>()
    return ok({ initialized: true, hasUser: (userCount?.count ?? 0) > 0 })
  } catch {
    return ok({ initialized: false, hasUser: false })
  }
}
