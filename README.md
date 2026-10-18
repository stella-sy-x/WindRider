# Wind Rider

A wingsuit racer for the browser, with multiplayer races. You fly a paper
airplane down a seeded course: a river valley, a glacier, a lagoon, a sunken
reef, a field of floating islands, eight biomes in all, threading crystal
gates to the finish. Dive for speed, skim the rock for style points and a
boost, and beat your friends to the last gate.

- **Race friends:** create a room, share its code, everyone flies the same
  map at the same time and sees each other live. Up to 12 pilots.
- **Time trial:** race the clock on today's course or choose one in the map
  select, against the ghosts of the fastest runs.

Started as a VIScon 2026 hackathon entry (React + Three.js in the browser,
FastAPI behind Caddy) and developed on since.

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

Node 22+ (the Docker image builds with Node 24), Python 3.14.

Frontend checks, from `frontend`:

```bash
npm run lint && npx tsc -b
```

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/*.test.mjs
```

## How to Play

| Input | Action |
|:------|:-------|
| Mouse (click the view) | Pitch and turn; bank limited to 80° |
| `W` `S` / `↑` `↓` | Dive / pull up |
| `A` `D` / `←` `→` | Turn left / right |
| `Q` `E` / gamepad `LB` `RB` | 5 m sideways dodge with a roll (1 s cooldown) |
| Hold `Shift` / gamepad `RT` | Boost (release to recharge) |
| Hold `Space` / gamepad `LT` | Air brake |
| `R` | Respawn at the last gate |
| `P` | Pause / resume |
| `M` | Mute |
| `Enter` | Start the race (room lobby); restart it when it is over (host) |
| `N` | Change map (room lobby, host) |
| `Esc` | Free the mouse |

Keys can be rebound in the settings, which also hold axis inversion per
device, mouse sensitivity, gamepad dead zone, music and effects volume,
graphics quality, reduced camera motion and a left-handed touch layout.
New players are asked once whether they want a short tutorial.

### Phones and tablets

The game is played in landscape. On Android the first tap goes full screen;
iOS has no full-screen API, so the orientation is locked instead.

| Touch | Action |
|:------|:-------|
| Drag anywhere | Stick: pitch and turn |
| Hold **Boost** / **Brake** | Boost / air brake |
| `‹` `›` | Sideways dodge |
| **Respawn**, **Pause** | As `R` and `P` |

### Flight

Diving turns height into speed, climbing turns speed back into height.
Flying within a few metres of rock fills the skim bar: you score style points
and get extra acceleration, so risky lines are faster. Crash into the rock,
or fall out of the course, and you respawn at your last gate, clock still
running. Boost has a 2.5 s reserve that recharges when released.

## How It Works

```
Browser (each player)                         Server (docker compose)
┌──────────────────────────────┐            ┌───────────────────────────────────┐
│ Three.js game loop           │ POST state │ Caddy :8080                       │
│  flight model, seeded world, │ ─15 Hz───▶ │  /        built game (compressed) │
│  collisions, gates, ghosts   │            │  /api/*   ──▶ FastAPI :8000       │
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
- Behind the VIScon portal, players are the portal's `X-User-Id` headers
  (`TRUST_USER_HEADERS=1` in `docker-compose.yml`; never expose port 8080
  without that portal in front). Anywhere else they are guests: a nickname
  and a browser id

**Seeded worlds**: a seed picks one of the eight biomes and one of its
lighting moods; the racing line descends through it with a crystal gate every
95 to 130 m. The land is a ground heightfield plus a signed distance field,
meshed in web workers and streamed in four levels of detail around the
pilot. On the Sunken Reef canyon walls bound the course and nothing is
generated beyond them; the other biomes still use a hard hold 150 m from the
line while the walls spread. Collisions use the drawn triangles, not the
field. `docs/biomes.md` lists what every biome is made of.

**Flight model**: arcade, energy-based. Fixed 120 Hz physics, rendering
interpolates. The hitbox is a ball for the body and a rectangle per wing.
Every constant is in `FLIGHT` (`flight.ts`); looks are in `tuning.ts`; both
are live sliders at `/?seed=42&tune`.

**Leaderboards and ghosts**: finished runs upload a 15 Hz recording. The
board shows the ten best times per seed; the top three ghosts fly along in
time trials.

## API

All routes start with `/api`.

| Method | Path | Description |
|:-------|:-----|:------------|
| `GET` | `/api/me` | Current user |
| `GET` | `/api/time` | Server clock for sync |
| `POST` | `/api/rooms/{code}/join` | Join or create a room |
| `GET` | `/api/rooms/{code}` | Room state |
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

`/?test` (or `/?test=verdant&seed=2`): free flight through any biome.
Worlds, lighting and half speed are buttons on its panel (no debug keys).
Included in production builds, nothing saved. See `docs/debug-mode.md`.

## More

- `CLAUDE.md`: art direction, rules for working on the code, change log
- `docs/biomes.md`: every biome and its assets
- `docs/debug-mode.md`: test mode
- `docs/racing-next-steps.md`: where the racing is heading
- `docs/audit-2026-10-11.md`: the pre-playtest review
- `CREDITS.md`: assets, fonts and tools
