import type { Env } from '../../src/types'

// ---- Password Hashing (PBKDF2-SHA256) ----

export async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    key,
    256,
  )
  return bufToHex(new Uint8Array(bits))
}

export function generateSalt(): string {
  const buf = new Uint8Array(16)
  crypto.getRandomValues(buf)
  return bufToHex(buf)
}

// ---- JWT (HMAC-SHA256) ----

export async function createJWT(payload: Record<string, unknown>, secret: string): Promise<string> {
  if (!secret) throw new Error('JWT_SECRET 未配置，请在 Cloudflare Pages 环境变量中设置')
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const fullPayload = { ...payload, iat: now, exp: now + 7 * 24 * 3600 }
  const segments = [b64url(JSON.stringify(header)), b64url(JSON.stringify(fullPayload))]
  const data = segments.join('.')
  const key = await getHmacKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  segments.push(b64url(sig))
  return segments.join('.')
}

export async function verifyJWT(token: string, secret: string): Promise<Record<string, unknown> | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const key = await getHmacKey(secret)
    const data = `${parts[0]}.${parts[1]}`
    const sig = b64urlDecode(parts[2])
    const valid = await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(data))
    if (!valid) return null
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

// ---- Text Chunking ----

const CHUNK_SIZE = 500
const CHUNK_OVERLAP = 100

export function chunkText(text: string): string[] {
  const cleaned = text.trim()
  if (cleaned.length <= CHUNK_SIZE) return [cleaned]
  const chunks: string[] = []
  const step = CHUNK_SIZE - CHUNK_OVERLAP
  for (let i = 0; i < cleaned.length; i += step) {
    chunks.push(cleaned.slice(i, i + CHUNK_SIZE))
    if (i + CHUNK_SIZE >= cleaned.length) break
  }
  return chunks
}

// ---- Content Hash ----

export async function contentHash(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return bufToHex(new Uint8Array(buf))
}

// ---- Helpers ----

export function json<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function err(message: string, status = 400): Response {
  return json({ ok: false, error: message }, status)
}

export function ok<T>(data?: T): Response {
  return json({ ok: true, data })
}

function bufToHex(buf: Uint8Array): string {
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function b64url(input: string | ArrayBuffer): string {
  const str = typeof input === 'string' ? btoa(input) : btoa(String.fromCharCode(...new Uint8Array(input)))
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(input: string): ArrayBuffer {
  const str = atob(input.replace(/-/g, '+').replace(/_/g, '/'))
  const buf = new Uint8Array(str.length)
  for (let i = 0; i < str.length; i++) buf[i] = str.charCodeAt(i)
  return buf.buffer
}

// ---- RAG Search ----

export interface RagSource {
  article_id: number
  article_title: string
  notebook_name: string
  chunk_text: string
  score: number
}

export async function ragSearch(
  env: Env, query: string, userId: number, topK = 5
): Promise<{ contextParts: string[], sources: RagSource[] }> {
  // 1. Embed the query
  const embedResult: any = await env.AI.run('@cf/baai/bge-m3' as any, { text: [query.trim()] })
  const queryVector = embedResult?.data?.[0] as number[] | undefined

  if (!queryVector || queryVector.length === 0) {
    return { contextParts: [], sources: [] }
  }

  // 2. Search Vectorize — try with filter, fallback to no filter
  const filter: Record<string, number> = { user_id: userId }

  let matches = await env.VECTORIZE.query(queryVector, {
    topK: 10,
    filter,
    returnMetadata: 'all',
  })

  let usedFallback = false
  if (!matches.matches || matches.matches.length === 0) {
    matches = await env.VECTORIZE.query(queryVector, {
      topK: 10,
      returnMetadata: 'all',
    })
    usedFallback = true
  }

  if (!matches.matches || matches.matches.length === 0) {
    return { contextParts: [], sources: [] }
  }

  // 3. Fetch chunk texts for context
  const sources: RagSource[] = []
  const contextParts: string[] = []

  for (const match of matches.matches) {
    const articleId = match.metadata?.article_id as number
    const chunkIndex = match.metadata?.chunk_index as number
    if (!articleId && articleId !== 0) continue

    const article = await env.DB.prepare(
      `SELECT a.id, a.title, a.notebook_id, a.user_id, n.name as notebook_name
       FROM articles a LEFT JOIN notebooks n ON a.notebook_id = n.id
       WHERE a.id = ?`
    ).bind(articleId).first<any>()

    const chunk = await env.DB.prepare(
      'SELECT chunk_text FROM chunks WHERE article_id = ? AND chunk_index = ?'
    ).bind(articleId, chunkIndex).first<{ chunk_text: string }>()

    if (article && chunk) {
      if (usedFallback && article.user_id !== userId) continue

      contextParts.push(`[${sources.length + 1}] ${chunk.chunk_text}`)
      sources.push({
        article_id: article.id,
        article_title: article.title,
        notebook_name: article.notebook_name || '',
        chunk_text: chunk.chunk_text,
        score: match.score,
      })
    }

    if (sources.length >= topK) break
  }

  return { contextParts, sources }
}

// ---- Auth Middleware Helper ----

export async function getUser(request: Request, env: Env): Promise<{ id: number; username: string } | null> {
  const auth = request.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const payload = await verifyJWT(auth.slice(7), env.JWT_SECRET)
  if (!payload || !payload.uid) return null
  return { id: payload.uid as number, username: payload.username as string }
}
