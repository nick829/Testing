'use strict'

const { loadConfig } = require('./config')
const { createLogger } = require('./logger')
const { createProxy } = require('./proxy')
const { PackLoader } = require('./pack-loader')
const { FreecamController } = require('./freecam')
const { createDashboard } = require('./dashboard')

function proxyText(message) {
  return {
    type: 'raw',
    needs_translation: false,
    source_name: 'Proxy',
    xuid: '',
    platform_chat_id: '',
    filtered_message: '',
    message
  }
}

async function main() {
  const config = loadConfig()
  const logger = createLogger(config.logLevel)
  const packLoader = new PackLoader(config.packsDir, logger)
  await packLoader.scan()
  packLoader.watch()

  const freecam = new FreecamController(logger)
  const dashboard = createDashboard({ controller: freecam, config, logger })
  const proxy = createProxy({
    config,
    logger,
    onPlayerConnect: (player, address) => freecam.addClient(address, player.username || 'Bedrock client'),
    onPlayerClose: (_player, sessionId) => freecam.removeClient(sessionId),
    onPlayerPacket: (player, direction, data, des, sessionId, command) => {
      freecam.observe(sessionId, direction, data.name, data.params)
      if (!command) return
      const state = freecam.state().find((item) => item.id === sessionId)
      let message
      if (command.action === 'toggle') {
        const updated = freecam.toggle(sessionId)
        message = `Native freecam is unavailable on an unmodified client. External radar is ${updated.radarEnabled ? 'ON' : 'OFF'}.`
      } else if (command.action === 'status') {
        message = `Native freecam: unavailable. External radar: ${state?.radarEnabled ? 'ON' : 'OFF'}.`
      } else {
        message = 'Proxy commands: /.freecam [toggle radar], /.freecam status'
      }
      player.queue('text', proxyText(message))
      logger.info('Handled proxy-local command', { command: command.action, message })
    }
  })

  try {
    await dashboard.listen()
    await proxy.listen()
  } catch (error) {
    packLoader.close()
    await Promise.allSettled([dashboard.close(), proxy.close()])
    throw error
  }

  let stopping = false
  const shutdown = async (signal) => {
    if (stopping) return
    stopping = true
    logger.info('Shutting down', { signal })
    packLoader.close()
    await Promise.allSettled([proxy.close(), dashboard.close()])
  }

  process.once('SIGINT', () => void shutdown('SIGINT'))
  process.once('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch((error) => {
  process.stderr.write(`Startup failed: ${error.message}\n`)
  process.exitCode = 1
})