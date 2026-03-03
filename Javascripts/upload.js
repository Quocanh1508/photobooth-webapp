// clear local storage
window.addEventListener('DOMContentLoaded', () => localStorage.removeItem('photoStrip'));

// constants
const WIDTH = 1176, HEIGHT = 1470, HALF = HEIGHT / 2;

// dom elements
const elements = {
  canvas: document.getElementById('finalCanvas'),
  ctx: document.getElementById('finalCanvas').getContext('2d'),
  uploadInput: document.getElementById('uploadPhotoInput'),
  uploadBtn: document.getElementById('uploadPhoto'),
  readyBtn: document.getElementById('readyButton'),
};

let photoStage = 0; // 0=top, 1=bottom, 2=done

// ── Crop state (per-image) ────────────────────────────────────────
let currentImg = null;
let cropZoom = 1.0;        // zoom multiplier (1 = fit, >1 = zoomed in)
let cropOffsetX = 0;       // pan offset in image pixels (center x of crop)
let cropOffsetY = 0;       // pan offset in image pixels (center y of crop)
let isDragging = false;
let lastPointer = { x: 0, y: 0 };

// ── Preview canvas (shown in overlay for crop selection) ─────────
const preview = document.getElementById('cropPreview');
const pCtx = preview ? preview.getContext('2d') : null;
const PREVIEW_W = preview ? preview.width : 588;
const PREVIEW_H = preview ? preview.height : 735;

function drawPreview() {
  if (!currentImg || !pCtx) return;
  const targetAspect = WIDTH / HALF;
  const imgAspect = currentImg.width / currentImg.height;

  // base source rect (fit the image to the target aspect ratio)
  let bsw, bsh, bsx, bsy;
  if (imgAspect > targetAspect) {
    bsh = currentImg.height; bsw = currentImg.height * targetAspect;
    bsx = (currentImg.width - bsw) / 2; bsy = 0;
  } else {
    bsw = currentImg.width; bsh = currentImg.width / targetAspect;
    bsx = 0; bsy = (currentImg.height - bsh) / 2;
  }

  // apply zoom: shrink source rect
  const zoomedW = bsw / cropZoom;
  const zoomedH = bsh / cropZoom;
  let sx = cropOffsetX - zoomedW / 2;
  let sy = cropOffsetY - zoomedH / 2;

  // clamp so we don't go outside the image
  sx = Math.max(0, Math.min(currentImg.width - zoomedW, sx));
  sy = Math.max(0, Math.min(currentImg.height - zoomedH, sy));

  pCtx.clearRect(0, 0, PREVIEW_W, PREVIEW_H);
  pCtx.drawImage(currentImg, sx, sy, zoomedW, zoomedH, 0, 0, PREVIEW_W, PREVIEW_H);
}

// ── Bake the current crop into the main canvas ───────────────────
function commitCrop() {
  if (!currentImg) return;
  const { ctx } = elements;
  const yOffset = photoStage === 0 ? 0 : HALF;
  const targetAspect = WIDTH / HALF;
  const imgAspect = currentImg.width / currentImg.height;

  let bsw, bsh, bsx, bsy;
  if (imgAspect > targetAspect) {
    bsh = currentImg.height; bsw = currentImg.height * targetAspect;
    bsx = (currentImg.width - bsw) / 2; bsy = 0;
  } else {
    bsw = currentImg.width; bsh = currentImg.width / targetAspect;
    bsx = 0; bsy = (currentImg.height - bsh) / 2;
  }

  const zoomedW = bsw / cropZoom;
  const zoomedH = bsh / cropZoom;
  let sx = cropOffsetX - zoomedW / 2;
  let sy = cropOffsetY - zoomedH / 2;
  sx = Math.max(0, Math.min(currentImg.width - zoomedW, sx));
  sy = Math.max(0, Math.min(currentImg.height - zoomedH, sy));

  ctx.drawImage(currentImg, sx, sy, zoomedW, zoomedH, 0, yOffset, WIDTH, HALF);

  photoStage++;
  hideCropOverlay();
  currentImg = null;

  if (photoStage === 1) {
    // allow uploading second photo
    elements.uploadBtn.textContent = 'Upload Photo 2';
    elements.uploadBtn.disabled = false;
  } else if (photoStage === 2) {
    finalizePhotoStrip();
  }
}

// ── Overlay show/hide ────────────────────────────────────────────
const cropOverlay = document.getElementById('cropOverlay');

function showCropOverlay(img) {
  currentImg = img;
  // reset crop state: default center + no zoom
  cropZoom = 1.0;
  cropOffsetX = img.width / 2;
  cropOffsetY = img.height / 2;
  document.getElementById('cropZoomSlider').value = 1;
  document.getElementById('cropZoomValue').textContent = '1.0×';
  cropOverlay.style.display = 'flex';
  drawPreview();
}

