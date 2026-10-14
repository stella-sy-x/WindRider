# Wind Rider

A Superflight-style wingsuit racer for the browser, with multiplayer races.
Every course is a field of floating islands generated from a seed: the same
islands, tunnels, rock walls and rings for everyone on the same seed. Dive
for speed, skim the rock for style points and a boost, and beat your friends
to the last gate.

- **Race friends:** create a room, share its code, everyone flies the same
  map at the same time and sees each other live.
- **Time trial:** race the clock on today's course or choose one in the map
  select, against the ghosts of the fastest runs.

Built on the VIScon hackathon template: React + Three.js in the browser,
FastAPI behind Caddy on the team VM.

## Quick Start

```bash
docker compose up --build
```

Then open http://localhost:8080. API docs at http://localhost:8080/api/docs.

For development (hot reload):

```bash
# Terminal 1: backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && python app.py    # :8000

# Terminal 2: frontend
cd frontend && npm install && npm run dev           # http://localhost:5173
```

Node 22+, Python 3.14.

## How to Play

| Input | Action |
|:------|:-------|
| Mouse (click the view) | Pitch and turn; bank limited to 80° |
| `W` `S` / `↑` `↓` | Dive / pull up |
| `A` `D` / `←` `→` | Turn left / right |
| `Q` `E` / gamepad `LB` `RB` | 5 m sideways dodge + roll |
| Hold `Shift` / gamepad `RT` | Boost (release to recharge) |
| Hold `Space` / gamepad `LT` | Air brake |
| `R` | Respawn at the last gate |
| `P` | Pause / resume |
| `M` | Mute |
| `Enter` | Start the race |
| `N` | Change map (in a room lobby) |
| `Esc` | Free the mouse |

New players are asked once whether they want a short tutorial.

### Phones and tablets

The game is played in landscape. On Android the first tap goes full screen.

| Touch | Action |
|:------|:-------|
| Drag anywhere | Stick: pitch and turn |
| Hold **Boost** / **Brake** | Boost / air brake |
| `‹` `›` | Sideways dodge |
| **Respawn**, **Pause** | As `R` and `P` |

### Flight

Diving turns height into speed, climbing turns speed back into height.
Flying within a few metres of rock fills the orange bar: you get extra
acceleration, so risky lines are faster. Crash or drop below the islands
and you respawn at your last gate, clock still running. Boost has a 2.5 s
reserve that recharges when released.

## How It Works

```
Browser (each player)                         Team VM (docker compose)
┌──────────────────────────────┐            ┌───────────────────────────────────┐
│ Three.js game loop           │ POST state │ Caddy :8080                       │
│  flight model, seeded world, │ ─15 Hz───▶ │  /        built game (compressed) │
│  collisions, rings, ghosts   │            │  /api/*   ──▶ FastAPI :8000       │
│ React: menu, lobby, HUD      │ ◀──SSE──── │           rooms, 15 Hz relay,     │
└──────────────────────────────┘ snapshots  │           leaderboards (SQLite)   │
                                            └───────────────────────────────────┘
```

**Players never collide**, so the server only relays positions. SSE down,
POST up, plain HTTP (WebSockets didn't survive the hackathon network).

- Race ends 60 s after the first finish, or 240 s from the start
- The first pilot in the room is the host and can restart a race
- Remote players are drawn 120 ms in the past, interpolated between snapshots
- The server times runs and rejects anything under 25 s or more than 3 s off

**Seeded worlds**: the racing line descends through procedurally generated
terrain, with a gate every 95–130 m. Eight biomes share one map pool (a seed
determines the biome, layout and lighting). All rock is a signed distance
field meshed in web workers. Collisions use the drawn triangles, not the field.

**Flight model**: arcade, energy-based. Fixed 120 Hz physics. The hitbox is
a ball for the body and a rectangle per wing. Every constant is in `FLIGHT`
(flight.ts) and tunable at `/?seed=42&tune`.

**Leaderboards and ghosts**: finished runs upload a 15 Hz recording. The top
three ghosts fly along in time trials.

## API

All routes start with `/api`.

| Method | Path | Description |
|:-------|:-----|:------------|
| `GET` | `/api/me` | Current user |
| `GET` | `/api/time` | Server clock for sync |
| `POST` | `/api/rooms/{code}/join` | Join or create a room |
| `GET` | `/api/rooms/{code}/stream` | SSE: events and snapshots |
| `POST` | `/api/rooms/{code}/state` | Your position (15 Hz) |
| `POST` | `/api/rooms/{code}/start` | Start race (5 s countdown) |
| `POST` | `/api/rooms/{code}/restart` | Host: restart the race |
| `POST` | `/api/rooms/{code}/map` | Change map |
| `POST` | `/api/rooms/{code}/finish` | Report finish time + ghost |
| `POST` | `/api/rooms/{code}/leave` | Leave the room |
| `POST` | `/api/runs/start` | Start time trial clock |
| `POST` | `/api/runs/finish` | Submit time trial + ghost |
| `GET` | `/api/leaderboard?seed=` | Best times per seed |
| `GET` | `/api/ghosts?seed=` | Ghost recordings per seed |

## Test Mode

`/?test` (or `/?test=verdant&seed=2`): free flight through any biome with
debug shortcuts. Shift+S for speed toggle, N/B/V to switch
biomes. Included in production builds, nothing saved.
