'use strict'

const fs = require('node:fs/promises')
const watchFs = require('node:fs')
const path = require('node:path')
const { EventEmitter } = require('node:events')
const { validatePack } = require('./pack-validator')

function sameVersion(left, right) {
  return left.length === right.length && left.every((part, index) => part === right[index])
}

function orderPacks(packs) {
  const byUuid = new Map()
  const duplicateIds = new Set()
  for (const pack of packs) {
    if (byUuid.has(pack.uuid)) duplicateIds.add(pack.uuid)
    else byUuid.set(pack.uuid, pack)
  }

  const errors = new Map()
  const states = new Map()
  const ordered = []
  const visit = (pack, trail = []) => {
    if (duplicateIds.has(pack.uuid)) {
      errors.set(pack.uuid, `Duplicate pack UUID ${pack.uuid}`)
      return false
    }
    const state = states.get(pack.uuid)
    if (state === 'done') return !errors.has(pack.uuid)
    if (state === 'visiting') {
      const cycle = [...trail.slice(trail.indexOf(pack.uuid)), pack.uuid].join(' -> ')
      errors.set(pack.uuid, `Dependency cycle: ${cycle}`)
      return false
    }

    states.set(pack.uuid, 'visiting')
    let valid = pack.supported
    if (!pack.supported) errors.set(pack.uuid, `Pack "${pack.name}" includes unsupported module types: ${pack.moduleTypes.join(', ')}`)

    for (const dependency of pack.dependencies) {
      const required = byUuid.get(dependency.uuid)
      if (!required) {
        errors.set(pack.uuid, `Missing dependency ${dependency.uuid} (${dependency.version.join('.')})`)
        valid = false
        continue
      }
      if (!sameVersion(required.version, dependency.version)) {
        errors.set(pack.uuid, `Dependency ${dependency.uuid} version mismatch; required ${dependency.version.join('.')}, found ${required.version.join('.')}`)
        valid = false
        continue
      }
      if (!visit(required, [...trail, pack.uuid])) {
        errors.set(pack.uuid, errors.get(pack.uuid) || `Dependency ${required.name} is invalid`)
        valid = false
      }
    }

    states.set(pack.uuid, 'done')
    if (valid && !errors.has(pack.uuid)) ordered.push(pack)
    return valid && !errors.has(pack.uuid)
  }

  for (const pack of packs) visit(pack)
  return { ordered, errors }
}

class PackLoader extends EventEmitter {
  constructor(directory, logger, debounceMs = 250) {
    super()
    this.directory = directory
    this.logger = logger
    this.debounceMs = debounceMs
    this.packs = []
    this.watcher = null
    this.timer = null
    this.scanPromise = null
  }

  async scan() {
    if (this.scanPromise) return this.scanPromise
    this.scanPromise = this.scanDirectory()
    try {
      return await this.scanPromise
    } finally {
      this.scanPromise = null
    }
  }

  async scanDirectory() {
    await fs.mkdir(this.directory, { recursive: true })
    const names = (await fs.readdir(this.directory))
      .filter((name) => name.toLowerCase().endsWith('.mcpack'))
      .sort((left, right) => left.localeCompare(right))
    const inspected = await Promise.all(names.map(async (name) => {
      const filePath = path.join(this.directory, name)
      try {
        return await validatePack(filePath)
      } catch (error) {
        this.logger.error('Invalid resource pack', { file: name, reason: error.message })
        return null
      }
    }))

    const validManifests = inspected.filter(Boolean)
    const { ordered, errors } = orderPacks(validManifests)
    for (const [uuid, reason] of errors) {
      const pack = validManifests.find((item) => item.uuid === uuid)
      this.logger.error('Pack dependency or module issue', { pack: pack?.fileName, uuid, reason })
    }
    this.packs = ordered
    this.emit('reload', this.packs)
    this.logger.info('Pack catalog refreshed', {
      found: names.length,
      valid: validManifests.length,
      usable: ordered.length
    })
    return this.packs
  }

  watch() {
    if (this.watcher) return
    this.watcher = watchFs.watch(this.directory, (eventType, fileName) => {
      if (fileName && !String(fileName).toLowerCase().endsWith('.mcpack')) return
      clearTimeout(this.timer)
      this.timer = setTimeout(() => {
        this.scan().catch((error) => this.logger.error('Pack directory rescan failed', { reason: error.message }))
      }, this.debounceMs)
    })
    this.watcher.on('error', (error) => this.logger.error('Pack directory watcher failed', { reason: error.message }))
  }

  close() {
    clearTimeout(this.timer)
    this.watcher?.close()
    this.watcher = null
  }
}

module.exports = { PackLoader, orderPacks }