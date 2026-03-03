// clear local storage
window.addEventListener('DOMContentLoaded', () => localStorage.removeItem('photoStrip'));

// constants – output canvas dimensions
const WIDTH = 1176, HEIGHT = 1470, HALF = HEIGHT / 2;
const CROP_ASPECT = WIDTH / HALF; // ~1.6 (landscape)

// dom elements
const elements = {
  canvas: document.getElementById('finalCanvas'),
  ctx: document.getElementById('finalCanvas').getContext('2d'),
  uploadInput: document.getElementById('uploadPhotoInput'),
  uploadBtn: document.getElementById('uploadPhoto'),
  readyBtn: document.getElementById('readyButton'),
};

let photoStage = 0;
let currentImg = null;

// ── Crop tool state ───────────────────────────────────────────────
// The image is drawn at a fixed scale to fill/fit the preview canvas.
// The crop box is draggable over the image.
let imgZoom = 1;    // zoom applied to the image (1 = fit to preview)
let cropX, cropY;   // crop box top-left in preview canvas coords
let cropW, cropH;   // crop box size (fixed aspect, adjusts with zoom)
let imgDraw;        // { x, y, w, h } — where image is drawn in preview

let isDragging = false;
let dragStart = null;
let cropStart = null;
let lastPinchDist = null;

const cropCanvas = document.getElementById('cropCanvas');
const cCtx = cropCanvas.getContext('2d');
const CW = cropCanvas.width, CH = cropCanvas.height;

// ── Layout helpers ────────────────────────────────────────────────
function computeImgDraw() {
  // Scale image to fill the preview canvas (object-cover), then apply zoom
  const imgAspect = currentImg.width / currentImg.height;
  const canvasAspect = CW / CH;
  let baseW, baseH;
  if (imgAspect > canvasAspect) {
    baseH = CH; baseW = CH * imgAspect;
  } else {
    baseW = CW; baseH = CW / imgAspect;
  }
  const dw = baseW * imgZoom;
  const dh = baseH * imgZoom;
  // keep image centered
  const dx = (CW - dw) / 2;
  const dy = (CH - dh) / 2;
  return { x: dx, y: dy, w: dw, h: dh };
}

function initCropBox() {
  imgDraw = computeImgDraw();
  // crop box size = a fraction of the canvas (80% of width)
  const MARGIN = 0.1;
  cropW = CW * (1 - MARGIN * 2);
  cropH = cropW / CROP_ASPECT;
  if (cropH > CH * (1 - MARGIN * 2)) {
    cropH = CH * (1 - MARGIN * 2);
    cropW = cropH * CROP_ASPECT;
  }

  // clamp crop box to image bounds
  clampCropBox();
}

function clampCropBox() {
  imgDraw = computeImgDraw();
  // keep crop box inside the visible image area
  const minX = imgDraw.x;
  const minY = imgDraw.y;
  const maxX = imgDraw.x + imgDraw.w - cropW;
  const maxY = imgDraw.y + imgDraw.h - cropH;

  if (cropX === undefined) {
    // initial center
    cropX = (CW - cropW) / 2;
    cropY = (CH - cropH) / 2;
  }
  cropX = Math.max(minX, Math.min(maxX, cropX));
  cropY = Math.max(minY, Math.min(maxY, cropY));
}

// ── Drawing ───────────────────────────────────────────────────────
function drawCrop() {
  imgDraw = computeImgDraw();
  clampCropBox();

  cCtx.clearRect(0, 0, CW, CH);

  // Full image dimmed
  cCtx.save();
  cCtx.globalAlpha = 0.35;
  cCtx.drawImage(currentImg, imgDraw.x, imgDraw.y, imgDraw.w, imgDraw.h);
  cCtx.globalAlpha = 1;
  cCtx.restore();

  // Crop region bright (via clip)
  cCtx.save();
  cCtx.beginPath();
  cCtx.rect(cropX, cropY, cropW, cropH);
  cCtx.clip();
  cCtx.drawImage(currentImg, imgDraw.x, imgDraw.y, imgDraw.w, imgDraw.h);
  cCtx.restore();

  // Crop border
  cCtx.strokeStyle = '#4A9FDB';
  cCtx.lineWidth = 2.5;
  cCtx.strokeRect(cropX, cropY, cropW, cropH);

  // Rule-of-thirds grid
  cCtx.strokeStyle = 'rgba(74,159,219,0.65)';
  cCtx.lineWidth = 1;
  for (let i = 1; i < 3; i++) {
    cCtx.beginPath();
    cCtx.moveTo(cropX + cropW * i / 3, cropY);
    cCtx.lineTo(cropX + cropW * i / 3, cropY + cropH);
    cCtx.stroke();
    cCtx.beginPath();
    cCtx.moveTo(cropX, cropY + cropH * i / 3);
    cCtx.lineTo(cropX + cropW, cropY + cropH * i / 3);
    cCtx.stroke();
  }

  // Thick corner L-brackets
  const ARM = 20;
  cCtx.strokeStyle = '#4A9FDB';
  cCtx.lineWidth = 4;
  const cns = [
    [cropX, cropY, 1, 1],
    [cropX + cropW, cropY, -1, 1],
    [cropX, cropY + cropH, 1, -1],
    [cropX + cropW, cropY + cropH, -1, -1],
  ];
  cns.forEach(([cx, cy, sx, sy]) => {
    cCtx.beginPath();
    cCtx.moveTo(cx + sx * ARM, cy);
    cCtx.lineTo(cx, cy);
    cCtx.lineTo(cx, cy + sy * ARM);
    cCtx.stroke();
  });
}

