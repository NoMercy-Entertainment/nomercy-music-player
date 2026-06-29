[![npm](https://img.shields.io/npm/v/@nomercy-entertainment/nomercy-music-player/rc?label=rc)](https://www.npmjs.com/package/@nomercy-entertainment/nomercy-music-player)
[![license](https://img.shields.io/npm/l/@nomercy-entertainment/nomercy-music-player)](./LICENSE)
[![bundlephobia](https://img.shields.io/bundlephobia/minzip/@nomercy-entertainment/nomercy-music-player)](https://bundlephobia.com/package/@nomercy-entertainment/nomercy-music-player)

Full documentation: https://docs.nomercy.tv/nomercy-music-player/

# nomercy-music-player

The headless audio engine behind music on NoMercy TV. It is built around the hard part of a music player, the hand-off between two tracks, and hands you plain events and methods so you wire your own interface.

- Sample-accurate crossfade on the Web Audio backend, or a gapless straight-into-the-next transition
- A full equalizer chain and synced lyrics
- Queue and backlog control, repeat and shuffle, and a typed event bus
- `MediaSessionPlugin` for lock-screen and notification controls, plus an auto-advance plugin

It is built on [`@nomercy-entertainment/nomercy-player-core`](https://www.npmjs.com/package/@nomercy-entertainment/nomercy-player-core), the shared engine that carries the queue, auth, plugin system, i18n, and storage.

```
npm install @nomercy-entertainment/nomercy-music-player
```

HLS support is built in. `hls.js` ships with the player core, so `.m3u8` streams work out of the box with nothing extra to install.

> **Upgrading from v1?** See [MIGRATION.md](./MIGRATION.md) for the full breaking-change list, including renamed methods, changed event payloads, and the `item.path` to `item.url` rename that breaks silently if missed. Group listening queue serialization is particularly sensitive to this change.

## Quick start

```ts
import { nmMusicPlayer } from '@nomercy-entertainment/nomercy-music-player';
import { AutoAdvancePlugin, MediaSessionPlugin } from '@nomercy-entertainment/nomercy-music-player/plugins';

const player = nmMusicPlayer('main')
  .addPlugin(AutoAdvancePlugin)
  .addPlugin(MediaSessionPlugin)
  .setup({
    baseUrl: 'https://raw.githubusercontent.com/NoMercy-Entertainment/nomercy-media/master/Music',
    playlist: [
      {
        id: 'bent-wyre-01',
        name: 'Ants Of The Beat',
        url: '/B/bent%20wyre/%5B2025%5D%20If%20Only%20Life%20Was%20This%20Easy%20Volume%205%20-%20The%20Beat%20Misdirect/01%20Ants%20Of%20The%20Beat.mp3',
        artistTracks: [{ id: 1, name: 'bent wyre' }],
      },
    ],
  });

player.on('ready', () => {
  player.item(0, { autoplay: true });
});
```

`AutoAdvancePlugin` advances the queue when a track ends, and `MediaSessionPlugin` wires the lock-screen and notification controls.

## Documentation

The [docs site](https://docs.nomercy.tv/nomercy-music-player/) is the full reference:

- [Quick Start](https://docs.nomercy.tv/nomercy-music-player/quickstart), install, and first track
- [Configuration](https://docs.nomercy.tv/nomercy-music-player/configuration), every option and default
- [API Methods](https://docs.nomercy.tv/nomercy-music-player/api-methods) and [Events](https://docs.nomercy.tv/nomercy-music-player/events)
- [Crossfade](https://docs.nomercy.tv/nomercy-music-player/crossfade), framework guides for Vue and React, lyric sync, the equalizer, and writing your own plugins

## License

Apache-2.0

Repository: [github.com/NoMercy-Entertainment/nomercy-music-player](https://github.com/NoMercy-Entertainment/nomercy-music-player)
