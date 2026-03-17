/* ============================================
   1. STATE
   ============================================ */

let photos = [];          // [{ image, exif, name, src }]
let currentIndex = 0;
let currentFrameStyle = 'cinematic';
let currentAspectRatio = 'original';
let isExporting = false;

const RAW_EXTENSIONS = ['.dng', '.cr2', '.cr3', '.nef', '.arw', '.orf', '.rw2', '.raf', '.raw', '.pef', '.srw'];

const ASPECT_RATIOS = {
    'original': null,
    '1:1': 1,
    '4:5': 4 / 5,
    '3:4': 3 / 4,
    '16:9': 16 / 9,
    '9:16': 9 / 16
};

/* ============================================
   2. DOM REFERENCES (resolved in init)
   ============================================ */

const $ = (sel) => document.querySelector(sel);
let uploadView, uploadZone, fileInput, workspace, previewCanvas;
let photoStrip, photoCounter, btnDownload, btnDownloadAll, btnAdd, btnNew, toastContainer;

/* ============================================
   3. EXIF PARSING & FORMATTING
   ============================================ */

async function parseExif(file) {
    try {
        const raw = await exifr.parse(file, {
            tiff: true,
            exif: true,
            gps: false,
            icc: false,
            iptc: false,
            xmp: true,
            mergeOutput: true
        });
        return normalizeExif(raw);
    } catch (e) {
        console.warn('EXIF parsing failed:', e);
        return null;
    }
}

function normalizeExif(raw) {
    if (!raw) return null;
    const result = {
        make: raw.Make || null,
        model: cleanModelName(raw.Model, raw.Make),
        lens: raw.LensModel || raw.Lens || null,
        focalLength: raw.FocalLength ? `${Math.round(raw.FocalLength)}mm` : null,
        aperture: raw.FNumber ? `f/${raw.FNumber}` : null,
        shutterSpeed: formatShutterSpeed(raw.ExposureTime),
        iso: raw.ISO ? `ISO ${raw.ISO}` : null,
        dateTaken: raw.DateTimeOriginal ? formatDate(raw.DateTimeOriginal) : null,
    };
    const hasData = Object.values(result).some(v => v !== null);
    return hasData ? result : null;
}

function cleanModelName(model, make) {
    if (!model) return null;
    if (make && model.toUpperCase().startsWith(make.toUpperCase())) {
        return model.substring(make.length).trim();
    }
    return model;
}

function formatShutterSpeed(exposureTime) {
    if (!exposureTime) return null;
    if (exposureTime >= 1) return `${exposureTime}s`;
    return `1/${Math.round(1 / exposureTime)}s`;
}

function formatDate(dateVal) {
    if (!dateVal) return null;
    const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDateShort(dateVal) {
    if (!dateVal) return null;
    const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
    if (isNaN(d.getTime())) return null;
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

/* ============================================
   4. RAW FORMAT HANDLING
   ============================================ */

function isRawFormat(filename) {
    const ext = '.' + filename.split('.').pop().toLowerCase();
    return RAW_EXTENSIONS.includes(ext);
}

function isImageFile(file) {
    return file.type.startsWith('image/') || isRawFormat(file.name);
}

async function extractRawPreview(file) {
    try {
        const url = await exifr.thumbnailUrl(file);
        if (url) return url;
    } catch (e) { /* continue */ }

    try {
        const dataUrl = await readFileAsDataURL(file);
        return await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img.naturalWidth > 0 ? dataUrl : null);
            img.onerror = () => resolve(null);
            img.src = dataUrl;
        });
    } catch (e) { /* continue */ }

    return null;
}

/* ============================================
   5. UPLOAD HANDLING
   ============================================ */

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    uploadZone.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    uploadZone.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    uploadZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files);
}

