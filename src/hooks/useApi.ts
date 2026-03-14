import { useCallback, useMemo, useRef } from 'react'

const API_BASE = '/api'

export function useApi(token: string | null, onUnauthorized?: () => void) {
  const onUnauthorizedRef = useRef(onUnauthorized)
  onUnauthorizedRef.current = onUnauthorized

  const request = useCallback(
    async <T = any>(path: string, options?: RequestInit): Promise<{ ok: boolean; data?: T; error?: string }> => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res = await fetch(`${API_BASE}${path}`, { ...options, headers: { ...headers, ...options?.headers } })
      if (res.status === 401) {
        onUnauthorizedRef.current?.()
        return { ok: false, error: '未登录或登录已过期' }
      }
      const json = await res.json() as any
      return json
    },
    [token],
  )

  const get = useCallback(<T = any>(path: string) => request<T>(path), [request])

  const post = useCallback(
    <T = any>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
    [request],
  )

  const put = useCallback(
    <T = any>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
    [request],
  )

  const del = useCallback(
    <T = any>(path: string) => request<T>(path, { method: 'DELETE' }),
    [request],
  )

  return useMemo(() => ({ get, post, put, del }), [get, post, put, del])
}
