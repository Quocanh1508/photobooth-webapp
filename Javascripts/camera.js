// constants
const WIDTH = 1176, HEIGHT = 1470, HALF = HEIGHT / 2;

// dom elements
const elements = {
  video: document.getElementById('liveVideo'),
  canvas: document.getElementById('finalCanvas'),
  ctx: document.getElementById('finalCanvas').getContext('2d'),
  takePhotoBtn: document.getElementById('takePhoto'),
  downloadBtn: document.getElementById('downloadBtn'),
  countdownEl: document.querySelector('.countdown-timer'),
  zoomSlider: document.getElementById('zoomSlider'),
  zoomValue: document.getElementById('zoomValue')
};

let photoStage = 0;   // 0=taking slot 1, 1=taking slot 2, 2=done
let zoomLevel = 1.0;
let previewRAF = null; // requestAnimationFrame handle for live preview

// ── Live preview loop ─────────────────────────────────────────────
// Applies the same crop/zoom math as capturePhoto, so what you see 
// in the preview is exactly what gets captured.
function startLivePreview(slotIndex) {
  const { video, ctx } = elements;
  const yOffset = slotIndex === 0 ? 0 : HALF;

  function drawFrame() {
    // wait until video has real dimensions
    if (video.videoWidth && video.readyState >= 2) {
      const vW = video.videoWidth, vH = video.videoHeight;
      const targetAspect = WIDTH / HALF, vAspect = vW / vH;
      let sx, sy, sw, sh;

      // base crop to match frame aspect ratio
      if (vAspect > targetAspect) {
        sh = vH; sw = vH * targetAspect;
        sx = (vW - sw) / 2; sy = 0;
      } else {
        sw = vW; sh = vW / targetAspect;
        sx = 0; sy = (vH - sh) / 2;
      }

      // apply zoom — shrink source rect = zoom in
      const zoomedW = sw / zoomLevel;
      const zoomedH = sh / zoomLevel;
      sx += (sw - zoomedW) / 2;
      sy += (sh - zoomedH) / 2;
      sw = zoomedW;
      sh = zoomedH;

      // draw mirrored into the correct half of the canvas
      ctx.save();
      ctx.translate(WIDTH, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, sx, sy, sw, sh, 0, yOffset, WIDTH, HALF);
      ctx.restore();
    }
    previewRAF = requestAnimationFrame(drawFrame);
  }

  previewRAF = requestAnimationFrame(drawFrame);
}

function stopLivePreview() {
  if (previewRAF) { cancelAnimationFrame(previewRAF); previewRAF = null; }
}

// ── Capture one slot ──────────────────────────────────────────────
const capturePhoto = () => {
  const { video, ctx, takePhotoBtn } = elements;
  const yOffset = photoStage === 0 ? 0 : HALF;
  const vW = video.videoWidth, vH = video.videoHeight;
  const targetAspect = WIDTH / HALF, vAspect = vW / vH;
  let sx, sy, sw, sh;

  if (vAspect > targetAspect) { sh = vH; sw = vH * targetAspect; sx = (vW - sw) / 2; sy = 0; }
  else { sw = vW; sh = vW / targetAspect; sx = 0; sy = (vH - sh) / 2; }

  const zoomedW = sw / zoomLevel;
  const zoomedH = sh / zoomLevel;
  sx += (sw - zoomedW) / 2;
  sy += (sh - zoomedH) / 2;
  sw = zoomedW;
  sh = zoomedH;

  stopLivePreview();

  ctx.save();
  ctx.translate(WIDTH, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, sx, sy, sw, sh, 0, yOffset, WIDTH, HALF);
  ctx.restore();

  photoStage++;
  if (photoStage === 1) {
    takePhotoBtn.disabled = false;
    startLivePreview(1); // start preview for second slot
  } else if (photoStage === 2) {
    finalizePhotoStrip();
  }
};

// ── Countdown ─────────────────────────────────────────────────────
const startCountdown = callback => {
  let count = 3;
  const { countdownEl } = elements;
  countdownEl.textContent = count;
  countdownEl.style.display = 'flex';
  const intervalId = setInterval(() => {
    count--;
    if (count > 0) countdownEl.textContent = count;
    else {
      clearInterval(intervalId);
      countdownEl.style.display = 'none';
      callback();
    }
  }, 1000);
};

// ── Finalize ──────────────────────────────────────────────────────
const finalizePhotoStrip = () => {
  const { video, ctx, canvas } = elements;
  stopLivePreview();
  video.style.display = 'none';

  const frame = new Image();
  frame.src = 'Assets/fish-photobooth/camerapage/frame.png';
  frame.onload = () => {
    ctx.drawImage(frame, 0, 0, WIDTH, HEIGHT);
    localStorage.setItem('photoStrip', canvas.toDataURL('image/png'));
    setTimeout(() => window.location.href = 'final.html', 50);
  };
  frame.complete && frame.onload();
};

// ── Download (fallback) ───────────────────────────────────────────
const downloadPhoto = () => {
  elements.canvas.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'photo-strip.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }, 'image/png');
};

// ── Camera setup ──────────────────────────────────────────────────
const setupCamera = () => {
  navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 2560 }, height: { ideal: 1440 }, facingMode: 'user' },
    audio: false
  })
    .then(stream => {
      elements.video.srcObject = stream;
      elements.video.play();
      // once the video is playing, start the preview loop for slot 0
      elements.video.addEventListener('playing', () => startLivePreview(0), { once: true });
    })
    .catch(err => alert('Camera access failed: ' + err));
};

// ── Events ────────────────────────────────────────────────────────
const setupEventListeners = () => {
  const { takePhotoBtn, downloadBtn, zoomSlider, zoomValue } = elements;

  takePhotoBtn.addEventListener('click', () => {
    if (photoStage > 1) return;
    takePhotoBtn.disabled = true;
    stopLivePreview();
    startCountdown(capturePhoto);
  });

  // zoom slider — updating zoomLevel is enough; the preview loop reads it live
  if (zoomSlider) {
    zoomSlider.addEventListener('input', () => {
      zoomLevel = parseFloat(zoomSlider.value);
      if (zoomValue) zoomValue.textContent = zoomLevel.toFixed(1) + '×';
    });
  }

  downloadBtn.addEventListener('click', downloadPhoto);
  window.addEventListener('resize', () => { /* preview loop handles redraws */ });
};

// ── Init ──────────────────────────────────────────────────────────
setupCamera();
setupEventListeners();

// logo redirect
document.addEventListener('DOMContentLoaded', () => {
  const logo = document.querySelector('.logo');
  if (logo) logo.addEventListener('click', () => window.location.href = 'index.html');
});