async function processFiles(fileList) {
    const files = Array.from(fileList).filter(isImageFile);
    if (files.length === 0) {
        showToast('No supported image files found.', 'error');
        return;
    }

    const startIdx = photos.length;
    let loaded = 0;
    let rawWarned = false;

    for (const file of files) {
        try {
            const photo = await loadSinglePhoto(file);
            if (photo) {
                photos.push(photo);
                loaded++;
                if (isRawFormat(file.name) && !rawWarned) {
                    showToast('RAW files use embedded preview — resolution may be lower.');
                    rawWarned = true;
                }
            }
        } catch (e) {
            console.warn(`Failed to load ${file.name}:`, e);
        }
    }

    if (loaded === 0) {
        showToast('Failed to load any images.', 'error');
        return;
    }

    showToast(`Loaded ${loaded} photo${loaded > 1 ? 's' : ''}.`);
    uploadView.hidden = true;
    workspace.hidden = false;
    showPhoto(startIdx);
    updateMultiPhotoUI();
}

async function loadSinglePhoto(file) {
    let imgSrc;
    if (isRawFormat(file.name)) {
        imgSrc = await extractRawPreview(file);
        if (!imgSrc) {
            showToast(`Could not load preview for ${file.name}`, 'error');
            return null;
        }
    } else {
        imgSrc = await readFileAsDataURL(file);
    }

    const exif = await parseExif(file);
    const img = new Image();
    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = imgSrc;
    });

    return { image: img, exif, name: file.name, src: imgSrc };
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/* ============================================
   6. PHOTO NAVIGATION
   ============================================ */

function showPhoto(index) {
    if (index < 0 || index >= photos.length) return;
    currentIndex = index;
    updateExifPanel(photos[currentIndex].exif);
    renderPreview();
    updatePhotoStripActive();
    updatePhotoCounter();
}

function updateMultiPhotoUI() {
    const multi = photos.length > 1;
    btnDownloadAll.hidden = !multi;
    btnDownloadAll.textContent = `Download All (${photos.length})`;
    photoStrip.hidden = !multi;
    photoCounter.hidden = !multi;
    renderPhotoStrip();
    updatePhotoCounter();
}

function renderPhotoStrip() {
    photoStrip.innerHTML = photos.map((p, i) => `
        <button class="strip-thumb${i === currentIndex ? ' active' : ''}"
                data-index="${i}" title="${esc(p.name)}">
            <img src="${p.src}" alt="${esc(p.name)}">
        </button>
    `).join('');
}

function updatePhotoStripActive() {
    photoStrip.querySelectorAll('.strip-thumb').forEach((btn, i) => {
        btn.classList.toggle('active', i === currentIndex);
    });
    const active = photoStrip.querySelector('.active');
    if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

function updatePhotoCounter() {
    if (photos.length <= 1) { photoCounter.hidden = true; return; }
    photoCounter.hidden = false;
    photoCounter.textContent = `${currentIndex + 1} / ${photos.length}`;
}

/* ============================================
   7. CONTROLS
   ============================================ */

function setFrameStyle(style) {
    currentFrameStyle = style;
    document.querySelectorAll('.style-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.style === style);
    });
    renderPreview();
}

function setAspectRatio(ratio) {
    currentAspectRatio = ratio;
    document.querySelectorAll('.ratio-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.ratio === ratio);
    });
    renderPreview();
}

function updateExifPanel(exif) {
    const ids = ['camera', 'lens', 'focal', 'aperture', 'shutter', 'iso', 'date'];
    if (!exif) {
        ids.forEach(id => {
            const el = $(`#exif-${id}-value`) || $(`#exif-${id}`);
            if (el) el.textContent = '--';
        });
        $('#exif-empty').hidden = false;
        return;
    }
    $('#exif-empty').hidden = true;
    const camera = [exif.make, exif.model].filter(Boolean).join(' ');
    $('#exif-camera-value').textContent = camera || '--';
    $('#exif-lens-value').textContent = exif.lens || '--';
    $('#exif-focal').textContent = exif.focalLength || '--';
    $('#exif-aperture').textContent = exif.aperture || '--';
    $('#exif-shutter').textContent = exif.shutterSpeed || '--';
    $('#exif-iso').textContent = exif.iso || '--';
    $('#exif-date-value').textContent = exif.dateTaken || '--';
}

