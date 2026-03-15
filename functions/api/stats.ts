import { ok, err } from './_utils'
import type { Env } from '../../src/types'

// GET /api/stats - Aggregated usage statistics
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    // 1. D1 counts
    const [notebookRow, articleRow, vectorizedRow] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) as c FROM notebooks').first<{ c: number }>(),
      env.DB.prepare('SELECT COUNT(*) as c FROM articles').first<{ c: number }>(),
      env.DB.prepare('SELECT COUNT(*) as c FROM articles WHERE is_vectorized = 1').first<{ c: number }>(),
    ])

    const notebooks = notebookRow?.c ?? 0
    const articles = articleRow?.c ?? 0
    const articles_vectorized = vectorizedRow?.c ?? 0

    // 2. Vectorize info
    let vectors_count = 0
    try {
      const info = await env.VECTORIZE.describe()
      const d = info as any
      vectors_count = d.vectorsCount ?? d.vectorCount ?? 0
    } catch { /* vectorize may not be available locally */ }

    const vectors_limit = 4882 // 5M dims / 1024 dims per vector
    const vector_usage_percent = vectors_limit > 0 ? Math.round((vectors_count / vectors_limit) * 10000) / 100 : 0

    // 3. Usage logs from D1
    const now = new Date()
    const todayStart = now.toISOString().slice(0, 10) + ' 00:00:00'
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10) + ' 00:00:00'

    const usageRows = await env.DB.prepare(`
      SELECT action,
        SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as today,
        SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as week,
        COUNT(*) as total
      FROM usage_logs
      GROUP BY action
    `).bind(todayStart, sevenDaysAgo).all<{ action: string; today: number; week: number; total: number }>()

    const usageMap: Record<string, { today: number; week: number; total: number }> = {}
    for (const r of usageRows.results ?? []) {
      usageMap[r.action] = { today: r.today, week: r.week, total: r.total }
    }

    const usage = {
      search_today: usageMap.search?.today ?? 0,
      search_7d: usageMap.search?.week ?? 0,
      search_total: usageMap.search?.total ?? 0,
      ai_qa_today: usageMap.ai_qa?.today ?? 0,
      ai_qa_7d: usageMap.ai_qa?.week ?? 0,
      ai_qa_total: usageMap.ai_qa?.total ?? 0,
      ai_chat_today: usageMap.ai_chat?.today ?? 0,
      ai_chat_7d: usageMap.ai_chat?.week ?? 0,
      ai_chat_total: usageMap.ai_chat?.total ?? 0,
      vectorize_total: usageMap.vectorize?.total ?? 0,
      import_total: usageMap.import?.total ?? 0,
      model_usage: [] as { model: string; today: number; week: number }[],
    }

    // Per-model usage breakdown from local logs
    try {
      const modelRows = await env.DB.prepare(`
        SELECT model,
          SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as today,
          SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as week
        FROM usage_logs
        WHERE model IS NOT NULL AND action IN ('ai_chat', 'ai_qa')
        GROUP BY model
        ORDER BY week DESC
      `).bind(todayStart, sevenDaysAgo).all<{ model: string; today: number; week: number }>()

      usage.model_usage = (modelRows.results ?? []).map(r => ({
        model: r.model,
        today: r.today,
        week: r.week,
      }))
    } catch { /* model column may not exist yet */ }

    // 4. Daily trend (last 7 days)
    const trendRows = await env.DB.prepare(`
      SELECT date(created_at) as date, action, COUNT(*) as c
      FROM usage_logs
      WHERE created_at >= ?
      GROUP BY date(created_at), action
      ORDER BY date(created_at)
    `).bind(sevenDaysAgo).all<{ date: string; action: string; c: number }>()

    const trendMap: Record<string, { search: number; ai_qa: number; ai_chat: number }> = {}
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10)
      trendMap[d] = { search: 0, ai_qa: 0, ai_chat: 0 }
    }
    for (const r of trendRows.results ?? []) {
      if (trendMap[r.date]) {
        if (r.action === 'search') trendMap[r.date].search = r.c
        if (r.action === 'ai_qa') trendMap[r.date].ai_qa = r.c
        if (r.action === 'ai_chat') trendMap[r.date].ai_chat = r.c
      }
    }
    const daily_trend = Object.entries(trendMap).map(([date, v]) => ({ date, ...v }))

    // 5. CF GraphQL API for Workers AI usage (optional)
    let ai_usage = null
    const cfToken = (env as any).CF_API_TOKEN as string | undefined
    const cfAccount = (env as any).CF_ACCOUNT_ID as string | undefined

    if (cfToken && cfAccount) {
      try {
        ai_usage = await fetchAiUsage(cfToken, cfAccount)
      } catch (e) {
        console.error('Failed to fetch CF AI usage:', e)
      }
    }

    return ok({
      notebooks,
      articles,
      articles_vectorized,
      vectors_count,
      vectors_limit,
      vector_usage_percent,
      ai_usage,
      usage,
      daily_trend,
    })
  } catch (e: any) {
    return err('获取统计失败: ' + e.message, 500)
  }
}

