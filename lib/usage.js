'use strict'

const DEFAULT_URL = 'https://api.anthropic.com/api/oauth/usage'
const TIMEOUT_MS = 10_000

class UsageError extends Error {
  constructor (code, message) {
    super(message)
    this.name = 'UsageError'
    this.code = code
  }
}

// URL sobrescrevivel para forcar o caminho offline nos testes manuais da fase 5.
function endpoint () {
  return process.env.CLAUDE_WIDGET_USAGE_URL || DEFAULT_URL
}

async function fetchUsage (token) {
  let res
  try {
    res = await fetch(endpoint(), {
      headers: {
        Authorization: `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'User-Agent': 'claude-code/2.1.0'
      },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
  } catch (err) {
    const code = err.name === 'TimeoutError' ? 'TIMEOUT' : 'OFFLINE'
    throw new UsageError(code, 'Não foi possível falar com a API da Anthropic.')
  }

  if (res.status === 401 || res.status === 403) {
    throw new UsageError('TOKEN_EXPIRED', 'A credencial local não é mais aceita.')
  }
  if (!res.ok) {
    throw new UsageError('HTTP_ERROR', `A API respondeu ${res.status}.`)
  }

  try {
    return await res.json()
  } catch {
    throw new UsageError('BAD_RESPONSE', 'A resposta da API não é um JSON válido.')
  }
}

module.exports = { fetchUsage, UsageError, DEFAULT_URL, TIMEOUT_MS }
