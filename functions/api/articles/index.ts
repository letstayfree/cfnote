import { ok, err, chunkText, contentHash } from '../_utils'
import type { Env } from '../../../src/types'

// POST /api/articles - Create article
export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = (data as any).user
  try {
    const { notebook_id, title, content } = await request.json<{
      notebook_id: number; title: string; content: string
    }>()
    if (!notebook_id || !title?.trim()) return err('笔记本ID和标题不能为空')

    // Verify notebook belongs to user
    const nb = await env.DB.prepare('SELECT id FROM notebooks WHERE id = ? AND user_id = ?')
      .bind(notebook_id, user.id).first()
    if (!nb) return err('笔记本不存在', 404)

    const hash = await contentHash(content || '')
    const result = await env.DB.prepare(
      'INSERT INTO articles (notebook_id, user_id, title, content, content_hash) VALUES (?, ?, ?, ?, ?)'
    ).bind(notebook_id, user.id, title.trim(), content || '', hash).run()

    const articleId = result.meta.last_row_id

    // Update notebook article count
    await env.DB.prepare(
      'UPDATE notebooks SET article_count = article_count + 1, updated_at = datetime(\'now\') WHERE id = ?'
    ).bind(notebook_id).run()

    // Vectorize if content is non-empty
    if (content && content.trim().length > 0) {
      await vectorizeArticle(env, articleId as number, user.id, notebook_id, title.trim(), content)
    }

    const article = await env.DB.prepare('SELECT * FROM articles WHERE id = ?').bind(articleId).first()
    return ok(article)
  } catch (e: any) {
    return err('创建失败: ' + e.message, 500)
  }
}

// Helper: vectorize an article's content
async function vectorizeArticle(
  env: Env, articleId: number, userId: number, notebookId: number, title: string, content: string,
) {
  try {
    const chunks = chunkText(title + '\n' + content)

    // Batch embed all chunks
    const embedResult: any = await env.AI.run('@cf/baai/bge-m3' as any, { text: chunks })
    const vectors = embedResult.data as number[][]

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

    // Upsert vectors
    if (vectorEntries.length > 0) {
      await env.VECTORIZE.upsert(vectorEntries)
    }

    // Batch insert chunk records + mark article as vectorized
    await env.DB.batch([
      ...chunkInserts,
      env.DB.prepare('UPDATE articles SET is_vectorized = 1 WHERE id = ?').bind(articleId),
    ])
  } catch (e) {
    // Vectorization failure is non-blocking; article is still saved
    console.error('Vectorization failed for article', articleId, e)
  }
}

export { vectorizeArticle }
