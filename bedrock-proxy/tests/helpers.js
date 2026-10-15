'use strict'

const fs = require('node:fs')
const yazl = require('yazl')

function createManifest({ name = 'Test Pack', uuid, version = [1, 0, 0], moduleUuid, moduleType = 'resources', dependencies = [] }) {
  return {
    format_version: 2,
    header: { name, description: 'Test fixture', uuid, version, min_engine_version: [1, 20, 0] },
    modules: [{ type: moduleType, uuid: moduleUuid, version }],
    dependencies
  }
}

function writePack(filePath, manifestSource) {
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile()
    const output = fs.createWriteStream(filePath)
    output.once('error', reject)
    output.once('finish', resolve)
    zip.outputStream.pipe(output)
    zip.addBuffer(Buffer.from(manifestSource), 'manifest.json')
    zip.addBuffer(Buffer.from('fixture'), 'texts/en_US.lang')
    zip.end()
  })
}

module.exports = { createManifest, writePack }