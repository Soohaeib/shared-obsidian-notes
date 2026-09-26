/**
 * ============================================================================
 * Obsidian Dedicated Mermaid Diagram Renderer (mermaid-renderer.js)
 * Handles detection, syntax auto-healing, DOM mounting, responsive SVG scaling,
 * error fallbacks, and dynamic theme switching for Mermaid diagrams.
 * ============================================================================
 */

(function() {
  'use strict';

  class MermaidRenderer {
    constructor() {
      this._loadingPromise = null;
      this._idCounter = 0;
    }

    /**
     * Ensures Mermaid library is loaded and available on window
     */
    async ensureMermaid() {
      if (window.mermaid) return window.mermaid;
      if (this._loadingPromise) return this._loadingPromise;

      this._loadingPromise = new Promise((resolve) => {
        if (window.mermaid) return resolve(window.mermaid);
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          if (window.mermaid) {
            clearInterval(interval);
            resolve(window.mermaid);
          } else if (attempts > 30) {
            clearInterval(interval);
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js';
            script.onload = () => resolve(window.mermaid || null);
            script.onerror = () => resolve(null);
            document.head.appendChild(script);
          }
        }, 100);
      });

      return this._loadingPromise;
    }

    /**
     * Heals common syntax quirks in Obsidian Mermaid notes:
     * - Multi-line or punctuation in open arrow labels: `A -- Cost Tracing<br>... --> B` => `A -->|Cost Tracing<br>...| B`
     * - Dotted arrows: `A -. Label .-> B` => `A -.->|Label| B`
     * - Thick arrows: `A == Label ==> B` => `A ==>|Label| B`
     * - Unescaped HTML entities (&lt;, &gt;, &amp;, &quot;)
     * - Missing mindmap declarations
     */
    healMermaidCode(rawText) {
      if (!rawText) return '';
      let text = rawText.trim();

      // Unescape HTML entities
      text = text.replace(/&lt;/g, '<')
                 .replace(/&gt;/g, '>')
                 .replace(/&amp;/g, '&')
                 .replace(/&quot;/g, '"');

      // Handle mindmaps missing mindmap declaration
      if (/^(mindmap|markmap)/i.test(text)) {
        if (!text.toLowerCase().startsWith('mindmap')) {
          text = `mindmap\n${text.replace(/^[^\n]+\n/, '')}`;
        }
      }

      // Heal open flowchart edge labels that contain <br>, commas, or special characters:
      // e.g. "B -- Cost Tracing<br>Requisitions, Time Cards --> D" => "B -->|Cost Tracing<br>Requisitions, Time Cards| D"
      text = text.replace(/([A-Za-z0-9_\]\)\}]|\b)[ \t]*--[ \t]+([^\n\->|]+?)[ \t]*-->[ \t]*([A-Za-z0-9_\[\(\{]|\b)/g, (match, from, label, to) => {
        return `${from} -->|${label.trim()}| ${to}`;
      });

      // Heal dotted arrows: "A -. Some Label .-> B" => "A -.->|Some Label| B"
      text = text.replace(/([A-Za-z0-9_\]\)\}]|\b)[ \t]*-\.[ \t]+([^\n\->|]+?)[ \t]*\.->[ \t]*([A-Za-z0-9_\[\(\{]|\b)/g, (match, from, label, to) => {
        return `${from} -.->|${label.trim()}| ${to}`;
      });

      // Heal thick arrows: "A == Some Label ==> B" => "A ==>|Some Label| B"
      text = text.replace(/([A-Za-z0-9_\]\)\}]|\b)[ \t]*==[ \t]+([^\n\->|]+?)[ \t]*==>[ \t]*([A-Za-z0-9_\[\(\{]|\b)/g, (match, from, label, to) => {
        return `${from} ==>|${label.trim()}| ${to}`;
      });

      return text;
    }

    /**
     * HTML escape helper for safe error message fallback
     */
    escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    /**
     * Initializes Mermaid configuration for light/dark themes
     */
    initializeMermaid(mermaid, isDark = true) {
      try {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'loose',
          theme: isDark ? 'dark' : 'default',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        });
      } catch (e) {
        console.warn('Mermaid initialize warning:', e);
      }
    }

    /**
     * Finds and processes all diagram candidates within root container
     */
    async renderAll(rootElement = document, isDark = true) {
      const candidates = Array.from(rootElement.querySelectorAll('pre code'));
      const diagramCodes = candidates.filter(codeEl => {
        const cls = (codeEl.className || '').toLowerCase();
        if (cls.includes('language-mermaid') || cls.includes('mermaid') || cls.includes('language-mindmap') || cls.includes('mindmap') || cls.includes('language-markmap')) {
          return true;
        }
        const firstLine = (codeEl.textContent || '').trim().split('\n')[0].trim().toLowerCase();
        return /^(graph\s+(td|tb|lr|rl|bt)|flowchart\s+(td|tb|lr|rl|bt)|sequencediagram|classdiagram|statediagram|erdiagram|gantt|pie|mindmap|journey|gitgraph|xychart-beta|quadrantchart|architecture|block-beta|packet-beta|kanban|timeline|sankey-beta)/i.test(firstLine);
      });

      if (diagramCodes.length === 0) return;

      const mermaid = await this.ensureMermaid();
      if (!mermaid) return;

      this.initializeMermaid(mermaid, isDark);

      for (let index = 0; index < diagramCodes.length; index++) {
        const codeEl = diagramCodes[index];
        const parent = codeEl.closest('pre');
        let rawCode = (codeEl.textContent || codeEl.innerText || '').trim();

        const isMindmap = (codeEl.className || '').includes('mindmap') || (codeEl.className || '').includes('markmap') || rawCode.toLowerCase().startsWith('mindmap');
        if (isMindmap && !rawCode.toLowerCase().startsWith('mindmap')) {
          rawCode = `mindmap\n${rawCode}`;
        }

        const healedCode = this.healMermaidCode(rawCode);
        const container = document.createElement('div');
        container.className = 'mermaid-diagram-container';
        container.dataset.mermaidCode = healedCode;
        container.dataset.mermaidRaw = rawCode;
        const id = `mermaid-diag-${Date.now()}-${index}-${++this._idCounter}`;

        // Mount container to live DOM before rendering so Mermaid can accurately measure bounding boxes
        if (parent && parent.parentNode) {
          parent.replaceWith(container);
        }

        let renderSuccess = false;

        // Attempt 1: Standard render with healed code
        try {
          const { svg } = await mermaid.render(id, healedCode);
          container.innerHTML = svg;
          renderSuccess = true;
        } catch (err1) {
          console.warn('Mermaid render attempt 1 issue, trying fallback:', err1);
          // Attempt 2: Fallback without <br> inside edge pipes
          try {
            const fallbackId = `${id}-fb`;
            const fallbackCode = healedCode.replace(/\|([^|]*?)<br\s*\/?>([^|]*?)\|/gi, '|$1 $2|');
            const { svg } = await mermaid.render(fallbackId, fallbackCode);
            container.innerHTML = svg;
            renderSuccess = true;
          } catch (err2) {
            console.warn('Mermaid render fallback issue:', err2);
            container.innerHTML = `<pre class="mermaid-error"><code>${this.escapeHtml(rawCode)}</code></pre>`;
          }
        }

        if (renderSuccess) {
          const svgEl = container.querySelector('svg');
          if (svgEl) {
            svgEl.removeAttribute('height');
            svgEl.style.width = '100%';
            svgEl.style.maxWidth = '100%';
            svgEl.style.height = 'auto';
            svgEl.style.display = 'block';
          }
        }

        // Clean stray artifacts created by Mermaid offscreen
        const stray = document.getElementById(`d${id}`);
        if (stray && stray !== container && stray.parentNode) stray.remove();
      }
    }

    /**
     * Dynamically re-renders all diagrams when theme toggles
     */
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

        const id = `mermaid-retheme-${Date.now()}-${i}-${++this._idCounter}`;
        try {
          const { svg } = await mermaid.render(id, code);
          container.innerHTML = svg;
          const svgEl = container.querySelector('svg');
          if (svgEl) {
            svgEl.removeAttribute('height');
            svgEl.style.width = '100%';
            svgEl.style.maxWidth = '100%';
            svgEl.style.height = 'auto';
            svgEl.style.display = 'block';
          }
        } catch (e) {
          console.warn('Error re-theming diagram:', e);
        }

        const stray = document.getElementById(`d${id}`);
        if (stray && stray !== container && stray.parentNode) stray.remove();
      }

      if (window.ObsidianMediaPreview && typeof window.ObsidianMediaPreview.attachCornerButtons === 'function') {
        window.ObsidianMediaPreview.attachCornerButtons(rootElement);
      }
    }
  }

  // Export globally
  window.ObsidianMermaidRenderer = new MermaidRenderer();
})();
