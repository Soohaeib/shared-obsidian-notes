/**
 * ============================================================================
 * Obsidian Dedicated Mermaid Diagram Renderer (mermaid-renderer.js)
 * ============================================================================
 * Production-grade resilient Mermaid & Mindmap parsing, multi-pass healing,
 * theme switching, orthogonal arrow routing, and responsive vector rendering
 * with integrated zoom/pan controls and lightbox integration.
 */

(function() {
  'use strict';

  class MermaidRenderer {
    constructor() {
      this._loadingPromise = null;
      this._idCounter = 0;
      this._zoomStates = new Map();
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
          if (window.mermaid) return resolve(window.mermaid);
        }

        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js';
        script.onload = () => resolve(window.mermaid || null);
        script.onerror = () => resolve(null);
        document.head.appendChild(script);
      });

      return this._loadingPromise;
    }

    /**
     * Sanitizes and heals common Obsidian Markdown diagram syntax deviations:
     * - Open arrows: A -- Label --> B => A -->|"Label"| B
     * - Dotted arrows: A -. Label .-> B => A -.->|"Label"| B
     * - Thick arrows: A == Label ==> B => A ==>|"Label"| B
     * - Unquoted special characters & parentheses in node labels
     * - Mindmap declaration & nested parentheses
     */
    healMermaidCode(rawText) {
      if (!rawText) return '';
      let text = rawText.trim();

      // 1. Unescape common HTML entities
      text = text.replace(/&lt;/g, '<')
                 .replace(/&gt;/g, '>')
                 .replace(/&amp;/g, '&')
                 .replace(/&quot;/g, '"')
                 .replace(/&#39;/g, "'")
                 .replace(/&#36;/g, '$');

      // 2. Mindmap root fix
      if (/^(?:mindmap|markmap)/i.test(text) && !text.toLowerCase().startsWith('mindmap')) {
        text = `mindmap\n${text.replace(/^[^\n]+\n/, '')}`;
      }

      const isMindmap = text.toLowerCase().startsWith('mindmap');

      // 3. Process line-by-line to prevent cross-line regex corruption
      const lines = text.split('\n');
      const processedLines = lines.map(line => {
        let l = line;

        if (isMindmap) {
          if (/^\s*root(?:\(\(|\(|\[|\{)/i.test(l) || /^\s*mindmap/i.test(l)) {
            return l;
          }
          // In mindmap children, replace unquoted parentheses to avoid shape parse conflicts
          return l.replace(/\(([^)]+)\)/g, ' - $1');
        }

        // Standard open arrow: A -- Label --> B => A -->|"Label"| B
        l = l.replace(/([A-Za-z0-9_\]\)\}]|\b)[ \t]*--[ \t]+([^\n-]+?)[ \t]*-->[ \t]*([A-Za-z0-9_\[\(\{]|\b)/g, (match, from, label, to) => {
          const clean = label.trim().replace(/^["'\\]+|["'\\]+$/g, '');
          return `${from} -->|"${clean}"| ${to}`;
        });

        // Dotted open arrow: A -. Label .-> B => A -.->|"Label"| B
        l = l.replace(/([A-Za-z0-9_\]\)\}]|\b)[ \t]*-\.[ \t]+([^\n.]+?)[ \t]*\.->[ \t]*([A-Za-z0-9_\[\(\{]|\b)/g, (match, from, label, to) => {
          const clean = label.trim().replace(/^["'\\]+|["'\\]+$/g, '');
          return `${from} -.->|"${clean}"| ${to}`;
        });

        // Thick open arrow: A == Label ==> B => A ==>|"Label"| B
        l = l.replace(/([A-Za-z0-9_\]\)\}]|\b)[ \t]*==[ \t]+([^\n=]+?)[ \t]*==>[ \t]*([A-Za-z0-9_\[\(\{]|\b)/g, (match, from, label, to) => {
          const clean = label.trim().replace(/^["'\\]+|["'\\]+$/g, '');
          return `${from} ==>|"${clean}"| ${to}`;
        });

        // Fix unquoted square brackets with parenthesis inside: e.g. B[Text (Sub)] => B["Text (Sub)"]
        l = l.replace(/(\b[A-Za-z0-9_]+)\[([^\]\n"]*[\(\)][^\]\n"]*)\]/g, (match, id, inner) => {
          return `${id}["${inner}"]`;
        });

        return l;
      });

      return processedLines.join('\n');
    }

    /**
     * Secondary aggressive fallback healing for tricky edge cases
     */
    aggressiveHeal(code) {
      if (!code) return '';
      let res = this.healMermaidCode(code);

      // Quote all node labels in brackets that are not yet quoted
      res = res.replace(/(\b[A-Za-z0-9_]+)\[([^"\]\n][^\]\n]*?)\]/g, (match, id, text) => {
        if (text.startsWith('"') && text.endsWith('"')) return match;
        const clean = text.replace(/"/g, "'");
        return `${id}["${clean}"]`;
      });

      // Fix raw ampersands in pipe labels
      res = res.replace(/\|([^|\n]+)\|/g, (match, inner) => {
        return `|${inner.replace(/&/g, 'and')}|`;
      });

      return res;
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
     * Initialize Mermaid with orthogonal, basis-free routing and generous padding.
     */
    initializeMermaid(mermaid, isDark = true) {
      try {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'loose',
          theme: isDark ? 'dark' : 'default',
          themeVariables: isDark ? {
            primaryColor: '#2e3440',
            primaryTextColor: '#eceff4',
            primaryBorderColor: '#88c0d0',
            lineColor: '#81a1c1',
            secondaryColor: '#3b4252',
            tertiaryColor: '#434c5e',
            edgeLabelBackground: '#1e222a',
            clusterBkg: 'rgba(46, 52, 64, 0.65)',
            clusterBorder: '#4c566a',
            nodeBorder: '#88c0d0',
            mainBkg: '#2e3440'
          } : {
            primaryColor: '#e5e9f0',
            primaryTextColor: '#2e3440',
            primaryBorderColor: '#5e81ac',
            lineColor: '#4c566a',
            secondaryColor: '#eceff4',
            tertiaryColor: '#d8dee9',
            edgeLabelBackground: '#ffffff',
            clusterBkg: 'rgba(236, 239, 244, 0.75)',
            clusterBorder: '#d8dee9',
            nodeBorder: '#5e81ac',
            mainBkg: '#f8fafc'
          },
          flowchart: {
            htmlLabels: true,
            useMaxWidth: false,
            curve: 'linear', // Orthogonal / basis-free routing prevents messy overlapping curves!
            padding: 24,
            nodeSpacing: 55,
            rankSpacing: 65,
            diagramPadding: 24
          },
          sequence: {
            diagramMarginX: 30,
            diagramMarginY: 25,
            actorMargin: 50,
            width: 150,
            height: 50,
            boxMargin: 15,
            boxTextMargin: 6,
            noteMargin: 12,
            messageMargin: 40,
            mirrorActors: false
          },
          state: {
            padding: 24
          },
          er: {
            diagramPadding: 24,
            layoutDirection: 'TB',
            minEntityWidth: 100,
            minEntityHeight: 75,
            entityPadding: 16
          },
          mindmap: {
            padding: 24
          },
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        });
      } catch (e) {
        console.warn('Mermaid initialize warning:', e);
      }
    }

    isMermaidCodeElement(codeEl) {
      const cls = (codeEl.className || '').toLowerCase();
      if (
        cls.includes('language-mermaid') ||
        cls.includes('mermaid') ||
        cls.includes('lang-mermaid') ||
        cls.includes('language-mindmap') ||
        cls.includes('mindmap') ||
        cls.includes('language-markmap')
      ) {
        return true;
      }

      const text = (codeEl.textContent || codeEl.innerText || '').trim();
      const lines = text.split('\n');
      for (const line of lines) {
        const cleanLine = line.trim().toLowerCase();
        if (!cleanLine || cleanLine.startsWith('%%') || cleanLine.startsWith('---')) continue;
        return /^(graph\b|flowchart\b|sequencediagram\b|classdiagram\b|statediagram\b|erdiagram\b|gantt\b|pie\b|mindmap\b|journey\b|gitgraph\b|xychart\b|quadrantchart\b|architecture\b|block\b|packet\b|kanban\b|timeline\b|sankey\b|c4\b|requirementdiagram\b|zenuml\b)/i.test(cleanLine);
      }
      return false;
    }

    /**
     * Creates an interactive, responsive diagram card structure.
     */
    buildCardContainer(diagramId, rawCode, healedCode, typeName) {
      const card = document.createElement('div');
      card.className = 'mermaid-diagram-container mermaid-diagram-card';
      card.id = `card_${diagramId}`;
      card.dataset.mermaidCode = healedCode;
      card.dataset.mermaidRaw = rawCode;
      card.dataset.diagramType = typeName;

      card.innerHTML = `
        <div class="mermaid-card-header">
          <div class="mermaid-card-meta">
            <span class="mermaid-type-badge">${this.escapeHtml(typeName)}</span>
          </div>
          <div class="mermaid-card-actions">
            <button type="button" class="mermaid-action-btn mermaid-btn-zoom-out" title="Zoom out (-)" aria-label="Zoom out">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                <line x1="8" y1="11" x2="14" y2="11"></line>
              </svg>
            </button>
            <span class="mermaid-zoom-indicator">100%</span>
            <button type="button" class="mermaid-action-btn mermaid-btn-zoom-in" title="Zoom in (+)" aria-label="Zoom in">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                <line x1="11" y1="8" x2="11" y2="14"></line>
                <line x1="8" y1="11" x2="14" y2="11"></line>
              </svg>
            </button>
            <button type="button" class="mermaid-action-btn mermaid-btn-reset" title="Reset zoom (100%)" aria-label="Reset zoom">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
                <path d="M21 3v5h-5"></path>
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
                <path d="M3 21v-5h5"></path>
              </svg>
            </button>
            <div class="mermaid-action-divider"></div>
            <button type="button" class="mermaid-action-btn mermaid-btn-copy" title="Copy Mermaid code" aria-label="Copy Mermaid code">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
            <button type="button" class="mermaid-action-btn mermaid-btn-expand" title="Open interactive zoom & pan modal" aria-label="Open interactive zoom & pan modal">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 3 21 3 21 9"></polyline>
                <polyline points="9 21 3 21 3 15"></polyline>
                <line x1="21" y1="3" x2="14" y2="10"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
              </svg>
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
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            Click diagram or expand button for interactive pan & zoom modal
          </span>
        </div>
      `;

      return card;
    }

    /**
     * Attaches interactive controls (Zoom, Reset, Copy, Modal trigger) to a card.
     */
    attachCardInteractions(card, rawCode) {
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

      btnZoomIn?.addEventListener('click', (e) => {
        e.stopPropagation();
        updateZoom(currentZoom * 1.25);
      });

      btnZoomOut?.addEventListener('click', (e) => {
        e.stopPropagation();
        updateZoom(currentZoom / 1.25);
      });

      btnReset?.addEventListener('click', (e) => {
        e.stopPropagation();
        updateZoom(1.0);
      });

      btnCopy?.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(rawCode);
          const origSvg = btnCopy.innerHTML;
          btnCopy.innerHTML = `<span style="font-size: 10px; font-weight: bold; color: var(--green, #a3be8c);">✓</span>`;
          btnCopy.title = 'Copied!';
          setTimeout(() => {
            btnCopy.innerHTML = origSvg;
            btnCopy.title = 'Copy Mermaid code';
          }, 2000);
        } catch (err) {
          console.warn('Clipboard write failed:', err);
        }
      });

      const openModal = (e) => {
        if (e) {
          e.stopPropagation();
          e.preventDefault();
        }
        const svgEl = card.querySelector('.mermaid-viewport-container svg');
        if (!svgEl) return;
        const typeName = card.dataset.diagramType || 'Diagram';
        if (window.ObsidianMediaPreview && typeof window.ObsidianMediaPreview.open === 'function') {
          window.ObsidianMediaPreview.open(svgEl.outerHTML, 'svg', typeName);
        }
      };

      btnExpand?.addEventListener('click', openModal);

      // Clicking on the diagram card body triggers full-screen zoom & pan modal
      cardBody?.addEventListener('click', (e) => {
        // Only open modal if user wasn't dragging/selecting text
        if (window.getSelection && window.getSelection().toString()) return;
        openModal(e);
      });

      // Cursor indicator
      if (cardBody) {
        cardBody.style.cursor = 'zoom-in';
      }
    }

    async renderAll(rootElement = document, isDark = true) {
      const candidates = Array.from(rootElement.querySelectorAll('pre code'));
      const diagramCodes = candidates.filter(el => this.isMermaidCodeElement(el));

      if (diagramCodes.length === 0) return;

      const mermaid = await this.ensureMermaid();
      if (!mermaid) {
        console.warn('Mermaid library could not be loaded.');
        return;
      }

      this.initializeMermaid(mermaid, isDark);

      for (let index = 0; index < diagramCodes.length; index++) {
        const codeEl = diagramCodes[index];
        const parent = codeEl.closest('pre');
        if (!parent || !parent.parentNode) continue;

        let rawCode = (codeEl.textContent || codeEl.innerText || '').trim();
        const healedCode = this.healMermaidCode(rawCode);
        const typeName = this.detectDiagramType(rawCode);

        const safeId = `mermaid_diag_${Date.now()}_${index}_${++this._idCounter}`;
        const container = this.buildCardContainer(safeId, rawCode, healedCode, typeName);

        parent.replaceWith(container);

        let renderSuccess = false;
        let renderedSvg = '';

        // Pass 1: Standard Healed Code
        try {
          const res = await mermaid.render(safeId, healedCode);
          renderedSvg = typeof res === 'string' ? res : res.svg;
          renderSuccess = true;
        } catch (err1) {
          console.warn(`Mermaid render pass 1 failed for [${safeId}], trying aggressive fallback:`, err1);
          this.cleanupStrayElements(safeId);

          // Pass 2: Aggressive Quoting & Ampersand Sanitization
          try {
            const fallbackId = `${safeId}_fb`;
            const aggressiveCode = this.aggressiveHeal(healedCode);
            const res2 = await mermaid.render(fallbackId, aggressiveCode);
            renderedSvg = typeof res2 === 'string' ? res2 : res2.svg;
            renderSuccess = true;
          } catch (err2) {
            console.warn(`Mermaid render pass 2 failed for [${safeId}]:`, err2);
            this.cleanupStrayElements(`${safeId}_fb`);

            // Pass 3: Safe Raw Code
            try {
              const rawId = `${safeId}_raw`;
              const res3 = await mermaid.render(rawId, rawCode);
              renderedSvg = typeof res3 === 'string' ? res3 : res3.svg;
              renderSuccess = true;
            } catch (err3) {
              console.warn(`Mermaid render pass 3 failed for [${safeId}]:`, err3);
              this.cleanupStrayElements(`${safeId}_raw`);
            }
          }
        }

        const viewportContainer = container.querySelector('.mermaid-viewport-container');

        if (renderSuccess && renderedSvg && viewportContainer) {
          viewportContainer.innerHTML = renderedSvg;
          const svgEl = viewportContainer.querySelector('svg');
          if (svgEl) {
            svgEl.style.display = 'block';
            svgEl.style.margin = '0 auto';
            svgEl.removeAttribute('height');

            if (svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.height > 0) {
              const vb = svgEl.viewBox.baseVal;
              svgEl.style.aspectRatio = `${vb.width} / ${vb.height}`;

              // If diagram is small, center naturally without over-stretching
              if (vb.width < 650) {
                svgEl.style.width = '100%';
                svgEl.style.maxWidth = `${Math.round(vb.width * 1.05)}px`;
              } else {
                svgEl.style.width = '100%';
                svgEl.style.maxWidth = '100%';
              }

              // On smaller screens, prevent microscopic scaling by establishing readable minimum
              if (vb.width > 550) {
                viewportContainer.style.minWidth = `${Math.min(vb.width, 680)}px`;
              }
            }
          }

          this.renderMathInDiagram(container);
          this.attachCardInteractions(container, rawCode);
        } else {
          const body = container.querySelector('.mermaid-card-body');
          if (body) {
            body.innerHTML = `
              <div class="mermaid-fallback-card" style="padding: 16px; border-radius: 8px; background: rgba(0,0,0,0.2); border: 1px dashed var(--background-modifier-border);">
                <div style="font-size: 0.75rem; font-family: var(--font-mono); color: var(--orange, #d08770); margin-bottom: 8px;">Diagram Syntax Notice</div>
                <pre class="mermaid-raw-code" style="margin: 0; padding: 8px; font-size: 0.85rem; overflow-x: auto;"><code>${this.escapeHtml(rawCode)}</code></pre>
              </div>
            `;
          }
        }

        this.cleanupStrayElements(safeId);
      }
    }

    async rethemeAll(rootElement = document, isDark = true) {
      const containers = Array.from(rootElement.querySelectorAll('.mermaid-diagram-card, .mermaid-diagram-container'));
      if (containers.length === 0) return;

      const mermaid = await this.ensureMermaid();
      if (!mermaid) return;

      this.initializeMermaid(mermaid, isDark);

      for (let i = 0; i < containers.length; i++) {
        const container = containers[i];
        const code = container.dataset.mermaidCode || container.dataset.mermaidRaw;
        if (!code) continue;

        const viewportContainer = container.querySelector('.mermaid-viewport-container');
        if (!viewportContainer) continue;

        const safeId = `mermaid_retheme_${Date.now()}_${i}_${++this._idCounter}`;
        try {
          const res = await mermaid.render(safeId, code);
          const svg = typeof res === 'string' ? res : res.svg;
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
                svgEl.style.maxWidth = '100%';
              }
              if (vb.width > 550) {
                viewportContainer.style.minWidth = `${Math.min(vb.width, 680)}px`;
              }
            }
          }
          this.renderMathInDiagram(container);
        } catch (e) {
          console.warn('Error re-theming diagram:', e);
        }

        this.cleanupStrayElements(safeId);
      }
    }

    renderMathInDiagram(container) {
      if (!window.katex || !container) return;
      const selectors = [
        '.nodeLabel', '.edgeLabel', '.label', 'foreignObject span', 'foreignObject div', 'foreignObject p',
        'text', 'tspan', '.actor', '.messageText', '.noteText', '.loopText', '.statediagram-state',
        '.statediagram-cluster', '.er', '.journey-section', '.task-text', '.pieTitleText', '.slice',
        '.quadrant-point', '.label-container', 'g.nodes g.node'
      ];
      const labelElements = container.querySelectorAll(selectors.join(', '));
      const processedElements = new Set();
      const macros = (window.ObsidianMathRenderer && window.ObsidianMathRenderer.katexMacros) || {};

      labelElements.forEach(el => {
        if (processedElements.has(el)) return;
        
        if (el.tagName && el.tagName.toLowerCase() !== 'text' && el.querySelector && el.querySelector('.nodeLabel, .edgeLabel, text, tspan')) {
          return;
        }

        const raw = el.innerHTML || el.textContent;
        if (!raw || (!raw.includes('$') && !raw.includes('\\(') && !raw.includes('\\[') && !raw.includes('\\begin{'))) {
          return;
        }

        processedElements.add(el);

        let processed = raw
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&#36;/g, '$');

        // Block environments
        processed = processed.replace(/\\begin\{([a-zA-Z0-9*]+)\}([\s\S]*?)\\end\{\1\}/g, (match) => {
          try {
            return window.katex.renderToString(match.trim(), {
              displayMode: true,
              throwOnError: false,
              output: 'htmlAndMathml',
              trust: true,
              macros: macros
            });
          } catch (e) { return match; }
        });

        // Block math
        processed = processed.replace(/(?:\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\])/g, (match, f1, f2) => {
          const formula = (f1 || f2 || '').trim();
          try {
            return window.katex.renderToString(formula, {
              displayMode: true,
              throwOnError: false,
              output: 'htmlAndMathml',
              trust: true,
              macros: macros
            });
          } catch (e) { return match; }
        });

        // Inline math
        processed = processed.replace(/(?:\$([^\$\n\r]+?)\$|\\\(([\s\S]*?)\\\))/g, (match, f1, f2) => {
          const formula = (f1 || f2 || '').trim();
          try {
            return window.katex.renderToString(formula, {
              displayMode: false,
              throwOnError: false,
              output: 'htmlAndMathml',
              trust: true,
              macros: macros
            });
          } catch (e) { return match; }
        });

        if (processed !== raw) {
          if (el.tagName && el.tagName.toLowerCase() === 'text') {
            try {
              const bbox = el.getBBox ? el.getBBox() : null;
              const x = el.getAttribute('x') || (bbox ? bbox.x : 0);
              const y = el.getAttribute('y') || (bbox ? bbox.y : 0);
              const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
              fo.setAttribute('x', x);
              fo.setAttribute('y', y);
              fo.setAttribute('width', (bbox && bbox.width > 0) ? Math.max(bbox.width + 60, 120) : 140);
              fo.setAttribute('height', (bbox && bbox.height > 0) ? Math.max(bbox.height + 30, 50) : 50);
              fo.innerHTML = `<div xmlns="http://www.w3.org/1999/xhtml" style="display:inline-flex;align-items:center;color:currentColor;font-size:inherit;">${processed}</div>`;
              el.replaceWith(fo);
            } catch (err) {
              el.innerHTML = processed;
            }
          } else {
            el.innerHTML = processed;
          }
        }
      });
    }

    cleanupStrayElements(safeId) {
      const strayD = document.getElementById(`d${safeId}`);
      if (strayD && strayD.parentNode) strayD.remove();
      const strayIframe = document.querySelector(`iframe#i${safeId}, [id^="i${safeId}"]`);
      if (strayIframe && strayIframe.parentNode) strayIframe.remove();
    }
  }

  window.ObsidianMermaidRenderer = new MermaidRenderer();
})();