async function fetchAiUsage(token: string, accountId: string) {
  const now = new Date()
  const todayStart = now.toISOString().slice(0, 10) + 'T00:00:00Z'
  const nowIso = now.toISOString()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10) + 'T00:00:00Z'

  const query = `{
    viewer {
      accounts(filter: { accountTag: "${accountId}" }) {
        today: aiInferenceAdaptiveGroups(
          limit: 50
          filter: { datetime_gt: "${todayStart}", datetime_lt: "${nowIso}" }
        ) {
          count
          dimensions { modelId }
          sum { totalNeurons totalInputTokens totalOutputTokens }
        }
        daily: aiInferenceAdaptiveGroups(
          limit: 50
          filter: { datetime_gt: "${sevenDaysAgo}", datetime_lt: "${nowIso}" }
          orderBy: [date_ASC]
        ) {
          count
          dimensions { date modelId }
          sum { totalNeurons totalInputTokens totalOutputTokens }
        }
      }
    }
  }`

  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })

  if (!res.ok) return null

  const json = await res.json() as any
  const accounts = json?.data?.viewer?.accounts
  if (!accounts || accounts.length === 0) return null

  const account = accounts[0]

  // Today's data — aggregate by model
  const todayGroups = account.today ?? []
  let neurons_today = 0
  const modelMap: Record<string, { count: number; neurons: number; inputTokens: number; outputTokens: number }> = {}

  for (const g of todayGroups) {
    const modelId = g.dimensions?.modelId ?? 'unknown'
    const n = g.sum?.totalNeurons ?? 0
    neurons_today += n
    if (!modelMap[modelId]) modelMap[modelId] = { count: 0, neurons: 0, inputTokens: 0, outputTokens: 0 }
    modelMap[modelId].count += g.count ?? 0
    modelMap[modelId].neurons += n
    modelMap[modelId].inputTokens += g.sum?.totalInputTokens ?? 0
    modelMap[modelId].outputTokens += g.sum?.totalOutputTokens ?? 0
  }

  const models = Object.entries(modelMap).map(([modelId, v]) => ({ modelId, ...v }))

  // Daily trend
  const dailyGroups = account.daily ?? []
  const dailyMap: Record<string, { neurons: number; count: number }> = {}
  for (const g of dailyGroups) {
    const date = g.dimensions?.date ?? ''
    if (!date) continue
    if (!dailyMap[date]) dailyMap[date] = { neurons: 0, count: 0 }
    dailyMap[date].neurons += g.sum?.totalNeurons ?? 0
    dailyMap[date].count += g.count ?? 0
  }

  const daily = Object.entries(dailyMap)
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return {
    neurons_today,
    neurons_limit: 10000,
    models,
    daily,
  }
}