/* ============================================
   8. CANVAS RENDERING (shared by preview + export)
   ============================================ */

function getCropRect(imgW, imgH, targetRatio) {
    if (!targetRatio) return { sx: 0, sy: 0, sw: imgW, sh: imgH };
    const imgRatio = imgW / imgH;
    let sx, sy, sw, sh;
    if (imgRatio > targetRatio) {
        sh = imgH; sw = Math.round(imgH * targetRatio);
        sx = Math.round((imgW - sw) / 2); sy = 0;
    } else {
        sw = imgW; sh = Math.round(imgW / targetRatio);
        sx = 0; sy = Math.round((imgH - sh) / 2);
    }
    return { sx, sy, sw, sh };
}

function scaleToFit(w, h, maxEdge) {
    if (Math.max(w, h) <= maxEdge) return { width: w, height: h };
    const ratio = w / h;
    if (w >= h) return { width: maxEdge, height: Math.round(maxEdge / ratio) };
    return { width: Math.round(maxEdge * ratio), height: maxEdge };
}

function calcDimensions(imgW, imgH, style, hasExif) {
    // CSS padding-% is relative to the containing block's WIDTH.
    // containerW = imgW / (1 - 2 * sidePct)
    // each padding = pct * containerW
    const configs = {
        clean:     { side: 8,   top: 8,   bottom: hasExif ? 13 : 8 },
        cinematic: { side: 6,   top: 6,   bottom: hasExif ? 10 : 6 },
        filmstrip: { side: 4,   top: 6,   bottom: 9 },
        polaroid:  { side: 6,   top: 6,   bottom: hasExif ? 20 : 12 },
        editorial: { side: 7,   top: hasExif ? 12 : 5, bottom: hasExif ? 15 : 7 }
    };

    const cfg = configs[style];
    const containerW = imgW / (1 - 2 * cfg.side / 100);
    const padSide = Math.round(cfg.side / 100 * containerW);
    const padTop = Math.round(cfg.top / 100 * containerW);
    const padBottom = Math.round(cfg.bottom / 100 * containerW);

    return {
        canvasW: Math.round(containerW),
        canvasH: imgH + padTop + padBottom,
        containerW: Math.round(containerW),
        padTop, padSide, padBottom,
        imgX: padSide, imgY: padTop,
        imgW, imgH
    };
}

/**
 * Build a framed canvas. Used for both preview and export.
 * @param {Object} photo
 * @param {string} style
 * @param {string} aspectRatio
 * @param {number} [maxEdge=6000] - max image edge (use ~1400 for preview, 6000 for export)
 */
function buildFrameCanvas(photo, style, aspectRatio, maxEdge) {
    const img = photo.image;
    const exif = photo.exif;
    const targetRatio = ASPECT_RATIOS[aspectRatio];

    // Crop
    const crop = getCropRect(img.naturalWidth, img.naturalHeight, targetRatio);

    // Scale
    const scaled = scaleToFit(crop.sw, crop.sh, maxEdge || 6000);
    const drawW = scaled.width;
    const drawH = scaled.height;

    // Frame dimensions
    const hasExif = !!exif;
    const dims = calcDimensions(drawW, drawH, style, hasExif);

    const canvas = document.createElement('canvas');
    canvas.width = dims.canvasW;
    canvas.height = dims.canvasH;
    const ctx = canvas.getContext('2d');

    // Background
    const bgColors = {
        clean: '#FAFAFA', cinematic: '#0A0A0A', filmstrip: '#1C1A17',
        polaroid: '#F5F2EB', editorial: '#FFFFFF'
    };
    ctx.fillStyle = bgColors[style];
    ctx.fillRect(0, 0, dims.canvasW, dims.canvasH);

    // Style-specific decorations (before image)
    if (style === 'filmstrip') drawFilmstripDecorations(ctx, dims);

    // Draw cropped image
    ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, dims.imgX, dims.imgY, dims.imgW, dims.imgH);

    // Image border overlays
    if (style === 'cinematic') {
        ctx.strokeStyle = '#1A1A1A'; ctx.lineWidth = 2;
        ctx.strokeRect(dims.imgX, dims.imgY, dims.imgW, dims.imgH);
    }
    if (style === 'filmstrip') {
        ctx.strokeStyle = '#2A2622'; ctx.lineWidth = 2;
        ctx.strokeRect(dims.imgX, dims.imgY, dims.imgW, dims.imgH);
    }

    // Metadata
    drawCanvasMeta(ctx, dims, exif, style);

    return canvas;
}

