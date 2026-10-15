'use strict'

const { Relay } = require('bedrock-protocol')
const { parseProxyCommand } = require('./commands')

const PACK_PACKET_NAMES = new Set([
  'resource_packs_info',
  'resource_pack_stack',
  'resource_pack_client_response',
  'resource_pack_data_info',
  'resource_pack_data_chunk',
  'resource_pack_chunk_request'
])

function remoteAddress(player) {
  const address = player.connection?.address
  const value = typeof address === 'string' ? address : address?.address
  return typeof value === 'string' ? value.replace(/^::ffff:/, '') : ''
}

function createProxy({ config, logger, onPlayerPacket = () => {}, onPlayerConnect = () => {}, onPlayerClose = () => {} }) {
  const options = {
    host: config.proxyHost,
    port: config.proxyPort,
    raknetBackend: config.raknetBackend,
    destination: { host: config.serverHost, port: config.serverPort }
  }
  if (config.bedrockVersion) options.version = config.bedrockVersion

  const relay = new Relay(options)
  const players = new Set()

  relay.on('connect', (player) => {
    const address = remoteAddress(player)
    if (!address || !config.clientAllowlist.has(address)) {
      logger.warn('Rejected client not present in CLIENT_ALLOWLIST', { address: address || 'unknown' })
      player.disconnect('This proxy is restricted to authorized client IP addresses.')
      return
    }

    players.add(player)
    const sessionId = onPlayerConnect(player, address)
    logger.info('Authorized client connected', { address })

    const attach = (direction) => (data, des) => {
      if (PACK_PACKET_NAMES.has(data.name)) {
        logger.debug('Relaying server-controlled resource-pack packet', {
          direction,
          packet: data.name,
          status: data.params?.status
        })
      }
      if (direction === 'serverbound') {
        const command = parseProxyCommand(data.name, data.params)
        if (command) {
          des.canceled = true
          onPlayerPacket(player, direction, data, des, sessionId, command)
          return
        }
      }
      onPlayerPacket(player, direction, data, des, sessionId, null)
    }

    player.on('serverbound', attach('serverbound'))
    player.on('clientbound', attach('clientbound'))
    player.on('close', (reason) => {
      players.delete(player)
      onPlayerClose(player, sessionId)
      logger.info('Client disconnected', { address, reason: String(reason || '') })
    })
    player.on('error', (error) => logger.warn('Client relay error', { message: error.message }))
  })

  relay.on('error', (error) => logger.error('Relay error', { message: error.message }))

  return {
    relay,
    get players() { return [...players] },
    async listen() {
      await relay.listen()
      logger.info('Bedrock relay listening', {
        host: config.proxyHost,
        port: config.proxyPort,
        destination: `${config.serverHost}:${config.serverPort}`
      })
    },
    close() {
      return relay.close()
    }
  }
}

module.exports = { createProxy, remoteAddress }