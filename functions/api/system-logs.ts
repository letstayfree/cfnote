import { ok, err } from './_utils'
import type { Env } from '../../src/types'

// GET /api/system-logs - Query system logs with pagination and filters
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const url = new URL(request.url)
    const level = url.searchParams.get('level') || ''
    const source = url.searchParams.get('source') || ''
    const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200)
    const offset = Number(url.searchParams.get('offset')) || 0

    let sql = 'SELECT * FROM system_logs WHERE 1=1'
    const binds: unknown[] = []

    if (level) {
      sql += ' AND level = ?'
      binds.push(level)
    }
    if (source) {
      sql += ' AND source = ?'
      binds.push(source)
    }

    // Count total
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total')
    const countRow = await env.DB.prepare(countSql).bind(...binds).first<{ total: number }>()
    const total = countRow?.total ?? 0

    // Fetch page
    sql += ' ORDER BY id DESC LIMIT ? OFFSET ?'
    binds.push(limit, offset)
    const rows = await env.DB.prepare(sql).bind(...binds).all<any>()

    return ok({
      logs: rows.results ?? [],
      total,
      limit,
      offset,
    })
  } catch (e: any) {
    return err('获取日志失败: ' + e.message, 500)
  }
}

// DELETE /api/system-logs - Clean up logs older than 30 days
export const onRequestDelete: PagesFunction<Env> = async ({ env }) => {
  try {
    const result = await env.DB.prepare(
      "DELETE FROM system_logs WHERE created_at < datetime('now', '-30 days')"
    ).run()
    return ok({ deleted: result.meta.changes ?? 0 })
  } catch (e: any) {
    return err('清理日志失败: ' + e.message, 500)
  }
}
