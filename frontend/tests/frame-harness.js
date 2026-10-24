// Frame harness v5: window.__h.run(mode, moods?, tag?) in the game tab (?test=<biome>&seed=1,
// viewport 960x540 emulated, pane visible). mode "ref" stores a PNG of every mood's frozen
// start-line frame in IndexedDB (slot a, then b); mode "cmp" renders them again and compares
// pixel for pixel against slot a (ignoring pixels where a and b differ, when b exists).
// Verified deterministic across page loads (two loads, both moods of the Archipelago, 0 pixels
// apart) once all of this holds: the clocks pinned; the camera snapped (frozen, it keeps the
// offset and roll it had before), its drift clock zeroed; the smoothed flight state reset; the
// pilot and its effects hidden (their pose carries the flight before the freeze); a fresh world
// per mood (a restart keeps the streamer's history); the land settled (idle workers, nothing
// arriving, the fade over); and the first world built after a page load thrown away (it settles
// into one of several states), so the first mood is captured again at the end.
window.__tuning["Trails & particles"].autoQuality = false;
window.__h = (() => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const frames = (n) => new Promise((r) => { const f = () => (n-- > 0 ? requestAnimationFrame(f) : r()); f(); });
  const db = () => new Promise((res, rej) => { const q = indexedDB.open("frames", 1); q.onupgradeneeded = () => q.result.createObjectStore("png"); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  const put = async (k, v) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction("png", "readwrite"); t.objectStore("png").put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); };
  const get = async (k) => { const d = await db(); return new Promise((res, rej) => { const q = d.transaction("png").objectStore("png").get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); };
  const grab = () => {
    const g = window.__game;
    if (g.composer) g.composer.render(); else g.renderer.render(g.scene, g.rig.camera);
    const src = g.renderer.domElement; const W = src.width, H = src.height;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const ctx = c.getContext("2d"); ctx.drawImage(src, 0, 0);
    return { W, H, d: ctx.getImageData(0, 0, W, H).data, png: () => c.toDataURL("image/png") };
  };
  const decode = (url) => new Promise((res, rej) => { const im = new Image(); im.onload = () => { const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const ctx = c.getContext("2d"); ctx.drawImage(im, 0, 0); res({ W: im.width, H: im.height, d: ctx.getImageData(0, 0, im.width, im.height).data }); }; im.onerror = rej; im.src = url; });
  const diff = (A, B, i) => Math.max(Math.abs(A.d[i] - B.d[i]), Math.abs(A.d[i + 1] - B.d[i + 1]), Math.abs(A.d[i + 2] - B.d[i + 2]));
  const cmp = (A, R, R2) => {
    if (A.W !== R.W || A.H !== R.H) return { size: [A.W, A.H, R.W, R.H] };
    const { W, H } = A; let n = 0, masked = 0, maxd = 0, x0 = W, y0 = H, x1 = -1, y1 = -1; const hist = {};
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (R2 && diff(R, R2, i) > 0) { masked++; continue; }
      const d = diff(A, R, i);
      if (d > maxd) maxd = d;
      if (d > 0) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; const k = `${Math.floor(x / 160)},${Math.floor(y / 90)}`; hist[k] = (hist[k] || 0) + 1; }
    }
    return { n, masked, maxd, box: n ? [x0, y0, x1, y1] : null, blocks: Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 6) };
  };
  const settle = async () => {
    const g = window.__game;
    g.rig.snap(g.flight.position, g.flight.forward, g.flight.up, g.flight.speed);
    g.rig.time = 0; g.prevVelocity.copy(g.flight.velocity); g.smoothProximity = 0; g.proximity = 0;
    g.avatar.group.visible = false; g.fx.visible = false;
    for (let i = 0; i < 80 && !g.view.ready; i++) await wait(250);
    let quiet = 0;
    for (let i = 0; i < 200 && quiet < 4; i++) { await wait(250); const idle = g.view.busy.every((b) => b === 0) && g.view.land.arrived.length === 0; quiet = idle ? quiet + 1 : 0; }
    await wait(2500);
    g.elapsed = 5; g.sceneryClock = 5;
    await frames(3);
  };
  const hash = (A) => { let h = 2166136261; const d = A.d; for (let i = 0; i < d.length; i += 4) { h ^= d[i]; h = Math.imul(h, 16777619); h ^= d[i + 1]; h = Math.imul(h, 16777619); h ^= d[i + 2]; h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
  const run = async (mode, moods, tag = "") => {
    const g = window.__game; const level = g.world.level; const out = [];
    g.setTestSpeed(0);
    g.setLevel({ ...level, key: { ...level.key, seed: level.key.seed + 7919 } });
    for (let i = 0; i < 40 && !g.view.ready; i++) await wait(250);
    const list = moods ?? level.biome.moods.map((_, i) => i);
    for (const [n, mood] of [list[0], ...list.slice(1), list[0]].entries()) {
      g.setTestSpeed(0);
      g.setLevel({ ...level, key: { ...level.key, mood }, palette: level.biome.moods[mood] });
      await settle();
      if (n === 0) continue;
      const A = grab(); const key = `${tag}${level.key.biome}:${mood}`; const row = { key, name: level.biome.moods[mood].name, hash: hash(A) };
      if (mode === "ref") { const slot = (await get(key + "#a")) ? "#b" : "#a"; await put(key + slot, A.png()); row.slot = slot; }
      else { const a = await get(key + "#a"); const b = await get(key + "#b"); row.cmp = a ? cmp(A, await decode(a), b ? await decode(b) : null) : "no ref"; }
      out.push(row);
    }
    return out.map((o) => (o.cmp && o.cmp.n === 0 ? { key: o.key, hash: o.hash, same: true, masked: o.cmp.masked } : o));
  };
  const clear = async () => { const d = await db(); return new Promise((res) => { const t = d.transaction("png", "readwrite"); t.objectStore("png").clear(); t.oncomplete = res; }); };
  return { run, grab, cmp, settle, put, get, decode, clear };
})();
"harness ready";
