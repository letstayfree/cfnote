import { ok, err, getUser } from '../_utils'
import type { Env } from '../../../src/types'

// POST /api/search - Semantic search (vector only, no LLM)
export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = (data as any).user
  try {
    const { query, notebook_id } = await request.json<{ query: string; notebook_id?: number }>()
    if (!query?.trim()) return err('搜索内容不能为空')

    // Embed the query
    const embedResult: any = await env.AI.run('@cf/baai/bge-m3' as any, { text: [query.trim()] })
    const queryVector = embedResult.data[0] as number[]

    // Search Vectorize with optional notebook filter
    const filter: VectorizeVectorMetadataFilter = { user_id: user.id }
    if (notebook_id) {
      (filter as any).notebook_id = notebook_id
    }

    const matches = await env.VECTORIZE.query(queryVector, {
      topK: 10,
      filter,
      returnMetadata: 'all',
    })

    if (!matches.matches || matches.matches.length === 0) {
      return ok({ results: [] })
    }

    // Gather unique article IDs
    const articleIds = [...new Set(matches.matches.map((m) => m.metadata?.article_id as number))]

    // Fetch article info and chunk texts
    const results = []
    for (const match of matches.matches) {
      const articleId = match.metadata?.article_id as number
      const chunkIndex = match.metadata?.chunk_index as number

      const article = await env.DB.prepare(
        `SELECT a.id, a.title, a.notebook_id, n.name as notebook_name
         FROM articles a LEFT JOIN notebooks n ON a.notebook_id = n.id
         WHERE a.id = ?`
      ).bind(articleId).first<any>()

      const chunk = await env.DB.prepare(
        'SELECT chunk_text FROM chunks WHERE article_id = ? AND chunk_index = ?'
      ).bind(articleId, chunkIndex).first<{ chunk_text: string }>()

      if (article && chunk) {
        results.push({
          article_id: article.id,
          article_title: article.title,
          notebook_id: article.notebook_id,
          notebook_name: article.notebook_name || '',
          chunk_text: chunk.chunk_text,
          score: match.score,
        })
      }
    }

    // Deduplicate by article_id, keep highest score
    const seen = new Map<number, typeof results[0]>()
    for (const r of results) {
      const existing = seen.get(r.article_id)
      if (!existing || r.score > existing.score) {
        seen.set(r.article_id, r)
      }
    }

    return ok({ results: [...seen.values()].sort((a, b) => b.score - a.score) })
  } catch (e: any) {
    return err('搜索失败: ' + e.message, 500)
  }
}
