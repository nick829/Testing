'use strict'

const { randomUUID } = require('node:crypto')

function positionOf(value) {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.z)) return null
  return { x: value.x, y: value.y, z: value.z }
}

class FreecamController {
  constructor(logger) {
    this.logger = logger
    this.sessions = new Map()
  }

  addClient(address, displayName = 'Bedrock client') {
    const id = randomUUID()
    this.sessions.set(id, {
      id,
      address,
      displayName,
      radarEnabled: false,
      selfRuntimeId: null,
      selfPosition: null,
      players: new Map()
    })
    return id
  }

  removeClient(id) {
    this.sessions.delete(id)
  }

  toggle(id) {
    const session = this.sessions.get(id)
    if (!session) return null
    session.radarEnabled = !session.radarEnabled
    if (!session.radarEnabled) session.players.clear()
    this.logger.info('Radar mode changed', {
      client: session.displayName,
      enabled: session.radarEnabled,
      nativeFreecam: false
    })
    return this.clientState(session)
  }

  observe(id, direction, packetName, params = {}) {
    const session = this.sessions.get(id)
    if (!session?.radarEnabled) return

    if (direction === 'serverbound' && packetName === 'move_player') {
      const position = positionOf(params.position)
      if (position) session.selfPosition = position
      session.selfRuntimeId = params.runtime_id ?? session.selfRuntimeId
      return
    }
    if (direction !== 'clientbound') return

    if (packetName === 'add_player') {
      const runtimeId = params.runtime_id ?? params.entity_id
      const position = positionOf(params.position)
      if (runtimeId !== undefined && position) {
        session.players.set(String(runtimeId), {
          runtimeId: String(runtimeId),
          name: String(params.username || params.name || `Player ${runtimeId}`),
          position,
          seenAt: Date.now()
        })
      }
      return
    }

    if (packetName === 'move_player') {
      const runtimeId = params.runtime_id ?? params.entity_id
      const existing = session.players.get(String(runtimeId))
      const position = positionOf(params.position)
      if (existing && position) {
        existing.position = position
        existing.seenAt = Date.now()
      }
      return
    }

    if (packetName === 'remove_entity' || packetName === 'remove_entity_base') {
      const runtimeId = params.entity_id ?? params.runtime_id
      if (runtimeId !== undefined) session.players.delete(String(runtimeId))
    }
  }

  clientState(session) {
    const now = Date.now()
    for (const [id, player] of session.players) {
      if (now - player.seenAt > 30000 || id === String(session.selfRuntimeId)) session.players.delete(id)
    }
    return {
      id: session.id,
      name: session.displayName,
      address: session.address,
      radarEnabled: session.radarEnabled,
      nativeFreecamSupported: false,
      selfPosition: session.selfPosition,
      players: [...session.players.values()].map((player) => ({
        name: player.name,
        x: player.position.x,
        y: player.position.y,
        z: player.position.z,
        distance: session.selfPosition
          ? Math.round(Math.hypot(
            player.position.x - session.selfPosition.x,
            player.position.y - session.selfPosition.y,
            player.position.z - session.selfPosition.z
          ) * 10) / 10
          : null
      }))
    }
  }

  state() {
    return [...this.sessions.values()].map((session) => this.clientState(session))
  }
}

module.exports = { FreecamController }