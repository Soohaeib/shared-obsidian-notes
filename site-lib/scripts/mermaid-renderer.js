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

    sanitizeSvg(svgText) {
      if (!svgText || typeof svgText !== 'string') return '';
      // Strip <script> tags and any contents
      let clean = svgText.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      // Strip on* event handlers (e.g. onclick, onerror, onload, onmouseover)
      clean = clean.replace(/\s+on[a-zA-Z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
      // Neutralize javascript: protocol links
      clean = clean.replace(/(?:href|xlink:href)\s*=\s*["']\s*javascript:[^"']*["']/gi, 'href="#"');
      return clean;
    }

    initializeMermaid(mermaid, isDark = true) {
      try {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'antiscript',
          theme: isDark ? 'dark' : 'default',
          themeVariables: isDark ? {
            darkMode: true,
            background: '#161922',
            mainBkg: '#242933',
            primaryColor: '#242933',
            primaryTextColor: '#f8fafc',
            primaryBorderColor: '#81a1c1',
            secondaryColor: '#2e3440',
            secondaryTextColor: '#eceff4',
            secondaryBorderColor: '#88c0d0',
            tertiaryColor: '#1e222a',
            tertiaryTextColor: '#d8dee9',
            tertiaryBorderColor: '#4c566a',
            lineColor: '#81a1c1',
            textColor: '#f8fafc',
            border1: '#81a1c1',
            border2: '#88c0d0',
            arrowheadColor: '#88c0d0',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            fontSize: '13px',
            // Flowchart specific
            nodeBorder: '#81a1c1',
            clusterBkg: 'rgba(136, 192, 208, 0.04)',
            clusterBorder: 'rgba(136, 192, 208, 0.3)',
            defaultLinkColor: '#81a1c1',
            titleColor: '#88c0d0',
            edgeLabelBackground: '#1e222a',
            nodeTextColor: '#f8fafc',
            // Sequence
            actorBkg: '#242933',
            actorBorder: '#88c0d0',
            actorTextColor: '#f8fafc',
            actorLineColor: '#81a1c1',
            signalColor: '#81a1c1',
            signalTextColor: '#f8fafc',
            labelBoxBkgColor: '#242933',
            labelBoxBorderColor: '#88c0d0',
            labelTextColor: '#f8fafc',
            loopTextColor: '#88c0d0',
            noteBkgColor: '#2e3440',
            noteBorderColor: '#ebcb8b',
            noteTextColor: '#f8fafc',
            activationBkgColor: 'rgba(136, 192, 208, 0.15)',
            activationBorderColor: '#88c0d0',
            // Class & State
            classText: '#f8fafc',
            stateBkg: '#242933',
            stateBorder: '#81a1c1',
            stateLabelColor: '#f8fafc',
            altBackground: '#1e222a'
          } : {
            darkMode: false,
            background: '#ffffff',
            mainBkg: '#f8fafc',
            primaryColor: '#f8fafc',
            primaryTextColor: '#0f172a',
            primaryBorderColor: '#94a3b8',
            secondaryColor: '#f1f5f9',
            secondaryTextColor: '#1e293b',
            secondaryBorderColor: '#5e81ac',
            tertiaryColor: '#e2e8f0',
            tertiaryTextColor: '#334155',
            tertiaryBorderColor: '#cbd5e1',
            lineColor: '#475569',
            textColor: '#0f172a',
            border1: '#94a3b8',
            border2: '#5e81ac',
            arrowheadColor: '#334155',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            fontSize: '13px',
            // Flowchart specific
            nodeBorder: '#94a3b8',
            clusterBkg: 'rgba(94, 129, 172, 0.04)',
            clusterBorder: 'rgba(94, 129, 172, 0.3)',
            defaultLinkColor: '#475569',
            titleColor: '#2563eb',
            edgeLabelBackground: '#f1f5f9',
            nodeTextColor: '#0f172a',
            // Sequence
            actorBkg: '#ffffff',
            actorBorder: '#5e81ac',
            actorTextColor: '#0f172a',
            actorLineColor: '#64748b',
            signalColor: '#475569',
            signalTextColor: '#0f172a',
            labelBoxBkgColor: '#ffffff',
            labelBoxBorderColor: '#5e81ac',
            labelTextColor: '#0f172a',
            loopTextColor: '#2563eb',
            noteBkgColor: '#fef3c7',
            noteBorderColor: '#f59e0b',
            noteTextColor: '#92400e',
            activationBkgColor: 'rgba(94, 129, 172, 0.12)',
            activationBorderColor: '#5e81ac',
            // Class & State
            classText: '#0f172a',
            stateBkg: '#ffffff',
            stateBorder: '#94a3b8',
            stateLabelColor: '#0f172a',
            altBackground: '#f8fafc'
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

    getDiagramIconSvg(typeName) {
      switch (typeName) {
        case 'MINDMAP':
          return `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M12 9V4M12 15v5M9 12H4M15 12h5"></path></svg>`;
        case 'SEQUENCE':
          return `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4v16M20 4v16M4 8h16M20 14H4"></path></svg>`;
        case 'CLASS':
        case 'STATE':
        case 'ENTITY-RELATION':
          return `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line></svg>`;
        case 'GIT GRAPH':
          return `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="3"></circle><circle cx="6" cy="6" r="3"></circle><path d="M6 9v12M18 9a9 9 0 0 1-9 9"></path></svg>`;
        default:
          return `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect><path d="M10 6.5h4a2 2 0 0 1 2 2v5.5"></path></svg>`;
      }
    }

    buildCardContainer(diagramId, rawCode, typeName) {
      const card = document.createElement('div');
      card.className = 'mermaid-diagram-container mermaid-diagram-card';
      card.id = `card_${diagramId}`;
      card.dataset.mermaidRaw = rawCode;
      card.dataset.diagramType = typeName;

      const iconSvg = this.getDiagramIconSvg(typeName);

      card.innerHTML = `
        <div class="mermaid-card-header">
          <div class="mermaid-card-meta">
            <span class="mermaid-status-dot" aria-hidden="true"></span>
            <span class="mermaid-type-badge">${iconSvg}<span>${this.escapeHtml(typeName)}</span></span>
          </div>
          <div class="mermaid-card-actions">
            <button type="button" class="mermaid-action-btn mermaid-btn-download" title="Export as SVG" aria-label="Download SVG image">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            </button>
            <button type="button" class="mermaid-action-btn mermaid-btn-copy" title="Copy Mermaid syntax" aria-label="Copy Mermaid code">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
            <button type="button" class="mermaid-action-btn mermaid-btn-expand" title="Open full interactive lightbox" aria-label="Open interactive zoom & pan modal">
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
            Click diagram or expand button to open interactive lightbox
          </span>
        </div>
      `;

      return card;
    }

    attachCardInteractions(card, rawCode) {
      const btnCopy = card.querySelector('.mermaid-btn-copy');
      const btnDownload = card.querySelector('.mermaid-btn-download');
      const btnExpand = card.querySelector('.mermaid-btn-expand');
      const cardBody = card.querySelector('.mermaid-card-body');
      const viewport = card.querySelector('.mermaid-viewport-container');

      const updateScrollIndicators = () => {
        if (!cardBody) return;
        const maxScroll = cardBody.scrollWidth - cardBody.clientWidth;
        if (maxScroll > 6) {
          cardBody.classList.toggle('has-scroll-left', cardBody.scrollLeft > 6);
          cardBody.classList.toggle('has-scroll-right', cardBody.scrollLeft < maxScroll - 6);
        } else {
          cardBody.classList.remove('has-scroll-left', 'has-scroll-right');
        }
      };

      cardBody?.addEventListener('scroll', updateScrollIndicators, { passive: true });
      window.addEventListener('resize', updateScrollIndicators, { passive: true });
      setTimeout(updateScrollIndicators, 150);

      btnCopy?.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(rawCode);
          const origContent = btnCopy.innerHTML;
          btnCopy.innerHTML = `<span style="font-size: 11px; font-weight: 700; color: var(--green, #a3be8c);">✓</span>`;
          btnCopy.classList.add('copied');
          setTimeout(() => {
            btnCopy.innerHTML = origContent;
            btnCopy.classList.remove('copied');
          }, 2000);
        } catch (err) {}
      });

      btnDownload?.addEventListener('click', (e) => {
        e.stopPropagation();
        const svgEl = viewport?.querySelector('svg');
        if (!svgEl) return;
        try {
          const svgData = new XMLSerializer().serializeToString(svgEl);
          const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          const typeName = (card.dataset.diagramType || 'diagram').toLowerCase().replace(/\s+/g, '-');
          a.href = url;
          a.download = `${typeName}-${Date.now()}.svg`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } catch (err) {
          console.warn('Failed to download SVG:', err);
        }
      });

      const openModal = (e) => {
        if (e) { e.stopPropagation(); e.preventDefault(); }
        const svgEl = card.querySelector('.mermaid-viewport-container svg');
        if (!svgEl) return;
        const typeName = card.dataset.diagramType || 'Diagram';
        if (window.ObsidianMediaPreview && typeof window.ObsidianMediaPreview.open === 'function') {
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
          viewportContainer.innerHTML = this.sanitizeSvg(svg);
          
          const svgEl = viewportContainer.querySelector('svg');
          if (svgEl) {
            svgEl.style.display = 'block';
            svgEl.style.margin = '0 auto';
            svgEl.style.maxWidth = '100%';
            svgEl.style.maxHeight = '55vh';
            svgEl.style.width = '100%';
            svgEl.style.height = 'auto';
            svgEl.style.objectFit = 'contain';
            svgEl.removeAttribute('height');

            if (svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.height > 0) {
              const vb = svgEl.viewBox.baseVal;
              svgEl.style.aspectRatio = `${vb.width} / ${vb.height}`;
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
          viewportContainer.innerHTML = this.sanitizeSvg(svg);

          const svgEl = viewportContainer.querySelector('svg');
          if (svgEl) {
            svgEl.style.display = 'block';
            svgEl.style.margin = '0 auto';
            svgEl.style.maxWidth = '100%';
            svgEl.style.maxHeight = '55vh';
            svgEl.style.width = '100%';
            svgEl.style.height = 'auto';
            svgEl.style.objectFit = 'contain';
            svgEl.removeAttribute('height');

            if (svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.height > 0) {
              const vb = svgEl.viewBox.baseVal;
              svgEl.style.aspectRatio = `${vb.width} / ${vb.height}`;
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