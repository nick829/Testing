'use strict'

const path = require('node:path')
const net = require('node:net')

function parsePort(name, value) {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be an integer from 1 to 65535`)
  }
  return port
}

function parseConfig(env = process.env) {
  const logLevel = (env.LOG_LEVEL || 'info').toLowerCase()
  if (!['debug', 'info', 'warn', 'error'].includes(logLevel)) {
    throw new Error('LOG_LEVEL must be debug, info, warn, or error')
  }
  const raknetBackend = (env.RAKNET_BACKEND || 'jsp-raknet').toLowerCase()
  if (!['jsp-raknet', 'raknet-native', 'raknet-node'].includes(raknetBackend)) {
    throw new Error('RAKNET_BACKEND must be jsp-raknet, raknet-native, or raknet-node')
  }

  const dashboardHost = env.DASHBOARD_HOST || '127.0.0.1'
  const dashboardToken = env.DASHBOARD_TOKEN || ''
  if (net.isIP(dashboardHost) !== 4 && net.isIP(dashboardHost) !== 6 && dashboardHost !== 'localhost') {
    throw new Error('DASHBOARD_HOST must be an IP address or localhost')
  }
  if (!['127.0.0.1', '::1', 'localhost'].includes(dashboardHost) && dashboardToken.length < 24) {
    throw new Error('DASHBOARD_TOKEN must be at least 24 characters when the dashboard is exposed beyond loopback')
  }

  const allowlist = (env.CLIENT_ALLOWLIST || '127.0.0.1,::1')
    .split(',')
    .map((address) => address.trim().replace(/^::ffff:/, ''))
    .filter(Boolean)
  for (const address of allowlist) {
    if (net.isIP(address) === 0) throw new Error(`CLIENT_ALLOWLIST contains an invalid IP address: ${address}`)
  }

  return {
    proxyHost: env.PROXY_HOST || '0.0.0.0',
    proxyPort: parsePort('PROXY_PORT', env.PROXY_PORT || '19132'),
    serverHost: env.SERVER_HOST || '127.0.0.1',
    serverPort: parsePort('SERVER_PORT', env.SERVER_PORT || '19133'),
    packsDir: path.resolve(env.PACKS_DIR || './packs'),
    logLevel,
    raknetBackend,
    bedrockVersion: env.BEDROCK_VERSION?.trim() || undefined,
    dashboardHost,
    dashboardPort: parsePort('DASHBOARD_PORT', env.DASHBOARD_PORT || '3000'),
    dashboardToken,
    clientAllowlist: new Set(allowlist)
  }
}

function loadConfig() {
  try {
    process.loadEnvFile()
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  return parseConfig()
}

module.exports = { loadConfig, parseConfig }