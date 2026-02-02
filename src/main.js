import './style.css'
import 'remixicon/fonts/remixicon.css'

// State
const state = {
  stream: null,
  videoEl: null,
  canvasEl: null,
  ctx: null,
  isRecording: false,
  mode: 'photo', // 'photo' | 'video'
  mediaRecorder: null,
  recordedChunks: [],
  currentFilterIndex: 0,
  gallery: [], // { type: 'image'|'video', url: string, date: Date }
  facingMode: 'user',
  width: 0,
  height: 0
};

// Filters Configuration
const filters = [
  { name: 'Normal', filter: 'none' },
  { name: 'Retro', filter: 'sepia(0.4) contrast(1.2) brightness(0.9) saturate(0.8)', overlay: 'vignette' },
  { name: 'B&W', filter: 'grayscale(1) contrast(1.1)' },
  { name: 'Warm', filter: 'sepia(0.3) saturate(1.4) hue-rotate(-15deg)' },
  { name: 'Cool', filter: 'saturate(1.2) hue-rotate(15deg) brightness(1.1)' },
  { name: 'Soft', filter: 'brightness(1.1) contrast(0.9) saturate(0.9) blur(0.5px)' },
  { name: 'Dreamy', filter: 'contrast(0.9) brightness(1.2) saturate(1.5)', overlay: 'bloom' },
  { name: 'Cyber', filter: 'contrast(1.3) saturate(1.5) hue-rotate(180deg)' },
];

// DOM Elements
const ui = {
  video: document.getElementById('webcam'),
  canvas: document.getElementById('output'),
  shutterBtn: document.getElementById('shutter-btn'),
  filtersList: document.getElementById('filters-list'),
  toggleCamBtn: document.getElementById('toggle-camera-btn'),
  galleryBtn: document.getElementById('gallery-btn'),
  modePhotoBtn: document.getElementById('mode-photo'),
  modeVideoBtn: document.getElementById('mode-video'),
  galleryModal: document.getElementById('gallery-modal'),
  closeGalleryBtn: document.getElementById('close-gallery'),
  galleryGrid: document.getElementById('gallery-grid'),
  emptyGallery: document.getElementById('empty-gallery'),
  flashOverlay: document.querySelector('.flash-overlay'),
  settingsBtn: document.getElementById('settings-btn')
};

// Initialization
async function init() {
  state.videoEl = ui.video;
  state.canvasEl = ui.canvas;
  state.ctx = state.canvasEl.getContext('2d', { willReadFrequently: true });

  // Handle resize for full resolution
  window.addEventListener('resize', handleResize);

  // Controls
  setupControls();
  renderFilterList();

  // Start Camera
  await startCamera();

  // Start Render Loop
  requestAnimationFrame(render);
}

// Camera Handling
async function startCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach(track => track.stop());
  }

  const constraints = {
    audio: true, // Try to get audio for video recording
    video: {
      facingMode: state.facingMode,
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    }
  };

  try {
    state.stream = await navigator.mediaDevices.getUserMedia(constraints);

    // Check if audio track exists, if not trying video might fail
    const audioTrack = state.stream.getAudioTracks()[0];
    if (!audioTrack) {
      console.warn('No audio track found');
    }

    state.videoEl.srcObject = state.stream;
    await state.videoEl.play();

    handleResize(); // Set canvas size
  } catch (err) {
    console.error("Camera access error:", err);
    alert("Could not access camera. Please allow permissions.");
  }
}

function handleResize() {
  const { blockWidth, blockHeight } = getViewportSize();
  // Set canvas resolution to match screen but maintain aspect ratio of camera if possible? 
  // Better: Set canvas to window size, draw video with 'object-fit: cover' simulation
  state.width = window.innerWidth;
  state.height = window.innerHeight;

  state.canvasEl.width = state.width;
  state.canvasEl.height = state.height;
}

function getViewportSize() {
  return { w: window.innerWidth, h: window.innerHeight };
}