/* ============================================
   9. PREVIEW (canvas-based — identical to export)
   ============================================ */

function renderPreview() {
    if (!photos[currentIndex]) return;

    // Build at a preview-friendly resolution (CSS scales it to fit)
    const frameCanvas = buildFrameCanvas(photos[currentIndex], currentFrameStyle, currentAspectRatio, 1400);

    previewCanvas.width = frameCanvas.width;
    previewCanvas.height = frameCanvas.height;
    const ctx = previewCanvas.getContext('2d');
    ctx.drawImage(frameCanvas, 0, 0);
}

/* ============================================
   10. EXPORT
   ============================================ */

async function exportFramedImage() {
    if (!photos[currentIndex] || isExporting) return;
    isExporting = true;
    btnDownload.classList.add('exporting');
    btnDownload.disabled = true;

    try {
        await document.fonts.ready;
        const canvas = buildFrameCanvas(photos[currentIndex], currentFrameStyle, currentAspectRatio);
        await downloadCanvas(canvas, photos[currentIndex].exif);
        showToast('Download started!');
    } catch (e) {
        console.error('Export failed:', e);
        showToast('Export failed. Please try again.', 'error');
    } finally {
        isExporting = false;
        btnDownload.classList.remove('exporting');
        btnDownload.disabled = false;
    }
}

async function exportAllPhotos() {
    if (isExporting || photos.length === 0) return;
    isExporting = true;
    btnDownloadAll.classList.add('exporting');
    btnDownloadAll.disabled = true;

    try {
        await document.fonts.ready;
        for (let i = 0; i < photos.length; i++) {
            btnDownloadAll.textContent = `Exporting ${i + 1} / ${photos.length}...`;
            const canvas = buildFrameCanvas(photos[i], currentFrameStyle, currentAspectRatio);
            await downloadCanvas(canvas, photos[i].exif, i);
            if (i < photos.length - 1) await new Promise(r => setTimeout(r, 500));
        }
        showToast(`Downloaded ${photos.length} framed photos!`);
    } catch (e) {
        console.error('Batch export failed:', e);
        showToast('Batch export failed.', 'error');
    } finally {
        isExporting = false;
        btnDownloadAll.classList.remove('exporting');
        btnDownloadAll.disabled = false;
        btnDownloadAll.textContent = `Download All (${photos.length})`;
    }
}

function downloadCanvas(canvas, exif, index) {
    return new Promise((resolve) => {
        canvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = generateFilename(exif, index);
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
            resolve();
        }, 'image/jpeg', 0.95);
    });
}

function generateFilename(exif, index) {
    const camera = exif?.model ? exif.model.replace(/\s+/g, '-') : 'photo';
    const now = new Date().toISOString().slice(0, 10);
    const suffix = index !== undefined ? `_${index + 1}` : '';
    return `${camera}_${now}_framed${suffix}.jpg`;
}

/* ============================================
   11. CANVAS DRAWING — DECORATIONS & METADATA
   ============================================ */

