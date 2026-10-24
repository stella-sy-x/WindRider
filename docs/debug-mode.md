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

## The look in `?tune`

The tuning panel's `Look: <mood>` folder holds the mood on screen's look
(`world/look.ts`, `docs/biomes.md`): a subfolder per group, a slider per
number, a colour picker per colour (a linear triple, such as a flash or a
tint born in GLSL, is edited in the file). The sliders are bound to a copy
of the mood's numbers: with `override` on the picture takes them, off it
keeps the numbers as written and the sliders go grey, still yours to move.
"Reset looks to defaults" returns the copy to the written numbers; "Copy
settings as JSON" puts on the clipboard, under `look`, only what the
sliders changed against the layers below, ready to paste into the mood.
Numbers the mesher bakes into the land and things built once per map
(the sea of clouds, structure colours, gate counts) show on the next map.

To check that a change of code leaves the picture as it was,
`frontend/tests/frame-harness.js` captures a frozen start-line frame per
mood from the canvas (viewport 960×540, the pilot hidden, the clocks
pinned) and compares later captures pixel for pixel: paste it into the
page's console on `?test=<biome>&seed=1`, `await __h.run("ref")` before the
change and `await __h.run("cmp")` after, once per biome.

## How it's built

- `route.ts`: `screenFromSearch` gives a `{ kind: "test", biome, seed }` screen.
- `testPlayback.ts`: the playback rate. `Game.loop` scales its frame delta
  (adaptive quality still reads the real one); CSS animations follow through
  the Web Animations API.
- Tests: `frontend/tests/test-mode.test.mjs` (URL parsing).