function hideCropOverlay() {
  cropOverlay.style.display = 'none';
}

// ── Crop overlay events ──────────────────────────────────────────
document.getElementById('cropZoomSlider').addEventListener('input', e => {
  cropZoom = parseFloat(e.target.value);
  document.getElementById('cropZoomValue').textContent = cropZoom.toFixed(1) + '×';
  drawPreview();
});

document.getElementById('cropConfirm').addEventListener('click', commitCrop);
document.getElementById('cropCancel').addEventListener('click', () => {
  currentImg = null;
  hideCropOverlay();
  elements.uploadBtn.disabled = false;
});

// Pan by dragging the preview canvas
function getXY(e) {
  const rect = preview.getBoundingClientRect();
  const clientX = e.touches?.[0]?.clientX ?? e.clientX;
  const clientY = e.touches?.[0]?.clientY ?? e.clientY;
  return { x: clientX - rect.left, y: clientY - rect.top };
}

preview.addEventListener('mousedown', e => { isDragging = true; lastPointer = getXY(e); });
preview.addEventListener('touchstart', e => { isDragging = true; lastPointer = getXY(e); e.preventDefault(); }, { passive: false });

window.addEventListener('mousemove', e => {
  if (!isDragging || !currentImg) return;
  const cur = getXY(e);
  const dx = cur.x - lastPointer.x;
  const dy = cur.y - lastPointer.y;
  lastPointer = cur;

  // convert screen-space drag to image-space pan
  const imgW = currentImg.width, imgH = currentImg.height;
  const targetAspect = WIDTH / HALF;
  const imgAspect = imgW / imgH;
  const bsw = imgAspect > targetAspect ? imgH * targetAspect : imgW;
  const bsh = imgAspect > targetAspect ? imgH : imgW / targetAspect;
  const zoomedW = bsw / cropZoom;
  const zoomedH = bsh / cropZoom;
  // scale: how many image pixels per preview pixel
  cropOffsetX -= (dx / PREVIEW_W) * zoomedW;
  cropOffsetY -= (dy / PREVIEW_H) * zoomedH;
  // clamp
  const hw = zoomedW / 2, hh = zoomedH / 2;
  cropOffsetX = Math.max(hw, Math.min(imgW - hw, cropOffsetX));
  cropOffsetY = Math.max(hh, Math.min(imgH - hh, cropOffsetY));
  drawPreview();
});
window.addEventListener('touchmove', e => {
  if (!isDragging || !currentImg) return;
  const cur = getXY(e);
  const dx = cur.x - lastPointer.x;
  const dy = cur.y - lastPointer.y;
  lastPointer = cur;
  const imgW = currentImg.width, imgH = currentImg.height;
  const targetAspect = WIDTH / HALF;
  const imgAspect = imgW / imgH;
  const bsw = imgAspect > targetAspect ? imgH * targetAspect : imgW;
  const bsh = imgAspect > targetAspect ? imgH : imgW / targetAspect;
  const zoomedW = bsw / cropZoom;
  const zoomedH = bsh / cropZoom;
  cropOffsetX -= (dx / PREVIEW_W) * zoomedW;
  cropOffsetY -= (dy / PREVIEW_H) * zoomedH;
  const hw = zoomedW / 2, hh = zoomedH / 2;
  cropOffsetX = Math.max(hw, Math.min(imgW - hw, cropOffsetX));
  cropOffsetY = Math.max(hh, Math.min(imgH - hh, cropOffsetY));
  drawPreview();
  e.preventDefault();
}, { passive: false });
window.addEventListener('mouseup', () => isDragging = false);
window.addEventListener('touchend', () => isDragging = false);

// ── Finalize photo strip ─────────────────────────────────────────
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

// ready button
elements.readyBtn.addEventListener('click', () => {
  localStorage.setItem('photoStrip', elements.canvas.toDataURL('image/png'));
  window.location.href = 'final.html';
});

// upload button
elements.uploadBtn.addEventListener('click', () => elements.uploadInput.click());

// handle file selection
elements.uploadInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  elements.uploadBtn.disabled = true;
  const img = new Image();
  img.onload = () => showCropOverlay(img);
  img.src = URL.createObjectURL(file);
  elements.uploadInput.value = '';
});

// logo redirect
document.addEventListener('DOMContentLoaded', () => {
  const logo = document.querySelector('.logo');
  if (logo) logo.addEventListener('click', () => window.location.href = 'index.html');
});
