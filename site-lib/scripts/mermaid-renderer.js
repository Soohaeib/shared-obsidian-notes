/**
 * ============================================================================
 * Obsidian Dedicated Mermaid Diagram Renderer (mermaid-renderer.js)
 * ============================================================================
 * Full-featured resilient Mermaid & Mindmap parsing, multi-pass healing,
 * theme switching, and responsive vector rendering.
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

    escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    initializeMermaid(mermaid, isDark = true) {
      try {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'loose',
          theme: isDark ? 'dark' : 'default',
          flowchart: {
            htmlLabels: true,
            useMaxWidth: true,
            curve: 'basis'
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

        const container = document.createElement('div');
        container.className = 'mermaid-diagram-container';
        container.dataset.mermaidCode = healedCode;
        container.dataset.mermaidRaw = rawCode;
        container.innerHTML = `
          <div class="mermaid-loading-skeleton" style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
            <span>Rendering diagram...</span>
          </div>
        `;

        parent.replaceWith(container);

        const safeId = `mermaid_diag_${Date.now()}_${index}_${++this._idCounter}`;
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

        if (renderSuccess && renderedSvg) {
          container.innerHTML = renderedSvg;
          const svgEl = container.querySelector('svg');
          if (svgEl) {
            svgEl.style.display = 'block';
            svgEl.style.width = '100%';
            svgEl.style.maxWidth = '100%';

            if (svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.height > 0) {
              const vb = svgEl.viewBox.baseVal;
              svgEl.style.aspectRatio = `${vb.width} / ${vb.height}`;
              svgEl.style.height = 'auto';
            }
          }
        } else {
          container.innerHTML = `
            <div class="mermaid-fallback-card" style="padding: 16px; border-radius: 8px; background: rgba(0,0,0,0.2); border: 1px dashed var(--background-modifier-border);">
              <div style="font-size: 0.75rem; font-family: var(--font-mono); color: var(--orange, #d08770); margin-bottom: 8px;">Diagram Syntax Notice</div>
              <pre class="mermaid-raw-code" style="margin: 0; padding: 8px; font-size: 0.85rem; overflow-x: auto;"><code>${this.escapeHtml(rawCode)}</code></pre>
            </div>
          `;
        }

        this.cleanupStrayElements(safeId);
      }

      if (window.ObsidianMediaPreview && typeof window.ObsidianMediaPreview.attachCornerButtons === 'function') {
        window.ObsidianMediaPreview.attachCornerButtons(rootElement);
      }
    }

    async rethemeAll(rootElement = document, isDark = true) {
      const containers = Array.from(rootElement.querySelectorAll('.mermaid-diagram-container'));
      if (containers.length === 0) return;

      const mermaid = await this.ensureMermaid();
      if (!mermaid) return;

      this.initializeMermaid(mermaid, isDark);

      for (let i = 0; i < containers.length; i++) {
        const container = containers[i];
        const code = container.dataset.mermaidCode || container.dataset.mermaidRaw;
        if (!code) continue;

        const safeId = `mermaid_retheme_${Date.now()}_${i}_${++this._idCounter}`;
        try {
          const res = await mermaid.render(safeId, code);
          const svg = typeof res === 'string' ? res : res.svg;
          container.innerHTML = svg;

          const svgEl = container.querySelector('svg');
          if (svgEl) {
            svgEl.style.display = 'block';
            svgEl.style.width = '100%';
            svgEl.style.maxWidth = '100%';
            if (svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.height > 0) {
              const vb = svgEl.viewBox.baseVal;
              svgEl.style.aspectRatio = `${vb.width} / ${vb.height}`;
              svgEl.style.height = 'auto';
            }
          }
        } catch (e) {
          console.warn('Error re-theming diagram:', e);
        }

        this.cleanupStrayElements(safeId);
      }

      if (window.ObsidianMediaPreview && typeof window.ObsidianMediaPreview.attachCornerButtons === 'function') {
        window.ObsidianMediaPreview.attachCornerButtons(rootElement);
      }
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
