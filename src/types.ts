// ---- Cloudflare Bindings ----
export interface Env {
  DB: D1Database
  VECTORIZE: VectorizeIndex
  AI: Ai
  JWT_SECRET: string
  CF_API_TOKEN?: string
  CF_ACCOUNT_ID?: string
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

export interface Conversation {
  id: number
  user_id: number
  title: string
  created_at: string
  updated_at: string
}

export interface Message {
  id: number
  conversation_id: number
  role: 'user' | 'assistant'
  content: string
  sources: SearchResult[] | null
  created_at: string
}

export interface SendMessageResponse {
  user_message: Message
  assistant_message: Message
  title_updated?: string
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

// ---- Stats ----
export interface StatsAiModel {
  modelId: string
  count: number
  neurons: number
  inputTokens: number
  outputTokens: number
}

export interface StatsAiUsage {
  neurons_today: number
  neurons_limit: number
  models: StatsAiModel[]
  daily: { date: string; neurons: number; count: number }[]
}

export interface StatsUsage {
  search_today: number
  search_7d: number
  search_total: number
  ai_qa_today: number
  ai_qa_7d: number
  ai_qa_total: number
  vectorize_total: number
  import_total: number
}

export interface Stats {
  notebooks: number
  articles: number
  articles_vectorized: number
  vectors_count: number
  vectors_limit: number
  vector_usage_percent: number
  ai_usage: StatsAiUsage | null
  usage: StatsUsage
  daily_trend: { date: string; search: number; ai_qa: number }[]
}
