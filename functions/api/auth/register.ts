import { hashPassword, generateSalt, ok, err } from '../_utils'

// POST /api/auth/register
export const onRequestPost: PagesFunction<{ DB: D1Database }> = async ({ request, env }) => {
  try {
    const { username, password } = await request.json<{ username: string; password: string }>()
    if (!username || !password) return err('用户名和密码不能为空')
    if (username.length < 2 || username.length > 32) return err('用户名长度应为2-32个字符')
    if (password.length < 6) return err('密码至少6个字符')

    // Check if any user already exists (single-user system)
    const existing = await env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>()
    if (existing && existing.count > 0) {
      return err('系统已有用户，不允许再次注册', 403)
    }

    const salt = generateSalt()
    const hash = await hashPassword(password, salt)
    await env.DB.prepare('INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)')
      .bind(username, hash, salt)
      .run()

    return ok({ message: '注册成功' })
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) return err('用户名已存在')
    return err('注册失败: ' + e.message, 500)
  }
}
