import { useState, useEffect, useRef, useCallback } from 'react'
import { marked } from 'marked'
import type { Article } from '../types'

interface Props {
  article: Article
  onSave: (id: number, data: { title?: string; content?: string }) => Promise<any>
}

export default function ArticleEditor({ article, onSave }: Props) {
  const [title, setTitle] = useState(article.title)
  const [content, setContent] = useState(article.content)
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveRef = useRef(onSave)
  saveRef.current = onSave

  // Reset state when article changes
  useEffect(() => {
    setTitle(article.title)
    setContent(article.content)
    setSaved(true)
  }, [article.id])

  // Mark as unsaved on changes
  useEffect(() => {
    const changed = title !== article.title || content !== article.content
    setSaved(!changed)
  }, [title, content, article.title, article.content])

  const handleSave = useCallback(async () => {
    setSaving(true)
    const res = await saveRef.current(article.id, { title, content })
    setSaving(false)
    if (res?.ok) setSaved(true)
  }, [article.id, title, content])

  // Ctrl+S / Cmd+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (!saving && !saved) handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave, saving, saved])

  // Auto-save after 3s idle
  useEffect(() => {
    if (saved) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      handleSave()
    }, 3000)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [handleSave, saved])

  const renderMarkdown = () => {
    try {
      return { __html: marked(content || '', { breaks: true }) as string }
    } catch {
      return { __html: content }
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMode('edit')}
            className={`px-3 py-1 rounded text-sm transition-colors ${mode === 'edit' ? 'bg-gray-200 text-gray-800' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            编辑
          </button>
          <button
            onClick={() => setMode('preview')}
            className={`px-3 py-1 rounded text-sm transition-colors ${mode === 'preview' ? 'bg-gray-200 text-gray-800' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            预览
          </button>
        </div>
        <div className="flex items-center gap-3">
          {article.is_vectorized ? (
            <span className="text-xs text-emerald-500 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              已向量化
            </span>
          ) : null}
          <span className={`text-xs ${saved ? 'text-gray-400' : 'text-amber-500'}`}>
            {saving ? '保存中...' : saved ? '已保存' : '未保存'}
          </span>
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className="px-3 py-1 bg-emerald-500 text-white text-sm rounded-lg hover:bg-emerald-600 disabled:opacity-40 transition-colors"
          >
            保存
          </button>
        </div>
      </div>

      {/* Title */}
      <div className="px-6 pt-4 shrink-0">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full text-2xl font-bold text-gray-900 border-none outline-none bg-transparent placeholder:text-gray-300"
          placeholder="文章标题"
        />
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden px-6 py-4">
        {mode === 'edit' ? (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-full resize-none border-none outline-none text-gray-700 leading-relaxed text-[15px] font-mono bg-transparent placeholder:text-gray-300"
            placeholder="开始写作... (支持 Markdown 语法)"
          />
        ) : (
          <div
            className="prose prose-sm max-w-none h-full overflow-y-auto text-gray-700"
            dangerouslySetInnerHTML={renderMarkdown()}
          />
        )}
      </div>
    </div>
  )
}
