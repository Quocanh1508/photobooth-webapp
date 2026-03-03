// clear local storage
window.addEventListener('DOMContentLoaded', () => localStorage.removeItem('photoStrip'));

// constants – output canvas dimensions
const WIDTH = 1176, HEIGHT = 1470, HALF = HEIGHT / 2;
const CROP_ASPECT = WIDTH / HALF; // ~1.6 (landscape per slot)

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
let imgZoom = 1; // zoom of the underlying image

// ── Crop box state ───────────────────────────────────────────────
let cropX, cropY, cropW, cropH;

// ── Preview canvas ───────────────────────────────────────────────
const cropCanvas = document.getElementById('cropCanvas');
const cCtx = cropCanvas.getContext('2d');
const CW = cropCanvas.width;
const CH = cropCanvas.height;
const HANDLE_R = 16; // hit-test radius for corner handles in canvas px

// ── Interaction state ────────────────────────────────────────────
let dragMode = null; // 'move' | 'nw' | 'ne' | 'sw' | 'se' | null
let dragStart = null;
let cropSnapshot = null; // snapshot of crop box when drag started
let lastPinchDist = null;

// ── Image layout helper ──────────────────────────────────────────
function getImgDraw() {
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
  return { x: (CW - dw) / 2, y: (CH - dh) / 2, w: dw, h: dh };
}

function clampCropToImg(img) {
  const minW = 40;
  cropW = Math.max(minW, cropW);
  cropH = cropW / CROP_ASPECT;
  cropX = Math.max(img.x, Math.min(img.x + img.w - cropW, cropX));
  cropY = Math.max(img.y, Math.min(img.y + img.h - cropH, cropY));
  // also clamp right and bottom edge
  if (cropX + cropW > img.x + img.w) { cropW = img.x + img.w - cropX; cropH = cropW / CROP_ASPECT; }
  if (cropY + cropH > img.y + img.h) { cropH = img.y + img.h - cropY; cropW = cropH * CROP_ASPECT; }
}

function initCropBox() {
  const margin = 0.08;
  cropW = CW * (1 - margin * 2);
  cropH = cropW / CROP_ASPECT;
  if (cropH > CH * (1 - margin * 2)) {
    cropH = CH * (1 - margin * 2);
    cropW = cropH * CROP_ASPECT;
  }
  cropX = (CW - cropW) / 2;
  cropY = (CH - cropH) / 2;
}

// ── Drawing ──────────────────────────────────────────────────────
function drawCrop() {
  const img = getImgDraw();
  clampCropToImg(img);

  cCtx.clearRect(0, 0, CW, CH);

  // Full image dimmed
  cCtx.save();
  cCtx.globalAlpha = 0.32;
  cCtx.drawImage(currentImg, img.x, img.y, img.w, img.h);
  cCtx.globalAlpha = 1;
  cCtx.restore();

  // Crop area bright
  cCtx.save();
  cCtx.beginPath();
  cCtx.rect(cropX, cropY, cropW, cropH);
  cCtx.clip();
  cCtx.drawImage(currentImg, img.x, img.y, img.w, img.h);
  cCtx.restore();

  // Crop border
  cCtx.strokeStyle = '#4A9FDB';
  cCtx.lineWidth = 2;
  cCtx.strokeRect(cropX, cropY, cropW, cropH);

  // Rule-of-thirds grid
  cCtx.strokeStyle = 'rgba(74,159,219,0.55)';
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

  // L-shaped corner handles
  const ARM = 22;
  cCtx.strokeStyle = '#4A9FDB';
  cCtx.lineWidth = 5;
  cCtx.lineCap = 'square';
  [
    [cropX, cropY, 1, 1],
    [cropX + cropW, cropY, -1, 1],
    [cropX, cropY + cropH, 1, -1],
    [cropX + cropW, cropY + cropH, -1, -1],
  ].forEach(([cx, cy, sx, sy]) => {
    cCtx.beginPath();
    cCtx.moveTo(cx + sx * ARM, cy);
    cCtx.lineTo(cx, cy);
    cCtx.lineTo(cx, cy + sy * ARM);
    cCtx.stroke();
  });
}

