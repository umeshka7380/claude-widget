'use strict'

// Fase 3 do plano: observar se o token e renovado quando o Claude Code fica fechado.
// Roda em segundo plano. Nao faz parte do widget; a saida e a evidencia da decisao.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { CREDS_PATH } = require('../lib/creds')

const OUT = path.join(__dirname, '..', 'token-observation.log')
const PID_FILE = path.join(__dirname, '..', 'token-observation.pid')
const EVERY_MS = 15 * 60_000
const STOP_AFTER_MS = 26 * 3600_000 // uma noite inteira com folga, depois sai sozinho

function claudeRunning () {
  try {
    const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq node.exe', '/FO', 'CSV'], { encoding: 'utf8' })
    return /node\.exe/i.test(out)
  } catch {
    return null
  }
}

function sample () {
  const now = new Date()
  let expiresAt = null
  let mtime = null
  try {
    const raw = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8'))
    expiresAt = raw.claudeAiOauth && raw.claudeAiOauth.expiresAt
    mtime = fs.statSync(CREDS_PATH).mtime.toISOString()
  } catch (err) {
    expiresAt = `erro:${err.code || err.name}`
  }

  const line = JSON.stringify({
    at: now.toISOString(),
    expiresAt,
    expiresAtHuman: typeof expiresAt === 'number' ? new Date(expiresAt).toISOString() : null,
    minutesLeft: typeof expiresAt === 'number' ? Math.round((expiresAt - now.getTime()) / 60_000) : null,
    credsMtime: mtime,
    nodeProcesses: claudeRunning()
  })
  fs.appendFileSync(OUT, line + os.EOL)
}

// Um processo de fundo sem fim e sem rastro e pior do que nao observar nada:
// deixa o PID em disco e se encerra sozinho quando a janela de observacao fecha.
fs.writeFileSync(PID_FILE, String(process.pid))

function stop (motivo) {
  fs.appendFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), fim: motivo }) + os.EOL)
  try { fs.unlinkSync(PID_FILE) } catch {}
  process.exit(0)
}

sample()
const timer = setInterval(sample, EVERY_MS)
setTimeout(() => { clearInterval(timer); stop('janela de 26 h encerrada') }, STOP_AFTER_MS)
process.on('SIGTERM', () => stop('encerrado por sinal'))
process.on('SIGINT', () => stop('encerrado por sinal'))
