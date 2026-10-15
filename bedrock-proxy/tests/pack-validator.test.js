'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { validatePack } = require('../src/pack-validator')
const { createManifest, writePack } = require('./helpers')

const PACK_UUID = '11111111-1111-4111-8111-111111111111'
const MODULE_UUID = '22222222-2222-4222-8222-222222222222'

test('validates pack identity, modules, version, and dependencies', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bedrock-pack-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const filePath = path.join(directory, 'valid.mcpack')
  const manifest = createManifest({ uuid: PACK_UUID, moduleUuid: MODULE_UUID })
  await writePack(filePath, JSON.stringify(manifest))

  const pack = await validatePack(filePath)
  assert.equal(pack.name, 'Test Pack')
  assert.equal(pack.uuid, PACK_UUID)
  assert.deepEqual(pack.version, [1, 0, 0])
  assert.deepEqual(pack.moduleTypes, ['resources'])
  assert.equal(pack.supported, true)
})

test('reports malformed manifests with a useful error', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bedrock-pack-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const filePath = path.join(directory, 'broken.mcpack')
  await writePack(filePath, '{ not-json')

  await assert.rejects(validatePack(filePath), /manifest\.json is not valid JSON/)
})

test('rejects a zip without a root manifest', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bedrock-pack-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const filePath = path.join(directory, 'missing.mcpack')
  await writePack(filePath, JSON.stringify({ header: {}, modules: [] }))
  const nestedPath = path.join(directory, 'nested.mcpack')
  const yazl = require('yazl')
  await new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile()
    const output = require('node:fs').createWriteStream(nestedPath)
    output.once('error', reject)
    output.once('finish', resolve)
    zip.outputStream.pipe(output)
    zip.addBuffer(Buffer.from('{}'), 'folder/manifest.json')
    zip.end()
  })

  await assert.rejects(validatePack(nestedPath), /manifest\.json at its root/)
})