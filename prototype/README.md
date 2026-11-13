# Everyday English — private PWA proof of concept

A runnable, dependency-free first vertical slice for a French-speaking adult starting English from the beginning.

## Run locally

1. Install Python 3.
2. In this folder, run `python3 -m http.server 8080`.
3. Open **http://localhost:8080** in Chrome or Edge.
4. Allow the camera only if desired. The microphone button uses browser speech recognition, which is not supported by all browsers.
5. For PWA installation, use the browser's install/add-to-home-screen option if supported. PNG app icons are included for installability.

Use `localhost`, not opening `index.html` directly: module imports and service workers need a web origin.

## What actually works

- Five interactive activities: listening comprehension, speaking/typing, reading, and a transfer prompt.
- English text-to-speech using the browser's voice engine.
- Optional browser speech recognition with typed fallback; **recognized words are only a rough proxy for speaking**, not a pronunciation measure.
- French assistance, replay, scaffolding after repeated difficulty, and skip.
- Optional webcam preview with no recording or uploads; visible on/off controls.
- Local learning evidence, session resumption, export, and clearing.
- Web app manifest and offline-first caching for previously visited static resources.

## What this is NOT

- **Not** a live AI tutor: there is no AI model/API integration yet.
- **Not** an evaluation of your dad's language level or learning style.
- **Not** a deployed, remotely hosted, authenticated, cross-device or production-ready app.
- **Not** camera interpretation: the camera is a local preview only.
- **Not** guaranteed offline speech: speech recognition/voices may need the browser's services or network.
- **Not** a secure multi-user data store: localStorage is for prototype data only.

## Roadmap

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md).
