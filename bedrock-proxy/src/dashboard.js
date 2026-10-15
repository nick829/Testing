'use strict'

const http = require('node:http')
const { timingSafeEqual } = require('node:crypto')

const PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bedrock Proxy</title>
  <style>
    :root { color-scheme: dark; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; background: #111715; color: #edf4ef; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: linear-gradient(145deg, #18231d, #101413 58%); }
    header { padding: 20px clamp(16px, 4vw, 48px); border-bottom: 1px solid #36453b; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    h1 { margin: 0; font-size: 18px; font-weight: 650; }
    main { max-width: 1000px; padding: 24px clamp(16px, 4vw, 48px); margin: auto; }
    .toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
    input, button { min-height: 42px; border: 1px solid #526356; border-radius: 4px; color: inherit; background: #1b2520; padding: 8px 12px; font: inherit; }
    input { flex: 1 1 220px; min-width: 0; }
    button { cursor: pointer; background: #b5e5a7; color: #142018; border-color: #b5e5a7; font-weight: 700; }
    button:hover { background: #d0f0c4; }
    #status { min-height: 24px; color: #b8c7bb; margin: 10px 0 20px; }
    .client { border-top: 1px solid #36453b; padding: 16px 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; }
    .client h2 { margin: 0 0 5px; font-size: 15px; overflow-wrap: anywhere; }
    .meta { color: #a9b9ad; font-size: 12px; line-height: 1.65; }
    .players { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 6px; margin-top: 4px; }
    .player { border-left: 2px solid #8dbc7c; background: #1a241e; padding: 8px 10px; font-size: 12px; }
    .empty { color: #9ca99f; padding: 12px 0; }
    @media (max-width: 520px) { header { align-items: flex-start; flex-direction: column; } .client { grid-template-columns: 1fr; } .client button { width: 100%; } }
  </style>
</head>
<body>
  <header><h1>Bedrock Proxy / Radar</h1><span id="connection">Connecting</span></header>
  <main>
    <div class="toolbar"><input id="token" type="password" autocomplete="current-password" placeholder="Dashboard token, if configured"><button id="refresh" type="button">Refresh</button></div>
    <div id="status" role="status">Native freecam is not supported by proxy packets. Radar shows player positions observed by this client.</div>
    <section id="clients" aria-live="polite"></section>
  </main>
  <script>
    const token = document.querySelector('#token');
    const clients = document.querySelector('#clients');
    const status = document.querySelector('#status');
    const connection = document.querySelector('#connection');
    async function request(url, method = 'GET') {
      const headers = { Authorization: 'Bearer ' + token.value };
      const response = await fetch(url, { method, headers });
      if (!response.ok) throw new Error((await response.text()) || response.statusText);
      return response.json();
    }
    function render(items) {
      clients.replaceChildren();
      if (!items.length) { clients.innerHTML = '<p class="empty">No connected clients.</p>'; return; }
      for (const client of items) {
        const section = document.createElement('article'); section.className = 'client';
        const details = document.createElement('div');
        const heading = document.createElement('h2'); heading.textContent = client.name;
        const meta = document.createElement('div'); meta.className = 'meta';
        meta.textContent = client.address + ' · Radar ' + (client.radarEnabled ? 'ON' : 'OFF') + ' · Native camera unsupported';
        details.append(heading, meta);
        const button = document.createElement('button'); button.type = 'button'; button.textContent = client.radarEnabled ? 'Disable radar' : 'Enable radar';
        button.addEventListener('click', async () => { try { await request('/api/clients/' + encodeURIComponent(client.id) + '/radar', 'POST'); await refresh(); } catch (error) { status.textContent = error.message; } });
        const radar = document.createElement('div'); radar.className = 'players';
        if (!client.radarEnabled) radar.innerHTML = '<div class="empty">Radar is disabled.</div>';
        else if (!client.players.length) radar.innerHTML = '<div class="empty">No player position packets observed yet.</div>';
        else for (const player of client.players) {
          const row = document.createElement('div'); row.className = 'player';
          row.textContent = player.name + ' · ' + [player.x, player.y, player.z].map(n => n.toFixed(1)).join(', ') + (player.distance === null ? '' : ' · ' + player.distance + ' m');
          radar.append(row);
        }
        section.append(details, button, radar); clients.append(section);
      }
    }
    async function refresh() {
      try { render(await request('/api/state')); status.textContent = 'Native freecam unavailable; radar is an external read-only view of observed player packets.'; connection.textContent = 'Connected'; }
      catch (error) { connection.textContent = 'Unavailable'; status.textContent = error.message; }
    }
    document.querySelector('#refresh').addEventListener('click', refresh);
    refresh(); setInterval(refresh, 3000);
  </script>
</body>
</html>`

function authorized(request, token) {
  if (!token) return true
  const provided = request.headers.authorization || ''
  const expected = `Bearer ${token}`
  const providedBuffer = Buffer.from(provided)
  const expectedBuffer = Buffer.from(expected)
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer)
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}

function createDashboard({ controller, config, logger }) {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost')
    if (request.method === 'GET' && url.pathname === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
      response.end(PAGE)
      return
    }

    if (!authorized(request, config.dashboardToken)) {
      sendJson(response, 401, { error: 'Unauthorized' })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/state') {
      sendJson(response, 200, controller.state())
      return
    }
    const match = request.method === 'POST' && url.pathname.match(/^\/api\/clients\/([^/]+)\/radar$/)
    if (match) {
      const result = controller.toggle(decodeURIComponent(match[1]))
      if (!result) {
        sendJson(response, 404, { error: 'Client session not found' })
        return
      }
      logger.info('Radar toggled from dashboard', { client: result.name, enabled: result.radarEnabled })
      sendJson(response, 200, result)
      return
    }
    sendJson(response, 404, { error: 'Not found' })
  })

  return {
    get address() { return server.address() },
    listen() {
      return new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(config.dashboardPort, config.dashboardHost, () => {
          server.removeListener('error', reject)
          logger.info('Admin dashboard listening', { host: config.dashboardHost, port: config.dashboardPort })
          resolve()
        })
      })
    },
    close() {
      if (!server.listening) return Promise.resolve()
      return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
  }
}

module.exports = { createDashboard }