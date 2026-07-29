'use strict'

// Gera os tres icones 16x16 da bandeja. Roda uma vez: `npm run icons`.
// PNG escrito na mao com zlib da stdlib para nao trazer dependencia de imagem.

const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const COLORS = {
  ok: [0x4f, 0xa3, 0x7c],
  warn: [0xd6, 0xa0, 0x3d],
  crit: [0xcf, 0x4e, 0x42]
}

const SIZE = 16
const RADIUS = 7
const SAMPLES = 3 // supersampling para a borda nao sair serrilhada

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32 (buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk (type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

// Fracao do pixel coberta pelo disco, por amostragem regular.
function coverage (x, y) {
  const cx = SIZE / 2 - 0.5
  const cy = SIZE / 2 - 0.5
  let hits = 0
  for (let sy = 0; sy < SAMPLES; sy++) {
    for (let sx = 0; sx < SAMPLES; sx++) {
      const px = x + (sx + 0.5) / SAMPLES - 0.5
      const py = y + (sy + 0.5) / SAMPLES - 0.5
      if (Math.hypot(px - cx, py - cy) <= RADIUS) hits++
    }
  }
  return hits / (SAMPLES * SAMPLES)
}

function png (rgb) {
  const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
  let o = 0
  for (let y = 0; y < SIZE; y++) {
    raw[o++] = 0 // filtro "none"
    for (let x = 0; x < SIZE; x++) {
      const a = coverage(x, y)
      raw[o++] = rgb[0]
      raw[o++] = rgb[1]
      raw[o++] = rgb[2]
      raw[o++] = Math.round(a * 255)
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(SIZE, 0)
  ihdr.writeUInt32BE(SIZE, 4)
  ihdr[8] = 8   // bits por canal
  ihdr[9] = 6   // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const dir = path.join(__dirname, '..', 'assets')
fs.mkdirSync(dir, { recursive: true })

for (const [name, rgb] of Object.entries(COLORS)) {
  const file = path.join(dir, `tray-${name}.png`)
  fs.writeFileSync(file, png(rgb))
  console.log('escrito', file)
}
