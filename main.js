'use strict'

const path = require('node:path')
const fs = require('node:fs')
const {
  app, BrowserWindow, Tray, Menu, ipcMain, screen,
  nativeTheme, powerMonitor, shell, nativeImage
} = require('electron')

const { readCreds, CredsError } = require('./lib/creds')
const { fetchUsage, UsageError } = require('./lib/usage')
const { toViewModel, worstSeverity } = require('./lib/view-model')
const windowState = require('./lib/window-state')
const autostart = require('./lib/autostart')
const tokenUsage = require('./lib/token-usage')
const { nextBackoff, BASE_MS: POLL_BASE_MS } = require('./lib/poll-policy')

// A aba de tokens le arquivos do disco, nao a API: ritmo proprio, e so quando aberta.
const TOKENS_REFRESH_MS = 60_000

const WIDTH = 348
const WIDTH_COMPACT = 230

// Aparencia fixa nos tons creme do mockup. Para voltar a acompanhar o Windows,
// troque por: () => nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
const theme = () => 'light'

let win = null
let tray = null
let state = null
let pollTimer = null
let tickTimer = null
let appliedHeight = 0
let quitting = false

const runtime = {
  raw: null,        // ultima resposta crua boa
  vm: null,         // modelo derivado
  at: null,         // quando a resposta chegou
  status: 'loading',
  message: null,
  stale: false,
  plan: null,
  backoff: POLL_BASE_MS,
  tokens: null,      // agregado por modelo da janela de 7 dias
  tokensAt: 0,
  tokensBusy: false
}

// ---------------------------------------------------------------- cache

function cacheFile () {
  return path.join(app.getPath('userData'), 'last-usage.json')
}

function saveCache () {
  if (!runtime.vm) return
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true })
    fs.writeFileSync(cacheFile(), JSON.stringify({ vm: runtime.vm, at: runtime.at, plan: runtime.plan }))
  } catch { /* cache e conveniencia, nao requisito */ }
}

// Abrir ja com numero, mesmo antes da primeira resposta. Sempre marcado como velho.
function loadCache () {
  try {
    const c = JSON.parse(fs.readFileSync(cacheFile(), 'utf8'))
    if (c && c.vm) {
      runtime.vm = c.vm
      runtime.at = c.at
      runtime.plan = c.plan
      runtime.stale = true
    }
  } catch { /* primeira execucao */ }
}

// ---------------------------------------------------------------- ciclo

async function refresh () {
  let creds
  try {
    creds = readCreds()
  } catch (err) {
    return fail(err instanceof CredsError && err.code === 'NO_FILE' ? 'expired' : 'error', err.message)
  }

  runtime.plan = creds.plan

  // Vencido: nem vale gastar a requisicao, a resposta ja seria 401.
  if (creds.expired) {
    return fail('expired', null)
  }

  try {
    const raw = await fetchUsage(creds.token)
    runtime.raw = raw
    runtime.at = Date.now()
    runtime.vm = toViewModel(raw, runtime.at)
    runtime.status = 'ok'
    runtime.message = null
    runtime.stale = false
    runtime.backoff = nextBackoff(runtime.backoff, true)
    saveCache()
  } catch (err) {
    const code = err instanceof UsageError ? err.code : 'HTTP_ERROR'
    if (code === 'TOKEN_EXPIRED') return fail('expired', null)
    if (code === 'OFFLINE' || code === 'TIMEOUT') return fail('offline', null)
    return fail('error', err.message)
  }

  push()
  schedule()
}

function fail (status, message) {
  runtime.status = status
  runtime.message = message
  runtime.stale = true
  runtime.backoff = nextBackoff(runtime.backoff, false)
  push()
  schedule()
}

function schedule () {
  clearTimeout(pollTimer)
  // Janela escondida com icone estatico: nada muda na tela, nao ha o que buscar.
  if (win && !win.isVisible() && runtime.status === 'ok') return
  pollTimer = setTimeout(refresh, runtime.backoff)
}

