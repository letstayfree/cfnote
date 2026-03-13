import { useState, useEffect, useRef } from 'react'

interface Props {
  loading: boolean
  onImport: (url: string) => Promise<void>
  onClose: () => void
}

export default function ImportDialog({ loading, onImport, onClose }: Props) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleSubmit = async () => {
    const trimmed = url.trim()
    if (!trimmed) { setError('请输入文章链接'); return }
    try { new URL(trimmed) } catch { setError('请输入有效的 URL'); return }
    setError('')
    try {
      await onImport(trimmed)
    } catch (e: any) {
      setError(e.message || '导入失败')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">从网页导入文章</h3>
        <p className="text-sm text-gray-500 mb-4">输入文章链接，自动提取正文内容并转为 Markdown</p>

        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !loading && handleSubmit()}
            placeholder="https://example.com/article"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            disabled={loading}
          />
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 bg-emerald-500 text-white text-sm rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors shrink-0"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                导入中...
              </span>
            ) : '导入'}
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg p-2">{error}</p>}

        <p className="mt-3 text-xs text-gray-400">
          支持大多数新闻、博客、技术文章页面。将自动去除导航栏、广告等无关内容。
        </p>
      </div>
    </div>
  )
}
