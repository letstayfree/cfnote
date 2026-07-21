import type { Env } from '../src/types'

// Hono 应用环境:Bindings = Cloudflare 绑定,Variables = 认证中间件注入的请求级数据
export type AppEnv = {
  Bindings: Env
  Variables: {
    user: { id: number; username: string }
  }
}
