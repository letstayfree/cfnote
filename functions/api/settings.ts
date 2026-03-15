import { ok, err, isAllowedModel, DEFAULT_MODEL } from './_utils'
import type { Env } from '../../src/types'

const SENSITIVE_PATTERNS = /key|token|secret/i
const MASK_PREFIX = '****'

function maskValue(key: string, value: string): string {
  if (!SENSITIVE_PATTERNS.test(key) || !value) return value
  if (value.length <= 4) return MASK_PREFIX
  return MASK_PREFIX + value.slice(-4)
}

function isMasked(value: string): boolean {
  return value.startsWith(MASK_PREFIX)
}

// GET /api/settings - Get all settings as key-value object (sensitive values masked)
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const rows = await env.DB.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>()
    const settings: Record<string, string> = {}
    for (const r of rows.results ?? []) {
      settings[r.key] = maskValue(r.key, r.value)
    }
    // Ensure llm_model always has a value
    if (!settings.llm_model) {
      settings.llm_model = DEFAULT_MODEL
    }
    return ok(settings)
  } catch (e: any) {
    return err('获取设置失败: ' + e.message, 500)
  }
}

// PUT /api/settings - Batch update settings (skip masked values)
export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body = await request.json<Record<string, string>>()

    // Validate llm_model if present
    if (body.llm_model !== undefined && !isAllowedModel(body.llm_model)) {
      return err('不支持的模型')
    }

    for (const [key, value] of Object.entries(body)) {
      // Skip masked values — user didn't change the key
      if (isMasked(value)) continue

      await env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(key, value).run()
    }

    return ok(body)
  } catch (e: any) {
    return err('更新设置失败: ' + e.message, 500)
  }
}
