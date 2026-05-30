# Changelog — @nomercy-entertainment/nomercy-music-player

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
