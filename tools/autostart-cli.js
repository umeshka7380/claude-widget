'use strict'

// Liga/desliga o inicio automatico sem precisar abrir o menu da bandeja.
// Roda dentro do Electron porque writeShortcutLink e API do Electron.
//   npm run autostart:on | autostart:off | autostart:status

const path = require('node:path')
const { app, shell } = require('electron')
const autostart = require('../lib/autostart')

const acao = (process.argv.find(a => /^--(on|off|status)$/.test(a)) || '--status').slice(2)
const APP_DIR = path.join(__dirname, '..')

app.whenReady().then(() => {
  let saida
  try {
    if (acao === 'on') {
      autostart.set(shell, true, process.execPath, APP_DIR)
      saida = autostart.isOn()
        ? `ligado\natalho: ${autostart.LINK}`
        : 'FALHOU: o atalho nao foi criado'
    } else if (acao === 'off') {
      autostart.set(shell, false, process.execPath, APP_DIR)
      saida = autostart.isOn() ? 'FALHOU: o atalho continua la' : 'desligado'
    } else {
      saida = autostart.isOn() ? `ligado\natalho: ${autostart.LINK}` : 'desligado'
    }
  } catch (err) {
    saida = 'ERRO: ' + err.message
  }

  // Processo GUI no Windows nao escreve no console do terminal.
  process.stdout.write(saida + '\n')
  require('node:fs').writeFileSync(path.join(APP_DIR, 'autostart.out'), saida)
  app.exit(saida.startsWith('FALHOU') || saida.startsWith('ERRO') ? 1 : 0)
})
