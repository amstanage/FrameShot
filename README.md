<div align="center">

# FrameShot

**Frame your photos. Show your settings.**

A client-side web app that wraps your photos in beautiful frames with EXIF metadata baked in.
No server, no uploads, no tracking — everything runs in your browser.

---

`CLEAN` | `CINEMA` | `FILM STRIP` | `POLAROID` | `EDITORIAL`

---

</div>

## Frame Styles

| Style | Look | Metadata |
|-------|------|----------|
| **Clean** | Off-white gallery print | Camera + lens left, exposure right, thin divider |
| **Cinema** | Matte black with REC dot | Monospace uppercase, pipe-separated, ARRI-style |
| **Film Strip** | 35mm negative with sprocket holes | Amber rebate text, Kodak edge-print aesthetic |
| **Polaroid** | Warm cream, wide bottom border | Handwritten Caveat font, slight rotation |
| **Editorial** | Pure white, bold typography | Large display camera name, red accent bar, 3-col exposure grid |

## Features

| | |
|---|---|
| **Multi-Photo** | Upload batches, navigate with thumbnails or `←` `→` keys, download all at once |
| **Aspect Ratio** | Crop to `Original` `1:1` `4:5` `3:4` `16:9` `9:16` |
| **RAW Support** | DNG, CR2, CR3, NEF, ARW, ORF, RW2, RAF via embedded preview extraction |
| **EXIF** | Camera, lens, focal length, aperture, shutter speed, ISO, date |
| **WYSIWYG** | Canvas-based rendering — preview and export are pixel-identical |
| **Private** | Fully client-side. Your photos never leave your machine |

## Quick Start

```bash
# no install, no build, no dependencies
python3 -m http.server 8080
# open http://localhost:8080
```

Or just open `index.html` directly.

**Drop photos → pick a style → download.**

## Tech

```
FrameShot/
├── index.html    — markup + CDN links
├── styles.css    — dark theme UI
└── app.js        — upload, EXIF, canvas rendering, export
```

Three files. Zero build steps. Vanilla HTML/CSS/JS.

| Dependency | Role | Loaded via |
|------------|------|------------|
| [exifr](https://github.com/MikeKovarik/exifr) | EXIF parsing | CDN |
| [Inter](https://rsms.me/inter/) | UI typography | Google Fonts |
| [JetBrains Mono](https://www.jetbrains.com/lp/mono/) | EXIF values / Cinema style | Google Fonts |
| [Caveat](https://fonts.google.com/specimen/Caveat) | Polaroid handwriting | Google Fonts |
| [DM Sans](https://fonts.google.com/specimen/DM+Sans) | Editorial display type | Google Fonts |

## Supported Formats

**Standard** — JPEG, PNG, WebP, TIFF

**RAW** — DNG, CR2, CR3, NEF, ARW, ORF, RW2, RAF, PEF, SRW

> RAW files use the embedded JPEG preview for display. EXIF data is extracted at full fidelity.

---

<div align="center">

Made with FrameShot

</div>
