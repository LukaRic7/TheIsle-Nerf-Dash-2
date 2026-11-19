# Player state server

The server accepts JSON messages over WebSocket at `ws://<host>:8765`. Set
`SERVER_PASSWORD` in the Portainer stack environment before deploying. For
public deployments, terminate TLS at a trusted reverse proxy and connect using
`wss://`.

## Client protocol

The first message must authenticate the client:

```json
{"type":"authenticate","password":"your-server-password"}
```

On success, the server replies with the client's assigned color and the current
data pool. The pool is an object keyed by each player's color:

```json
{
  "type":"authenticated",
  "color":"#00FFFF",
  "datapool":{}
}
```

After authentication, send each player's full state as a `data` message:

```json
{
  "type":"data",
  "data":{
    "bones":12,
    "meat":3,
    "minutes_played":90,
    "is_prime":false,
    "current_dino":"Example",
    "username":"Player",
    "location":{"x":-120000,"y":210000},
    "level":2,
    "health":100.0,
    "stamina":80.0,
    "hunger":70.0,
    "thirst":60.0,
    "growth":0.5
  }
}
```

Each accepted update is broadcast to every connected client as
`{"type":"datapool","datapool":{...}}`. Send
`{"type":"heartbeat"}` at least once within the configured heartbeat timeout;
the server responds with `{"type":"heartbeat_ack"}`. Clients that stop
heartbeating are removed from the pool and remaining clients receive the updated
pool. A normal WebSocket close also removes the client's data.

The server supports five simultaneous clients, matching the available colors.
Optional environment settings are `HEARTBEAT_TIMEOUT_SECONDS` (45),
`HEARTBEAT_CHECK_INTERVAL_SECONDS` (5), `AUTH_TIMEOUT_SECONDS` (10), and
`HOST_PORT` (8765, the published host port).

## Electron client

Copy `client/config/player-server.example.json` to
`client/config/environment/player-server.json` and set the server password in
that local config. The real config path is ignored by Git so the password is
not committed. The Electron main process refreshes its current player data from
the Nerf API every 15 seconds, sends it to the server, and forwards received
data pools to the renderer.
