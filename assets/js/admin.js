/**
 * COGNIZANCE ARTS FEST — ADMIN CONTROLLER
 */
(() => {
  'use strict';

  const AUTH_STORAGE_KEY = 'cognizance_admin_authed';

  // DOM Elements
  const lockscreen = document.getElementById('adm-lockscreen');
  const dashboard = document.getElementById('adm-dashboard');
  const pinInput = document.getElementById('adm-pin-input');
  const pinBtn = document.getElementById('adm-pin-btn');
  const pinError = document.getElementById('adm-pin-error');
  const logoutBtn = document.getElementById('adm-logout-btn');

  const tabBtns = document.querySelectorAll('.adm-tab-btn');
  const tabPanes = document.querySelectorAll('.adm-tab-pane');

  const statusAlert = document.getElementById('adm-status-alert');

  // Photo elements
  const dropzone = document.getElementById('adm-dropzone');
  const fileInput = document.getElementById('adm-file-input');
  const photoCaptionInput = document.getElementById('adm-photo-caption');
  const uploadProgress = document.getElementById('adm-upload-progress');
  const progressBar = document.getElementById('adm-progress-bar');
  const galleryGrid = document.getElementById('adm-gallery-grid');
  const photoCountEl = document.getElementById('adm-photo-count');

  // Video elements
  const ytUrlInput = document.getElementById('adm-yt-url');
  const ytTitleInput = document.getElementById('adm-yt-title');
  const ytAddBtn = document.getElementById('adm-yt-add-btn');
  const ytPreview = document.getElementById('adm-yt-preview');
  const ytPreviewThumb = document.getElementById('adm-yt-preview-thumb');
  const ytPreviewTitle = document.getElementById('adm-yt-preview-title');
  const videoGrid = document.getElementById('adm-video-grid');
  const videoCountEl = document.getElementById('adm-video-count');

  // Toast container
  function showToast(message, duration = 3000) {
    const toast = document.createElement('div');
    toast.className = 'adm-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // Auth Handling
  function checkAuth() {
    const authed = sessionStorage.getItem(AUTH_STORAGE_KEY) === 'true';
    if (authed) {
      lockscreen.hidden = true;
      lockscreen.style.display = 'none';
      if (pinInput) pinInput.value = '';
      dashboard.hidden = false;
      dashboard.style.display = 'block';
      logoutBtn.hidden = false;
      initDashboard();
    } else {
      lockscreen.hidden = false;
      lockscreen.style.display = 'flex';
      dashboard.hidden = true;
      dashboard.style.display = 'none';
      logoutBtn.hidden = true;
      if (pinInput) {
        pinInput.value = '';
        pinInput.focus();
      }
    }
  }

  function handleLogin() {
    const enteredPin = pinInput.value.trim();
    const config = window.COGNIZANCE_CONFIG || {};
    const expectedPin = config.adminPin || '2025';

    if (enteredPin === expectedPin) {
      sessionStorage.setItem(AUTH_STORAGE_KEY, 'true');
      pinError.hidden = true;
      pinInput.value = '';
      checkAuth();
      showToast('Welcome to Cognizance Admin!');
    } else {
      pinError.hidden = false;
      pinError.textContent = 'Incorrect passcode. Please try again.';
      pinInput.select();
    }
  }

  function handleLogout() {
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    checkAuth();
    showToast('Signed out successfully.');
  }

  // Tab Switching
  function setupTabs() {
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabPanes.forEach(p => p.hidden = true);

        btn.classList.add('active');
        const targetId = btn.getAttribute('data-target');
        const targetPane = document.getElementById(targetId);
        if (targetPane) targetPane.hidden = false;
      });
    });
  }

  // Dashboard Init
  function initDashboard() {
    const isConfigured = window.CognizanceAPI && window.CognizanceAPI.isSupabaseConfigured();

    if (!isConfigured) {
      statusAlert.hidden = false;
      statusAlert.className = 'adm-alert adm-alert-warning';
      statusAlert.innerHTML = `
        <div>
          <strong>Supabase Configuration Required:</strong><br>
          Please enter your Supabase Project URL and Anon Public Key inside <code>assets/js/supabase-config.js</code>.
        </div>
      `;
    } else {
      statusAlert.hidden = false;
      statusAlert.className = 'adm-alert adm-alert-success';
      statusAlert.innerHTML = `
        <div>
          <strong>Supabase Connected:</strong> Live cloud database & storage are active!
        </div>
      `;
    }

    loadPhotos();
    loadVideos();
  }

  // -------------------------------------------------------------
  // PHOTOS MANAGEMENT
  // -------------------------------------------------------------
  async function loadPhotos() {
    if (!galleryGrid) return;
    galleryGrid.innerHTML = '<div class="adm-empty">Loading photos...</div>';

    const photos = await window.CognizanceAPI.fetchGalleryPhotos();

    if (!photos) {
      galleryGrid.innerHTML = `
        <div class="adm-empty">
          Unable to connect to Supabase database.<br>
          <small>Check your config in <code>assets/js/supabase-config.js</code>.</small>
        </div>
      `;
      if (photoCountEl) photoCountEl.textContent = '0';
      return;
    }

    if (photoCountEl) photoCountEl.textContent = photos.length;

    if (photos.length === 0) {
      galleryGrid.innerHTML = '<div class="adm-empty">No live photos uploaded yet. Upload your first photo above!</div>';
      return;
    }

    galleryGrid.innerHTML = '';
    photos.forEach(photo => {
      const card = document.createElement('div');
      card.className = 'adm-item-card';

      const createdDate = photo.created_at ? new Date(photo.created_at).toLocaleDateString() : '';

      card.innerHTML = `
        <img class="adm-item-thumb" src="${escapeHtml(photo.image_url)}" alt="${escapeHtml(photo.alt_text || 'Photo')}" loading="lazy">
        <div class="adm-item-body">
          <div class="adm-item-title" title="${escapeHtml(photo.alt_text || 'Photo')}">${escapeHtml(photo.alt_text || 'Untitled Photo')}</div>
          <div class="adm-item-meta">${createdDate}</div>
          <button class="adm-btn-danger" data-id="${photo.id}" data-path="${escapeHtml(photo.storage_path || '')}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            Delete
          </button>
        </div>
      `;

      const delBtn = card.querySelector('.adm-btn-danger');
      delBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to delete this photo?')) return;
        delBtn.disabled = true;
        delBtn.textContent = 'Deleting...';
        try {
          await window.CognizanceAPI.deleteGalleryPhoto(photo.id, photo.storage_path);
          showToast('Photo deleted successfully.');
          loadPhotos();
        } catch (err) {
          alert('Delete failed: ' + err.message);
          delBtn.disabled = false;
          delBtn.textContent = 'Delete';
        }
      });

      galleryGrid.appendChild(card);
    });
  }

  async function handlePhotoUpload(files) {
    if (!files || !files.length) return;

    const caption = photoCaptionInput.value.trim();
    uploadProgress.style.display = 'block';
    progressBar.style.width = '10%';

    let successCount = 0;
    const total = files.length;

    for (let i = 0; i < total; i++) {
      const file = files[i];
      try {
        progressBar.style.width = `${Math.round(((i + 0.5) / total) * 100)}%`;
        await window.CognizanceAPI.uploadGalleryPhoto(file, { altText: caption });
        successCount++;
        progressBar.style.width = `${Math.round(((i + 1) / total) * 100)}%`;
      } catch (err) {
        console.error('Upload error for file', file.name, err);
        alert(`Failed to upload ${file.name}: ${err.message}`);
      }
    }

    setTimeout(() => {
      uploadProgress.style.display = 'none';
      progressBar.style.width = '0%';
    }, 500);

    photoCaptionInput.value = '';
    fileInput.value = '';
    if (successCount > 0) {
      showToast(`${successCount} photo(s) uploaded successfully!`);
      loadPhotos();
    }
  }

  // -------------------------------------------------------------
  // VIDEO HIGHLIGHTS MANAGEMENT
  // -------------------------------------------------------------
  async function loadVideos() {
    if (!videoGrid) return;
    videoGrid.innerHTML = '<div class="adm-empty">Loading videos...</div>';

    const videos = await window.CognizanceAPI.fetchVideos();

    if (!videos) {
      videoGrid.innerHTML = `
        <div class="adm-empty">
          Unable to connect to Supabase database.<br>
          <small>Check your config in <code>assets/js/supabase-config.js</code>.</small>
        </div>
      `;
      if (videoCountEl) videoCountEl.textContent = '0';
      return;
    }

    if (videoCountEl) videoCountEl.textContent = videos.length;

    if (videos.length === 0) {
      videoGrid.innerHTML = '<div class="adm-empty">No live videos added yet. Paste a YouTube URL above!</div>';
      return;
    }

    videoGrid.innerHTML = '';
    videos.forEach(video => {
      const card = document.createElement('div');
      card.className = 'adm-item-card';

      card.innerHTML = `
        <img class="adm-item-thumb" src="${escapeHtml(video.thumbnail_url)}" alt="${escapeHtml(video.title)}" loading="lazy">
        <div class="adm-item-body">
          <div class="adm-item-title" title="${escapeHtml(video.title)}">${escapeHtml(video.title)}</div>
          <div class="adm-item-meta">
            <a href="${escapeHtml(video.youtube_url)}" target="_blank" rel="noopener noreferrer" style="color:var(--adm-gold); text-decoration:none;">Open on YouTube ↗</a>
          </div>
          <button class="adm-btn-danger" data-id="${video.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            Delete
          </button>
        </div>
      `;

      const delBtn = card.querySelector('.adm-btn-danger');
      delBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to delete this video?')) return;
        delBtn.disabled = true;
        delBtn.textContent = 'Deleting...';
        try {
          await window.CognizanceAPI.deleteVideo(video.id);
          showToast('Video deleted successfully.');
          loadVideos();
        } catch (err) {
          alert('Delete failed: ' + err.message);
          delBtn.disabled = false;
          delBtn.textContent = 'Delete';
        }
      });

      videoGrid.appendChild(card);
    });
  }

  function handleYtInputPreview() {
    const url = ytUrlInput.value.trim();
    const data = window.CognizanceAPI.extractYouTubeData(url);
    if (data) {
      ytPreview.hidden = false;
      ytPreviewThumb.src = data.thumbnailUrl;
      ytPreviewTitle.textContent = ytTitleInput.value.trim() || `YouTube Video (${data.videoId})`;
      ytAddBtn.disabled = false;
    } else {
      ytPreview.hidden = true;
      ytAddBtn.disabled = url.length > 0;
    }
  }

  async function handleAddVideo() {
    const url = ytUrlInput.value.trim();
    const title = ytTitleInput.value.trim();

    if (!url) return;

    ytAddBtn.disabled = true;
    ytAddBtn.textContent = 'Adding...';

    try {
      await window.CognizanceAPI.addYouTubeVideo({ url, title });
      showToast('Video added successfully!');
      ytUrlInput.value = '';
      ytTitleInput.value = '';
      ytPreview.hidden = true;
      loadVideos();
    } catch (err) {
      alert('Failed to add video: ' + err.message);
    } finally {
      ytAddBtn.disabled = false;
      ytAddBtn.textContent = 'Add Video';
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Event Listeners
  function initListeners() {
    pinBtn.addEventListener('click', handleLogin);
    pinInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') handleLogin();
    });

    logoutBtn.addEventListener('click', handleLogout);

    setupTabs();

    // Drag and Drop
    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => handlePhotoUpload(e.target.files));

    dropzone.addEventListener('dragover', e => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files) {
        handlePhotoUpload(e.dataTransfer.files);
      }
    });

    // YouTube inputs
    ytUrlInput.addEventListener('input', handleYtInputPreview);
    ytTitleInput.addEventListener('input', handleYtInputPreview);
    ytAddBtn.addEventListener('click', handleAddVideo);
  }

  // Bootstrap
  document.addEventListener('DOMContentLoaded', () => {
    initListeners();
    checkAuth();
  });
})();