function drawFilmstripDecorations(ctx, dims) {
    const cw = dims.containerW;
    const sprocketW = Math.round(cw * 0.022);
    const sprocketH = Math.round(cw * 0.014);
    // Sprockets sit at the very top and bottom edges of the frame
    const sprocketY1 = Math.round(dims.padTop * 0.15);
    const sprocketY2 = dims.canvasH - Math.round(dims.padBottom * 0.15) - sprocketH;
    const count = 12;
    const totalW = dims.canvasW;
    const spacing = totalW / (count + 1);

    ctx.fillStyle = '#2A2622';
    for (let i = 1; i <= count; i++) {
        const x = Math.round(spacing * i) - sprocketW / 2;
        roundRect(ctx, x, sprocketY1, sprocketW, sprocketH, 3);
        ctx.fill();
        roundRect(ctx, x, sprocketY2, sprocketW, sprocketH, 3);
        ctx.fill();
    }
}

function drawCanvasMeta(ctx, dims, exif, style) {
    if (!exif) return;
    const cw = dims.containerW;
    const baseFontSize = Math.max(12, Math.round(cw * 0.014));
    const metaY = dims.imgY + dims.imgH;

    switch (style) {
        case 'clean': drawCleanMeta(ctx, dims, exif, baseFontSize, metaY); break;
        case 'cinematic': drawCinematicMeta(ctx, dims, exif, baseFontSize, metaY); break;
        case 'filmstrip': drawFilmstripMeta(ctx, dims, exif, baseFontSize, metaY); break;
        case 'polaroid': drawPolaroidMeta(ctx, dims, exif, baseFontSize, metaY); break;
        case 'editorial': drawEditorialMeta(ctx, dims, exif, baseFontSize, metaY); break;
    }
}

function drawCleanMeta(ctx, dims, exif, fs, metaY) {
    const cw = dims.containerW;
    const lineY = metaY + Math.round(cw * 0.025);
    ctx.fillStyle = '#D4D4D4';
    ctx.fillRect(dims.imgX, lineY, dims.imgW, 2);

    const textY = lineY + Math.round(cw * 0.015);
    const camera = [exif.make, exif.model].filter(Boolean).join(' ');
    const cameraLens = [camera, exif.lens].filter(Boolean).join(' \u00B7 ');

    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#2C2C2C';
    ctx.font = `400 ${fs}px Inter, sans-serif`;
    if (cameraLens) ctx.fillText(cameraLens, dims.imgX, textY);

    const specs = [exif.focalLength, exif.aperture, exif.shutterSpeed, exif.iso].filter(Boolean).join(' \u00B7 ');
    const specSize = Math.round(fs * 0.85);
    ctx.fillStyle = '#6B6B6B';
    ctx.font = `300 ${specSize}px Inter, sans-serif`;
    if (specs) ctx.fillText(specs, dims.imgX, textY + fs + 6);

    if (exif.dateTaken) {
        ctx.fillStyle = '#9A9A9A';
        ctx.font = `300 ${Math.round(fs * 0.8)}px Inter, sans-serif`;
        ctx.textAlign = 'right';
        ctx.fillText(exif.dateTaken, dims.imgX + dims.imgW, textY);
    }
    ctx.textAlign = 'left';
}

