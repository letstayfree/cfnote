// ---- Cloudflare Bindings ----
export interface Env {
  DB: D1Database
  VECTORIZE: VectorizeIndex
  AI: Ai
  JWT_SECRET: string
}

// ---- Database Models ----
export interface User {
  id: number
  username: string
  password_hash: string
  salt: string
  created_at: string
}

export interface Notebook {
  id: number
  user_id: number
  name: string
  description: string
  color: string
  article_count: number
  created_at: string
  updated_at: string
}

export interface Article {
  id: number
  notebook_id: number
  user_id: number
  title: string
  content: string
  content_hash: string | null
  is_vectorized: number
  created_at: string
  updated_at: string
}

export interface Chunk {
  id: number
  article_id: number
  chunk_index: number
  chunk_text: string
  vector_id: string
  created_at: string
}

// ---- API Types ----
export interface ApiResponse<T = unknown> {
  ok: boolean
  data?: T
  error?: string
}

export interface SearchResult {
  article_id: number
  article_title: string
  notebook_name: string
  chunk_text: string
  score: number
}

export interface AiSearchResult {
  answer: string
  sources: SearchResult[]
}

// ---- Frontend State ----
export interface AuthState {
  token: string | null
  username: string | null
}
