/**
 * ============================================================================
 * Obsidian Dedicated Media & SVG Interactive Lightbox (media-preview.js)
 * Handles full-screen previewing, smooth pan/zoom, gestures, SVG downloads,
 * and corner expand triggers for figures and diagrams.
 * ============================================================================
 */

(function() {
  'use strict';

  class MediaPreview {
    constructor() {
      this.mediaZoom = 1.0;
      this.mediaPanX = 0;
      this.mediaPanY = 0;
      this.mediaAutoHideTimer = null;
      this.isMouseOverControls = false;
      this.mediaPreviewObjectUrl = null;
      this._initialized = false;
    }

    /**
     * Set up lightbox DOM structure and gesture listeners
     */
    setup() {
      if (document.getElementById('media-preview-overlay')) return;

      const overlay = document.createElement('div');
      overlay.id = 'media-preview-overlay';
      overlay.className = 'media-preview-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Media Preview');

      overlay.innerHTML = `
        <div class="media-preview-stage" id="media-preview-stage" aria-label="Interactive preview canvas">
          <div class="media-preview-viewport" id="media-preview-viewport"></div>
        </div>

        <div class="media-preview-topbar" id="media-preview-topbar">
          <div class="media-preview-meta">
            <span id="media-preview-title" class="media-preview-title">Preview</span>
            <span id="media-preview-badge" class="media-preview-badge">DIAGRAM</span>
          </div>
          <button class="media-top-close-btn" id="media-btn-close" type="button" aria-label="Close preview" title="Close (Esc)">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="media-floating-toolbar" id="media-preview-toolbar">
          <button class="media-pill-btn" id="media-btn-zoom-out" type="button" aria-label="Zoom out" title="Zoom out (-)">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              <line x1="8" y1="11" x2="14" y2="11"></line>
            </svg>
          </button>

          <span class="media-zoom-level" id="media-zoom-level">100%</span>

          <button class="media-pill-btn" id="media-btn-zoom-in" type="button" aria-label="Zoom in" title="Zoom in (+)">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              <line x1="11" y1="8" x2="11" y2="14"></line>
              <line x1="8" y1="11" x2="14" y2="11"></line>
            </svg>
          </button>

          <div class="media-pill-divider"></div>

          <button class="media-pill-btn" id="media-btn-zoom-reset" type="button" aria-label="Reset zoom and center" title="Reset to 100% & Center (Double-click)">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
              <path d="M21 3v5h-5"></path>
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
              <path d="M3 21v-5h5"></path>
            </svg>
          </button>

          <div class="media-pill-divider"></div>

          <a class="media-pill-btn" id="media-btn-download" download aria-label="Download media" title="Download">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </a>
        </div>
      `;

      document.body.appendChild(overlay);

      const stage = document.getElementById('media-preview-stage');
      const viewport = document.getElementById('media-preview-viewport');
      const toolbar = document.getElementById('media-preview-toolbar');
      const topbar = document.getElementById('media-preview-topbar');

      const close = () => {
        overlay.classList.remove('is-open');
        clearTimeout(this.mediaAutoHideTimer);
        if (viewport) {
          viewport.replaceChildren();
          viewport.style.transform = 'none';
        }
        this.mediaZoom = 1.0;
        this.mediaPanX = 0;
        this.mediaPanY = 0;
        if (this.mediaPreviewObjectUrl) {
          URL.revokeObjectURL(this.mediaPreviewObjectUrl);
          this.mediaPreviewObjectUrl = null;
        }
      };

      document.getElementById('media-btn-close')?.addEventListener('click', close);
      document.addEventListener('keydown', (e) => {
        if (overlay.classList.contains('is-open')) {
          if (e.key === 'Escape') {
            e.preventDefault();
            close();
          } else if (e.key === '+' || e.key === '=') {
            e.preventDefault();
            this.zoomAroundCenter(1.25);
          } else if (e.key === '-' || e.key === '_') {
            e.preventDefault();
            this.zoomAroundCenter(1 / 1.25);
          } else if (e.key === '0') {
            e.preventDefault();
            this.resetCanvas();
          }
        }
      });

      // Auto-hide toolbar after 2.5s of inactivity
      const resetAutoHideTimer = () => {
        if (toolbar) toolbar.classList.remove('is-hidden');
        if (topbar) topbar.classList.remove('is-hidden');

        clearTimeout(this.mediaAutoHideTimer);
        this.mediaAutoHideTimer = setTimeout(() => {
          if (!this.isMouseOverControls && overlay.classList.contains('is-open')) {
            if (toolbar) toolbar.classList.add('is-hidden');
            if (topbar) topbar.classList.add('is-hidden');
          }
        }, 2500);
      };

      this._resetAutoHideTimer = resetAutoHideTimer;

      [toolbar, topbar].forEach(el => {
        if (!el) return;
        el.addEventListener('mouseenter', () => {
          this.isMouseOverControls = true;
          clearTimeout(this.mediaAutoHideTimer);
          el.classList.remove('is-hidden');
        });
        el.addEventListener('mouseleave', () => {
          this.isMouseOverControls = false;
          resetAutoHideTimer();
        });
      });

      // Mouse drag-to-pan
      let isDragging = false;
      let startX = 0, startY = 0;
      let startPanX = 0, startPanY = 0;
      let lastTapTime = 0;
      let lastTouchDist = 0;
      let lastTouchMidX = 0, lastTouchMidY = 0;

      stage.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startPanX = this.mediaPanX;
        startPanY = this.mediaPanY;
        stage.classList.add('is-panning');
        resetAutoHideTimer();
      });

      window.addEventListener('mousemove', (e) => {
        if (!overlay.classList.contains('is-open')) return;
        resetAutoHideTimer();
        if (!isDragging) return;
        this.mediaPanX = startPanX + (e.clientX - startX);
        this.mediaPanY = startPanY + (e.clientY - startY);
        this.applyTransform();
      });

      window.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          stage.classList.remove('is-panning');
        }
      });

      // Desktop scroll-to-zoom (anchored to cursor, clamped 0.2x - 6.0x)
      stage.addEventListener('wheel', (e) => {
        e.preventDefault();
        resetAutoHideTimer();
        const rect = stage.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const delta = -e.deltaY;
        const zoomFactor = delta > 0 ? 1.15 : (1 / 1.15);
        const newZoom = Math.min(6.0, Math.max(0.2, this.mediaZoom * zoomFactor));

        if (newZoom !== this.mediaZoom) {
          this.mediaPanX = mouseX - (mouseX - this.mediaPanX) * (newZoom / this.mediaZoom);
          this.mediaPanY = mouseY - (mouseY - this.mediaPanY) * (newZoom / this.mediaZoom);
          this.mediaZoom = newZoom;
          this.applyTransform();
          this.updateZoomDisplay();
        }
      }, { passive: false });

      // Touch events (Single finger pan, 2-finger pinch zoom, double-tap reset)
      stage.addEventListener('touchstart', (e) => {
        resetAutoHideTimer();
        if (e.touches.length === 1) {
          const now = Date.now();
          if (now - lastTapTime < 300) {
            e.preventDefault();
            this.resetCanvas();
            lastTapTime = 0;
            return;
          }
          lastTapTime = now;

          isDragging = true;
          startX = e.touches[0].clientX;
          startY = e.touches[0].clientY;
          startPanX = this.mediaPanX;
          startPanY = this.mediaPanY;
          stage.classList.add('is-panning');
        } else if (e.touches.length === 2) {
          isDragging = false;
          stage.classList.remove('is-panning');
          const t1 = e.touches[0];
          const t2 = e.touches[1];
          lastTouchDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
          const rect = stage.getBoundingClientRect();
          lastTouchMidX = (t1.clientX + t2.clientX) / 2 - rect.left;
          lastTouchMidY = (t1.clientY + t2.clientY) / 2 - rect.top;
        }
      }, { passive: false });

      stage.addEventListener('touchmove', (e) => {
        resetAutoHideTimer();
        if (e.touches.length === 1 && isDragging) {
          e.preventDefault();
          this.mediaPanX = startPanX + (e.touches[0].clientX - startX);
          this.mediaPanY = startPanY + (e.touches[0].clientY - startY);
          this.applyTransform();
        } else if (e.touches.length === 2 && lastTouchDist > 0) {
          e.preventDefault();
          const t1 = e.touches[0];
          const t2 = e.touches[1];
          const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
          const rect = stage.getBoundingClientRect();
          const midX = (t1.clientX + t2.clientX) / 2 - rect.left;
          const midY = (t1.clientY + t2.clientY) / 2 - rect.top;

          const ratio = dist / lastTouchDist;
          const newZoom = Math.min(6.0, Math.max(0.2, this.mediaZoom * ratio));

          if (newZoom !== this.mediaZoom) {
            this.mediaPanX = midX - (midX - this.mediaPanX) * (newZoom / this.mediaZoom) + (midX - lastTouchMidX);
            this.mediaPanY = midY - (midY - this.mediaPanY) * (newZoom / this.mediaZoom) + (midY - lastTouchMidY);
            this.mediaZoom = newZoom;
            this.applyTransform();
            this.updateZoomDisplay();
          }

          lastTouchDist = dist;
          lastTouchMidX = midX;
          lastTouchMidY = midY;
        }
      }, { passive: false });

      stage.addEventListener('touchend', (e) => {
        if (e.touches.length === 0) {
          isDragging = false;
          stage.classList.remove('is-panning');
          lastTouchDist = 0;
        } else if (e.touches.length === 1) {
          isDragging = true;
          startX = e.touches[0].clientX;
          startY = e.touches[0].clientY;
          startPanX = this.mediaPanX;
          startPanY = this.mediaPanY;
          stage.classList.add('is-panning');
        }
      });

      stage.addEventListener('dblclick', (e) => {
        e.preventDefault();
        this.resetCanvas();
      });

      document.getElementById('media-btn-zoom-in')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.zoomAroundCenter(1.25);
      });

      document.getElementById('media-btn-zoom-out')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.zoomAroundCenter(1 / 1.25);
      });

      document.getElementById('media-btn-zoom-reset')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.resetCanvas();
      });

      this._initialized = true;
    }

    zoomAroundCenter(factor) {
      const stage = document.getElementById('media-preview-stage');
      if (!stage) return;
      const midX = stage.clientWidth / 2;
      const midY = stage.clientHeight / 2;

      const newZoom = Math.min(6.0, Math.max(0.2, this.mediaZoom * factor));
      if (newZoom !== this.mediaZoom) {
        this.mediaPanX = midX - (midX - this.mediaPanX) * (newZoom / this.mediaZoom);
        this.mediaPanY = midY - (midY - this.mediaPanY) * (newZoom / this.mediaZoom);
        this.mediaZoom = newZoom;
        this.applyTransform();
        this.updateZoomDisplay();
        if (this._resetAutoHideTimer) this._resetAutoHideTimer();
      }
    }

    applyTransform() {
      const viewport = document.getElementById('media-preview-viewport');
      if (viewport) {
        viewport.style.transform = `translate(${this.mediaPanX}px, ${this.mediaPanY}px) scale(${this.mediaZoom})`;
      }
    }

    updateZoomDisplay() {
      const zoomLevelEl = document.getElementById('media-zoom-level');
      if (zoomLevelEl) {
        zoomLevelEl.textContent = `${Math.round(this.mediaZoom * 100)}%`;
      }
    }

    resetCanvas(fitToScreen = false) {
      const stage = document.getElementById('media-preview-stage');
      const viewport = document.getElementById('media-preview-viewport');
      if (!stage || !viewport) return;

      const stageW = stage.clientWidth || window.innerWidth;
      const stageH = stage.clientHeight || window.innerHeight;

      const contentEl = viewport.firstElementChild;
      let contentW = 800;
      let contentH = 600;

      if (contentEl) {
        if (contentEl.tagName && contentEl.tagName.toLowerCase() === 'img') {
          contentW = contentEl.naturalWidth || contentEl.offsetWidth || 800;
          contentH = contentEl.naturalHeight || contentEl.offsetHeight || 600;
        } else {
          const svg = contentEl.querySelector('svg') || contentEl;
          if (svg && svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width > 0) {
            contentW = svg.viewBox.baseVal.width;
            contentH = svg.viewBox.baseVal.height;
          } else {
            const rect = contentEl.getBoundingClientRect();
            contentW = rect.width || 800;
            contentH = rect.height || 600;
          }
        }
      }

      viewport.style.width = `${contentW}px`;
      viewport.style.height = `${contentH}px`;

      if (fitToScreen) {
        const padW = stageW * 0.85;
        const padH = stageH * 0.80;
        const scaleX = padW / contentW;
        const scaleY = padH / contentH;
        this.mediaZoom = Math.min(1.0, Math.min(scaleX, scaleY));
        this.mediaZoom = Math.max(0.2, Math.min(6.0, this.mediaZoom));
      } else {
        this.mediaZoom = 1.0;
      }

      this.mediaPanX = (stageW - contentW * this.mediaZoom) / 2;
      this.mediaPanY = (stageH - contentH * this.mediaZoom) / 2;

      this.applyTransform();
      this.updateZoomDisplay();
      if (this._resetAutoHideTimer) this._resetAutoHideTimer();
    }

    open(source, type = 'img', title = 'Preview') {
      this.setup();
      const overlay = document.getElementById('media-preview-overlay');
      const viewport = document.getElementById('media-preview-viewport');
      const titleElement = document.getElementById('media-preview-title');
      const badgeElement = document.getElementById('media-preview-badge');
      const download = document.getElementById('media-btn-download');

      if (!overlay || !viewport || !titleElement || !download) return;

      if (this.mediaPreviewObjectUrl) URL.revokeObjectURL(this.mediaPreviewObjectUrl);
      this.mediaPreviewObjectUrl = null;

      titleElement.textContent = title;
      titleElement.setAttribute('title', title);
      if (badgeElement) badgeElement.textContent = type === 'svg' ? 'DIAGRAM' : 'IMAGE';

      viewport.replaceChildren();

      let downloadUrl = source;

      if (type === 'svg') {
        this.mediaPreviewObjectUrl = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
        downloadUrl = this.mediaPreviewObjectUrl;

        const wrapper = document.createElement('div');
        wrapper.className = 'media-preview-svg';
        wrapper.innerHTML = source;

        const innerSvg = wrapper.querySelector('svg');
        if (innerSvg) {
          innerSvg.style.setProperty('overflow', 'visible', 'important');
          innerSvg.style.setProperty('pointer-events', 'none', 'important');
          if (innerSvg.viewBox && innerSvg.viewBox.baseVal && innerSvg.viewBox.baseVal.width > 0) {
            innerSvg.setAttribute('width', innerSvg.viewBox.baseVal.width);
            innerSvg.setAttribute('height', innerSvg.viewBox.baseVal.height);
          }
        }

        viewport.appendChild(wrapper);
        download.download = `${title}.svg`;
      } else {
        const image = document.createElement('img');
        image.src = source;
        image.alt = title;
        image.draggable = false;
        image.style.pointerEvents = 'none';

        viewport.appendChild(image);
        download.download = title.includes('.') ? title : `${title}.png`;
      }

      download.href = downloadUrl;
      overlay.classList.add('is-open');

      requestAnimationFrame(() => {
        this.resetCanvas(true);
      });
    }

    /**
     * Attach corner expand buttons to images, figures, and diagram containers
     */
    attachCornerButtons(rootElement = document) {
      const article = rootElement.querySelector ? rootElement.querySelector('#note-article') || rootElement : rootElement;
      if (!article) return;

      // 1. Process Embedded Images / Figures
      const figures = article.querySelectorAll('figure.obsidian-media-embed, .image-embed');
      figures.forEach((fig) => {
        if (fig.querySelector('.media-corner-action-btn')) return;
        const img = fig.querySelector('img');
        if (!img) return;

        const alt = img.getAttribute('alt') || 'Embedded Image';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'media-corner-action-btn';
        btn.title = 'Open interactive preview';
        btn.setAttribute('aria-label', `Open full interactive preview for ${alt}`);
        btn.innerHTML = `
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 3 21 3 21 9"></polyline>
            <polyline points="9 21 3 21 3 15"></polyline>
            <line x1="21" y1="3" x2="14" y2="10"></line>
            <line x1="3" y1="21" x2="10" y2="14"></line>
          </svg>
        `;

        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.open(img.src, 'img', alt);
        });

        fig.appendChild(btn);
      });

      // 2. Process Mermaid Diagrams
      const diagrams = article.querySelectorAll('.mermaid-diagram-container');
      diagrams.forEach((container, idx) => {
        if (container.querySelector('.media-corner-action-btn')) return;
        const svg = container.querySelector('svg');
        if (!svg) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'media-corner-action-btn';
        btn.title = 'Open interactive canvas preview';
        btn.setAttribute('aria-label', 'Open full interactive preview for diagram');
        btn.innerHTML = `
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 3 21 3 21 9"></polyline>
            <polyline points="9 21 3 21 3 15"></polyline>
            <line x1="21" y1="3" x2="14" y2="10"></line>
            <line x1="3" y1="21" x2="10" y2="14"></line>
          </svg>
        `;

        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          const currentSvg = container.querySelector('svg');
          if (!currentSvg) return;
          const svgContent = currentSvg.outerHTML;
          this.open(svgContent, 'svg', `Diagram-${idx + 1}`);
        });

        container.appendChild(btn);
      });
    }
  }

  // Export globally
  window.ObsidianMediaPreview = new MediaPreview();
})();
