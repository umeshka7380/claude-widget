'use strict'

// Tokens por modelo, lidos dos transcripts que o Claude Code grava nesta maquina.
// Nao vem da API: e o que este computador gastou, nao o que a conta consumiu.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const readline = require('node:readline')

const ROOT = process.env.CLAUDE_WIDGET_PROJECTS_DIR ||
  path.join(os.homedir(), '.claude', 'projects')

const WINDOW_DAYS = 7            // padrao
const WINDOW_CHOICES = [7, 30, 90]
const MAX_DAYS = 90              // o indice guarda ate aqui, para trocar de janela sair barato
const INDEX_VERSION = 2

// Mensagens que o proprio Claude Code fabrica; nao sao consumo de modelo.
const IGNORED_MODELS = new Set(['<synthetic>'])

// O historico tambem guarda nomes que nunca foram modelo de verdade: variavel de
// ambiente que ninguem expandiu ($ANTHROPIC_MODEL) ou nome que veio com aspas.
function isRealModel (id) {
  return id.length > 0 && !IGNORED_MODELS.has(id) && !/^[$"'<]/.test(id)
}

function dayKey (ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Os N dias de calendario que a janela cobre, hoje inclusive.
function windowDays (now = Date.now(), days = WINDOW_DAYS) {
  const out = new Set()
  for (let i = 0; i < days; i++) out.add(dayKey(now - i * 86400_000))
  return out
}

function listFiles (dir, cutoffMs, out = []) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      listFiles(p, cutoffMs, out)
    } else if (e.name.endsWith('.jsonl')) {
      // Transcripts so crescem no fim: um arquivo parado ha mais de uma janela
      // nao pode conter linha dentro dela.
      let st
      try { st = fs.statSync(p) } catch { continue }
      if (st.mtimeMs >= cutoffMs) out.push({ path: p, size: st.size, mtimeMs: st.mtimeMs })
    }
  }
  return out
}

function emptyTotals () {
  return { output: 0, input: 0, cacheRead: 0, cacheWrite: 0, calls: 0 }
}

function addInto (target, u) {
  target.output += u.output_tokens || 0
  target.input += u.input_tokens || 0
  target.cacheRead += u.cache_read_input_tokens || 0
  target.cacheWrite += u.cache_creation_input_tokens || 0
  target.calls++
}

// Le do offset em diante e devolve os totais por dia e por modelo daquele trecho.
async function scanFile (file, fromByte) {
  const days = {}
  const stream = fs.createReadStream(file, { encoding: 'utf8', start: fromByte })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

  for await (const line of rl) {
    // Filtro barato: a maioria das linhas nao tem uso e nao merece JSON.parse.
    if (line.length < 40 || line.indexOf('"usage"') === -1) continue
    let o
    try { o = JSON.parse(line) } catch { continue }
    const m = o.message
    if (!m || !m.usage || typeof m.model !== 'string') continue
    if (!isRealModel(m.model)) continue
    const ts = Date.parse(o.timestamp)
    if (!Number.isFinite(ts)) continue

    const key = dayKey(ts)
    const day = days[key] || (days[key] = {})
    const cur = day[m.model] || (day[m.model] = emptyTotals())
    addInto(cur, m.usage)
  }
  return days
}

function mergeDays (target, extra) {
  for (const [day, models] of Object.entries(extra)) {
    const dest = target[day] || (target[day] = {})
    for (const [model, t] of Object.entries(models)) {
      const cur = dest[model] || (dest[model] = emptyTotals())
      cur.output += t.output
      cur.input += t.input
      cur.cacheRead += t.cacheRead
      cur.cacheWrite += t.cacheWrite
      cur.calls += t.calls
    }
  }
}

function loadIndex (file) {
  try {
    const idx = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (idx && idx.version === INDEX_VERSION && idx.files) return idx
  } catch { /* primeira execucao ou indice de versao antiga */ }
  return { version: INDEX_VERSION, files: {} }
}

function saveIndex (file, index) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(index))
  } catch { /* o indice e cache: perder so custa uma releitura */ }
}

/**
 * Agrega os tokens da janela. O indice guarda, por arquivo, ate onde ja foi lido
 * e os totais por dia — assim so o trecho novo de cada transcript e reprocessado.
 */
async function collect (indexFile, now = Date.now(), days = WINDOW_DAYS) {
  // So varre o disco ate onde a janela pedida alcanca; o que ja foi indexado antes
  // continua guardado, entao voltar para uma janela menor nao custa releitura.
  const cutoff = now - (days + 1) * 86400_000
  const keepFrom = now - (MAX_DAYS + 1) * 86400_000
  const index = loadIndex(indexFile)
  const files = listFiles(ROOT, cutoff)
  const seen = new Set()
  let rescanned = 0

  for (const f of files) {
    seen.add(f.path)
    const prev = index.files[f.path]

    if (prev && prev.size === f.size && prev.mtimeMs === f.mtimeMs) continue

    // Arquivo encolheu: foi reescrito, entao o offset antigo nao vale mais.
    const from = prev && f.size > prev.size ? prev.size : 0
    const base = from === 0 ? {} : (prev.days || {})
    const fresh = await scanFile(f.path, from)
    mergeDays(base, fresh)

    index.files[f.path] = { size: f.size, mtimeMs: f.mtimeMs, days: base }
    rescanned++
  }

  // Purga pelo teto de 90 dias, nao pela janela escolhida: um arquivo indexado
  // continua util se o usuario voltar a olhar um periodo maior.
  for (const [p, entry] of Object.entries(index.files)) {
    const sumiu = !seen.has(p) && !fs.existsSync(p)
    if (sumiu || entry.mtimeMs < keepFrom) delete index.files[p]
  }
  saveIndex(indexFile, index)

  const inWindow = windowDays(now, days)
  const byModel = new Map()
  for (const entry of Object.values(index.files)) {
    for (const [day, models] of Object.entries(entry.days || {})) {
      if (!inWindow.has(day)) continue
      for (const [model, t] of Object.entries(models)) {
        const cur = byModel.get(model) || emptyTotals()
        cur.output += t.output
        cur.input += t.input
        cur.cacheRead += t.cacheRead
        cur.cacheWrite += t.cacheWrite
        cur.calls += t.calls
        byModel.set(model, cur)
      }
    }
  }

  const models = [...byModel.entries()]
    .map(([model, t]) => ({ model, ...t, isClaude: model.startsWith('claude-') }))
    .sort((a, b) => b.output - a.output)

  return {
    days,
    models,
    totalOutput: models.reduce((s, m) => s + m.output, 0),
    filesRescanned: rescanned,
    at: now
  }
}

module.exports = {
  collect, dayKey, windowDays, scanFile, mergeDays, isRealModel,
  WINDOW_DAYS, WINDOW_CHOICES, MAX_DAYS, ROOT
}
