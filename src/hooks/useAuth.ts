import { useState, useCallback } from 'react'
import type { AuthState } from '../types'

const TOKEN_KEY = 'cfnote_token'
const USER_KEY = 'cfnote_user'

export function useAuth() {
  const [auth, setAuth] = useState<AuthState>(() => ({
    token: localStorage.getItem(TOKEN_KEY),
    username: localStorage.getItem(USER_KEY),
  }))

  const login = useCallback((token: string, username: string) => {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, username)
    setAuth({ token, username })
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setAuth({ token: null, username: null })
  }, [])

  return { ...auth, isLoggedIn: !!auth.token, login, logout }
}
