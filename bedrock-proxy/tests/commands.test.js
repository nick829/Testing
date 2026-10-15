'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { parseProxyCommand } = require('../src/commands')
const { FreecamController } = require('../src/freecam')

test('recognizes the custom freecam command packet locally', () => {
  assert.deepEqual(parseProxyCommand('command_request', { command: '/.freecam' }), { action: 'toggle' })
  assert.deepEqual(parseProxyCommand('text', { message: '.freecam' }), { action: 'toggle' })
  assert.deepEqual(parseProxyCommand('command_request', { command: '/.freecam status' }), { action: 'status' })
})

test('ignores ordinary chat and unrelated server commands', () => {
  assert.equal(parseProxyCommand('text', { message: 'hello everyone' }), null)
  assert.equal(parseProxyCommand('command_request', { command: '/spawn' }), null)
  assert.equal(parseProxyCommand('move_player', {}), null)
})

test('toggles the supported external radar and reports observed player positions', () => {
  const controller = new FreecamController({ info() {} })
  const clientId = controller.addClient('127.0.0.1', 'Test client')
  assert.equal(controller.state()[0].nativeFreecamSupported, false)
  assert.equal(controller.toggle(clientId).radarEnabled, true)

  controller.observe(clientId, 'serverbound', 'move_player', {
    runtime_id: 1,
    position: { x: 0, y: 64, z: 0 }
  })
  controller.observe(clientId, 'clientbound', 'add_player', {
    runtime_id: 2,
    username: 'Observed player',
    position: { x: 3, y: 64, z: 4 }
  })

  const player = controller.state()[0].players[0]
  assert.equal(player.name, 'Observed player')
  assert.equal(player.distance, 5)
  assert.equal(controller.toggle(clientId).radarEnabled, false)
  assert.equal(controller.state()[0].players.length, 0)
})