'use strict'

// Gera o zip para levar a outra maquina: so o codigo, sem node_modules.
// Usa o Compress-Archive do proprio Windows, para nao trazer dependencia de zip.
//   npm run empacotar

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const APP_DIR = path.join(__dirname, '..')
const NOME = 'claude-widget'

const INCLUIR = [
  'package.json', 'package-lock.json',
  'main.js', 'preload.js', 'index.html', 'renderer.js',
  'README.md', 'LICENSE',
  'lib', 'assets', 'tools', 'test', 'docs'
]

// Sobras de execucao e de teste nao vao junto.
const EXCLUIR = /^(node_modules|\.impeccable)$|\.(log|pid|out)$|^token-observation|^autostart\.out$/

function copiar (origem, destino) {
  const st = fs.statSync(origem)
  if (st.isDirectory()) {
    fs.mkdirSync(destino, { recursive: true })
    for (const nome of fs.readdirSync(origem)) {
      if (EXCLUIR.test(nome)) continue
      copiar(path.join(origem, nome), path.join(destino, nome))
    }
  } else {
    fs.copyFileSync(origem, destino)
  }
}

const staging = path.join(os.tmpdir(), `${NOME}-pack`)
fs.rmSync(staging, { recursive: true, force: true })
fs.mkdirSync(path.join(staging, NOME), { recursive: true })

let faltando = []
for (const item of INCLUIR) {
  const origem = path.join(APP_DIR, item)
  if (!fs.existsSync(origem)) { faltando.push(item); continue }
  copiar(origem, path.join(staging, NOME, item))
}
if (faltando.length) console.log('aviso: nao encontrado ->', faltando.join(', '))

const zip = path.join(APP_DIR, `${NOME}.zip`)
fs.rmSync(zip, { force: true })

execFileSync('powershell', [
  '-NoProfile', '-Command',
  `Compress-Archive -Path "${path.join(staging, NOME)}" -DestinationPath "${zip}" -CompressionLevel Optimal`
], { stdio: 'inherit' })

fs.rmSync(staging, { recursive: true, force: true })

const kb = Math.round(fs.statSync(zip).size / 1024)
console.log(`\npronto: ${zip} (${kb} KB)`)
console.log('na outra maquina: descompactar, npm install, npm start')

