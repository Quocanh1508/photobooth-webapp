// constants
const WIDTH = 1176, HEIGHT = 1470;

// dom elements
const canvas = document.getElementById('finalCanvas'),
  ctx = canvas.getContext('2d'),
  addFishBtn = document.getElementById('addFish'),
  addOctopusBtn = document.getElementById('addOctopus'),
  addSeaweedBtn = document.getElementById('addSeaweed'),
  addAxBtn = document.getElementById('addAx'),
  addBubbleBtn = document.getElementById('addBubble'),
  downloadBtn = document.getElementById('downloadBtn'),
  homeBtn = document.getElementById('homeBtn'),
  resetBtn = document.getElementById('reset');

// sticker state
let stickers = [], dragOffset = { x: 0, y: 0 }, selectedSticker = null;

// ── Floating overlay for selected sticker ──────────────────────────
const overlay = document.createElement('div');
overlay.id = 'sticker-overlay';
overlay.innerHTML = `
  <button id="rotateLeft"  title="Rotate Left">↺</button>
  <button id="rotateRight" title="Rotate Right">↻</button>
  <button id="sizeDown" title="Shrink">➖</button>
  <button id="sizeUp" title="Grow">➕</button>
  <button id="deleteSticker" title="Delete">🗑️</button>
`;
overlay.style.cssText = `
  display:none; position:absolute;
  background:rgba(255,255,255,0.92);
  border:2px solid #2a4a53; border-radius:2rem;
  padding:4px 10px; gap:6px; align-items:center;
  z-index:200; box-shadow:0 2px 10px rgba(0,0,0,0.15);
  pointer-events:auto;
`;
const container = document.getElementById('canvasContainer');
container.style.position = 'relative';
container.appendChild(overlay);

['rotateLeft', 'rotateRight', 'deleteSticker'].forEach(id => {
  overlay.querySelector('#' + id).style.cssText =
    'background:none;border:none;font-size:1.3rem;cursor:pointer;padding:4px 8px;';
});

function showOverlay(s) {
  const canvasRect = canvas.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const scaleX = canvasRect.width / WIDTH;
  const scaleY = canvasRect.height / HEIGHT;
  const cx = (s.x + s.width / 2) * scaleX + canvasRect.left - containerRect.left;
  const top = s.y * scaleY + canvasRect.top - containerRect.top - 50;
  overlay.style.display = 'flex';
  // position after it's visible so offsetWidth is correct
  requestAnimationFrame(() => {
    overlay.style.left = (cx - overlay.offsetWidth / 2) + 'px';
    overlay.style.top = Math.max(4, top) + 'px';
  });
}

function hideOverlay() { overlay.style.display = 'none'; }

// overlay button actions
document.getElementById('rotateLeft').addEventListener('click', e => {
  e.stopPropagation();
  if (selectedSticker) { selectedSticker.rotation = (selectedSticker.rotation || 0) - 15; drawCanvas(); showOverlay(selectedSticker); }
});
document.getElementById('rotateRight').addEventListener('click', e => {
  e.stopPropagation();
  if (selectedSticker) { selectedSticker.rotation = (selectedSticker.rotation || 0) + 15; drawCanvas(); showOverlay(selectedSticker); }
});
document.getElementById('deleteSticker').addEventListener('click', e => {
  e.stopPropagation();
  if (selectedSticker) {
    stickers = stickers.filter(s => s !== selectedSticker);
    selectedSticker = null;
    hideOverlay();
    drawCanvas();
  }
});
document.getElementById('sizeUp').addEventListener('click', e => {
  e.stopPropagation();
  if (selectedSticker) {
    const factor = 1.15;
    selectedSticker.x -= (selectedSticker.width * (factor - 1)) / 2;
    selectedSticker.y -= (selectedSticker.height * (factor - 1)) / 2;
    selectedSticker.width *= factor;
    selectedSticker.height *= factor;
    drawCanvas(); showOverlay(selectedSticker);
  }
});
document.getElementById('sizeDown').addEventListener('click', e => {
  e.stopPropagation();
  if (selectedSticker) {
    const factor = 1 / 1.15;
    selectedSticker.x -= (selectedSticker.width * (factor - 1)) / 2;
    selectedSticker.y -= (selectedSticker.height * (factor - 1)) / 2;
    selectedSticker.width *= factor;
    selectedSticker.height *= factor;
    drawCanvas(); showOverlay(selectedSticker);
  }
});

// ── Load photo ─────────────────────────────────────────────────────
const finalImage = new Image();
const dataURL = localStorage.getItem('photoStrip');
if (dataURL) {
  finalImage.src = dataURL;
  finalImage.onload = drawCanvas;
  localStorage.removeItem('photoStrip');
} else alert('No photo found!');

// ── Draw canvas ────────────────────────────────────────────────────
function drawCanvas() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.drawImage(finalImage, 0, 0, WIDTH, HEIGHT);
  stickers.forEach(s => {
    ctx.save();
    const cx = s.x + s.width / 2;
    const cy = s.y + s.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate(((s.rotation || 0) * Math.PI) / 180);
    ctx.drawImage(s.img, -s.width / 2, -s.height / 2, s.width, s.height);
    if (s === selectedSticker) {
      ctx.strokeStyle = '#2a4a53';
      ctx.lineWidth = 6;
      ctx.setLineDash([12, 6]);
      ctx.strokeRect(-s.width / 2 - 4, -s.height / 2 - 4, s.width + 8, s.height + 8);
      ctx.setLineDash([]);
    }
    ctx.restore();
  });
}

