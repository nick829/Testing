'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { createDashboard } = require('../src/dashboard')

test('serves dashboard shell and protects API routes with the configured token', async () => {
  const dashboard = createDashboard({
    controller: { state: () => [] },
    config: { dashboardHost: '127.0.0.1', dashboardPort: 0, dashboardToken: 'test-dashboard-token' },
    logger: { info() {} }
  })
  await dashboard.listen()
  try {
    const origin = `http://127.0.0.1:${dashboard.address.port}`
    const page = await fetch(origin)
    assert.equal(page.status, 200)
    assert.match(await page.text(), /Bedrock Proxy \/ Radar/)

    const denied = await fetch(`${origin}/api/state`)
    assert.equal(denied.status, 401)

    const accepted = await fetch(`${origin}/api/state`, {
      headers: { Authorization: 'Bearer test-dashboard-token' }
    })
    assert.equal(accepted.status, 200)
    assert.deepEqual(await accepted.json(), [])
  } finally {
    await dashboard.close()
  }
})