// Rendering
function render() {
  if (state.videoEl && state.videoEl.readyState >= 2) {
    const ctx = state.ctx;
    const { width, height } = state;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Apply Filter
    const activeFilter = filters[state.currentFilterIndex];
    ctx.filter = activeFilter.filter;

    // Draw Video (Cover simulation)
    const vW = state.videoEl.videoWidth;
    const vH = state.videoEl.videoHeight;
    const vRatio = vW / vH;
    const cRatio = width / height;

    let drawW, drawH, startX, startY;

    if (vRatio > cRatio) {
      drawH = height;
      drawW = height * vRatio;
      startX = (width - drawW) / 2;
      startY = 0;
    } else {
      drawW = width;
      drawH = width / vRatio;
      startX = 0;
      startY = (height - drawH) / 2;
    }

    // Mirror if facing user
    if (state.facingMode === 'user') {
      ctx.save();
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(state.videoEl, startX * -1 - drawW, startY, drawW, drawH); // Adjust calculation for mirror
      // Simple mirror logic:
      // Translate to width, scale -1
      // Draw image at normal coords but mirrored space
      // Wait, 'startX' is negative if cropping center.
      // Let's redo:
      // We want to draw the image centered.
      // If we flip, x -> width - x.
      // Hard to calculate 'cover' cropping with flip manually easily.
      // Easier: ctx.translate(width, 0); ctx.scale(-1, 1);
      // Then draw with correct centered coords.
      // If startX is -100 (left crop), we draw at -100.
      // But in flipped coords, x=0 is right edge. 
      // width + (startX) -> wait.
      // Let's assume draw at (startX, startY, drawW, drawH)
      // If we flip context:
      // x' = width - x.
      // If we draw image at x=startX...
      // e.g. startX = -50.
      // Image draws from -50 to width+50.
      // Flipped: width - (-50) -> width + 50 starts? No.
      // Correct transform for "Mirror the whole canvas output" vs "Mirror the source input".
      // Mirror source:
      // ctx.scale(-1, 1); ctx.drawImage(img, -drawX - drawW, drawY, drawW, drawH);
      // Let's trust basic flipping.

      // Let's keep it simple: Draw normally, if usermode, flip the whole canvas? No, user needs to see text properly? No text on video.
      // Just flip context X.
    } else {
      ctx.drawImage(state.videoEl, startX, startY, drawW, drawH);
    }

    if (state.facingMode === 'user') {
      ctx.restore();
    }

    // Overlays
    if (activeFilter.overlay === 'vignette') {
      const grad = ctx.createRadialGradient(width / 2, height / 2, height / 3, width / 2, height / 2, height);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.6)');
      ctx.fillStyle = grad;
      ctx.filter = 'none'; // distinct from image filter
      ctx.fillRect(0, 0, width, height);
    }
  }

  requestAnimationFrame(render);
}

// Logic
function setupControls() {
  // Mode Switching
  ui.modePhotoBtn.addEventListener('click', () => setMode('photo'));
  ui.modeVideoBtn.addEventListener('click', () => setMode('video'));

  // Shutter
  ui.shutterBtn.addEventListener('click', handleShutter);

  // Camera Toggle
  ui.toggleCamBtn.addEventListener('click', () => {
    state.facingMode = state.facingMode === 'user' ? 'environment' : 'user';
    startCamera();
  });

  // Gallery
  ui.galleryBtn.addEventListener('click', openGallery);
  ui.closeGalleryBtn.addEventListener('click', closeGallery);
}

function setMode(mode) {
  state.mode = mode;
  ui.modePhotoBtn.classList.toggle('active', mode === 'photo');
  ui.modeVideoBtn.classList.toggle('active', mode === 'video');
  ui.shutterBtn.classList.remove('recording');
}

async function handleShutter() {
  if (state.mode === 'photo') {
    takePhoto();
  } else {
    toggleRecording();
  }
}

function takePhoto() {
  // Visual Feedback
  ui.flashOverlay.classList.add('flash-active');
  setTimeout(() => ui.flashOverlay.classList.remove('flash-active'), 150);

  // Capture
  const canvas = state.canvasEl;
  const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

  addToGallery('image', dataUrl);
}

