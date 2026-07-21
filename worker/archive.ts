import { getSettingValue, queryAeSql, AE_DATASET, logSystem } from './utils'
import type { Env } from '../src/types'

export interface ArchiveResult {
  archived_periods: string[]
  rows_archived: number
  boundary: string
}

// 把 AE 中所有已完成月份的用量归档到 D1 长期保存
// - 从上次归档边界开始(首次归档从 AE 90 天保留窗口的起始月开始),顺序归档到上个月
// - 每个月份的数据行与边界推进放在同一个 D1 batch 中原子提交,失败重跑不会重复计数
// - /api/stats 的累计值只统计边界之后的 AE 数据,与归档值相加即为完整累计
export async function archiveCompletedMonths(env: Env, cfToken: string, cfAccount: string): Promise<ArchiveResult> {
  const boundary = await getSettingValue(env, 'usage_archive_boundary', '')
  const startMs = /^\d{4}-\d{2}-\d{2}$/.test(boundary)
    ? Date.parse(boundary + 'T00:00:00Z')
    : Date.now() - 90 * 86400000

  const start = new Date(startMs)
  let y = start.getUTCFullYear()
  let m = start.getUTCMonth()

  const now = new Date()
  const curY = now.getUTCFullYear()
  const curM = now.getUTCMonth()

  const archived_periods: string[] = []
  let rows_archived = 0

  while (y < curY || (y === curY && m < curM)) {
    const period = `${y}-${String(m + 1).padStart(2, '0')}`
    const nextY = m === 11 ? y + 1 : y
    const nextM = m === 11 ? 0 : m + 1
    const startDate = `${period}-01`
    const endDate = `${nextY}-${String(nextM + 1).padStart(2, '0')}-01`

    const rows = await queryAeSql<{ action: string; model: string; count: number }>(cfToken, cfAccount, `
      SELECT blob1 AS action, blob2 AS model, SUM(double1 * _sample_interval) AS count
      FROM ${AE_DATASET}
      WHERE timestamp >= toDateTime('${startDate} 00:00:00')
        AND timestamp < toDateTime('${endDate} 00:00:00')
      GROUP BY blob1, blob2
    `)

    const stmts = []
    for (const r of rows) {
      const count = Number(r.count) || 0
      if (!r.action || count <= 0) continue
      stmts.push(env.DB.prepare(
        `INSERT INTO usage_archive (period, action, model, count) VALUES (?, ?, ?, ?)
         ON CONFLICT(period, action, model) DO UPDATE SET count = count + excluded.count`
      ).bind(period, r.action, r.model ?? '', count))
      rows_archived++
    }
    stmts.push(env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('usage_archive_boundary', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind(endDate))
    await env.DB.batch(stmts)

    archived_periods.push(period)
    y = nextY
    m = nextM
  }

  const finalBoundary = `${curY}-${String(curM + 1).padStart(2, '0')}-01`
  return { archived_periods, rows_archived, boundary: finalBoundary }
}

/** 月度 cron 入口:未配置统计凭据时静默跳过,结果写入 system_logs */
export async function runScheduledArchive(env: Env): Promise<void> {
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) return
  try {
    const r = await archiveCompletedMonths(env, env.CF_API_TOKEN, env.CF_ACCOUNT_ID)
    if (r.archived_periods.length > 0) {
      logSystem(env, 'info', 'cron', `月度自动归档完成: ${r.archived_periods.join(', ')} 共 ${r.rows_archived} 行`)
    }
  } catch (e: any) {
    logSystem(env, 'error', 'cron', '月度自动归档失败', { error: e.message || String(e) })
  }
}
