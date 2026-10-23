# Test mode

Free flight through any biome for visual inspection and debugging. Nothing
is saved. Part of the normal build (dev, `vite preview`, Docker); the URL
alone turns it on.

## Opening it

| URL | Opens |
| :-- | :-- |
| `/?test` | Sky Archipelago, seed 1 |
| `/?test=glacier&seed=2` | Glacier Peaks, seed 2 |
| `/?seed=42&test` | Sky Archipelago, seed 42 |

An unknown world falls back to the Sky Archipelago.

## The panel

Test mode has no keys of its own (they fought the rebindable flight keys).
Its panel has a button per world, a button per lighting mood of the current
world, and three speeds: normal, half and frozen (physics, animation,
shaders, camera and CSS animations all slow or stop together; frozen keeps
drawing the frame, for looking at it and pulling `?tune` sliders). On desktop the mouse is locked
to the game while flying: press Esc to free it before clicking the panel.

## How it's built

- `route.ts`: `screenFromSearch` gives a `{ kind: "test", biome, seed }` screen.
- `testPlayback.ts`: the playback rate. `Game.loop` scales its frame delta
  (adaptive quality still reads the real one); CSS animations follow through
  the Web Animations API.
- Tests: `frontend/tests/test-mode.test.mjs` (URL parsing).
