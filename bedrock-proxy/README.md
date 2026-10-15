# Bedrock Proxy

An authenticated Minecraft Bedrock relay built on [`bedrock-protocol`](https://www.npmjs.com/package/bedrock-protocol). It forwards the destination server's packets without changing player identity, authentication, or resource-pack decisions. It also validates local `.mcpack` files and provides a small local radar dashboard.

## Requirements

- Node.js 24 or newer. `bedrock-protocol` 3.60.1 currently declares this engine requirement and supports a range of Bedrock protocol versions; the client, proxy, and destination must still negotiate a mutually supported version.
- A Bedrock destination server reachable over UDP/RakNet.
- An authorized Minecraft account/client and permission to connect through the proxy.

## Setup

```sh
cd bedrock-proxy
npm install
cp .env.example .env
npm start
```

Set `SERVER_HOST` and `SERVER_PORT` to the destination. The defaults listen on UDP `0.0.0.0:19132` and forward to `127.0.0.1:19133`. The default `RAKNET_BACKEND=jsp-raknet` uses the protocol library's JavaScript RakNet implementation and does not require native install scripts. Set `BEDROCK_VERSION` only when you need to pin a version supported by the installed `bedrock-protocol` release; otherwise the library default is used.

`CLIENT_ALLOWLIST` is a comma-separated list of client IPs. The default allows loopback only. Add the trusted client address before connecting, for example `CLIENT_ALLOWLIST=192.168.1.42`. This is an IP allowlist, not a replacement for the destination server's Minecraft authentication or permissions.

The proxy uses `Relay` from `bedrock-protocol`, which handles the supported authentication/encryption and RakNet relay path. It does not spoof XUIDs, bypass Xbox authentication, evade server restrictions, or translate incompatible protocol versions. A client must authenticate normally and the destination server must permit the connection.

## Resource Packs

Put `.mcpack` files under `packs/` (or the configured `PACKS_DIR`). At startup the proxy checks ZIP integrity, the root `manifest.json`, UUIDs, versions, module types, entry paths, archive size, and dependencies. A filesystem watcher rescans after pack files are added, removed, or changed. Dependencies are ordered before dependent packs; missing, mismatched, cyclic, duplicate, malformed, and unsupported packs are logged and excluded from the usable local catalog.

**The local catalog is inspection-only. This project does not inject or force files from `packs/` onto connecting clients.** The upstream Bedrock server controls its resource/behavior pack stack and its policy. `bedrock-protocol`'s `Relay` forwards that negotiation and the related chunk requests, transfer data, and client responses unchanged. This avoids inventing version-specific transfer behavior or claiming a pack was installed when the protocol has not confirmed it. A client must accept/download packs according to normal Bedrock rules, and the destination may prohibit them.

Use a server-managed pack for delivery. The proxy logs pack-negotiation packet names at debug level but does not claim installation; client response packets remain the protocol's source of status.

## `/.freecam` and Radar

The proxy intercepts `/.freecam` in Bedrock command requests, plus `.freecam` as a chat-compatible fallback, and does not forward the recognized command upstream. `/.freecam status` reports its current state. The command toggles **external radar mode**, not camera movement.

An unmodified Minecraft Bedrock client, including PS5, does not expose independent camera movement that a network proxy can enable. Freezing serverbound movement packets would freeze or desynchronize the real player; it would not detach the console's camera. This project deliberately does not do that. Radar is an external, read-only dashboard showing player positions observed in packets sent to that client. It is not a native freecam, may omit players without position updates, and does not reveal entities the server never sent to that client.

The dashboard defaults to `http://127.0.0.1:3000`. To access it from a phone or another host, set `DASHBOARD_HOST` to a reachable interface and set `DASHBOARD_TOKEN` to a random value of at least 24 characters. The dashboard sends this token as a bearer token and is intentionally not exposed remotely without it. Use HTTPS or a trusted private network if exposing it beyond loopback.

## Codespaces and Hosting

GitHub Codespaces is suitable for editing, installing dependencies, and running unit tests. Standard Codespaces forwarded ports are TCP; Bedrock RakNet uses UDP, so a forwarded Codespaces port is not a supported way to connect a PS5 to this relay. Run the proxy on a host that exposes the configured UDP port, such as a home server or a cloud VM with UDP firewall rules configured. Keep `CLIENT_ALLOWLIST` restricted to trusted addresses.

On a normal Node.js server, install Node 24+, clone the repository, run `npm ci`, create `.env`, and run `npm start`. Configure the host firewall/security group to allow the proxy's UDP listen port and allow the proxy host to reach the destination UDP port. For console use, the console must be able to address the proxy as a server; this project does not bypass platform server-list restrictions or alter the PS5 client.

## Tests and Verification

```sh
npm test
npm run check
```

The tests create temporary valid and invalid ZIP packs, exercise discovery/reload and dependency ordering, check command parsing, and verify the radar state transition using synthetic packet records. They do not authenticate to a live Minecraft server or prove PS5 compatibility. A live end-to-end relay and resource-pack negotiation check requires an authorized Bedrock client and a compatible test server; set the server's pack policy and verify client response packets on that test session. Do not use an offline/self-signed test identity against a server that requires Xbox authentication.

## Configuration

See [.env.example](.env.example). Invalid ports, log levels, dashboard bind addresses, tokens, and client IPs fail startup with actionable errors. `.env` is ignored by Git.

## Troubleshooting

- **Protocol/version error:** Check that the installed `bedrock-protocol` release supports the client version. Leave `BEDROCK_VERSION` blank first; pin only to a listed supported version. This is a relay, not a protocol translator.
- **Connection refused or timeout:** Confirm the destination host/UDP port, server availability, routing, and UDP firewall rules. TCP port checks do not validate RakNet reachability.
- **Client rejected by proxy:** Add the client's observed source IP to `CLIENT_ALLOWLIST`; account authentication and destination allowlists still apply.
- **Pack rejected or download stalls:** Check the destination server's pack settings and client response. Local catalog validation does not publish those local files. Inspect proxy debug logs and the destination server's resource-pack logs.
- **Pack invalid:** Ensure the `.mcpack` is a ZIP with `manifest.json` at its root, valid UUIDs and three-integer versions, recognized modules, and present dependency UUID/version pairs. Avoid path traversal entries and oversized archives.
- **Radar empty:** Enable it with `/.freecam` or the dashboard and wait for player add/movement packets. The radar only includes positions observed by the connected client and cannot provide native camera movement.
- **Dashboard unavailable:** Confirm `DASHBOARD_HOST`/`DASHBOARD_PORT`; if binding beyond loopback, provide a 24-character-or-longer `DASHBOARD_TOKEN` and enter it in the dashboard.