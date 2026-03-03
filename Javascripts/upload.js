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

let photoStage = 0; // 0 = first slot, 1 = second slot, 2 = done

// ── Crop tool state ───────────────────────────────────────────────
let currentImg = null;
let imgCX = 0;    // image center X in preview canvas coords
let imgCY = 0;    // image center Y in preview canvas coords
let imgScale = 1; // zoom level (1 = image just fills crop box width/height)
let isDragging = false;
let lastTouch = null;
let lastPinchDist = null;

// Crop box rect (computed dynamically)
let cropX, cropY, cropW, cropH;

// Preview canvas
const cropCanvas = document.getElementById('cropCanvas');
const cCtx = cropCanvas.getContext('2d');

function initCropBox() {
  const margin = 24; // px margin inside preview
  cropW = cropCanvas.width - margin * 2;
  cropH = cropW / CROP_ASPECT;
  // if height overflows, fit by height instead
  if (cropH > cropCanvas.height - margin * 2) {
    cropH = cropCanvas.height - margin * 2;
    cropW = cropH * CROP_ASPECT;
  }
  cropX = (cropCanvas.width - cropW) / 2;
  cropY = (cropCanvas.height - cropH) / 2;
}

// Compute displayed image dimensions at current scale
function getImgDraw() {
  const imgAspect = currentImg.width / currentImg.height;
  let baseW, baseH;
  if (imgAspect > CROP_ASPECT) {
    baseH = cropH; baseW = baseH * imgAspect;
  } else {
    baseW = cropW; baseH = baseW / imgAspect;
  }
  const dw = baseW * imgScale;
  const dh = baseH * imgScale;
  // clamp center so image always covers the crop box
  const minCX = cropX + dw / 2;
  const maxCX = cropX + cropW - dw / 2;
  const minCY = cropY + dh / 2;
  const maxCY = cropY + cropH - dh / 2;
  const cx = dw >= cropW ? Math.max(minCX, Math.min(maxCX, imgCX)) : (cropX + cropW / 2);
  const cy = dh >= cropH ? Math.max(minCY, Math.min(maxCY, imgCY)) : (cropY + cropH / 2);
  return { cx, cy, dw, dh, x: cx - dw / 2, y: cy - dh / 2 };
}

function drawCrop() {
  const W = cropCanvas.width, H = cropCanvas.height;
  cCtx.clearRect(0, 0, W, H);

  const { x: ix, y: iy, dw, dh, cx, cy } = getImgDraw();

  // Draw full image dimmed
  cCtx.save();
  cCtx.globalAlpha = 0.35;
  cCtx.drawImage(currentImg, ix, iy, dw, dh);
  cCtx.restore();

  // Draw crop area bright (clip mask)
  cCtx.save();
  cCtx.beginPath();
  cCtx.rect(cropX, cropY, cropW, cropH);
  cCtx.clip();
  cCtx.drawImage(currentImg, ix, iy, dw, dh);
  cCtx.restore();

  // Crop border
  cCtx.strokeStyle = '#4A9FDB';
  cCtx.lineWidth = 2.5;
  cCtx.strokeRect(cropX, cropY, cropW, cropH);

  // Rule-of-thirds grid
  cCtx.strokeStyle = 'rgba(74,159,219,0.65)';
  cCtx.lineWidth = 1;
  for (let i = 1; i < 3; i++) {
    const gx = cropX + cropW * i / 3;
    const gy = cropY + cropH * i / 3;
    cCtx.beginPath(); cCtx.moveTo(gx, cropY); cCtx.lineTo(gx, cropY + cropH); cCtx.stroke();
    cCtx.beginPath(); cCtx.moveTo(cropX, gy); cCtx.lineTo(cropX + cropW, gy); cCtx.stroke();
  }

  // Corner handles
  const R = 9;
  const corners = [
    [cropX, cropY], [cropX + cropW, cropY],
    [cropX, cropY + cropH], [cropX + cropW, cropY + cropH]
  ];
  cCtx.fillStyle = '#4A9FDB';
  corners.forEach(([hx, hy]) => {
    cCtx.beginPath();
    cCtx.arc(hx, hy, R, 0, Math.PI * 2);
    cCtx.fill();
  });

  // Store clamped center for commit
  imgCX = cx; imgCY = cy;
}

