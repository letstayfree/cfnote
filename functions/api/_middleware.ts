import { getUser, err } from './_utils'

// Auth middleware: skip for public routes, enforce JWT for everything else
export const onRequest: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async (context) => {
  const url = new URL(context.request.url)
  const path = url.pathname

  // Public routes that don't need auth
  const publicRoutes = ['/api/status', '/api/init', '/api/auth/login', '/api/auth/register']
  if (publicRoutes.includes(path)) {
    return context.next()
  }

  // All other /api/ routes require auth
  if (path.startsWith('/api/')) {
    const user = await getUser(context.request, context.env as any)
    if (!user) {
      return err('未登录或登录已过期', 401)
    }
    // Attach user to context.data
    ;(context.data as any).user = user
  }

  return context.next()
}
