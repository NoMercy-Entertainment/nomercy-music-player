# Migration

## v1 (1.x `PlayerCore`) → v2 (2.0)

v2 is a rewrite on the shared player core. The `PlayerCore` entry stays for
migration and installs `V1MusicCompatPlugin`, which restores the v1 method API
(`getVolume()`, `getCurrentTime()`, `setQueue()`, `playTrack()`, …) and the v1
property reads (`currentTime`, `muted`, `isPlaying`, `isPaused`, `isStopped`,
`isRepeating`, `isShuffling`, `state`, `currentSong`, …) with deprecation
warnings. New code should construct `NMMusicPlayer` directly.

These v1 reads cannot be restored as properties because v2 owns the name as a
method. Call the method instead:

| v1 property read | v2 |
| --- | --- |
| `player.volume` | `player.volume()` (or `player.getVolume()`) |
| `player.duration` | `player.duration()` (or `player.getDuration()`) |
| `player.buffered` | `player.buffered()` (or `player.getBuffer()`) |
| `player.playbackRate` | `player.playbackRate()` |
| `player.volumeState` | `player.volumeState()` (values are now `muted`/`unmuted`) |
| `player.isTransitioning` | `player.isTransitioning()` |
| `player.baseUrl` | `player.baseUrl()` (or `player.setBaseUrl()`) |

Two members have no runtime shim:

- `player.mediaSession` (raw instance) is gone. Use the media-session plugin.
- The `PlayerState` enum is now `PlayState`. Import `PlayState` and map values
  (`BUFFERING`/`ENDED` are not part of `PlayState`).

### Known compat-shim gaps

The shim restores the v1 transport, volume, queue, current-song, repeat/shuffle,
crossfade, and auth methods, and the v1 event names. For a player that drives
playback and reads queue state that is the whole migration. A few v1 surfaces
moved to dedicated plugins in v2, so the shim can only stub them. Check these
against your call sites before assuming "add the plugin and done". v1 `on('queue')`
and `on('backlog')` listeners are safe: they fire on every real mutation, not just
once at startup.

| v1 surface | What the shim does | What to change |
| --- | --- | --- |
| `equalizerBands`, `equalizerPresets`, `equalizerSliderValues`, `equalizerPanning` | Returns the v1 default shapes, not live state. Writes do nothing. | Read and set bands through `getPlugin(EqualizerPlugin)`; set panning through `getPlugin(MixerPlugin)`. |
| `setPreGain()`, `setPanner()`, `setFilter()`, `loadEqualizerSettings()`, `saveEqualizerSettings()` | Logs a deprecation and no-ops. | Use `EqualizerPlugin` and `MixerPlugin` directly. |
| `fadeVolume(level)` | Sets the volume in one step. The v1 ramp is gone. | Use crossfade transitions for ramps, or ramp in your own UI. |
| `isSeeking` | Always `false`. v2 has no distinct seeking phase. | Drive seek-in-progress state from your own UI gesture. |
| `_audioElement1` / `_audioElement2` (and `.motion`) | Returns an inert stub. No visualizer access. | Read frequency data from `SpectrumPlugin` or the `AudioContext`. |
| `getAudioElement()` | Returns `undefined`. v2 does not expose the element. | Use the plugin surfaces above. |
| `siteTitle` / `setSiteTitle()` | Stored but does not touch `document.title`. | Set `document.title` yourself, or use `MediaSessionPlugin`. |

## v2 API-consistency pass (post-rc.19)

`crossfadeTo(track, opts)` is now `crossfadeTo(item, opts)` — the queue/playlist
unit is always called `item` across the v2 trio, never `track` (media-stream
`Track` types like `AudioTrack` are unaffected, those are correct as-is).
Positional call sites don't need changes; the `crossfadeComplete` event payload
changed shape:

```ts
// Before
player.on('crossfadeComplete', ({ track }) => { /* ... */ });

// After
player.on('crossfadeComplete', ({ item }) => { /* ... */ });
```

Five `adapters/` ports were audited for real consumers. Two were dead —
deleted outright, no replacement:

| Removed | Why | Replacement |
| --- | --- | --- |
| `INowPlayingArt`, `MediaSessionArtProvider` (`./adapters/now-playing-art`) | Redundant — nothing in the player called it. `MediaSessionPlugin` already publishes now-playing metadata + artwork. | `getPlugin(MediaSessionPlugin)` |
| `ILyricSource`, `LrcFileSource` (`./adapters/lyric-source`) | Redundant — nothing in the player called it. `LyricsPlugin` already resolves lyrics via `item.lyricsUrl` / `opts.getLyricsUrl`. | `getPlugin(LyricsPlugin)`, or pass `opts.getLyricsUrl` |

Two were real but living in the wrong place — folded into the plugin that
actually drives them:

| Moved | From | To |
| --- | --- | --- |
| `IScrobbler`, `NoopScrobbler` | `./adapters/scrobbler` | `./plugins/scrobble` — now driven by a real `ScrobblePlugin`. Pass `addPlugin(ScrobblePlugin, { scrobbler: myScrobbler })`; the plugin calls `nowPlaying()` / `scrobble()` for you against real listened-time tracking. |
| `IPlaylistGenerator`, `LinearPlaylistGenerator`, `SmartShuffleGenerator` | `./adapters/playlist-generator` | `./plugins/auto-advance` — now `AutoAdvancePlugin`'s `opts.generator`. `addPlugin(AutoAdvancePlugin, { generator: new SmartShuffleGenerator() })`. Omitting `generator` keeps the old linear-queue behavior. |

One is reserved, not yet wired to anything, and no longer advertised as a
public API:

| Kept, unexported | Status |
| --- | --- |
| `ISimilarityEngine` (`./adapters/similarity-engine`) | The interface stays defined in `src/adapters/similarity-engine/` for a future radio-mode / "more like this" feature, but the `./adapters/similarity-engine` subpath export is gone — it had no scoped consumer and was masquerading as a wired API. |

## beta.0 → beta.1 breaking change

`currentSubtitle()`, `currentAudioTrack()`, and `currentQuality()` now return
selection objects instead of bare indexes.

```ts
// Before (beta.0)
const idx: number | null = player.currentAudioTrack();

// After (beta.1)
const sel = player.currentAudioTrack(); // CurrentAudioTrackSelection | null
sel?.index; // number
sel?.track; // AudioTrack
```

Setter forms are unchanged. Full details in the kit migration guide.

---

Full v1 → v2 migration guide lives in the docs site:

**[docs.nomercy.tv/player/music/migration-v1-v2](https://docs.nomercy.tv/player/music/migration-v1-v2)**

Quick orientation:

- The npm name is unchanged. `^1.x` consumers do not auto-upgrade; opt in with an explicit `2.x` bump.
- `item.path` → `item.url`. **Server-side payloads must be updated in the same release as any web migration**, or playback breaks silently for self-hosted users.
- Event payloads, the plugin system, and several method names changed. The full breaking-change diff and replacement examples are in the docs link above.

If you're integrating from scratch, start at the [Quick start](https://docs.nomercy.tv/player/music/quickstart) instead.
