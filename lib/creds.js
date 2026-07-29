'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

// Sobrescrevivel para exercitar os estados de falha sem tocar no arquivo real.
const CREDS_PATH = process.env.CLAUDE_WIDGET_CREDS_PATH ||
  path.join(os.homedir(), '.claude', '.credentials.json')

// Folga antes do vencimento: abaixo disso nem vale gastar a requisicao, ja vem 401.
const EXPIRY_SKEW_MS = 60_000

class CredsError extends Error {
  constructor (code, message) {
    super(message)
    this.name = 'CredsError'
    this.code = code
  }
}

function parse (text, now) {
  let json
  try {
    // Um editor do Windows pode ter gravado o arquivo com BOM; JSON.parse engasga com ele.
    json = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
  } catch {
    throw new CredsError('BAD_JSON', 'O arquivo de credenciais não é um JSON válido.')
  }

  const oauth = json && json.claudeAiOauth
  if (!oauth || typeof oauth !== 'object') {
    throw new CredsError('BAD_SHAPE', 'Arquivo de credenciais sem o bloco claudeAiOauth.')
  }
  if (typeof oauth.accessToken !== 'string' || oauth.accessToken === '') {
    throw new CredsError('BAD_SHAPE', 'Credencial sem token de acesso utilizável.')
  }
  if (typeof oauth.expiresAt !== 'number') {
    throw new CredsError('BAD_SHAPE', 'Credencial sem data de validade utilizável.')
  }

  return {
    token: oauth.accessToken,
    expiresAt: oauth.expiresAt,
    plan: typeof oauth.subscriptionType === 'string' ? oauth.subscriptionType : null,
    expired: now >= oauth.expiresAt - EXPIRY_SKEW_MS
  }
}

// O Claude Code troca esse arquivo por renomeacao. A renomeacao e atomica no NTFS,
// mas uma leitura pode pegar o instante errado — daí a segunda tentativa.
function readCreds (now = Date.now()) {
  let text
  try {
    text = fs.readFileSync(CREDS_PATH, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new CredsError('NO_FILE', 'Credenciais do Claude Code não encontradas nesta máquina.')
    }
    try {
      text = fs.readFileSync(CREDS_PATH, 'utf8')
    } catch {
      throw new CredsError('UNREADABLE', 'Não foi possível ler o arquivo de credenciais.')
    }
  }
  return parse(text, now)
}

module.exports = { readCreds, parse, CredsError, CREDS_PATH, EXPIRY_SKEW_MS }
