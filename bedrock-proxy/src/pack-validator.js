'use strict'

const yauzl = require('yauzl')

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SUPPORTED_MODULES = new Set(['resources', 'data', 'client_data', 'interface', 'script'])
const KNOWN_MODULES = new Set([...SUPPORTED_MODULES, 'world_template', 'world_behavior', 'editor'])
const MAX_ENTRIES = 4096
const MAX_UNPACKED_BYTES = 128 * 1024 * 1024
const MAX_MANIFEST_BYTES = 1024 * 1024

function validateUuid(value, label) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new Error(`${label} must be a UUID`)
  }
}

function validateVersion(value, label) {
  if (!Array.isArray(value) || value.length !== 3 || value.some((part) => !Number.isInteger(part) || part < 0)) {
    throw new Error(`${label} must be a three-part non-negative integer version`)
  }
}

function parseManifest(source, filePath) {
  let manifest
  try {
    manifest = JSON.parse(source)
  } catch (error) {
    throw new Error(`manifest.json is not valid JSON: ${error.message}`)
  }

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('manifest.json must contain a JSON object')
  }
  const { header, modules, dependencies = [] } = manifest
  if (!header || typeof header.name !== 'string' || !header.name.trim()) {
    throw new Error('manifest.json header.name must be a non-empty string')
  }
  validateUuid(header.uuid, 'manifest.json header.uuid')
  validateVersion(header.version, 'manifest.json header.version')
  if (!Array.isArray(modules) || modules.length === 0) {
    throw new Error('manifest.json modules must be a non-empty array')
  }

  const moduleTypes = []
  for (const [index, module] of modules.entries()) {
    const label = `manifest.json modules[${index}]`
    validateUuid(module?.uuid, `${label}.uuid`)
    validateVersion(module?.version, `${label}.version`)
    if (!KNOWN_MODULES.has(module?.type)) {
      throw new Error(`${label}.type is not a recognized Bedrock module type`)
    }
    moduleTypes.push(module.type)
  }

  if (!Array.isArray(dependencies)) {
    throw new Error('manifest.json dependencies must be an array')
  }
  const parsedDependencies = dependencies.map((dependency, index) => {
    const label = `manifest.json dependencies[${index}]`
    validateUuid(dependency?.uuid, `${label}.uuid`)
    validateVersion(dependency?.version, `${label}.version`)
    return { uuid: dependency.uuid.toLowerCase(), version: [...dependency.version] }
  })

  return {
    filePath,
    fileName: filePath.split(/[\\/]/).pop(),
    name: header.name.trim(),
    uuid: header.uuid.toLowerCase(),
    version: [...header.version],
    dependencies: parsedDependencies,
    moduleTypes,
    supported: moduleTypes.every((type) => SUPPORTED_MODULES.has(type))
  }
}

function validatePack(filePath) {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, {
      lazyEntries: true,
      autoClose: true,
      decodeStrings: true,
      validateEntrySizes: true
    }, (openError, zipFile) => {
      if (openError) {
        reject(new Error(`Invalid ZIP archive: ${openError.message}`))
        return
      }

      let entryCount = 0
      let unpackedBytes = 0
      let manifestSource
      let settled = false
      const seenNames = new Set()

      const fail = (error) => {
        if (settled) return
        settled = true
        zipFile.close()
        reject(error)
      }

      zipFile.on('error', fail)
      zipFile.on('entry', (entry) => {
        entryCount += 1
        unpackedBytes += entry.uncompressedSize
        const normalized = entry.fileName.replace(/\\/g, '/')
        const pathParts = normalized.split('/')
        if (normalized.startsWith('/') || /^[a-z]:/i.test(normalized) || pathParts.includes('..')) {
          fail(new Error(`Unsafe ZIP entry path: ${entry.fileName}`))
          return
        }
        if (seenNames.has(normalized)) {
          fail(new Error(`Duplicate ZIP entry: ${entry.fileName}`))
          return
        }
        seenNames.add(normalized)

        if (entryCount > MAX_ENTRIES || unpackedBytes > MAX_UNPACKED_BYTES) {
          fail(new Error('ZIP exceeds the pack safety limits (4096 entries or 128 MiB unpacked)'))
          return
        }
        if (entry.fileName !== 'manifest.json') {
          zipFile.readEntry()
          return
        }
        if (entry.uncompressedSize > MAX_MANIFEST_BYTES) {
          fail(new Error('manifest.json exceeds the 1 MiB size limit'))
          return
        }

        zipFile.openReadStream(entry, (streamError, stream) => {
          if (streamError) {
            fail(streamError)
            return
          }
          const chunks = []
          let size = 0
          stream.on('data', (chunk) => {
            size += chunk.length
            if (size > MAX_MANIFEST_BYTES) {
              stream.destroy(new Error('manifest.json exceeds the 1 MiB size limit'))
              return
            }
            chunks.push(chunk)
          })
          stream.on('error', fail)
          stream.on('end', () => {
            manifestSource = Buffer.concat(chunks).toString('utf8')
            zipFile.readEntry()
          })
        })
      })
      zipFile.on('end', () => {
        if (settled) return
        settled = true
        if (manifestSource === undefined) {
          reject(new Error('ZIP must contain manifest.json at its root'))
          return
        }
        try {
          resolve(parseManifest(manifestSource, filePath))
        } catch (error) {
          reject(error)
        }
      })
      zipFile.readEntry()
    })
  })
}

module.exports = { validatePack, parseManifest, SUPPORTED_MODULES }