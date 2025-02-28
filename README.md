# Sample Browser

A minimalist audio sample browser with waveform visualization, designed for sound designers and music producers.

## Features

- Clean, dark interface inspired by modern audio workstations
- Browse folders and ZIP files containing audio samples
- Waveform visualization with precise playback control
- Auto-looping functionality with toggle option
- Support for common audio formats (WAV, MP3, FLAC, etc.)
- File metadata display

## Installation

### Prerequisites

- Node.js (v14+)
- npm or yarn

### Setup

1. Clone or download this repository
2. Install dependencies:

```bash
npm install
```

## Usage

To run the application:

```bash
npm start
```

1. Click "Open Folder" to browse a folder containing audio samples, or "Open ZIP" to open a ZIP archive
2. Navigate through folders using the file explorer on the left
3. Click on an audio file to select it and view its waveform
4. Use the play/pause button to control playback
5. Toggle looping on/off with the loop button

## Technologies

- Electron
- WaveSurfer.js
- JSZip

## License

MIT 