# Leaderboards and the ranked daily

Design, not built. Written 2026-10-18 after looking at how racing games with
fixed, generated and daily tracks are received; the short version of that
research is at the end. The aim: keep the per-seed boards that exist, add a
daily seed everyone flies for the first time together, and rank players
across days the way a MOBA ladder does, where a bad day costs points.

## What exists

- **Per-seed boards.** Every finished time trial is a row in `runs`
  (`seed, user_id, name, time_ms, created_at, ghost, rules`). `GET
  /api/leaderboard?seed=` returns the top times and your own rank, `GET
  /api/ghosts?seed=` the fastest three ghosts. A run is opened with `POST
  /api/runs/start` (server-timestamped token) and closed with `POST
  /api/runs/finish`, which checks the elapsed time against the server clock
  (`check_finish_time`). The `rules` column keeps old boards apart from new
  physics.
- **Maps.** A seed stands for one biome and mood (`seedMap` in
  `biomes/index.ts`); `featuredSeed(biome)` is the lowest seed of each biome,
  used as its showcase course in the map select.
- **Identity.** Behind the portal, `X-User-Id` / `X-User-Name` headers make a
  verified user; elsewhere the browser's own id makes `guest:<client_id>`.
- **A pace to compare against.** The racing-line autopilot
  (`game/autopilot.ts`) can fly any seed; its time is a deterministic
  "author time" for a map nobody has played yet.

## Three boards

| Board | Lifetime | For | Risk |
|:------|:---------|:----|:-----|
| Per-seed | Permanent, exists today | Any seed, friends comparing times, ghosts | None: only your best counts |
| Featured seeds | Permanent, one per biome | Learning a course by heart, hunting | None |
| Ranked daily | One seed per day, settled nightly; rating carries across days | Reading an unseen course under pressure | Points gained **or lost** |

The first two are the same table and endpoints; the featured board is a
menu entry pointing at `featuredSeed(biome)`. Everything below is about the
third.

## The ranked daily

### The seed of the day

- `dailySeed(day)`: a hash of the UTC date, so every client and the server
  agree without a lookup, and the series is unpredictable without the salt
  (server-side secret; the client gets the seed from `GET /api/daily`).
- Today's seed is **hidden from solo play**: the map select and the URL
  route refuse it until the day is over, and the server rejects
  `/api/runs/start` for it outside the daily flow. Yesterday's seed becomes
  an ordinary seed with an ordinary board.

### The entry window

A time trial can be restarted forever; the ladder needs one answer per
player per day. So entering is a decision:

- Your window opens the first time you press *Start* on the daily, and
  closes **15 minutes** or **5 finished attempts** later, whichever comes
  first (both tunable server-side). Your best finished time in the window is
  your result. Crashes that are not restarted do not count as attempts;
  running out the clock mid-run counts the run if it finishes within a grace
  of 60 s.
- Not entering costs nothing that day (see decay below for the long run).
- The window is enforced on the server: `POST /api/daily/start` records
  `window_started_at` for the user; run tokens for the daily carry the day,
  and `/api/runs/finish` refuses tokens whose window has closed.

### Scoring: against your own expectation

Each player has a hidden rating `R` (start 1500). Settlement, once per day
after the UTC rollover (or lazily on the first request after it):

1. **Observed result `P`**: the share of the day's field you beat, ties
   counting half. 1.0 for the fastest, 0.0 for the slowest.
2. **Expected result `E`**: the average, over everyone else in the field, of
   the Elo win probability `1 / (1 + 10^((R_other - R_you) / 400))`. A
   player rated like the field expects 0.5.
3. **Delta** `= K × (P − E)`, clamped to `±K/2`. `K = 60` for a player's
   first 10 settled days, `30` after.

Playing more days does not raise the rating by itself: a Diamond-rated
player who finishes mid-field loses points. Playing more attempts within
the window only improves the one result that counts.

### Small fields: pacers from the autopilot

With five entrants a percentile is noise. The autopilot's time `T_auto` on
the day's seed adds three **pacers** to the field, phantom entrants with a
time and a rating:

| Pacer | Time | Rating |
|:------|:-----|:-------|
| Fast | `0.92 × T_auto` | 1800 |
| Even | `1.00 × T_auto` | 1500 |
| Easy | `1.20 × T_auto` | 1200 |

Each pacer has weight `max(0, 20 − N) / 20` where `N` is the number of human
entrants; humans have weight 1. `P` and `E` are weighted averages. With one
human the pacers decide the day; with twenty or more they vanish. The
multipliers are the thing to tune once there are real times to compare the
autopilot against (it flies the line cleanly but does not boost or cut
gates, so humans should beat it).

### Tiers, floors and the visible number

- The visible score `S` is the rating with floors applied; `R` itself stays
  pure so the expectation stays honest.