function toggleRecording() {
  if (state.isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

function startRecording() {
  state.isRecording = true;
  ui.shutterBtn.classList.add('recording');
  state.recordedChunks = [];

  // Get stream from canvas with filters
  const canvasStream = state.canvasEl.captureStream(30);

  // Add audio if available
  if (state.stream.getAudioTracks().length > 0) {
    canvasStream.addTrack(state.stream.getAudioTracks()[0]);
  }

  const options = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? { mimeType: 'video/webm;codecs=vp9' }
    : { mimeType: 'video/webm' };

  state.mediaRecorder = new MediaRecorder(canvasStream, options);

  state.mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      state.recordedChunks.push(e.data);
    }
  };

  state.mediaRecorder.onstop = () => {
    const blob = new Blob(state.recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    addToGallery('video', url);
  };

  state.mediaRecorder.start();
}

function stopRecording() {
  state.isRecording = false;
  ui.shutterBtn.classList.remove('recording');
  state.mediaRecorder.stop();
}

function addToGallery(type, url) {
  state.gallery.unshift({ type, url, date: new Date() });
  updateGalleryPreview();
  renderGalleryGrid();
}

function updateGalleryPreview() {
  if (state.gallery.length > 0) {
    const latest = state.gallery[0];
    const el = ui.galleryBtn;
    el.innerHTML = '';

    if (latest.type === 'image') {
      const img = document.createElement('img');
      img.src = latest.url;
      el.appendChild(img);
    } else {
      const vid = document.createElement('video');
      vid.src = latest.url;
      el.appendChild(vid);
    }
  }
}

function renderFilterList() {
  ui.filtersList.innerHTML = '';
  filters.forEach((f, i) => {
    const item = document.createElement('div');
    item.className = `filter-item ${i === state.currentFilterIndex ? 'active' : ''}`;

    // Preview Circle (Just a colored div or text for now, extracting real preview is expensive)
    // We can use a linear-gradient that approximates the filter? Or just a generic icon.
    // Better: Apply the filter to a small sample color div.

    const preview = document.createElement('div');
    preview.className = 'filter-preview';
    // Style the preview to show the filter effect? 
    // We can set background image to a static sample thumbnail
    // For now, simple gray plus the filter? filter css property works on divs too.
    preview.style.backgroundColor = '#888';
    preview.style.filter = f.filter;
    preview.style.backgroundImage = 'linear-gradient(45deg, #ff9a9e 0%, #fad0c4 99%, #fad0c4 100%)'; // Cute gradient

    const name = document.createElement('span');
    name.className = 'filter-name';
    name.innerText = f.name;

    item.appendChild(preview);
    item.appendChild(name);

    item.onclick = () => {
      // Set active
      document.querySelectorAll('.filter-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      state.currentFilterIndex = i;
    };

    ui.filtersList.appendChild(item);
  });
}

function openGallery() {
  ui.galleryModal.classList.remove('hidden');
  renderGalleryGrid();
}

function closeGallery() {
  ui.galleryModal.classList.add('hidden');
}

function renderGalleryGrid() {
  const container = ui.galleryGrid;
  const empty = ui.emptyGallery;

  container.innerHTML = '';

  if (state.gallery.length === 0) {
    empty.style.display = 'flex';
    return;
  }

  empty.style.display = 'none';

  state.gallery.forEach(item => {
    const div = document.createElement('div');
    div.className = 'gallery-item';

    if (item.type === 'image') {
      const img = document.createElement('img');
      img.src = item.url;
      div.appendChild(img);
    } else {
      const vid = document.createElement('video');
      vid.src = item.url;
      vid.controls = true; // Allow playback
      div.appendChild(vid);

      const indicator = document.createElement('i');
      indicator.className = 'ri-movie-fill type-indicator';
      div.appendChild(indicator);
    }

    // Add download button on click or hover? 
    // Simply clicking it could open full view or download.
    // Let's add a download icon overlay.
    const downloadBtn = document.createElement('a');
    downloadBtn.href = item.url;
    downloadBtn.download = `lumina_${Date.now()}.${item.type === 'image' ? 'jpg' : 'webm'}`;
    downloadBtn.className = 'ri-download-line';
    downloadBtn.style.position = 'absolute';
    downloadBtn.style.top = '5px';
    downloadBtn.style.right = '5px';
    downloadBtn.style.color = 'white';
    downloadBtn.style.background = 'rgba(0,0,0,0.5)';
    downloadBtn.style.padding = '5px';
    downloadBtn.style.borderRadius = '50%';
    downloadBtn.style.textDecoration = 'none';

    div.appendChild(downloadBtn);

    container.appendChild(div);
  });
}

// Start
init();
