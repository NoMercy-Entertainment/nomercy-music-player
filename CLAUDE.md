# NoMercy Music Player v2

Headless, plugin-driven, event-driven music player engine. Built on `@nomercy-entertainment/nomercy-player-core`.

## Tech stack

- TypeScript (ES2022), outputs ESM via `tsc` + IIFE CDN bundle via Vite (`build:iife`)
- Testing: Vitest (unit) + Playwright (e2e)
- Linting: `@antfu/eslint-config` (ESLint 9 flat config) + `@nomercy-entertainment/eslint-plugin-player` (planned)
- Formatting: Prettier — tabs, width 4, single quotes, semis, printWidth 150

## Structure

```
src/
  player/
    audio-backend/        # IAudioBackend + audio-element + webaudio impls
    *.ts                  # mixins composed onto NMMusicPlayer prototype
  plugins/                # auto-advance, equalizer, spectrum, lyrics, + re-exports
  streams/                # re-exports of kit's streams/ for ergonomic imports
  types.ts                # MusicEventMap, MusicPlayerConfig, enums
  index.ts                # nmMusicPlayer factory (default export) + nmMPlayer (v1 compat alias) + NMMusicPlayer class + PlayerCore v1 compat wrapper
```

## Conventions

- Files: camelCase (`audioElementBackend.ts`)
- Classes/Types: PascalCase
- npm scope: `@nomercy-entertainment/nomercy-music-player`
- Module type: ESM (`"type": "module"`)
- Subpath exports for plugins, backends, streams — tree-shakable

## Rules

- Headless. No UI in core. UI is a plugin concern.
- Every feature beyond raw transport is a plugin.
- Every plugin uses core's `Plugin` base — `static readonly id`, `use()`, `dispose()`.
- Listeners go through `this.listen()` / `this.on()` (auto-cleaned). Inline arrows are forbidden.
- Timers go through `this.timeout` / `this.interval` (auto-cleared).
- Plugins surface errors only via `this.throw({ ... })` — never `this.player.emit('error', ...)` directly.
- Plugin teardown is enforced by core's leak harness — runs in CI on every plugin.
- Run `npm run typecheck` and `npm test` before committing changes.

## Conventions locked in this branch

- **Method shape:** stateful = overloaded function (`volume()` reads, `volume(v)` writes). Action = verb. State = enum-returning function (`playState()` returns `PlayState`).
- **Position is set via `currentTime(t)`.** No `seek(t)` method.
- **Queue API delegates to `MediaList<T>` in core.** `queue()`, `queueAppend`, `queuePrepend`, `queueInsert`, `queueRemove`, `queueRemoveAt`, `queueMove`, `queueClear`, `queueShuffle`, `queueSort`, `peekNext`, `peekPrevious`.
- **Error categories:** stream(01), media(02), auth(03), network(04), drm(05), cue(06), policy(07), resource(08), player(09 — collapsed lifecycle+state), plugin(10), mediasession(11), visualization(12).
- **Decode errors split:** `media/decode-fatal-variant` (try next rendition) vs `media/decode-fatal-all` (no fallback).
- **401 vs 403 — never conflated.** 401 may refresh-and-retry once. 403 propagates immediately.
- **Visualization architecture:** three layers — Layer 1 (`SpectrumAnalyzer` data source via events), Layer 2 (`VisualizationPlugin` canvas convenience), Layer 3 (render-lib bridges, separate packages).
- **Embed-context:** `embedPlugin` (in core) handles iframe postMessage. Does NOT touch MediaSession — each frame owns its own.
- **iframe `allow` directive:** `autoplay` is load-bearing for OS-level controls. See spec §19.
