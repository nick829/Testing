'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { PackLoader, orderPacks } = require('../src/pack-loader')
const { createManifest, writePack } = require('./helpers')

const BASE_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BASE_MODULE_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ADDON_UUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const ADDON_MODULE_UUID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const silentLogger = { info() {}, error() {} }

test('orders dependencies before dependent packs and reports missing dependencies', () => {
  const base = { name: 'Base', uuid: BASE_UUID, version: [1, 0, 0], dependencies: [], supported: true }
  const addon = {
    name: 'Addon', uuid: ADDON_UUID, version: [1, 0, 0], supported: true,
    dependencies: [{ uuid: BASE_UUID, version: [1, 0, 0] }]
  }
  const ordered = orderPacks([addon, base])
  assert.deepEqual(ordered.ordered.map((pack) => pack.uuid), [BASE_UUID, ADDON_UUID])

  const missing = orderPacks([{ ...addon, dependencies: [{ uuid: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', version: [1, 0, 0] }] }])
  assert.equal(missing.ordered.length, 0)
  assert.match(missing.errors.get(ADDON_UUID), /Missing dependency/)
})

test('discovers valid packs at startup and reloads after a new pack is added', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bedrock-packs-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const loader = new PackLoader(directory, silentLogger, 40)
  t.after(() => loader.close())
  await writePack(path.join(directory, 'base.mcpack'), JSON.stringify(createManifest({
    uuid: BASE_UUID, moduleUuid: BASE_MODULE_UUID
  })))

  const initial = await loader.scan()
  assert.equal(initial.length, 1)
  assert.equal(initial[0].name, 'Test Pack')
  loader.watch()

  const reload = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('pack directory did not reload')), 3000)
    loader.once('reload', (packs) => {
      clearTimeout(timeout)
      resolve(packs)
    })
  })
  await writePack(path.join(directory, 'addon.mcpack'), JSON.stringify(createManifest({
    name: 'Addon', uuid: ADDON_UUID, moduleUuid: ADDON_MODULE_UUID,
    dependencies: [{ uuid: BASE_UUID, version: [1, 0, 0] }]
  })))
  const packs = await reload
  assert.deepEqual(packs.map((pack) => pack.name), ['Test Pack', 'Addon'])
})

test('excludes malformed packs while keeping valid catalog entries', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bedrock-packs-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const loader = new PackLoader(directory, silentLogger)
  t.after(() => loader.close())
  await writePack(path.join(directory, 'bad.mcpack'), '{')

  assert.deepEqual(await loader.scan(), [])
})