// ── Commit crop to output canvas ──────────────────────────────────
function commitCrop() {
  if (!currentImg) return;
  const { ctx } = elements;
  const yOffset = photoStage === 0 ? 0 : HALF;

  // Map crop box position back to image source coords
  const scaleX = currentImg.width / imgDraw.w;
  const scaleY = currentImg.height / imgDraw.h;
  const sx = (cropX - imgDraw.x) * scaleX;
  const sy = (cropY - imgDraw.y) * scaleY;
  const sw = cropW * scaleX;
  const sh = cropH * scaleY;

  ctx.drawImage(currentImg, sx, sy, sw, sh, 0, yOffset, WIDTH, HALF);
  photoStage++;
  hideCropOverlay();

  if (photoStage === 1) {
    elements.uploadBtn.textContent = 'Upload Photo 2';
    elements.uploadBtn.disabled = false;
  } else if (photoStage === 2) {
    finalizePhotoStrip();
  }
}

// ── Overlay ────────────────────────────────────────────────────────
const cropOverlay = document.getElementById('cropOverlay');

function showCropOverlay(img) {
  currentImg = img;
  imgZoom = 1;
  cropX = undefined; cropY = undefined;
  document.getElementById('zoomSlider').value = 1;
  document.getElementById('zoomLabel').textContent = '1.0×';
  cropOverlay.style.display = 'flex';
  initCropBox();
  drawCrop();
}
function hideCropOverlay() {
  cropOverlay.style.display = 'none';
  currentImg = null;
}

document.getElementById('zoomSlider').addEventListener('input', e => {
  imgZoom = parseFloat(e.target.value);
  document.getElementById('zoomLabel').textContent = imgZoom.toFixed(1) + '×';
  drawCrop();
});

document.getElementById('cropConfirm').addEventListener('click', commitCrop);
document.getElementById('cropCancel').addEventListener('click', () => {
  elements.uploadBtn.disabled = false;
  hideCropOverlay();
});

// ── Drag events (move the crop box) ──────────────────────────────
function getPos(e) {
  const rect = cropCanvas.getBoundingClientRect();
  const scaleX = CW / rect.width;
  const scaleY = CH / rect.height;
  const src = e.touches ? e.touches[0] : e;
  return {
    x: (src.clientX - rect.left) * scaleX,
    y: (src.clientY - rect.top) * scaleY,
  };
}

function isInsideCrop(pos) {
  return pos.x >= cropX && pos.x <= cropX + cropW &&
    pos.y >= cropY && pos.y <= cropY + cropH;
}

cropCanvas.addEventListener('mousedown', e => {
  const pos = getPos(e);
  isDragging = true;
  dragStart = pos;
  cropStart = { x: cropX, y: cropY };
  e.preventDefault();
});

cropCanvas.addEventListener('touchstart', e => {
  if (e.touches.length === 2) {
    lastPinchDist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    isDragging = false;
  } else {
    const pos = getPos(e);
    isDragging = true;
    dragStart = pos;
    cropStart = { x: cropX, y: cropY };
  }
  e.preventDefault();
}, { passive: false });

function onMove(e) {
  if (e.touches && e.touches.length === 2) {
    const dist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    if (lastPinchDist) {
      imgZoom = Math.max(1, Math.min(5, imgZoom * (dist / lastPinchDist)));
      document.getElementById('zoomSlider').value = imgZoom;
      document.getElementById('zoomLabel').textContent = imgZoom.toFixed(1) + '×';
      drawCrop();
    }
    lastPinchDist = dist;
    return;
  }
  if (!isDragging || !dragStart) return;
  const pos = getPos(e);
  cropX = cropStart.x + (pos.x - dragStart.x);
  cropY = cropStart.y + (pos.y - dragStart.y);
  drawCrop();
  e.preventDefault();
}

cropCanvas.addEventListener('mousemove', e => onMove(e));
cropCanvas.addEventListener('touchmove', e => onMove(e), { passive: false });

window.addEventListener('mouseup', () => { isDragging = false; dragStart = null; });
window.addEventListener('touchend', () => { isDragging = false; dragStart = null; lastPinchDist = null; });

// ── Finalize ───────────────────────────────────────────────────────
const finalizePhotoStrip = () => {
  const { ctx, readyBtn, uploadBtn } = elements;
  const frame = new Image();
  frame.onload = () => {
    ctx.drawImage(frame, 0, 0, WIDTH, HEIGHT);
    uploadBtn.style.display = 'none';
    readyBtn.style.display = 'inline-block';
    readyBtn.disabled = false;
  };
  frame.src = 'Assets/fish-photobooth/camerapage/frame.png';
};

elements.readyBtn.addEventListener('click', () => {
  localStorage.setItem('photoStrip', elements.canvas.toDataURL('image/png'));
  window.location.href = 'final.html';
});

elements.uploadBtn.addEventListener('click', () => elements.uploadInput.click());
elements.uploadInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  elements.uploadBtn.disabled = true;
  const img = new Image();
  img.onload = () => showCropOverlay(img);
  img.src = URL.createObjectURL(file);
  elements.uploadInput.value = '';
});

document.addEventListener('DOMContentLoaded', () => {
  const logo = document.querySelector('.logo');
  if (logo) logo.addEventListener('click', () => window.location.href = 'index.html');
});
