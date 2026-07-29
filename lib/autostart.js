'use strict'

const fs = require('node:fs')
const path = require('node:path')

const DIR = path.join(
  process.env.APPDATA || '',
  'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'
)
const LINK = path.join(DIR, 'Claude Widget.lnk')

function isOn () {
  return fs.existsSync(LINK)
}

// O estado e o proprio arquivo, nao uma preferencia guardada a parte:
// apagar o atalho pela mao do usuario tem que refletir no menu.
function set (shell, on, exePath, appDir) {
  if (on) {
    fs.mkdirSync(DIR, { recursive: true })
    return shell.writeShortcutLink(LINK, 'create', {
      target: exePath,
      args: `"${appDir}"`,
      cwd: appDir,
      description: 'Consumo da conta Claude Code'
    })
  }
  if (fs.existsSync(LINK)) fs.unlinkSync(LINK)
  return true
}

module.exports = { isOn, set, DIR, LINK }