// ── Bake the crop selection into the output canvas ────────────────
function commitCrop() {
  if (!currentImg) return;
  const { x: ix, y: iy, dw, dh } = getImgDraw();
  const { ctx } = elements;
  const yOffset = photoStage === 0 ? 0 : HALF;

  // sx/sy in image coords corresponding to top-left of crop box
  const scaleImgToCanvas = currentImg.width / dw;
  const sx = (cropX - ix) * scaleImgToCanvas;
  const sy = (cropY - iy) * scaleImgToCanvas;
  const sw = cropW * scaleImgToCanvas;
  const sh = cropH * scaleImgToCanvas;

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

// ── Overlay show / hide ───────────────────────────────────────────
const cropOverlay = document.getElementById('cropOverlay');

function showCropOverlay(img) {
  currentImg = img;
  initCropBox();
  // center image
  imgCX = cropX + cropW / 2;
  imgCY = cropY + cropH / 2;
  imgScale = 1;
  document.getElementById('zoomSlider').value = 1;
  document.getElementById('zoomLabel').textContent = '1.0×';
  cropOverlay.style.display = 'flex';
  drawCrop();
}
function hideCropOverlay() {
  cropOverlay.style.display = 'none';
  currentImg = null;
}

// ── Zoom slider ───────────────────────────────────────────────────
document.getElementById('zoomSlider').addEventListener('input', e => {
  imgScale = parseFloat(e.target.value);
  document.getElementById('zoomLabel').textContent = imgScale.toFixed(1) + '×';
  drawCrop();
});

document.getElementById('cropConfirm').addEventListener('click', commitCrop);
document.getElementById('cropCancel').addEventListener('click', () => {
  elements.uploadBtn.disabled = false;
  hideCropOverlay();
});

// ── Pointer events (drag to pan) ──────────────────────────────────
function pointerPos(e) {
  const rect = cropCanvas.getBoundingClientRect();
  const scaleX = cropCanvas.width / rect.width;
  const scaleY = cropCanvas.height / rect.height;
  const src = e.touches ? e.touches[0] : e;
  return {
    x: (src.clientX - rect.left) * scaleX,
    y: (src.clientY - rect.top) * scaleY
  };
}

cropCanvas.addEventListener('mousedown', e => { isDragging = true; lastTouch = pointerPos(e); });
cropCanvas.addEventListener('touchstart', e => {
  if (e.touches.length === 2) {
    lastPinchDist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
  } else {
    isDragging = true; lastTouch = pointerPos(e);
  }
  e.preventDefault();
}, { passive: false });

function onMove(pos) {
  if (!isDragging || !lastTouch) return;
  imgCX += pos.x - lastTouch.x;
  imgCY += pos.y - lastTouch.y;
  lastTouch = pos;
  drawCrop();
}

cropCanvas.addEventListener('mousemove', e => onMove(pointerPos(e)));
cropCanvas.addEventListener('touchmove', e => {
  if (e.touches.length === 2) {
    const dist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    if (lastPinchDist) {
      const delta = dist / lastPinchDist;
      imgScale = Math.max(1, Math.min(5, imgScale * delta));
      document.getElementById('zoomSlider').value = imgScale;
      document.getElementById('zoomLabel').textContent = imgScale.toFixed(1) + '×';
      drawCrop();
    }
    lastPinchDist = dist;
  } else {
    onMove(pointerPos(e));
  }
  e.preventDefault();
}, { passive: false });

window.addEventListener('mouseup', () => { isDragging = false; lastTouch = null; });
window.addEventListener('touchend', () => { isDragging = false; lastTouch = null; lastPinchDist = null; });

// ── Finalize photo strip ──────────────────────────────────────────
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

// ready → go to sticker page
elements.readyBtn.addEventListener('click', () => {
  localStorage.setItem('photoStrip', elements.canvas.toDataURL('image/png'));
  window.location.href = 'final.html';
});

// upload button
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

// logo redirect
document.addEventListener('DOMContentLoaded', () => {
  const logo = document.querySelector('.logo');
  if (logo) logo.addEventListener('click', () => window.location.href = 'index.html');
});