function push () {
  if (win && !win.isDestroyed()) {
    win.webContents.send('state', {
      vm: runtime.vm,
      status: runtime.status,
      message: runtime.message,
      stale: runtime.stale,
      plan: runtime.plan,
      age: runtime.at ? Date.now() - runtime.at : null,
      compact: state.compact,
      pinned: state.pinned,
      tokensOpen: state.tokensOpen,
      tokens: runtime.tokens,
      tokenDays: state.tokenDays,
      tokensBusy: runtime.tokensBusy,
      theme: theme()
    })
  }
  updateTray()
}

// Uma fonte de verdade para a contagem regressiva: o modelo e rederivado do
// bruto a cada segundo, em vez de o renderer manter um relogio proprio.
function tick () {
  if (!win || !win.isVisible()) return
  if (runtime.status === 'ok' && runtime.raw) {
    runtime.vm = toViewModel(runtime.raw, Date.now())
  }
  if (state.tokensOpen && !state.compact) refreshTokens()
  push()
}

// ---------------------------------------------------------------- tokens

function tokenIndexFile () {
  return path.join(app.getPath('userData'), 'token-index.json')
}

// Roda so com a aba aberta. A leitura e assincrona por linha, entao a janela
// continua respondendo mesmo na primeira varredura, que e a cara.
async function refreshTokens (force = false) {
  if (runtime.tokensBusy) return
  if (!force && Date.now() - runtime.tokensAt < TOKENS_REFRESH_MS) return
  runtime.tokensBusy = true
  push() // acende o indicador: a primeira varredura de 90 dias demora alguns segundos
  try {
    runtime.tokens = await tokenUsage.collect(tokenIndexFile(), Date.now(), state.tokenDays)
    runtime.tokensAt = Date.now()
  } catch (err) {
    console.error('tokens:', err.message)
    runtime.tokens = { days: state.tokenDays, models: [], totalOutput: 0, at: Date.now() }
  } finally {
    runtime.tokensBusy = false
    push()
  }
}

// ---------------------------------------------------------------- bandeja

function trayIcon (severity) {
  const file = path.join(__dirname, 'assets', `tray-${severity}.png`)
  const img = nativeImage.createFromPath(file)
  return img.isEmpty() ? nativeImage.createEmpty() : img
}

function trayTooltip () {
  if (!runtime.vm || !runtime.vm.session) return 'Consumo Claude Code'
  const parts = [`Sessão ${runtime.vm.session.pct}%`]
  if (runtime.vm.windows[0]) parts.push(`Semana ${runtime.vm.windows[0].pct}%`)
  if (runtime.stale) parts.push('(valor antigo)')
  return parts.join(' · ')
}

function updateTray () {
  if (!tray) return
  const severity = runtime.status === 'ok' && runtime.vm ? worstSeverity(runtime.vm) : 'warn'
  tray.setImage(trayIcon(severity))
  tray.setToolTip(trayTooltip())
  tray.setContextMenu(buildMenu())
}

function setAutostart (on) {
  try {
    // __dirname, nao app.getAppPath(): este e sempre a pasta do main, independente
    // de como o Electron foi invocado.
    autostart.set(shell, on, process.execPath, __dirname)
  } catch (err) {
    console.error('autostart:', err.message)
  }
  updateTray()
}

function buildMenu () {
  return Menu.buildFromTemplate([
    { label: win && win.isVisible() ? 'Ocultar' : 'Mostrar', click: toggleWindow },
    { label: 'Atualizar agora', click: () => { runtime.backoff = POLL_BASE_MS; refresh() } },
    { type: 'separator' },
    {
      label: 'Iniciar com o Windows',
      type: 'checkbox',
      checked: autostart.isOn(),
      click: item => setAutostart(item.checked)
    },
    { type: 'separator' },
    { label: 'Sair', click: () => { quitting = true; app.quit() } }
  ])
}

// ---------------------------------------------------------------- janela

function toggleWindow () {
  if (!win) return
  if (win.isVisible()) {
    win.hide()
  } else {
    win.show()
    if (runtime.status !== 'ok' || Date.now() - (runtime.at || 0) > POLL_BASE_MS) refresh()
    else schedule()
  }
  updateTray()
}