// ── Commit crop ───────────────────────────────────────────────────
function commitCrop() {
  if (!currentImg) return;
  const img = getImgDraw();
  const { ctx } = elements;
  const yOffset = photoStage === 0 ? 0 : HALF;

  const scaleX = currentImg.width / img.w;
  const scaleY = currentImg.height / img.h;
  const sx = (cropX - img.x) * scaleX;
  const sy = (cropY - img.y) * scaleY;
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

// ── Overlay ───────────────────────────────────────────────────────
const cropOverlay = document.getElementById('cropOverlay');

function showCropOverlay(img) {
  currentImg = img;
  imgZoom = 1;
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

// ── Pointer helpers ───────────────────────────────────────────────
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

// Determine which part of the crop box was hit
function getHitZone(pos) {
  const corners = {
    nw: { x: cropX, y: cropY },
    ne: { x: cropX + cropW, y: cropY },
    sw: { x: cropX, y: cropY + cropH },
    se: { x: cropX + cropW, y: cropY + cropH },
  };
  for (const [key, c] of Object.entries(corners)) {
    if (Math.hypot(pos.x - c.x, pos.y - c.y) <= HANDLE_R) return key;
  }
  if (pos.x >= cropX && pos.x <= cropX + cropW &&
    pos.y >= cropY && pos.y <= cropY + cropH) return 'move';
  return null;
}

// ── Drag events ───────────────────────────────────────────────────
function onPointerDown(e) {
  if (e.touches && e.touches.length === 2) {
    lastPinchDist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    dragMode = null;
    return;
  }
  const pos = getPos(e);
  dragMode = getHitZone(pos);
  if (dragMode) {
    dragStart = pos;
    cropSnapshot = { x: cropX, y: cropY, w: cropW, h: cropH };
  }
  e.preventDefault();
}

function onPointerMove(e) {
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
  if (!dragMode || !dragStart) return;
  e.preventDefault();

  const pos = getPos(e);
  const dx = pos.x - dragStart.x;
  const dy = pos.y - dragStart.y;
  const snap = cropSnapshot;

  if (dragMode === 'move') {
    cropX = snap.x + dx;
    cropY = snap.y + dy;
    cropW = snap.w; cropH = snap.h;

  } else if (dragMode === 'se') {
    // anchor = NW corner
    cropX = snap.x; cropY = snap.y;
    cropW = Math.max(40, snap.w + dx);
    cropH = cropW / CROP_ASPECT;

  } else if (dragMode === 'sw') {
    // anchor = NE corner (snap.x + snap.w, snap.y)
    const anchorX = snap.x + snap.w;
    cropW = Math.max(40, snap.w - dx);
    cropH = cropW / CROP_ASPECT;
    cropX = anchorX - cropW;
    cropY = snap.y;

  } else if (dragMode === 'ne') {
    // anchor = SW corner (snap.x, snap.y + snap.h)
    const anchorY = snap.y + snap.h;
    cropW = Math.max(40, snap.w + dx);
    cropH = cropW / CROP_ASPECT;
    cropX = snap.x;
    cropY = anchorY - cropH;

  } else if (dragMode === 'nw') {
    // anchor = SE corner (snap.x + snap.w, snap.y + snap.h)
    const anchorX = snap.x + snap.w;
    const anchorY = snap.y + snap.h;
    cropW = Math.max(40, snap.w - dx);
    cropH = cropW / CROP_ASPECT;
    cropX = anchorX - cropW;
    cropY = anchorY - cropH;
  }

  drawCrop();
}

function onPointerUp() {
  dragMode = null;
  dragStart = null;
  cropSnapshot = null;
  lastPinchDist = null;
}

cropCanvas.addEventListener('mousedown', onPointerDown);
cropCanvas.addEventListener('mousemove', onPointerMove);
window.addEventListener('mouseup', onPointerUp);

cropCanvas.addEventListener('touchstart', onPointerDown, { passive: false });
cropCanvas.addEventListener('touchmove', onPointerMove, { passive: false });
window.addEventListener('touchend', onPointerUp);
window.addEventListener('touchcancel', onPointerUp);

// ── Finalize ──────────────────────────────────────────────────────
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
