import { useState, useEffect, useCallback } from 'react'
import { useApi } from '../hooks/useApi'
import Sidebar from './Sidebar'
import ArticleList from './ArticleList'
import ArticleEditor from './ArticleEditor'
import SearchPanel from './SearchPanel'
import type { Notebook, Article } from '../types'

interface Props {
  token: string
  username: string
  onLogout: () => void
}

export default function Layout({ token, username, onLogout }: Props) {
  const api = useApi(token)
  const [notebooks, setNotebooks] = useState<Notebook[]>([])
  const [activeNotebook, setActiveNotebook] = useState<Notebook | null>(null)
  const [articles, setArticles] = useState<Article[]>([])
  const [activeArticle, setActiveArticle] = useState<Article | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Load notebooks
  const loadNotebooks = useCallback(async () => {
    const res = await api.get<Notebook[]>('/notebooks')
    if (res.ok && res.data) setNotebooks(res.data)
  }, [api])

  useEffect(() => { loadNotebooks() }, [loadNotebooks])

  // Load articles when notebook changes
  const loadArticles = useCallback(async (notebookId: number) => {
    const res = await api.get<Article[]>(`/notebooks/${notebookId}/articles`)
    if (res.ok && res.data) setArticles(res.data)
  }, [api])

  useEffect(() => {
    if (activeNotebook) {
      loadArticles(activeNotebook.id)
      setActiveArticle(null)
    } else {
      setArticles([])
      setActiveArticle(null)
    }
  }, [activeNotebook, loadArticles])

  // Load full article detail
  const loadArticleDetail = useCallback(async (articleId: number) => {
    const res = await api.get<Article>(`/articles/${articleId}`)
    if (res.ok && res.data) setActiveArticle(res.data)
  }, [api])

  // Create notebook
  const createNotebook = async (name: string) => {
    const res = await api.post<Notebook>('/notebooks', { name })
    if (res.ok) await loadNotebooks()
    return res
  }

  // Delete notebook
  const deleteNotebook = async (id: number) => {
    const res = await api.del(`/notebooks/${id}`)
    if (res.ok) {
      if (activeNotebook?.id === id) {
        setActiveNotebook(null)
      }
      await loadNotebooks()
    }
    return res
  }

  // Create article
  const createArticle = async () => {
    if (!activeNotebook) return
    const res = await api.post<Article>('/articles', {
      notebook_id: activeNotebook.id,
      title: '无标题文章',
      content: '',
    })
    if (res.ok && res.data) {
      await loadArticles(activeNotebook.id)
      await loadNotebooks()
      setActiveArticle(res.data)
    }
  }

  // Save article
  const saveArticle = async (id: number, data: { title?: string; content?: string }) => {
    const res = await api.put<Article>(`/articles/${id}`, data)
    if (res.ok && res.data) {
      setActiveArticle(res.data)
      if (activeNotebook) await loadArticles(activeNotebook.id)
    }
    return res
  }

  // Delete article
  const deleteArticle = async (id: number) => {
    const res = await api.del(`/articles/${id}`)
    if (res.ok) {
      if (activeArticle?.id === id) setActiveArticle(null)
      if (activeNotebook) {
        await loadArticles(activeNotebook.id)
        await loadNotebooks()
      }
    }
    return res
  }

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Top Bar */}
      <header className="h-13 border-b border-gray-200 flex items-center px-4 shrink-0 bg-white z-10">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 rounded-lg hover:bg-gray-100 mr-3 lg:hidden">
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-emerald-500 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <span className="font-semibold text-gray-900 text-sm">CFNote</span>
        </div>

        {/* Search */}
        <button
          onClick={() => setShowSearch(!showSearch)}
          className="ml-4 flex items-center gap-2 bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-500 transition-colors flex-1 max-w-xs"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          搜索知识库...
        </button>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-gray-500">{username}</span>
          <button onClick={onLogout} className="text-sm text-gray-400 hover:text-red-500 transition-colors">退出</button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className={`${sidebarOpen ? 'w-56' : 'w-0'} transition-all duration-200 overflow-hidden border-r border-gray-200 bg-gray-50/70 shrink-0`}>
          <Sidebar
            notebooks={notebooks}
            activeNotebook={activeNotebook}
            onSelect={setActiveNotebook}
            onCreate={createNotebook}
            onDelete={deleteNotebook}
          />
        </div>

        {/* Article List */}
        <div className="w-72 border-r border-gray-200 bg-white shrink-0 flex flex-col overflow-hidden">
          <ArticleList
            articles={articles}
            activeArticle={activeArticle}
            notebookName={activeNotebook?.name}
            onSelect={(a) => loadArticleDetail(a.id)}
            onCreate={createArticle}
            onDelete={deleteArticle}
          />
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-hidden">
          {activeArticle ? (
            <ArticleEditor article={activeArticle} onSave={saveArticle} />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400">
              <div className="text-center">
                <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p>{activeNotebook ? '选择或创建一篇文章' : '选择一个笔记本开始'}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Search Panel Overlay */}
      {showSearch && (
        <SearchPanel token={token} onClose={() => setShowSearch(false)} onOpenArticle={(id) => { loadArticleDetail(id); setShowSearch(false) }} />
      )}
    </div>
  )
}
