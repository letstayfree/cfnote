import { ok, err, chunkText, contentHash, trackEvent } from '../_utils'
import type { Env } from '../../../src/types'

// POST /api/articles - Create article
export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = (data as any).user
  try {
    const { notebook_id, title, content } = await request.json<{
      notebook_id: number; title: string; content: string
    }>()
    if (!notebook_id || !title?.trim()) return err('笔记本ID和标题不能为空')

    const nb = await env.DB.prepare('SELECT id FROM notebooks WHERE id = ? AND user_id = ?')
      .bind(notebook_id, user.id).first()
    if (!nb) return err('笔记本不存在', 404)

    const hash = await contentHash(content || '')
    const result = await env.DB.prepare(
      'INSERT INTO articles (notebook_id, user_id, title, content, content_hash) VALUES (?, ?, ?, ?, ?)'
    ).bind(notebook_id, user.id, title.trim(), content || '', hash).run()

    const articleId = result.meta.last_row_id

    await env.DB.prepare(
      'UPDATE notebooks SET article_count = article_count + 1, updated_at = datetime(\'now\') WHERE id = ?'
    ).bind(notebook_id).run()

    let vectorize_error: string | null = null
    if (content && content.trim().length > 0) {
      vectorize_error = await vectorizeArticle(env, articleId as number, user.id, notebook_id, title.trim(), content)
    }

    const article = await env.DB.prepare('SELECT * FROM articles WHERE id = ?').bind(articleId).first()
    return ok({ ...article as any, vectorize_error })
  } catch (e: any) {
    return err('创建失败: ' + e.message, 500)
  }
}

// Helper: vectorize an article's content. Returns error message or null on success.
// userId is passed for usage logging.
async function vectorizeArticle(
  env: Env, articleId: number, userId: number, notebookId: number, title: string, content: string,
): Promise<string | null> {
  try {
    const chunks = chunkText(title + '\n' + content)

    // Embed all chunks
    const embedResult: any = await env.AI.run('@cf/baai/bge-m3' as any, { text: chunks })

    // Workers AI embedding response: { shape: [n, dim], data: [[...], ...] }
    const vectors = embedResult?.data as number[][] | undefined

    if (!vectors || vectors.length === 0) {
      return `嵌入模型未返回向量数据, response keys: ${Object.keys(embedResult || {}).join(',')}`
    }

    if (vectors.length !== chunks.length) {
      return `向量数量(${vectors.length})与分块数量(${chunks.length})不匹配`
    }

    const dims = vectors[0].length
    if (dims === 0) {
      return '嵌入模型返回了空向量(0维)'
    }

    // Prepare Vectorize upsert and D1 chunk records
    const vectorEntries: VectorizeVector[] = []
    const chunkInserts: D1PreparedStatement[] = []

    for (let i = 0; i < chunks.length; i++) {
      const vectorId = `art_${articleId}_${i}`
      vectorEntries.push({
        id: vectorId,
        values: vectors[i],
        metadata: { article_id: articleId, notebook_id: notebookId, user_id: userId, chunk_index: i },
      })
      chunkInserts.push(
        env.DB.prepare('INSERT INTO chunks (article_id, chunk_index, chunk_text, vector_id) VALUES (?, ?, ?, ?)')
          .bind(articleId, i, chunks[i], vectorId)
      )
    }

    // Upsert vectors and check result
    const upsertResult = await env.VECTORIZE.upsert(vectorEntries)
    // Log upsert result for debugging
    console.log(`Vectorize upsert for article ${articleId}: ${JSON.stringify(upsertResult)}, dims=${dims}, chunks=${chunks.length}`)

    // Batch insert chunk records + mark article as vectorized
    await env.DB.batch([
      ...chunkInserts,
      env.DB.prepare('UPDATE articles SET is_vectorized = 1 WHERE id = ?').bind(articleId),
    ])

    // Fire-and-forget usage tracking
    trackEvent(env, 'vectorize', userId)

    return null
  } catch (e: any) {
    console.error('Vectorization failed for article', articleId, e)
    return '向量化失败: ' + (e.message || String(e))
  }
}

export { vectorizeArticle }
