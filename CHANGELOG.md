# Changelog — @nomercy-entertainment/nomercy-music-player

## [2.0.0-rc.24] — 2026-07-03

### Added

- `AudioBackendFactory` now re-exported from the root barrel (`import { AudioBackendFactory } from '@nomercy-entertainment/nomercy-music-player'`). It was declared in `src/types.ts` and used to type `setup()`'s `backendFactory` option, but never exported anywhere public — a consumer following the documented `backendFactory` extension pattern couldn't import the type to annotate their own factory against it. Matches `nomercy-video-player`'s existing `VideoBackendFactory` root export.

### Changed

- `@nomercy-entertainment/nomercy-player-core` dependency range bumped to `^2.0.0-rc.23` (from `^2.0.0-rc.22`) — this release is tested against rc.23, which ships the new declarative `setup({ plugins })` config and the renamed-event dev warning (see core's rc.23 changelog). Both are additive and don't require any code change in this package.

## [2.0.0-rc.23] — 2026-07-03

### Added

- Native `<audio controls>` support: setting `controls: true` on `MusicPlayerConfig` (inherited from `BasePlayerConfig` in `@nomercy-entertainment/nomercy-player-core`) now applies the browser's built-in audio controls when no UI plugin is loaded — matching the video player's existing `controls` behavior. Re-applied on every backend (re)creation, including a runtime `backend(kind)` swap, so it survives a crossfade backend switch.

### Fixed

- Cover-art resolution now reads the cross-library canonical `image` field (inherited from `BasePlaylistItem`) first, falling back to this package's own `cover` field for back-compat — matching how the video player already resolves poster art. Affects `MusicPreloadStrategy.assetsToPreload()` (poster preloading) and `CastSenderPlugin.buildMetadata()` (Cast `MusicTrackMediaMetadata.images[0].url`). Items that only set `image` now get their art preloaded and cast correctly; items that only set `cover` are unaffected. `MusicPlaylistItem.cover` remains a valid field — no removal, additive back-compat only.

### Changed

- `@nomercy-entertainment/nomercy-player-core` dependency range bumped to `^2.0.0-rc.22` (from `^2.0.0-rc.21`) for clarity — this release is tested against rc.22, which is already the published `rc` dist-tag.

## [2.0.0-rc.22] — 2026-07-02

### Breaking

- Realigned with `nomercy-player-core` rc.21's M1 Connect-plugin slice: `volume()`, `mute()`, `unmute()`, `subtitle()`, `audioTrack()`, `playbackRate()`, `repeatState()`, `shuffleState()`, and `dispose()` now return `Promise<void>` on `NMMusicPlayer` and `IMusicPlayer`, matching `IPlayer`. Code that read state synchronously right after calling one of these must now `await` the call first; fire-and-forget callers are unaffected. Requires `@nomercy-entertainment/nomercy-player-core@^2.0.0-rc.21` or newer. (Version jumps rc.20 → rc.22, skipping rc.21, to stay clear of the sibling `nomercy-video-player@2.0.0-rc.21` release that shipped without this alignment.)

### Added

- `crossfadeTo(item, opts)` now dispatches a cancellable `beforeCrossfade` hook before touching any backend buffer — mirrors `crossfadeStart`'s `{ from, to, duration }` payload. A listener may `preventDefault()` to block the handoff (`crossfadePrevented` fires instead, `from` keeps playing) or reshape the target item/duration.
- `V1MusicCompatPlugin` (`import { V1MusicCompatPlugin } from '@nomercy-entertainment/nomercy-music-player'`) — opt-in shim attaching the v1 method surface onto `NMMusicPlayer` via declaration merging. Every shim delegates to the real v2 API and logs one `@deprecated` warning per call. Add via `player.addPlugin(V1MusicCompatPlugin)` before `setup()`; delete the plugin once migrated.

### Fixed

- The wrapped `dispose()` override now awaits the composed cancellable dispose and only tears down the audio backend + registry entry once `phase()` actually reaches `'disposed'`, instead of killing the backend before `beforeDispose` had a chance to run. A plugin calling `preventDefault()` on `beforeDispose` no longer loses its backend.
- Standalone CI (outside the monorepo checkout) now lints cleanly — the ESLint config imports the player rule pack from `@nomercy-entertainment/nomercy-player-core/eslint-plugin` instead of a monorepo-relative path that doesn't exist in a standalone clone.

## [2.0.0-rc.20] — 2026-07-02

### Changed

- Backend routes through the shared core helpers (`createAuthorizationXhrSetup`, `destroyHlsInstance`, `bridgeBackendPlayState`); `BackendEvent` is now derived via `keyof BackendEventPayload`. Internal only; no public surface change.

### BREAKING

- `crossfadeTo(track, opts)` renamed to `crossfadeTo(item, opts)`. Positional callers are unaffected; the `crossfadeComplete` event payload changed from `{ track }` to `{ item }` — update any listener that destructures `track` off that payload.
- `./adapters/now-playing-art` and `./adapters/lyric-source` subpaths removed. Both ports were dead weight — `MediaSessionPlugin` already publishes now-playing metadata/artwork and `LyricsPlugin` already resolves lyrics via `item.lyricsUrl` / `opts.getLyricsUrl`. Delete any import of `INowPlayingArt`, `MediaSessionArtProvider`, `ILyricSource`, or `LrcFileSource` — there is no replacement because nothing in the shipped player called them.
- `./adapters/scrobbler` subpath removed. `IScrobbler` and `NoopScrobbler` moved to `./plugins/scrobble`, alongside the new `ScrobblePlugin` that actually drives them — see Added below.
- `./adapters/playlist-generator` subpath removed. `IPlaylistGenerator`, `LinearPlaylistGenerator`, and `SmartShuffleGenerator` moved to `./plugins/auto-advance`, now wired as `AutoAdvancePlugin`'s `opts.generator`.
- `./adapters/similarity-engine` subpath removed. `ISimilarityEngine` stays defined (reserved for a future radio-mode / "more like this" feature) but is no longer part of the public API surface — it had no consumer.

### Added

- `ScrobblePlugin` (`./plugins/scrobble`) — tracks listened time against the player's `time` / `item` / `ended` events and reports to a configured `IScrobbler`. Calls `nowPlaying(item)` on every item change and `scrobble(item, context)` once listened time crosses `min(duration * thresholdRatio, thresholdSeconds)` — mirrors Last.fm's 50%-or-4-minute rule, both configurable via `opts.thresholdRatio` / `opts.thresholdSeconds`. Items shorter than `opts.minDurationSeconds` (default 30s) are never scrobbled. Defaults to `NoopScrobbler` so registering the plugin without a backend is a safe no-op.
- `AutoAdvancePlugin` gains `opts.generator: IPlaylistGenerator` — plug in `LinearPlaylistGenerator` (default-equivalent), `SmartShuffleGenerator`, or a custom server-driven / radio-mode generator to control "what's next" on `ended` / `itemEndingSoon`. Omitting `opts.generator` keeps the previous observable behavior exactly (delegates to the player's own `next()` / `peekNext()`).

### Removed

- `INowPlayingArt`, `MediaSessionArtProvider` — deleted, no replacement (superseded by `MediaSessionPlugin`).
- `ILyricSource`, `LrcFileSource` — deleted, no replacement (superseded by `LyricsPlugin`).

## [2.0.0-rc.15] — 2026-06-29

### Changed

- The package default export is now the `nmMusicPlayer` factory. `import nmMusicPlayer from '...'` returns the factory directly — no `new`, matching the video player convention. The named `NMMusicPlayer` class and the `nmMPlayer` v1-compat alias remain as named exports.
- The v1-compat `queue` and `backlog` events now fire on every real queue/backlog mutation, not only once at startup.

### Removed

- `DrmPlugin`, `GroupListeningPlugin`, and `LiveTranscodingPlugin` stubs deleted. The `./plugins/drm`, `./plugins/group-listening`, and `./plugins/live-transcoding` subpath exports no longer exist — importing them will 404. These were unimplemented stubs with no production functionality.

### Added

- Real-browser Playwright e2e suite (`e2e/`) with media fixtures generated from the NoMercy ffmpeg fork. Run with `npm run test:e2e`.

## [2.0.0-rc.14] — 2026-06-29

### Changed

- The package default export changed from the `PlayerCore` class to the `nmMusicPlayer` factory. `import nmMusicPlayer from '...'` calls the factory directly — no `new` required, matching the video player convention. The named `NMMusicPlayer` class and the `nmMPlayer` v1-compat alias remain as named exports.

### Removed

- `DrmPlugin`, `GroupListeningPlugin`, and `LiveTranscodingPlugin` stubs deleted. The `./plugins/drm`, `./plugins/group-listening`, and `./plugins/live-transcoding` subpath exports no longer exist.

### Added

- Real-browser Playwright e2e suite (`e2e/`) as the primary integration test layer.

## [2.0.0-rc.13] — 2026-06-28

Version aligned with the trio; pinned `@nomercy-entertainment/nomercy-player-core` rc.13.

## [2.0.0-rc.12] — 2026-06-28

Version aligned with the trio; pinned `@nomercy-entertainment/nomercy-player-core` rc.12.

## [2.0.0-rc.11] — 2026-06-28

Version aligned with the trio; pinned `@nomercy-entertainment/nomercy-player-core` rc.11.

## [2.0.0-rc.10] — 2026-06-28

Version aligned with the trio; pinned `@nomercy-entertainment/nomercy-player-core` rc.10.

## [2.0.0-rc.9] — 2026-06-28

### Changed

- `hls.js` dropped as a direct dependency. The core package owns it; music pulls it transitively. `hls.js` remains a `devDependency` for local test builds.

## [2.0.0-rc.8] — 2026-06-28

### Changed

- Build emits `.js` extensions on all internal imports via `tsc-alias`, enabling clean Node-ESM import without loader hacks.

## [2.0.0-rc.7] — 2026-06-28

### Changed

- Pinned `@nomercy-entertainment/nomercy-player-core` rc.6 (and subsequently rc.7 for the Node-ESM kit-version fix).
- ESLint configured with `--max-warnings 0`; all existing lint warnings resolved.

### Added

- `hls.js` added as a `devDependency` for local build and test runs.

## [2.0.0-rc.6] — 2026-06-14

### Fixed

- The v1-compat plugin now bridges 5 v1 public members (setCurrentTime, setRepeating, fadeVolume, getAudioElement,
  hasNextQueued) that an upgrading v1 consumer
  could call. The plugin once again covers the full v1 public surface, so old
  code keeps working with only the compat plugin added.

## [2.0.0-rc.5] — 2026-06-14

### Changed

- The cast-sender plugin's translations use a typesafe key schema (`en.ts`
  exports the canonical key type; language files are full-coverage
  `satisfies Record<CastSenderTranslationKey, string>`) and ship in every
  supported language.

### Fixed

- The README and the package `homepage` point at the live docs route
  (`docs.nomercy.tv/nomercy-music-player/`) instead of the dead `/player/` path.

## [2.0.0-rc.4] — 2026-06-14

### Fixed

- The standalone build resolves the player core from `node_modules` instead of
  a sibling monorepo checkout, so `build:all` (including the IIFE bundle) runs
  in a clean CI checkout. The vite and vitest configs guard the source aliases
  behind `existsSync` and follow the core's repository rename.
- Every source file carries the `Apache-2.0` license header.

## [2.0.0-rc.2] — 2026-06-14

### Changed

- v1 compatibility now lives entirely in `V1MusicCompatPlugin`. The deprecated
  `PlayerCore` entry installs that plugin instead of patching the instance in
  core, so the clean `NMMusicPlayer` path carries no v1 shims and v1 callers keep
  their full surface with deprecation warnings.
- The WebAudio backend keeps a single shared `AudioContext` across a crossfade,
  and the secondary load carries auth.

### Removed

- The `music-ui` plugin.
- Stale `./plugins/embed`, `./plugins/message`, and `./plugins/tab-leader`
  subpath exports that pointed at unbuilt files. These kit plugins remain
  available through the `./plugins` aggregate or directly from the core package.

## [2.0.0-rc.1] — 2026-06-14

### Added

- First 2.0.0 release candidate. Restores full v1 `PlayerCore` property-read parity so upgrading consumers can read `currentTime`, `duration`, `volume`, and the other v1 public properties through the compat shim without errors.

## [2.0.0-beta.1] — 2026-05-30

### Changed

- Dependency on `@nomercy-entertainment/nomercy-player-core` changed from `file:` local
  path to `^2.0.0-beta.0` semver range — resolves correctly from the npm registry.
- Removed unused `audiomotion-analyzer` production dependency (zero imports in src).
- `contributors` email updated to GitHub noreply address.

---

## [2.0.0-beta.0] — 2026-05-16

First public pre-release. Built on `@nomercy-entertainment/nomercy-player-core` 2.0.0-beta.0
(the shared player kit). Public API surface is stabilized for the beta period.

### Added

- `NMMusicPlayer` — headless music player class, composed from kit mixins
- `nmMPlayer` factory function — primary entry point
- Dual-backend architecture: `AudioElementBackend` (default) and `WebAudioBackend`
- Crossfade engine: `crossfadeTo(track, opts)` with dual-buffer swap, configurable
  duration and easing curve, idempotent guard against stacked crossfades
- `CrossfadeTransitionStrategy` wired by default; overridable via `setTransitionStrategy`
- `MusicPreloadStrategy` — preloads next track at configurable lead time
- Queue management: `queue`, `queueAppend`, `queuePrepend`, `queueInsert`, `queueRemove`,
  `queueMove`, `queueClear`, `queueShuffle`, `queueSort`, `peekNext`, `peekPrevious`
- Backlog support for radio/infinite-scroll sources
- `trackEndingSoon` event with configurable threshold
- `backend:changed` event on runtime backend swap
- Repeat and shuffle state with `repeatState` / `shuffleState` dual getter/setters
- 14 plugins: `auto-advance`, `cast-sender`, `drm`, `embed`, `group-listening`,
  `key-handler`, `live-transcoding`, `lyrics`, `media-session`, `message`,
  `music-ui`, `tab-leader` (all via kit plugin runtime)
- 6 adapter ports: `audio-backend`, `lyric-source`, `now-playing-art`,
  `playlist-generator`, `scrobbler`, `similarity-engine`
- Subpath exports for all adapters and plugins (`./plugins/lyrics`, etc.)
- HLS peer dependency is optional — plain URLs work without hls.js installed
- `audiomotion-analyzer` peer dependency is optional

### Architecture

Replaces the previous monolithic v1 `NMMusicPlayer` which hardcoded all concrete
dependencies. In v2, every dependency is an injected adapter port with a sensible default.
The player class contains only music-domain logic; all shared transport, queue, plugin,
auth, and i18n logic lives in `@nomercy-entertainment/nomercy-player-core`.

### Breaking Changes (v1 → v2)

**Consumer API**

- `seek(time)` renamed to `currentTime(t, opts?)`
- `getDuration()` renamed to `duration()`
- `getCurrentTime()` renamed to `currentTime()`
- `getBuffer()` renamed to `buffered()`
- `getTimeData()` renamed to `timeData()` — payload shape also changed
- `setVolume(v)` renamed to `volume(v)`; `getVolume()` renamed to `volume()`
- `getQueue()` renamed to `queue()`; `setQueue(items)` renamed to `queue(items, opts?)`
- `addToQueue(item)` renamed to `queueAppend(item)`
- `pushToQueue(items)` renamed to `queueAppend(items)`
- `removeFromQueue(item)` renamed to `queueRemove(id)` — takes id, not full item object
- `addToQueueNext(item)` renamed to `queuePrepend(item)`
- `getBackLog()` renamed to `backlog()`; `setBackLog(items)` renamed to `backlog(items)`
- `addToBackLog(item)` / `pushToBackLog(items)` renamed to `backlogAppend(item)`
- `removeFromBackLog(item)` renamed to `backlogRemove(id)` — takes id
- `playTrack(track, tracks?)` split into `current(track)` + `queue(tracks)`
- `setCurrentSong(item)` renamed to `current(item, opts?)`
- `currentSong` property replaced by `current()` method
- `shuffle(bool)` renamed to `shuffleState(ShuffleState)` — boolean → `ShuffleState` enum
- `repeat(value)` renamed to `repeatState(value)`
- `prepareCrossfade(item?)` replaced by `crossfadeTo(track, opts?)` — semantics changed: v1 staged for later, v2 starts immediately
- `setAccessToken(token)` replaced by `auth({ bearerToken: token })`
- `setBaseUrl(url)` renamed to `baseUrl(url)`
- `isShuffling` property replaced by `shuffleState()` method
- `isRepeating` property replaced by `repeatState()` method
- `isMuted` property replaced by `volumeState()` method (returns enum)
- `isPlaying` property / `state` enum replaced by `playState()` method
- `_crossfadeActive` property replaced by `isTransitioning()` method
- `context` (AudioContext) property replaced by `audioContext()` method
- `isPlatform(platform)` replaced by `isMobile()` / `isTv()` separate methods
- `loadEqualizerSettings()` / `saveEqualizerSettings()` / `setPreGain()` / `setFilter()` relocated to `EqualizerPlugin`
- `setPanner()` relocated to `MixerPlugin`
- `setAutoPlayback(v)` replaced by `setup({ disableAutoPlayback: !v })` — config-time only

**Constructor options removed**

- `siteTitle` removed — player must not touch `document.title`
- `motionConfig` / `motionColors` replaced by `addPlugin(SpectrumPlugin, { ... })`
- `actions` (MediaSession) replaced by `addPlugin(MediaSessionPlugin, { ... })`
- `onCrossfadeStart` / `onCrossfadeComplete` callbacks replaced by `player.on('crossfadeStart', fn)` / `player.on('crossfadeComplete', fn)`
- `fadeDuration` replaced by `setup({ crossfadeDefaults: { durationMs } })`
- `prefetchLeeway` replaced by `setup({ preloadLeadSeconds })`
- `debug` → `logLevel: 'debug'`

**Event renames**

- `song` renamed to `current`
- `fatalError` renamed to `fatal`
- `loadstart` replaced by `setupStart` / `beforeLoad`

**Event payload shape changes**

- `play` / `pause` / `ended`: `HTMLAudioElement` → `ActionOptions` / `void`
- `current` (was `song`): `S | null` → `{ item: T | undefined; index: number }`
- `time` / `seeked`: `TimeState` (5 fields) → `{ time: number }`
- `duration`: `number` → `{ duration: number }`
- `shuffle`: `boolean` → `{ state: ShuffleState }`
- `repeat`: `RepeatState` string → `{ state: RepeatState }`
- `mute`: `boolean` → `{ muted: boolean }`
- `volume`: `number` → `{ level: number }`
- `crossfadeStart`: `void` → `{ from: T; to: T; duration: number }`
- `crossfadeComplete`: `void` → `{ track: T }`
- `error`: `HTMLAudioElement` → `PlayerErrorEvent`
- `fatal` (was `fatalError`): ad-hoc object → `PlayerErrorEvent`
- `canplay` / `waiting`: `HTMLAudioElement` → `void`

**Events removed (internal signals that were never public)**

- `queueNext`, `startFadeOut`, `endFadeOut`, `nextSong`, `setCurrentAudio`
- `setPreGain`, `setPanner`, `setFilter` (relocated to plugin events)
- `time-internal`, `play-internal`, `pause-internal`, `loadedmetadata`

**Playlist item field changes**

- `path: string` renamed to `url?: string` — **silent break if server emits `path` and app passes items directly to player; group listening queue serialization is particularly sensitive**
- `album_track` changed from required to optional
- `artist_track` changed from required to optional

**Plugins that moved from always-on to opt-in**

- Equalizer + Spectrum: `addPlugin(AudioGraphPlugin)` + `addPlugin(EqualizerPlugin)` + `addPlugin(SpectrumPlugin)`
- MediaSession: `addPlugin(MediaSessionPlugin)`
- Auto-advance: `addPlugin(AutoAdvancePlugin)`

**Migration guide:** See [MIGRATION.md](./MIGRATION.md) for per-change detail, code examples, and volume storage key migration notes.
