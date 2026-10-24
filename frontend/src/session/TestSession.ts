import { Game, type HudState } from "../game/Game";
import { trackFile } from "../game/music";
import { BIOMES, type BiomeId, makeLevel } from "../game/world/biomes";
import type { Settings } from "../storage";
import { Store } from "./store";
import { makeRng } from "../game/rng";
import { PLAYER_COLOR } from "../game/toon";

export interface TestState {
  hud: HudState | null;
  error: string | null;
  biome: BiomeId;
  mood: number;
  /** The music file this world should play, and the one actually playing */
  track: string;
  playing: string | null;
  speed: number;
}

/**
 * Test mode (`/?test`): free flight through any biome. No clock, nothing saved.
 * Worlds, lighting moods and the speed (normal, half, frozen) are switched from its panel, without
 * reloading, to check looks and music together. It has no keys of its own: a
 * test key would have to be kept clear of every rebindable flight key
 */
export class TestSession {
  readonly seed: number;
  readonly store: Store<TestState>;
  private settings: Settings;
  private game: Game | null = null;
  private timer = 0;

  constructor(biome: BiomeId, seed: number, settings: Settings) {
    this.seed = seed;
    this.settings = settings;
    this.store = new Store<TestState>({
      hud: null,
      error: null,
      biome,
      mood: this.biomeMood(biome),
      track: trackFile(biome),
      playing: null,
      speed: 1,
    });
  }

  /** Pick a mood for a biome deterministically from the session seed */
  private biomeMood(biome: BiomeId): number {
    return Math.floor(makeRng(this.seed, "palette")() * BIOMES[biome].moods.length);
  }

  mount(container: HTMLElement) {
    const { biome, mood } = this.store.get();
    try {
      this.game = new Game(container, {
        seed: this.seed,
        level: this.level(biome, mood),
        clock: () => performance.now(),
        controls: this.settings,
        color: PLAYER_COLOR,
        testMode: true,
        events: { hud: (hud) => this.store.set({ hud }), testSpeed: (speed) => this.store.set({ speed }) },
      });
    } catch (e) {
      if (import.meta.env.DEV) console.error(e);
      this.store.set({ error: `The game couldn't start: ${(e as Error).message}` });
    }
    // The music loads and starts a moment after the first click: keep the panel honest
    this.timer = window.setInterval(() => {
      const playing = this.game?.musicTrack ?? null;
      if (playing !== this.store.get().playing) this.store.set({ playing });
    }, 400);
  }

  unmount() {
    window.clearInterval(this.timer);
    this.game?.dispose();
    this.game = null;
  }

  setSettings(settings: Settings) {
    this.settings = settings;
    this.game?.setControls(settings);
  }

  private level(biome: BiomeId, mood: number) {
    return makeLevel({ biome, seed: this.seed, mood });
  }

  /** Switches to another world and restarts at its start; `mood` defaults to that world's own */
  show(biome: BiomeId, mood?: number) {
    const own = this.biomeMood(biome);
    const next = mood === undefined ? own : ((mood % BIOMES[biome].moods.length) + BIOMES[biome].moods.length) % BIOMES[biome].moods.length;
    this.game?.setLevel(this.level(biome, next));
    this.updateUrl(biome);
    this.store.set({ biome, mood: next, track: trackFile(biome) });
  }

  private updateUrl(biome: BiomeId) {
    const url = new URL(location.href);
    url.searchParams.set("test", biome);
    url.searchParams.set("seed", String(this.seed));
    history.replaceState(null, "", url.pathname + url.search + url.hash);
  }

  again() {
    const { biome, mood } = this.store.get();
    this.show(biome, mood);
  }

  setSpeed(rate: number) {
    this.game?.setTestSpeed(rate);
  }
}