// ── Add sticker ────────────────────────────────────────────────────
function addSticker(src) {
  const img = new Image();
  img.src = src;
  img.onload = () => {
    const s = {
      img,
      x: WIDTH / 2 - img.width / 6,
      y: HEIGHT / 2 - img.height / 6,
      width: img.width / 2.5,
      height: img.height / 2.5,
      rotation: 0,
      dragging: false
    };
    stickers.push(s);
    selectedSticker = s;
    drawCanvas();
    setTimeout(() => showOverlay(s), 60);
  };
}

// ── Hit test (rotation-aware) ──────────────────────────────────────
function hitTest(s, mx, my) {
  const cx = s.x + s.width / 2, cy = s.y + s.height / 2;
  const angle = -((s.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const dx = mx - cx, dy = my - cy;
  const lx = cos * dx - sin * dy;
  const ly = sin * dx + cos * dy;
  return Math.abs(lx) <= s.width / 2 && Math.abs(ly) <= s.height / 2;
}

// ── Pointer helpers ────────────────────────────────────────────────
function getPointerPos(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
  const clientX = e.touches?.[0]?.clientX ?? e.clientX;
  const clientY = e.touches?.[0]?.clientY ?? e.clientY;
  return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}

function pointerDown(e) {
  if (e.target !== canvas) return;
  const { x: mx, y: my } = getPointerPos(e);
  let hit = false;
  for (let i = stickers.length - 1; i >= 0; i--) {
    const s = stickers[i];
    if (hitTest(s, mx, my)) {
      selectedSticker = s;
      s.dragging = true;
      dragOffset.x = mx - s.x;
      dragOffset.y = my - s.y;
      stickers.splice(i, 1);
      stickers.push(s);
      drawCanvas();
      showOverlay(s);
      e.preventDefault();
      hit = true;
      break;
    }
  }
  if (!hit) { selectedSticker = null; hideOverlay(); drawCanvas(); }
}

function pointerMove(e) {
  if (!selectedSticker?.dragging) return;
  const { x: mx, y: my } = getPointerPos(e);
  selectedSticker.x = mx - dragOffset.x;
  selectedSticker.y = my - dragOffset.y;
  drawCanvas();
  showOverlay(selectedSticker);
  e.preventDefault();
}

function pointerUp() { if (selectedSticker) selectedSticker.dragging = false; }

canvas.addEventListener('mousedown', pointerDown);
canvas.addEventListener('mousemove', pointerMove);
canvas.addEventListener('mouseup', pointerUp);
canvas.addEventListener('mouseleave', pointerUp);
canvas.addEventListener('touchstart', pointerDown, { passive: false });
canvas.addEventListener('touchmove', pointerMove, { passive: false });
canvas.addEventListener('touchend', pointerUp);
canvas.addEventListener('touchcancel', pointerUp);

// ── Sticker buttons ────────────────────────────────────────────────
addFishBtn.addEventListener('click', () => addSticker('Assets/fish-photobooth/camerapage/stickers/fish.png'));
addOctopusBtn.addEventListener('click', () => addSticker('Assets/fish-photobooth/camerapage/stickers/octopus.png'));

const seaweedImages = ['Assets/fish-photobooth/camerapage/stickers/seaweed1.png', 'Assets/fish-photobooth/camerapage/stickers/seaweed2.png'];
const bubbleImages = ['Assets/fish-photobooth/camerapage/stickers/bubble1.png', 'Assets/fish-photobooth/camerapage/stickers/bubble2.png'];
let seaweedIndex = 0, bubbleIndex = 0;

addSeaweedBtn.addEventListener('click', () => { addSticker(seaweedImages[seaweedIndex]); seaweedIndex = (seaweedIndex + 1) % seaweedImages.length; });
addAxBtn.addEventListener('click', () => addSticker('Assets/fish-photobooth/camerapage/stickers/axolotl.png'));
addBubbleBtn.addEventListener('click', () => { addSticker(bubbleImages[bubbleIndex]); bubbleIndex = (bubbleIndex + 1) % bubbleImages.length; });

// ── Controls ────────────────────────────────────────────────────────
resetBtn.addEventListener('click', () => { stickers = []; selectedSticker = null; hideOverlay(); drawCanvas(); });

// mobile-aware download helper
function downloadImage(canvasEl, filename) {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (isIOS) {
    // iOS Safari ignores the `download` attribute — open in new tab so user can long-press to save
    const dataUrl = canvasEl.toDataURL('image/png');
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(
        `<html><body style="margin:0;background:#000;text-align:center">` +
        `<p style="color:#fff;font-family:sans-serif;margin:12px">Hold the image and tap <b>Save Image</b></p>` +
        `<img src="${dataUrl}" style="max-width:100%;display:block;margin:0 auto">` +
        `</body></html>`
      );
      win.document.close();
    } else {
      // popup blocked – navigate directly to the image
      window.location.href = dataUrl;
    }
  } else {
    canvasEl.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }
}

downloadBtn.addEventListener('click', () => {
  selectedSticker = null; hideOverlay(); drawCanvas();
  setTimeout(() => downloadImage(canvas, 'fish-photobooth.png'), 80);
});

homeBtn.addEventListener('click', () => window.location.href = 'index.html');

// canvas view-zoom slider (display only, doesn't change exported image)
const canvasZoomSlider = document.getElementById('canvasZoom');
const canvasZoomValue = document.getElementById('canvasZoomValue');
if (canvasZoomSlider) {
  canvasZoomSlider.addEventListener('input', () => {
    const scale = parseFloat(canvasZoomSlider.value);
    canvas.style.transform = `scale(${scale})`;
    canvas.style.transformOrigin = 'top center';
    canvasZoomValue.textContent = scale.toFixed(2) + '×';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const logo = document.querySelector('.logo');
  if (logo) logo.addEventListener('click', () => window.location.href = 'index.html');
});
