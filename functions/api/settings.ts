import { ok, err, getUserModel, isAllowedModel, DEFAULT_MODEL } from './_utils'
import type { Env } from '../../src/types'

// GET /api/settings - Get user settings (auto-create default if missing)
export const onRequestGet: PagesFunction<Env> = async ({ env, data }) => {
  const user = (data as any).user
  try {
    const llm_model = await getUserModel(env, user.id)
    return ok({ llm_model })
  } catch (e: any) {
    return err('获取设置失败: ' + e.message, 500)
  }
}

// PUT /api/settings - Update user settings
export const onRequestPut: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = (data as any).user
  try {
    const { llm_model } = await request.json<{ llm_model: string }>()

    if (!llm_model || !isAllowedModel(llm_model)) {
      return err('不支持的模型')
    }

    await env.DB.prepare(
      `INSERT INTO user_settings (user_id, llm_model) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET llm_model = excluded.llm_model`
    ).bind(user.id, llm_model).run()

    return ok({ llm_model })
  } catch (e: any) {
    return err('更新设置失败: ' + e.message, 500)
  }
}