function applyWidth () {
  const w = state.compact ? WIDTH_COMPACT : WIDTH
  win.setContentSize(w, appliedHeight || 430)
}

function createWindow () {
  const width = state.compact ? WIDTH_COMPACT : WIDTH
  const pos = windowState.placement(screen, state, width, 430)

  win = new BrowserWindow({
    width,
    height: 430,
    x: pos.x,
    y: pos.y,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: state.pinned,
    skipTaskbar: true,
    show: false,
    backgroundColor: theme() === 'dark' ? '#1B1815' : '#FAF6EF',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.loadFile('index.html')
  win.once('ready-to-show', () => { win.show(); push() })

  // 'moved' nao dispara quando o arrasto vem do app-region: o Chromium move a
  // janela por fora do caminho normal. 'move' dispara sempre; o debounce evita
  // gravar a cada pixel.
  let moveTimer = null
  const rememberPosition = () => {
    clearTimeout(moveTimer)
    moveTimer = setTimeout(() => {
      if (!win || win.isDestroyed()) return
      const [x, y] = win.getPosition()
      state = { ...state, x, y }
      windowState.save(app, state)
    }, 500)
  }
  win.on('move', rememberPosition)
  win.on('moved', rememberPosition)

  win.on('close', e => {
    if (quitting) return
    e.preventDefault()
    win.hide()
    updateTray()
  })
}

// ---------------------------------------------------------------- ipc

ipcMain.on('refresh', () => { runtime.backoff = POLL_BASE_MS; refresh() })
ipcMain.on('hide', () => { if (win) { win.hide(); updateTray() } })

ipcMain.on('toggle-pin', () => {
  state = { ...state, pinned: !state.pinned }
  win.setAlwaysOnTop(state.pinned)
  windowState.save(app, state)
  push()
})

ipcMain.on('toggle-compact', () => {
  state = { ...state, compact: !state.compact }
  windowState.save(app, state)
  applyWidth()
  push()
})

ipcMain.on('toggle-tokens', () => {
  state = { ...state, tokensOpen: !state.tokensOpen }
  windowState.save(app, state)
  push()
  if (state.tokensOpen) refreshTokens()
})

ipcMain.on('set-token-days', (_e, days) => {
  if (!tokenUsage.WINDOW_CHOICES.includes(days) || days === state.tokenDays) return
  state = { ...state, tokenDays: days }
  windowState.save(app, state)
  push()
  refreshTokens(true) // periodo novo: recalcula na hora, sem esperar o minuto
})

// A altura depende de quantas janelas semanais a API devolveu, entao quem manda e a tela.
ipcMain.on('height', (_e, height) => {
  if (!win || win.isDestroyed() || !height) return
  // Nunca mais alta que a area util do monitor onde a janela esta: com a aba de
  // tokens aberta em 90 dias a lista e longa, e a janela nao pode sair da tela.
  const area = screen.getDisplayMatching(win.getBounds()).workArea
  const h = Math.min(Math.round(height), area.height - 40)
  if (h === appliedHeight) return
  appliedHeight = h
  win.setContentSize(state.compact ? WIDTH_COMPACT : WIDTH, h)
})

// ---------------------------------------------------------------- vida

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => { if (win) { win.show(); win.focus() } })

  app.whenReady().then(() => {
    app.setAppUserModelId('dev.giovanijunior.claude-widget')

    state = windowState.load(app)
    loadCache()
    createWindow()

    tray = new Tray(trayIcon('ok'))
    tray.on('click', toggleWindow)
    updateTray()

    refresh()
    tickTimer = setInterval(tick, 1000)

    powerMonitor.on('resume', () => { runtime.backoff = POLL_BASE_MS; refresh() })
    powerMonitor.on('unlock-screen', () => { runtime.backoff = POLL_BASE_MS; refresh() })
    nativeTheme.on('updated', push)
  })

  app.on('window-all-closed', () => { /* vive na bandeja */ })
  app.on('before-quit', () => {
    quitting = true
    clearTimeout(pollTimer)
    clearInterval(tickTimer)
  })
}
