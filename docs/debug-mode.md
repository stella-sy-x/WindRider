# Test mode

Free flight through any biome for visual inspection and debugging. Nothing
is saved. Part of the normal build (dev, `vite preview`, Docker); the URL
alone turns it on.

## Opening it

| URL | Opens |
| :-- | :-- |
| `/?test` | Verdant Highlands, seed 1 |
| `/?test=glacier&seed=2` | Glacier Peaks, seed 2 |
| `/?seed=42&test` | Verdant Highlands, seed 42 |

An unknown world falls back to Verdant Highlands.

## The panel

Test mode has no keys of its own (they fought the rebindable flight keys).
Its panel, top right, has a button per world, a button per lighting mood of
the current world, and a half-speed toggle (physics, animation, shaders,
camera and CSS animations all slow together). On desktop the mouse is locked
to the game while flying: press Esc to free it before clicking the panel.

## How it's built

- `route.ts`: `screenFromSearch` gives a `{ kind: "test", biome, seed }` screen.
- `testPlayback.ts`: the playback rate. `Game.loop` scales its frame delta
  (adaptive quality still reads the real one); CSS animations follow through
  the Web Animations API.
- Tests: `frontend/tests/test-mode.test.mjs` (URL parsing).