function drawCinematicMeta(ctx, dims, exif, fs, metaY) {
    const cw = dims.containerW;
    let y = metaY + Math.round(cw * 0.02);

    const dotR = Math.max(4, Math.round(cw * 0.003));
    ctx.fillStyle = '#E03C31';
    ctx.beginPath();
    ctx.arc(dims.imgX + dotR, y + fs / 2, dotR, 0, Math.PI * 2);
    ctx.fill();

    const camera = [exif.make, exif.model].filter(Boolean).join(' ');
    const parts = [camera, exif.lens].filter(Boolean).join('  |  ');

    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#C8C8C8';
    ctx.font = `400 ${fs}px "JetBrains Mono", monospace`;
    if (parts) ctx.fillText(parts.toUpperCase(), dims.imgX + dotR * 3, y);
    y += fs + 8;

    const specs = [exif.aperture, exif.shutterSpeed, exif.iso, exif.focalLength].filter(Boolean).join('  |  ');
    const specSize = Math.round(fs * 0.85);
    ctx.fillStyle = '#888888';
    ctx.font = `300 ${specSize}px "JetBrains Mono", monospace`;
    if (specs) ctx.fillText(specs.toUpperCase(), dims.imgX + dotR * 3, y);
    y += specSize + 6;

    if (exif.dateTaken) {
        ctx.fillStyle = '#555555';
        ctx.font = `300 ${Math.round(fs * 0.75)}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'right';
        ctx.fillText(formatDateShort(exif.dateTaken), dims.imgX + dims.imgW, y);
        ctx.textAlign = 'left';
    }
}

function drawFilmstripMeta(ctx, dims, exif, fs, metaY) {
    const parts = [exif.make, exif.model, exif.lens, exif.focalLength,
                   exif.aperture, exif.shutterSpeed, exif.iso].filter(Boolean);

    // Larger text for film rebate look
    const fontSize = Math.round(fs * 1.1);
    ctx.fillStyle = '#C47B2B';
    ctx.font = `400 ${fontSize}px "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Place text between image bottom and bottom sprocket row (at ~40% into bottom padding)
    ctx.fillText(parts.join('    ').toUpperCase(), dims.canvasW / 2, metaY + dims.padBottom * 0.4);

    // Top rebate text — between top sprocket row and image
    const topFontSize = Math.round(fontSize * 0.85);
    ctx.font = `400 ${topFontSize}px "Helvetica Neue", Arial, sans-serif`;
    ctx.globalAlpha = 0.7;
    ctx.fillText('FRAMESHOT   5063   \u25A0\u25A0   24   24A   25   25A', dims.canvasW / 2, dims.padTop * 0.55);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
}

function drawPolaroidMeta(ctx, dims, exif, fs, metaY) {
    const cw = dims.containerW;
    const centerX = dims.canvasW / 2;
    let y = metaY + Math.round(cw * 0.04);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const camera = [exif.make, exif.model].filter(Boolean).join(' ');
    const cameraFocal = [camera, exif.focalLength].filter(Boolean).join(' ~ ');
    const titleSize = Math.round(fs * 1.3);
    ctx.fillStyle = '#2C3E50';
    ctx.font = `400 ${titleSize}px Caveat, cursive`;
    if (cameraFocal) ctx.fillText(cameraFocal, centerX, y);
    y += titleSize + 4;

    const specs = [exif.aperture, exif.shutterSpeed, exif.iso].filter(Boolean).join(' | ');
    ctx.fillStyle = '#5D6D7E';
    ctx.font = `400 ${fs}px Caveat, cursive`;
    if (specs) ctx.fillText(specs, centerX, y);
    y += fs + 8;

    if (exif.dateTaken) {
        const dateSize = Math.round(fs * 1.4);
        ctx.fillStyle = '#2C3E50';
        ctx.font = `700 ${dateSize}px Caveat, cursive`;
        ctx.fillText(exif.dateTaken, centerX, y);
    }
    ctx.textAlign = 'left';
}

function drawEditorialMeta(ctx, dims, exif, fs, metaY) {
    const cw = dims.containerW;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    const camera = [exif.make, exif.model].filter(Boolean).join(' ');
    if (camera) {
        const nameSize = Math.round(cw * 0.04);
        ctx.fillStyle = '#1A1A1A';
        ctx.font = `200 ${nameSize}px "DM Sans", sans-serif`;
        ctx.fillText(camera.toUpperCase(), dims.imgX, Math.round(dims.padTop * 0.2));
    }

    let y = metaY + Math.round(cw * 0.02);

    if (exif.lens) {
        const lensSize = Math.round(fs * 0.9);
        ctx.fillStyle = '#1A1A1A';
        ctx.font = `300 ${lensSize}px Inter, sans-serif`;
        ctx.fillText(exif.lens, dims.imgX, y);
        y += lensSize + 8;
    }

    ctx.fillStyle = '#FF3B30';
    ctx.fillRect(dims.imgX, y, dims.imgW, Math.max(2, Math.round(cw * 0.002)));
    y += Math.round(cw * 0.012);

    const colW = dims.imgW / 3;
    const valueSize = Math.round(fs * 1.3);
    const labelSize = Math.max(8, Math.round(fs * 0.55));

    [
        { value: exif.aperture || '--', label: 'APERTURE' },
        { value: exif.shutterSpeed || '--', label: 'SHUTTER' },
        { value: exif.iso || '--', label: 'SENSITIVITY' }
    ].forEach((col, i) => {
        const x = dims.imgX + colW * i;
        ctx.fillStyle = '#1A1A1A';
        ctx.font = `700 ${valueSize}px "DM Sans", sans-serif`;
        ctx.fillText(col.value, x, y);
        ctx.fillStyle = '#E0E0E0';
        ctx.fillRect(x, y + valueSize + 4, colW * 0.8, 1);
        ctx.fillStyle = '#999999';
        ctx.font = `400 ${labelSize}px Inter, sans-serif`;
        ctx.fillText(col.label, x, y + valueSize + 10);
    });

    if (exif.dateTaken) {
        ctx.fillStyle = '#999999';
        ctx.font = `300 ${Math.round(fs * 0.8)}px Inter, sans-serif`;
        ctx.textAlign = 'right';
        ctx.fillText(exif.dateTaken, dims.imgX + dims.imgW, y + valueSize + labelSize + 24);
        ctx.textAlign = 'left';
    }
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

/* ============================================
   12. UI UTILITIES
   ============================================ */

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast${type === 'error' ? ' toast-error' : ''}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function resetToUpload() {
    photos = [];
    currentIndex = 0;
    fileInput.value = '';
    photoStrip.hidden = true;
    photoCounter.hidden = true;
    btnDownloadAll.hidden = true;
    workspace.hidden = true;
    uploadView.hidden = false;
    setAspectRatio('original');
}

function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/* ============================================
   13. INITIALIZATION
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
    // Resolve DOM references
    uploadView = $('#upload-view');
    uploadZone = $('#upload-zone');
    fileInput = $('#file-input');
    workspace = $('#workspace');
    previewCanvas = $('#preview-canvas');
    photoStrip = $('#photo-strip');
    photoCounter = $('#photo-counter');
    btnDownload = $('#btn-download');
    btnDownloadAll = $('#btn-download-all');
    btnAdd = $('#btn-add');
    btnNew = $('#btn-new');
    toastContainer = $('#toast-container');

    // Upload
    uploadZone.addEventListener('dragover', handleDragOver);
    uploadZone.addEventListener('dragleave', handleDragLeave);
    uploadZone.addEventListener('drop', handleDrop);
    uploadZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) processFiles(e.target.files);
    });

    // Frame style
    document.querySelectorAll('.style-btn').forEach(btn => {
        btn.addEventListener('click', () => setFrameStyle(btn.dataset.style));
    });

    // Aspect ratio
    document.querySelectorAll('.ratio-btn').forEach(btn => {
        btn.addEventListener('click', () => setAspectRatio(btn.dataset.ratio));
    });

    // Photo strip
    photoStrip.addEventListener('click', (e) => {
        const thumb = e.target.closest('.strip-thumb');
        if (thumb) showPhoto(parseInt(thumb.dataset.index, 10));
    });

    // Buttons
    btnDownload.addEventListener('click', exportFramedImage);
    btnDownloadAll.addEventListener('click', exportAllPhotos);
    btnNew.addEventListener('click', resetToUpload);
    btnAdd.addEventListener('click', () => fileInput.click());

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (workspace.hidden) return;
        if (e.key === 'ArrowLeft') showPhoto(currentIndex - 1);
        if (e.key === 'ArrowRight') showPhoto(currentIndex + 1);
    });
});
