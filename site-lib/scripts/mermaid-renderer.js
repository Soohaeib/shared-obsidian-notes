/**
 * ============================================================================
 * Obsidian Dedicated Mermaid Diagram Renderer (mermaid-renderer.js)
 * ============================================================================
 * Authentic native Mermaid & Mindmap rendering pipeline.
 * Defers parsing to Mermaid.js natively, avoiding brittle regex mutations,
 * while wrapping diagrams in a responsive UI card with zoom/pan and lightbox integration.
 */

(function() {
  'use strict';

  class MermaidRenderer {
    constructor() {
      this._loadingPromise = null;
      this._idCounter = 0;
    }

    async ensureMermaid() {
      if (window.mermaid) return window.mermaid;
      if (this._loadingPromise) return this._loadingPromise;

      this._loadingPromise = new Promise((resolve) => {
        if (window.mermaid) return resolve(window.mermaid);
        const existingScript = document.querySelector('script[src*="mermaid"]');
        if (existingScript) {
          existingScript.addEventListener('load', () => resolve(window.mermaid || null));
          existingScript.addEventListener('error', () => resolve(null));
          return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js';
        script.onload = () => resolve(window.mermaid || null);
        script.onerror = () => resolve(null);
        document.head.appendChild(script);
      });

      return this._loadingPromise;
    }

    detectDiagramType(code) {
      if (!code) return 'FLOWCHART';
      const clean = code.trim().toLowerCase();
      if (/^flowchart\b|^graph\b/.test(clean)) return 'FLOWCHART';
      if (/^mindmap\b/.test(clean)) return 'MINDMAP';
      if (/^sequencediagram\b/.test(clean)) return 'SEQUENCE';
      if (/^classdiagram\b/.test(clean)) return 'CLASS';
      if (/^statediagram\b/.test(clean)) return 'STATE';
      if (/^erdiagram\b/.test(clean)) return 'ENTITY-RELATION';
      if (/^gantt\b/.test(clean)) return 'GANTT';
      if (/^pie\b/.test(clean)) return 'PIE CHART';
      if (/^gitgraph\b/.test(clean)) return 'GIT GRAPH';
      if (/^timeline\b/.test(clean)) return 'TIMELINE';
      if (/^architecture\b/.test(clean)) return 'ARCHITECTURE';
      return 'DIAGRAM';
    }

    escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    /**
     * Clean HTML entities that markdown parsers sometimes mistakenly inject into code blocks
     */
    unescapeMarkdownEntities(rawText) {
      if (!rawText) return '';
      return rawText.trim()
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
    }

    initializeMermaid(mermaid, isDark = true) {
      try {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'loose',
          theme: isDark ? 'dark' : 'default',
          // Trust the user's YAML frontmatter for layout styles, provide safe defaults
          themeVariables: isDark ? {
            primaryColor: '#2e3440',
            primaryTextColor: '#eceff4',
            lineColor: '#81a1c1',
            mainBkg: '#2e3440'
          } : {
            primaryColor: '#e5e9f0',
            primaryTextColor: '#2e3440',
            lineColor: '#4c566a',
            mainBkg: '#f8fafc'
          },
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        });
      } catch (e) {
        console.warn('Mermaid initialize warning:', e);
      }
    }

    isMermaidCodeElement(codeEl) {
      const cls = (codeEl.className || '').toLowerCase();
      if (cls.includes('mermaid') || cls.includes('mindmap') || cls.includes('markmap')) {
        return true;
      }
      return false;
    }

    buildCardContainer(diagramId, rawCode, typeName) {
      const card = document.createElement('div');
      card.className = 'mermaid-diagram-container mermaid-diagram-card';
      card.id = `card_${diagramId}`;
      card.dataset.mermaidRaw = rawCode;
      card.dataset.diagramType = typeName;

      card.innerHTML = `
        <div class="mermaid-card-header">
          <div class="mermaid-card-meta">
            <span class="mermaid-type-badge">${this.escapeHtml(typeName)}</span>
          </div>
          <div class="mermaid-card-actions">
            <button type="button" class="mermaid-action-btn mermaid-btn-zoom-out" title="Zoom out (-)" aria-label="Zoom out">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
            </button>
            <span class="mermaid-zoom-indicator">100%</span>
            <button type="button" class="mermaid-action-btn mermaid-btn-zoom-in" title="Zoom in (+)" aria-label="Zoom in">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
            </button>
            <button type="button" class="mermaid-action-btn mermaid-btn-reset" title="Reset zoom (100%)" aria-label="Reset zoom">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path><path d="M3 21v-5h5"></path></svg>
            </button>
            <div class="mermaid-action-divider"></div>
            <button type="button" class="mermaid-action-btn mermaid-btn-copy" title="Copy Mermaid code" aria-label="Copy Mermaid code">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
            <button type="button" class="mermaid-action-btn mermaid-btn-expand" title="Open interactive zoom & pan modal" aria-label="Open interactive zoom & pan modal">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
            </button>
          </div>
        </div>
        <div class="mermaid-card-body" role="region" aria-label="Diagram canvas">
          <div class="mermaid-viewport-container">
            <div class="mermaid-loading-skeleton">
              <span>Rendering vector diagram...</span>
            </div>
          </div>
        </div>
        <div class="mermaid-card-footer">
          <span class="mermaid-hint">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            Click diagram or expand button for interactive pan & zoom modal
          </span>
        </div>
      `;

      return card;
    }

    attachCardInteractions(card, rawCode) {
      // (Your interactions remain exactly the same as they were mathematically correct for the UI)
      const zoomIndicator = card.querySelector('.mermaid-zoom-indicator');
      const btnZoomIn = card.querySelector('.mermaid-btn-zoom-in');
      const btnZoomOut = card.querySelector('.mermaid-btn-zoom-out');
      const btnReset = card.querySelector('.mermaid-btn-reset');
      const btnCopy = card.querySelector('.mermaid-btn-copy');
      const btnExpand = card.querySelector('.mermaid-btn-expand');
      const cardBody = card.querySelector('.mermaid-card-body');
      const viewport = card.querySelector('.mermaid-viewport-container');

      let currentZoom = 1.0;

      const updateZoom = (newZoom) => {
        currentZoom = Math.max(0.5, Math.min(3.0, newZoom));
        if (zoomIndicator) zoomIndicator.textContent = `${Math.round(currentZoom * 100)}%`;
        if (viewport) {
          viewport.style.transform = `scale(${currentZoom})`;
          viewport.style.transformOrigin = 'center top';
        }
      };

      btnZoomIn?.addEventListener('click', (e) => { e.stopPropagation(); updateZoom(currentZoom * 1.25); });
      btnZoomOut?.addEventListener('click', (e) => { e.stopPropagation(); updateZoom(currentZoom / 1.25); });
      btnReset?.addEventListener('click', (e) => { e.stopPropagation(); updateZoom(1.0); });

      btnCopy?.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(rawCode);
          const origSvg = btnCopy.innerHTML;
          btnCopy.innerHTML = `<span style="font-size: 10px; font-weight: bold; color: var(--green, #a3be8c);">✓</span>`;
          setTimeout(() => { btnCopy.innerHTML = origSvg; }, 2000);
        } catch (err) {}
      });

      const openModal = (e) => {
        if (e) { e.stopPropagation(); e.preventDefault(); }
        const svgEl = card.querySelector('.mermaid-viewport-container svg');
        if (!svgEl) return;
        const typeName = card.dataset.diagramType || 'Diagram';
        if (window.ObsidianMediaPreview && typeof window.ObsidianMediaPreview.open === 'function') {
          // Open authentic SVG in the Lightbox!
          window.ObsidianMediaPreview.open(svgEl.outerHTML, 'svg', typeName);
        }
      };

      btnExpand?.addEventListener('click', openModal);
      cardBody?.addEventListener('click', (e) => {
        if (window.getSelection && window.getSelection().toString()) return;
        openModal(e);
      });
      if (cardBody) cardBody.style.cursor = 'zoom-in';
    }

    async renderAll(rootElement = document, isDark = true) {
      const candidates = Array.from(rootElement.querySelectorAll('pre code'));
      const diagramCodes = candidates.filter(el => this.isMermaidCodeElement(el));

      if (diagramCodes.length === 0) return;

      const mermaid = await this.ensureMermaid();
      if (!mermaid) return;

      this.initializeMermaid(mermaid, isDark);

      for (let index = 0; index < diagramCodes.length; index++) {
        const codeEl = diagramCodes[index];
        const parent = codeEl.closest('pre');
        if (!parent || !parent.parentNode) continue;

        let rawCode = (codeEl.textContent || codeEl.innerText || '');
        const cleanCode = this.unescapeMarkdownEntities(rawCode); // Only fix HTML entities
        const typeName = this.detectDiagramType(cleanCode);

        const safeId = `mermaid_diag_${Date.now()}_${index}_${++this._idCounter}`;
        const container = this.buildCardContainer(safeId, rawCode, typeName);
        parent.replaceWith(container);

        try {
          // Single, authentic rendering pass. Let Mermaid handle its own syntax.
          const { svg } = await mermaid.render(safeId, cleanCode);
          
          const viewportContainer = container.querySelector('.mermaid-viewport-container');
          viewportContainer.innerHTML = svg;
          
          const svgEl = viewportContainer.querySelector('svg');
          if (svgEl) {
            svgEl.style.display = 'block';
            svgEl.style.margin = '0 auto';
            svgEl.removeAttribute('height');

            if (svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.height > 0) {
              const vb = svgEl.viewBox.baseVal;
              svgEl.style.aspectRatio = `${vb.width} / ${vb.height}`;
              if (vb.width < 650) {
                svgEl.style.width = '100%';
                svgEl.style.maxWidth = `${Math.round(vb.width * 1.05)}px`;
              } else {
                svgEl.style.width = '100%';
              }
              if (vb.width > 550) {
                viewportContainer.style.minWidth = `${Math.min(vb.width, 680)}px`;
              }
            }
          }
          this.attachCardInteractions(container, rawCode);
        } catch (err) {
          // If Mermaid fails, it injects a syntax error SVG itself. 
          // We don't hide it behind a fallback, we let the user see their error organically.
          console.warn(`Mermaid render failed for [${safeId}]:`, err);
          const viewportContainer = container.querySelector('.mermaid-viewport-container');
          
          // Mermaid appends an error SVG to the body, we grab it and show it.
          const errorSvg = document.getElementById(safeId);
          if (errorSvg) {
             viewportContainer.innerHTML = '';
             viewportContainer.appendChild(errorSvg);
          } else {
             viewportContainer.innerHTML = `<div class="mermaid-fallback-card" style="padding: 16px; color: var(--orange, #d08770);">Syntax Error in Mermaid. Check console.</div>`;
          }
        }
      }
    }
    
    async rethemeAll(rootElement = document, isDark = true) {
      const cards = Array.from(rootElement.querySelectorAll('.mermaid-diagram-card'));
      if (cards.length === 0) {
        return this.renderAll(rootElement, isDark);
      }

      const mermaid = await this.ensureMermaid();
      if (!mermaid) return;

      this.initializeMermaid(mermaid, isDark);

      for (let index = 0; index < cards.length; index++) {
        const card = cards[index];
        const rawCode = card.dataset.mermaidRaw;
        if (!rawCode) continue;

        const cleanCode = this.unescapeMarkdownEntities(rawCode);
        const safeId = `mermaid_retheme_${Date.now()}_${index}_${++this._idCounter}`;
        const viewportContainer = card.querySelector('.mermaid-viewport-container');
        if (!viewportContainer) continue;

        try {
          const { svg } = await mermaid.render(safeId, cleanCode);
          viewportContainer.innerHTML = svg;

          const svgEl = viewportContainer.querySelector('svg');
          if (svgEl) {
            svgEl.style.display = 'block';
            svgEl.style.margin = '0 auto';
            svgEl.removeAttribute('height');

            if (svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.height > 0) {
              const vb = svgEl.viewBox.baseVal;
              svgEl.style.aspectRatio = `${vb.width} / ${vb.height}`;
              if (vb.width < 650) {
                svgEl.style.width = '100%';
                svgEl.style.maxWidth = `${Math.round(vb.width * 1.05)}px`;
              } else {
                svgEl.style.width = '100%';
              }
              if (vb.width > 550) {
                viewportContainer.style.minWidth = `${Math.min(vb.width, 680)}px`;
              }
            }
          }
        } catch (err) {
          console.warn(`Mermaid retheme render failed for [${safeId}]:`, err);
        }
      }
    }
  }

  window.ObsidianMermaidRenderer = new MermaidRenderer();
})();