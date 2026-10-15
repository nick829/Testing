'use strict'

const LEVELS = ['debug', 'info', 'warn', 'error']

function createLogger(level = 'info') {
  const threshold = LEVELS.indexOf(level)

  function write(messageLevel, message, details) {
    if (LEVELS.indexOf(messageLevel) < threshold) return
    const suffix = details === undefined ? '' : ` ${JSON.stringify(details)}`
    const line = `${new Date().toISOString()} [${messageLevel}] ${message}${suffix}`
    const output = messageLevel === 'error' ? process.stderr : process.stdout
    output.write(`${line}\n`)
  }

  return Object.fromEntries(LEVELS.map((messageLevel) => [
    messageLevel,
    (message, details) => write(messageLevel, message, details)
  ]))
}

module.exports = { createLogger, LEVELS }