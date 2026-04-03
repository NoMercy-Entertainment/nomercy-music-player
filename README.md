# NoMercy Music Player

**Headless HTML5 Audio Player Built with TypeScript**

Tired of fighting player UI choices? This one has no UI, no opinions - just pure audio power for your custom player.

[![NPM Version](https://img.shields.io/npm/v/@nomercy-entertainment/nomercy-music-player?style=flat&logo=npm&logoColor=white&color=cb3837)](https://www.npmjs.com/package/@nomercy-entertainment/nomercy-music-player)
[![NPM Downloads](https://img.shields.io/npm/dm/@nomercy-entertainment/nomercy-music-player?style=flat&logo=npm&logoColor=white&color=cb3837)](https://www.npmjs.com/package/@nomercy-entertainment/nomercy-music-player)
[![Build Status](https://img.shields.io/github/actions/workflow/status/NoMercy-Entertainment/nomercy-music-player/release.yml?style=flat&logo=github&logoColor=white)](https://github.com/NoMercy-Entertainment/nomercy-music-player/actions)
[![License](https://img.shields.io/github/license/NoMercy-Entertainment/nomercy-music-player?style=flat&color=green)](./LICENSE)

[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-3178c6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Framework Agnostic](https://img.shields.io/badge/Framework-Agnostic-orange?style=flat)](https://github.com/NoMercy-Entertainment/nomercy-music-player)
[![GitHub Stars](https://img.shields.io/github/stars/NoMercy-Entertainment/nomercy-music-player?style=flat&logo=github&logoColor=white&color=yellow)](https://github.com/NoMercy-Entertainment/nomercy-music-player/stargazers)

## About

A headless HTML5 audio player built with TypeScript. Provides a comprehensive audio engine without imposing any UI decisions on your application.

**Powers music playback in [NoMercyTV](https://nomercy.tv)**

## Features

### Core Audio Features
- **Multi-Format Support**: MP3, FLAC, M4A, AAC, OGG, and more
- **HLS Streaming**: Adaptive streaming with [hls.js](https://github.com/video-dev/hls.js) integration
- **Cross-Platform**: Works across modern browsers and platforms
- **Hardware Acceleration**: Uses Web Audio API for performance

### Advanced Audio Processing
- **10-Band Equalizer**: EQ with 17 built-in presets (Rock, Pop, Classical, etc.)
- **Spectrum Analyzer**: Real-time visualization with [AudioMotion](https://github.com/hvianna/audioMotion-analyzer)
- **Audio Panning**: Stereo field control and spatial audio positioning
- **Crossfade Support**: Smooth transitions between tracks with customizable fade duration

### Modern Integration
- **Framework Agnostic**: Works with Vue, React, Angular, Svelte, Vanilla JS
- **TypeScript**: Full type safety with comprehensive interfaces
- **Media Session API**: Native OS media controls and lock screen integration
- **Event-Driven Architecture**: React to player state changes

### Queue Management
- **Queue System**: Add, remove, reorder tracks with state management
- **Shuffle & Repeat**: Playback modes with state persistence
- **Backlog Tracking**: Playback history with navigation support
- **Auto-Queue Management**: Next-track loading and crossfade preparation

## 🚀 Quick Start

### Installation

Choose your preferred package manager:

```bash
# npm
npm install @nomercy-entertainment/nomercy-music-player

# yarn
yarn add @nomercy-entertainment/nomercy-music-player

# pnpm
pnpm add @nomercy-entertainment/nomercy-music-player
```

### Basic Usage

```typescript
import { PlayerCore } from '@nomercy-entertainment/nomercy-music-player';
import type { BasePlaylistItem } from '@nomercy-entertainment/nomercy-music-player';

// Create player instance
const player = new PlayerCore<BasePlaylistItem>({
  baseUrl: 'https://your-media-server.com/',
  siteTitle: 'My Music App',
  expose: true, // Optional: expose to window.musicPlayer
});

// Set up your playlist
const playlist: BasePlaylistItem[] = [
  {
    name: "Bohemian Rhapsody",
    path: "/music/queen/bohemian-rhapsody.mp3",
    artist_track: [{ name: "Queen" }],
    album_track: [{ name: "A Night at the Opera" }]
  }
];

// Load and play
player.setQueue(playlist);
player.playTrack(playlist[0]);

// Listen to events
player.on('play', () => console.log('Playback started'));
player.on('song', (track) => console.log('Now playing:', track?.name));
player.on('time', (timeState) => {
  console.log(`${timeState.position}s / ${timeState.duration}s`);
});
```

## 🎯 Framework Integration

**💡 Need framework-specific help?** Check out our comprehensive guides:

- **[Vue 3 Integration Guide](https://github.com/NoMercy-Entertainment/nomercy-music-player/wiki/Vue-Integration)** - Composition API, Pinia stores, and reactive patterns
- **[React Integration Guide](https://github.com/NoMercy-Entertainment/nomercy-music-player/wiki/React-Integration)** - Hooks, context, and TypeScript patterns
- **[Quick Start Guide](https://github.com/NoMercy-Entertainment/nomercy-music-player/wiki/Quick-Start-Guide)** - Get running in 5 minutes

### Vanilla JavaScript Example

```javascript
// Simple setup for vanilla JavaScript projects
const player = new PlayerCore({
  baseUrl: 'https://your-server.com',
  siteTitle: 'My Music App',
  expose: true // Access via window.musicPlayer
});

// Event handling
player.on('play', () => console.log('Playing'));
player.on('song', (track) => console.log('Now playing:', track?.name));

// Basic controls
player.play();
player.pause();
player.next();
player.previous();
player.setVolume(75);
```

## 📖 Documentation

| Resource | Description |
|----------|-------------|
| **[🏠 Wiki Home](https://github.com/NoMercy-Entertainment/nomercy-music-player/wiki)** | Complete documentation hub |
| **[⚡ Quick Start](https://github.com/NoMercy-Entertainment/nomercy-music-player/wiki/Quick-Start-Guide)** | Get running in 5 minutes |
| **[📚 API Reference](https://github.com/NoMercy-Entertainment/nomercy-music-player/blob/master/API.md)** | Complete TypeScript API docs |
| **[🔧 Troubleshooting](https://github.com/NoMercy-Entertainment/nomercy-music-player/wiki/Troubleshooting)** | Common issues and solutions |
| **[🏗️ Architecture](https://github.com/NoMercy-Entertainment/nomercy-music-player/wiki/Player-Architecture)** | Technical implementation details |

## 🎛️ Advanced Features

### Equalizer System

The built-in 10-band equalizer provides professional audio control:

```typescript
// Access equalizer presets
const presets = player.equalizerPresets;
console.log(presets.map(p => p.name)); 
// ['Classical', 'Club', 'Dance', 'Flat', 'Pop', 'Rock', ...]

// Custom EQ configuration
player.setFilter({ frequency: 1000, gain: 5 }); // Boost 1kHz by 5dB
player.setPreGain(2); // Set pre-amplification
player.setPanner(-0.5); // Pan 50% to the left

// Save current EQ settings
player.saveEqualizerSettings();
```

### Spectrum Analyzer

Real-time audio visualization powered by AudioMotion-Analyzer:

```typescript
const player = new PlayerCore({
  baseUrl: 'https://cdn.example.com/',
  siteTitle: 'Visual Music Player',
  motionConfig: {
    mode: 2,                    // Visualization mode
    fftSize: 8192,             // Frequency resolution
    barSpace: 0.25,            // Bar spacing
    channelLayout: "dual-horizontal"
  },
  motionColors: ['#ff0066', '#00ff66', '#0066ff'] // Custom color palette
});
```

### Queue Management

Advanced queue operations with intelligent state management:

```typescript
// Queue operations
player.addToQueue(track);           // Add to end of queue
player.addToQueueNext(track);       // Add to play next
player.removeFromQueue(track);      // Remove specific track
player.setQueue(newTracks);         // Replace entire queue

// Playback modes
player.shuffle(true);               // Enable shuffle
player.repeat('all');               // Set repeat mode: 'off', 'one', 'all'

// Navigation
player.next();                      // Skip to next track
player.previous();                  // Previous track or restart current
```

### Media Session Integration

Native OS media controls with metadata:

```typescript
const player = new PlayerCore({
  baseUrl: 'https://cdn.example.com/',
  siteTitle: 'My Music App',
  actions: {
    play: () => handlePlayAction(),
    pause: () => handlePauseAction(),
    stop: () => handleStopAction(),
    seekbackward: () => player.seek(player.currentTime - 10),
    seekforward: () => player.seek(player.currentTime + 10),
    previoustrack: () => player.previous(),
    nexttrack: () => player.next(),
  }
});
```

## 🔧 Browser Support

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Core Audio | ✅ | ✅ | ✅ | ✅ |
| Web Audio API | ✅ | ✅ | ✅ | ✅ |
| Media Session | ✅ | ✅ | ✅ | ✅ |
| HLS Streaming | ✅ | ✅ | ✅* | ✅ |
| Spectrum Analyzer | ✅ | ✅ | ✅ | ✅ |

*Safari has native HLS support

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](https://github.com/NoMercy-Entertainment/nomercy-music-player/blob/master/CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/NoMercy-Entertainment/nomercy-music-player.git
cd nomercy-music-player

# Install dependencies
npm install

# Start development
npm run build
npm run test
```

## 📄 License

This project is licensed under the [Apache 2.0 License](./LICENSE) - see the LICENSE file for details.

## 🏢 About NoMercy Entertainment

NoMercy Entertainment builds open-source media tools that give developers full control over their audio and video.

### Our Ecosystem

- **[NoMercy MediaServer](https://github.com/NoMercy-Entertainment/nomercy-media-server)** - Complete media server solution
- **[NoMercy VideoPlayer](https://github.com/NoMercy-Entertainment/nomercy-video-player)** - Advanced HTML5 video player
- **[NoMercy FFmpeg](https://github.com/NoMercy-Entertainment/nomercy-ffmpeg)** - Optimized FFmpeg builds  
- **[NoMercy Music Player](https://github.com/NoMercy-Entertainment/nomercy-music-player)** - Headless audio engine
- **[NoMercy Tesseract](https://github.com/NoMercy-Entertainment/nomercy-tesseract)** - OCR training data

### Links

- 🌐 **Website**: [nomercy.tv](https://nomercy.tv)
- 📧 **Contact**: [support@nomercy.tv](mailto:support@nomercy.tv)  
- 💼 **GitHub**: [@NoMercy-Entertainment](https://github.com/NoMercy-Entertainment)
- 🎮 **Demo**: [examples.nomercy.tv/musicplayer](https://examples.nomercy.tv/musicplayer)

---

<div align="center">

**Built with ❤️ by the NoMercy Engineering Team**

*Empowering developers to create extraordinary audio experiences*

</div>