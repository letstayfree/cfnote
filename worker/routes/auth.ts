import { Hono } from 'hono'
import { ok, err, hashPassword, generateSalt, createJWT } from '../utils'
import type { AppEnv } from '../types'
import type { User } from '../../src/types'

export const auth = new Hono<AppEnv>()

// POST /api/auth/register
auth.post('/register', async (c) => {
  try {
    const { username, password } = await c.req.json<{ username: string; password: string }>()
    if (!username || !password) return err('用户名和密码不能为空')
    if (username.length < 2 || username.length > 32) return err('用户名长度应为2-32个字符')
    if (password.length < 6) return err('密码至少6个字符')

    // Check if any user already exists (single-user system)
    const existing = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>()
    if (existing && existing.count > 0) {
      return err('系统已有用户，不允许再次注册', 403)
    }

    const salt = generateSalt()
    const hash = await hashPassword(password, salt)
    await c.env.DB.prepare('INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)')
      .bind(username, hash, salt)
      .run()

    return ok({ message: '注册成功' })
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) return err('用户名已存在')
    return err('注册失败: ' + e.message, 500)
  }
})

// POST /api/auth/login
auth.post('/login', async (c) => {
  try {
    const { username, password } = await c.req.json<{ username: string; password: string }>()
    if (!username || !password) return err('用户名和密码不能为空')

    const user = await c.env.DB.prepare('SELECT * FROM users WHERE username = ?')
      .bind(username)
      .first<User>()
    if (!user) return err('用户名或密码错误', 401)

    const hash = await hashPassword(password, user.salt)
    if (hash !== user.password_hash) return err('用户名或密码错误', 401)

    const token = await createJWT({ uid: user.id, username: user.username }, c.env.JWT_SECRET)

    return ok({ token, username: user.username })
  } catch (e: any) {
    return err('登录失败: ' + e.message, 500)
  }
})
