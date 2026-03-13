import { hashPassword, createJWT, ok, err } from '../_utils'
import type { User } from '../../../src/types'

// POST /api/auth/login
export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ request, env }) => {
  try {
    const { username, password } = await request.json<{ username: string; password: string }>()
    if (!username || !password) return err('用户名和密码不能为空')

    const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?')
      .bind(username)
      .first<User>()
    if (!user) return err('用户名或密码错误', 401)

    const hash = await hashPassword(password, user.salt)
    if (hash !== user.password_hash) return err('用户名或密码错误', 401)

    const token = await createJWT({ uid: user.id, username: user.username }, env.JWT_SECRET)

    return ok({ token, username: user.username })
  } catch (e: any) {
    return err('登录失败: ' + e.message, 500)
  }
}