- Tiers are bands of `S`: Bronze below 1200, Silver to 1400, Gold to 1600,
  Platinum to 1800, Diamond above.
- **Floor**: the first time `S` reaches a tier in a season, that tier's lower
  bound becomes your floor. `S` can fall to the floor but not through it.
- **Demotion shield**: at the floor, three settled days in a row with a
  negative delta break it; you drop one tier and the floor moves down with
  you. One positive day resets the count.
- The day's result screen shows the time, the percentile, the delta and the
  tier badge; the ranked tab shows `S`, the tier, the season's history of
  deltas and the top of the ladder.

### Later, not in the first version

- **Inactivity decay**: Platinum and above lose 15 points per day after
  seven days without an entry, never below the Platinum floor. Stops
  parking a rank.
- **Seasons**: six weeks; at the rollover `R` moves one third of the way back
  to 1500, floors reset, badges are kept as history.
- **Rooms feeding the rating**: a race room is a small field with the same
  seed; the same formula applies with the room's finishing order. Needs the
  window rule rethought (rooms are one attempt already) and is a bigger
  trust surface.
- **Medals**: gold, silver and bronze thresholds from `T_auto` per seed, for
  the per-seed boards too. Cheap, and gives a target on a seed with no times.

## Trust

- Guests (`guest:<client_id>`) can enter the daily and see the standings but
  are not rated: a second browser is a second account. Behind the portal,
  verified users are rated. Boards show both.
- Times are already bounded by the server clock between start and finish;
  the daily adds the window check and one result per user per day.
- The daily seed cannot be practised in solo on the day (hidden and
  refused), and multiplayer rooms refuse it as a map for the day as well.
- Ghost replays stay per seed; the day's top ghosts become visible when the
  day closes, not during it.

## Data and endpoints

Tables (SQLite, in `store.py`, via `MIGRATIONS`):

```
daily_entries (day, user_id, name, window_started_at, attempts,
               best_time_ms, percentile, expected, delta, settled)
ratings       (user_id, season, rating, score, floor, shield_count,
               days_settled, last_entry_day)
daily_days    (day, seed, auto_time_ms, entrants, settled_at)
```

Endpoints:

- `GET /api/daily`: the day, the seed, your window state (not started /
  open with time and attempts left / closed with your result), the live
  standings (times only; deltas appear after settlement).
- `POST /api/daily/start`: opens your window, returns a run token as
  `/api/runs/start` does. Further attempts inside the window call it again
  and get a token while attempts remain.
- `POST /api/runs/finish`: unchanged for solo; for a daily token it also
  updates `daily_entries`.
- `GET /api/ranked`: your rating, tier, floor, recent deltas; the top of the
  ladder for the season.
- Settlement: a job at the rollover, with the lazy path as a fallback.

Frontend: a **Daily** entry in the menu with the countdown to the next seed
and your window state; the normal HUD during the run with the window timer
in the corner; a results screen with the delta; a ranked tab next to the
leaderboard. Solo's map select hides the day's seed.

## Order of work

1. Server: `dailySeed`, `/api/daily`, the window, one result per day,
   per-day standings. Client: Daily entry, window timer, standings. No
   rating yet. This alone is the "everyone flies the same unseen course"
   experience.
2. Autopilot time per seed on the server (run the course headless in a
   worker, or ship the time computed by the client of the first entrant and
   verify by consensus) and the pacers.
3. Rating, tiers, floors, the ranked tab.
4. Decay, seasons, medals, rooms.

## Open questions

- UTC rollover is simplest; a local-midnight rollover splits the field by
  timezone. Start with UTC and show the local time of the next seed.
- Window length: 15 minutes suits a 2 to 3 minute course; measure how long
  real entries take and adjust.
- Whether the autopilot time should be computed server-side (needs the
  terrain and flight code in Python or a headless Node worker) or trusted
  from clients with agreement checks. Server-side is cleaner; it is the
  only piece that needs the game's code outside the browser.
- `K`, the pacer multipliers and the tier bands are placeholders until there
  are a few weeks of entries.

## Why this shape (the research, briefly)

Across racing games the complaints sort cleanly. Fixed tracks are praised
for mastery, meaningful boards and memorable places, and criticised once
memorised ("not fun when both players have the map by heart"). Generated
tracks are praised for freshness and content, and criticised, almost every
time, for layouts that blur together after a few hours and for having
nothing to remember them by (Descenders, DiRT 4's Your Stage, Road
Redemption). The format with the best word of mouth is the shared unseen
course: Trackmania's Cup of the Day and Random Map Challenge, Race the Sun's
daily world, where reading a course is the skill and everyone starts equal.
Its own failure mode is a board that resets every day with nothing carried
over (Race the Sun), which is what the rating is for. Wind Rider's seeded
courses already are that format; this document adds the window, the
rating and the pacers around it.
