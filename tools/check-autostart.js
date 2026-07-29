'use strict'

// Verificacao do inicio automatico: cria o atalho, le de volta, apaga.
// Roda dentro do Electron porque shell.writeShortcutLink e API do Electron.
// Uso: node_modules/electron/dist/electron.exe tools/check-autostart.js

const { app, shell } = require('electron')
const autostart = require('../lib/autostart')

app.whenReady().then(() => {
  const results = []
  const check = (name, ok, detail) => results.push({ name, ok, detail })

  try {
    check('comeca desligado ou ligado sem erro', typeof autostart.isOn() === 'boolean')

    const before = autostart.isOn()

    autostart.set(shell, true, process.execPath, app.getAppPath())
    check('atalho criado', autostart.isOn(), autostart.LINK)

    const link = shell.readShortcutLink(autostart.LINK)
    check('aponta para o executavel', link.target === process.execPath, link.target)
    check('passa a pasta do app', link.args.includes(app.getAppPath()), link.args)

    autostart.set(shell, false, process.execPath, app.getAppPath())
    check('atalho removido', !autostart.isOn())

    // Restaura o estado anterior para nao mexer na maquina.
    if (before) autostart.set(shell, true, process.execPath, app.getAppPath())
  } catch (err) {
    check('sem excecao', false, err.message)
  }

  // Processo GUI no Windows nao escreve no console do terminal: sai por arquivo.
  const fs = require('node:fs')
  const path = require('node:path')
  const text = results
    .map(r => `${r.ok ? 'ok' : 'FALHOU'} - ${r.name}${r.detail ? ' :: ' + r.detail : ''}`)
    .join('\n')
  fs.writeFileSync(path.join(__dirname, '..', 'check-autostart.out'), text)
  app.exit(results.every(r => r.ok) ? 0 : 1)
})
