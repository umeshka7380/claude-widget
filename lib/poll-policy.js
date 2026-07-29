'use strict'

const BASE_MS = 5 * 60_000
const MAX_MS = 30 * 60_000

// Cada falha dobra a espera ate o teto; um sucesso devolve ao ritmo normal.
// Existe para nao martelar a API quando ela ja disse que nao vai responder.
function nextBackoff (current, ok) {
  if (ok) return BASE_MS
  return Math.min((current || BASE_MS) * 2, MAX_MS)
}

module.exports = { nextBackoff, BASE_MS, MAX_MS }
