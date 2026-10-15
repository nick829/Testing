'use strict'

function parseProxyCommand(packetName, params = {}) {
  let input
  if (packetName === 'command_request') input = params.command
  else if (packetName === 'text') input = params.message
  else return null

  if (typeof input !== 'string') return null
  const command = input.trim().toLowerCase().replace(/^\//, '')
  if (command === '.freecam' || command === 'freecam') return { action: 'toggle' }
  if (command === '.freecam status' || command === 'freecam status') return { action: 'status' }
  if (command === '.help' || command === 'help') return { action: 'help' }
  return null
}

module.exports = { parseProxyCommand }