# FrameShot

A client-side web app that frames your photos with elegant borders and displays EXIF metadata. No server, no uploads — everything runs in your browser.

## Features

- **5 Frame Styles**
  - **Clean** — Off-white gallery print with metadata caption
  - **Cinema** — Dark matte frame with monospace ARRI-style overlay and REC indicator
  - **Film Strip** — 35mm film negative with sprocket holes and amber rebate text
  - **Polaroid** — Classic instant print with handwritten-style metadata
  - **Editorial** — Magazine layout with bold typography and red accent bar

- **EXIF Extraction** — Reads camera, lens, focal length, aperture, shutter speed, ISO, and date from your photos
- **Multi-Photo Support** — Upload multiple photos, navigate with thumbnails or arrow keys, batch download all
- **Aspect Ratio Crop** — Original, 1:1, 4:5, 3:4, 16:9, 9:16
- **RAW/DNG Support** — Accepts DNG, CR2, CR3, NEF, ARW, ORF, RW2, RAF, and more via embedded preview extraction
- **Pixel-Perfect Export** — Canvas-based rendering ensures the download is identical to the preview
- **Fully Client-Side** — No data leaves your browser

## Usage

Open `index.html` in a browser, or serve locally:

```
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

1. Drop photos (or click to browse)
2. Pick a frame style and aspect ratio
3. Download the framed image

## Tech Stack

- HTML, CSS, JavaScript — no frameworks, no build tools
- [exifr](https://github.com/MikeKovarik/exifr) — EXIF parsing (CDN)
- Google Fonts — Inter, JetBrains Mono, Caveat, DM Sans

## File Structure

```
FrameShot/
├── index.html    — Page structure and CDN links
├── styles.css    — Dark theme UI, responsive layout
└── app.js        — Upload, EXIF parsing, canvas rendering, export
```
