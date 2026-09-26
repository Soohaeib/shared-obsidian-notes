/**
 * ============================================================================
 * Obsidian Dedicated Callout Renderer Engine (callout-renderer.js)
 * Supports standard callout types (note, tip, warning, danger, success,
 * question, quote, example, abstract, info, bug, etc.), foldability (+ / -),
 * custom titles, math formula embedding inside titles/bodies, and
 * interactive toggle events.
 * ============================================================================
 */

(function() {
  'use strict';

  class ObsidianCalloutRenderer {
    constructor() {
      this.calloutTokenIdx = 0;
      this.currentCalloutsMap = new Map();
    }

    reset() {
      this.calloutTokenIdx = 0;
      this.currentCalloutsMap = new Map();
    }

    getCalloutIconSvg(type) {
      const t = (type || 'note').toLowerCase();
      
      if (['quote', 'cite'].includes(t)) {
        return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"></path><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"></path></svg>`;
      }
      if (['tip', 'hint', 'important'].includes(t)) {
        return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>`;
      }
      if (['abstract', 'summary', 'tldr'].includes(t)) {
        return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="10" x2="3" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="21" y1="18" x2="3" y2="18"></line></svg>`;
      }
      if (['warning', 'caution', 'attention'].includes(t)) {
        return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
      }
      if (['danger', 'error', 'bug', 'failure', 'fail', 'flame', 'missing'].includes(t)) {
        return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
      }
      if (['success', 'check', 'done'].includes(t)) {
        return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
      }
      if (['question', 'help', 'faq'].includes(t)) {
        return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
      }
      if (['example', 'snippet'].includes(t)) {
        return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`;
      }
      if (['info', 'todo'].includes(t)) {
        return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
      }
      
      // Default: note / pencil
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`;
    }

    autoHealCallouts(text) {
      if (!text) return text;
      // Normalizes variations like ">[!NOTE]" or "> [!NOTE]" into standard format
      return text.replace(/^[ \t]*>\[!([a-zA-Z0-9_\-]+)\]([+\-])?\s*([^\n\r<]*)$/gm, '> [!$1]$2 $3');
    }

    processCallouts(text, codeBlocksMap = new Map()) {
      if (!this.currentCalloutsMap) this.currentCalloutsMap = new Map();
      const lines = text.split('\n');
      const resultLines = [];
      let inCallout = false, calloutType = '', foldChar = '', calloutTitle = '', calloutLines = [];

      const flushCallout = () => {
        if (!inCallout) return;
        const type = (calloutType || 'note').toLowerCase();
        const isCollapsible = foldChar === '+' || foldChar === '-';
        const isFolded = foldChar === '-';
        let rawTitle = (calloutTitle && calloutTitle.trim()) ? calloutTitle.trim() : (type.charAt(0).toUpperCase() + type.slice(1));

        if (window.ObsidianMathRenderer) {
          rawTitle = window.ObsidianMathRenderer.extractAndTokenize(rawTitle);
          rawTitle = window.ObsidianMathRenderer.restoreTokens(rawTitle);
        }

        const iconSvg = this.getCalloutIconSvg(type);

        let foldIndicator = '';
        if (isCollapsible) {
          foldIndicator = `
            <span class="callout-fold-indicator" aria-label="Toggle Callout">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </span>
          `;
        }

        let innerMarkdown = calloutLines.map(l => l.replace(/^[ \t]*>[ \t]?/, '')).join('\n');
        if (codeBlocksMap && codeBlocksMap.size > 0) {
          for (const [codeToken, codeContent] of codeBlocksMap.entries()) {
            if (innerMarkdown.includes(codeToken)) {
              innerMarkdown = innerMarkdown.replaceAll(codeToken, codeContent);
            }
          }
        }

        if (window.ObsidianMathRenderer) {
          innerMarkdown = window.ObsidianMathRenderer.extractAndTokenize(innerMarkdown);
        }
        if (window.ObsidianWikiLinks) {
          innerMarkdown = window.ObsidianWikiLinks.processMarkdownFeatures(innerMarkdown);
        }

        let innerHtml = '';
        try {
          if (typeof marked !== 'undefined' && marked.parse) {
            innerHtml = marked.parse(innerMarkdown);
          } else {
            innerHtml = innerMarkdown;
          }
        } catch (e) {
          innerHtml = innerMarkdown;
        }

        if (window.ObsidianMathRenderer) {
          innerHtml = window.ObsidianMathRenderer.restoreTokens(innerHtml);
        }

        const token = `@@OBS_CALLOUT_BLOCK_${this.calloutTokenIdx++}@@`;
        const fullCalloutHtml = `
          <div class="callout ${isFolded ? 'is-collapsed' : ''}" data-callout="${type}" ${isCollapsible ? 'data-callout-fold="true"' : ''}>
            <div class="callout-title" ${isCollapsible ? 'role="button" tabindex="0"' : ''}>
              <span class="callout-icon">${iconSvg}</span>
              <span class="callout-title-inner">${rawTitle}</span>
              ${foldIndicator}
            </div>
            <div class="callout-content">${innerHtml}</div>
          </div>
        `;
        this.currentCalloutsMap.set(token, fullCalloutHtml);
        resultLines.push(token);

        inCallout = false;
        calloutType = '';
        foldChar = '';
        calloutTitle = '';
        calloutLines = [];
      };

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const calloutHeaderMatch = line.match(/^[ \t]*>[ \t]*\[!([a-zA-Z0-9_\-]+)\]([+\-])?\s*(.*)$/i);

        if (calloutHeaderMatch) {
          if (inCallout) flushCallout();
          inCallout = true;
          calloutType = calloutHeaderMatch[1];
          foldChar = calloutHeaderMatch[2] || '';
          calloutTitle = calloutHeaderMatch[3] || '';
          calloutLines = [];
          continue;
        }

        if (inCallout) {
          if (/^[ \t]*>/.test(line)) {
            calloutLines.push(line);
          } else if (line.trim() === '') {
            let hasMoreQuote = false;
            for (let j = i + 1; j < lines.length; j++) {
              if (lines[j].trim() === '') continue;
              if (/^[ \t]*>/.test(lines[j])) hasMoreQuote = true;
              break;
            }
            if (hasMoreQuote) calloutLines.push('>');
            else {
              flushCallout();
              resultLines.push(line);
            }
          } else {
            flushCallout();
            resultLines.push(line);
          }
        } else {
          resultLines.push(line);
        }
      }

      if (inCallout) flushCallout();
      return resultLines.join('\n');
    }

    postprocessHtml(html) {
      if (this.currentCalloutsMap && this.currentCalloutsMap.size > 0) {
        for (const [token, calloutHtml] of this.currentCalloutsMap.entries()) {
          const pRegex = new RegExp(`<p>\\s*${token}\\s*<\\/p>`, 'g');
          if (pRegex.test(html)) html = html.replace(pRegex, () => calloutHtml);
          else html = html.replaceAll(token, () => calloutHtml);
        }
        // Clean up any stray paragraph tags enclosing block callout divs
        html = html.replace(/<p>\s*(<div class="callout[\s\S]*?<\/div>\s*<\/div>)\s*<\/p>/gi, '$1');
      }

      // Fallback regex for standard blockquotes that contain callout markup
      const calloutRegex = /<blockquote>\s*<p>\[!([a-zA-Z0-9_\-]+)\]([+\-])?\s*([^\n<]*)?([\s\S]*?)<\/blockquote>/gi;
      html = html.replace(calloutRegex, (match, rawType, foldChar, title, rest) => {
        const type = (rawType || 'note').toLowerCase();
        const isCollapsible = foldChar === '+' || foldChar === '-';
        const isFolded = foldChar === '-';
        let displayTitle = (title && title.trim()) ? title.trim() : (type.charAt(0).toUpperCase() + type.slice(1));
        
        if (window.ObsidianMathRenderer) {
          displayTitle = window.ObsidianMathRenderer.extractAndTokenize(displayTitle);
          displayTitle = window.ObsidianMathRenderer.restoreTokens(displayTitle);
        }
        const iconSvg = this.getCalloutIconSvg(type);

        let foldIndicator = '';
        if (isCollapsible) {
          foldIndicator = `
            <span class="callout-fold-indicator" aria-label="Toggle Callout">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </span>
          `;
        }

        let bodyHtml = (rest || '').trim();
        if (bodyHtml.startsWith('</p>')) bodyHtml = bodyHtml.slice(4).trim();
        if (bodyHtml && !bodyHtml.startsWith('<p') && !bodyHtml.startsWith('<div') && !bodyHtml.startsWith('<ul') && !bodyHtml.startsWith('<ol') && !bodyHtml.startsWith('<table') && !bodyHtml.startsWith('<blockquote')) {
          bodyHtml = `<p>${bodyHtml}</p>`;
        }

        if (window.ObsidianMathRenderer) {
          bodyHtml = window.ObsidianMathRenderer.extractAndTokenize(bodyHtml);
          bodyHtml = window.ObsidianMathRenderer.restoreTokens(bodyHtml);
        }

        return `
          <div class="callout ${isFolded ? 'is-collapsed' : ''}" data-callout="${type}" ${isCollapsible ? 'data-callout-fold="true"' : ''}>
            <div class="callout-title" ${isCollapsible ? 'role="button" tabindex="0"' : ''}>
              <span class="callout-icon">${iconSvg}</span>
              <span class="callout-title-inner">${displayTitle}</span>
              ${foldIndicator}
            </div>
            <div class="callout-content">${bodyHtml}</div>
          </div>
        `;
      });

      return html;
    }

    initInteractions(rootElement = document) {
      const container = rootElement.querySelector ? rootElement.querySelector('#note-container') || rootElement : rootElement;
      if (!container) return;

      container.querySelectorAll('.callout[data-callout-fold="true"]').forEach(callout => {
        const titleEl = callout.querySelector('.callout-title');
        if (titleEl && !titleEl._boundCalloutFold) {
          titleEl._boundCalloutFold = true;
          const toggle = (e) => {
            if (e) {
              e.preventDefault();
              e.stopPropagation();
            }
            callout.classList.toggle('is-collapsed');
          };
          titleEl.addEventListener('click', toggle);
          titleEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              toggle(e);
            }
          });
        }
      });
    }
  }

  const instance = new ObsidianCalloutRenderer();
  window.ObsidianCalloutRenderer = instance;
  window.ObsidianCallouts = instance;
})();
