/**
 * ============================================================================
 * Obsidian Dedicated Math & LaTeX Engine (math-renderer.js)
 * ============================================================================
 * Production-safe hybrid KaTeX & MathJax rendering pipeline for Obsidian Markdown.
 * - KaTeX is the default high-performance browser renderer.
 * - MathJax 3 with AMS is the source-preserving fallback for advanced constructs:
 *   \multicolumn, \cline, \renewcommand, aligned, gathered, cases, split, multline, etc.
 * - Preserves LaTeX source without destructive compatibility regex rewrites.
 * - Strict isolation: MathJax is NEVER run over code blocks, inline code, Mermaid,
 *   raw HTML, or already-rendered KaTeX output.
 * - Explicit MathJax load-failure state with human-readable fallback cards.
 * - Performance timing and error diagnostics without logging raw user formulas.
 */

(function() {
  'use strict';

  class ObsidianMathRenderer {
    constructor() {
      this.mathTokenIdx = 0;
      this.codeTokenIdx = 0;
      this.currentBlocksMap = new Map();
      this.currentInlinesMap = new Map();
      this.currentCodeMap = new Map();
      
      this.mathJaxState = 'ready'; // 'ready' | 'loading' | 'failed'
      this.mathJaxFailureReason = null;

      this.metrics = {
        katexCount: 0,
        mathJaxCount: 0,
        fallbackCount: 0,
        lastRenderTimeMs: 0
      };

      // Native KaTeX macros for common statistical and mathematical notation
      this.katexMacros = {
        "\\var": "\\operatorname{var}",
        "\\cov": "\\operatorname{cov}",
        "\\se": "\\operatorname{se}",
        "\\df": "\\operatorname{df}",
        "\\MLE": "\\operatorname{MLE}",
        "\\RR": "\\mathbb{R}",
        "\\NN": "\\mathbb{N}",
        "\\ZZ": "\\mathbb{Z}",
        "\\QQ": "\\mathbb{Q}",
        "\\CC": "\\mathbb{C}",
        "\\bm": "\\mathbf",
        "\\boldsymbol": "\\mathbf",
        "\\bold": "\\mathbf",
        "\\E": "\\mathbb{E}",
        "\\P": "\\mathbb{P}",
        "\\Var": "\\operatorname{Var}",
        "\\Cov": "\\operatorname{Cov}",
        "\\Corr": "\\operatorname{Corr}",
        "\\MSE": "\\operatorname{MSE}",
        "\\SSE": "\\operatorname{SSE}",
        "\\SSR": "\\operatorname{SSR}",
        "\\SST": "\\operatorname{SST}",
        "\\sd": "\\operatorname{sd}",
        "\\tr": "\\operatorname{tr}",
        "\\diag": "\\operatorname{diag}",
        "\\rank": "\\operatorname{rank}",
        "\\nullity": "\\operatorname{nullity}",
        "\\proj": "\\operatorname{proj}",
        "\\span": "\\operatorname{span}",
        "\\sgn": "\\operatorname{sgn}",
        "\\argmax": "\\operatorname*{arg\\,max}",
        "\\argmin": "\\operatorname*{arg\\,min}",
        "\\coloneqq": ":=",
        "\\eqqcolon": "=:",
        "\\given": "\\,\\vert\\,",
        "\\dd": "\\mathrm{d}",
        "\\diff": "\\frac{\\mathrm{d}}{\\mathrm{d}x}",
        "\\pd": "\\frac{\\partial}{\\partial x}"
      };
    }

    reset() {
      this.currentBlocksMap.clear();
      this.currentInlinesMap.clear();
      this.currentCodeMap.clear();
      this.metrics.katexCount = 0;
      this.metrics.mathJaxCount = 0;
      this.metrics.fallbackCount = 0;
    }

    escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    /**
     * Source-preserving formula preparation:
     * Cleans leading markdown blockquote markers (e.g. "> $$") and unescapes entities,
     * without altering or mutating LaTeX commands.
     */
    prepareFormulaSource(formula) {
      if (!formula) return '';
      let clean = String(formula).trim();
      // Remove leading blockquote markers inside callouts or quotes
      clean = clean.replace(/^[ \t]*>+[ \t]*/gm, '');
      // Unescape HTML dollar entities
      clean = clean.replace(/&#36;/g, '\\$');
      return clean.trim();
    }

    /**
     * Identifies formulas that contain constructs requiring MathJax 3 with AMS.
     * MathJax natively renders these without syntax loss.
     */
    requiresMathJax(formula) {
      if (!formula) return false;
      return /\\(?:renewcommand|begin\{(?:aligned|alignedat|gathered|gather|multline|split|cases|matrix\*|pmatrix\*|bmatrix\*|vmatrix\*|Vmatrix\*|dcases|rcases|subarray|CD)\}|tag\b|label\b)/.test(formula);
    }

    /**
     * Distinguishes LaTeX tabular schedules (stores ledgers, financial statements,
     * reconciliation tables with multicolumn, cline, hline) from standard mathematical formulas.
     */
    isLatexTable(formula) {
      if (!formula) return false;
      const clean = formula.trim();
      return /\\begin\{(?:array|tabular)\}/.test(clean) && 
             (/\\multicolumn|\\cline/.test(clean) || (/\\hline/.test(clean) && /&/.test(clean)));
    }

    /**
     * Renders LaTeX array tables with multicolumn, cline, and hline into
     * accessible, high-contrast, responsive HTML tables styled with accounting schedule specs.
     */
    renderLatexTable(formula, mathId = '') {
      if (!formula) return '';
      const clean = formula.trim();

      const matchPreamble = clean.match(/\\begin\{(?:array|tabular)\}(?:\[[a-z]\])?\{([^}]+)\}/);
      if (!matchPreamble) return this.renderMathJaxPlaceholder(formula, true, mathId);

      const colSpecRaw = matchPreamble[1];
      const colAlignments = [];
      const colBorders = [];
      
      const colChars = colSpecRaw.replace(/\s+/g, '');
      let colIndex = 0;
      for (let i = 0; i < colChars.length; i++) {
        const ch = colChars[i];
        if (ch === 'l') { colAlignments.push('left'); colIndex++; }
        else if (ch === 'r') { colAlignments.push('right'); colIndex++; }
        else if (ch === 'c') { colAlignments.push('center'); colIndex++; }
        else if (ch === '|') {
          if (colIndex > 0) colBorders[colIndex - 1] = true;
        }
      }

      const bodyStart = clean.indexOf(matchPreamble[0]) + matchPreamble[0].length;
      const bodyEnd = clean.lastIndexOf('\\end{');
      if (bodyEnd === -1) return this.renderMathJaxPlaceholder(formula, true, mathId);
      const body = clean.substring(bodyStart, bodyEnd).trim();

      // Split rows by \\ outside of nested braces
      const rawRows = [];
      let depth = 0;
      let lastPos = 0;
      for (let i = 0; i < body.length; i++) {
        if (body[i] === '{') depth++;
        else if (body[i] === '}') depth = Math.max(0, depth - 1);
        else if (depth === 0 && body[i] === '\\' && body[i + 1] === '\\') {
          rawRows.push(body.substring(lastPos, i).trim());
          lastPos = i + 2;
          i++;
        }
      }
      if (lastPos < body.length) {
        const last = body.substring(lastPos).trim();
        if (last) rawRows.push(last);
      }

      const rows = [];
      for (let rIdx = 0; rIdx < rawRows.length; rIdx++) {
        let rowStr = rawRows[rIdx].trim();
        if (!rowStr) continue;

        let hasDoubleHlineBottom = false;
        let hasSingleHlineTop = false;
        let hasSingleHlineBottom = false;

        while (rowStr.startsWith('\\hline')) {
          if (rowStr.startsWith('\\hline\\hline') || rowStr.startsWith('\\hline \\hline')) {
            hasSingleHlineTop = true;
            rowStr = rowStr.replace(/^\\hline\s*\\hline\s*/, '').trim();
          } else {
            hasSingleHlineTop = true;
            rowStr = rowStr.replace(/^\\hline\s*/, '').trim();
          }
        }

        while (rowStr.endsWith('\\hline')) {
          if (rowStr.endsWith('\\hline\\hline') || rowStr.endsWith('\\hline \\hline')) {
            hasDoubleHlineBottom = true;
            rowStr = rowStr.replace(/\\hline\s*\\hline\s*$/, '').trim();
          } else {
            hasSingleHlineBottom = true;
            rowStr = rowStr.replace(/\\hline\s*$/, '').trim();
          }
        }

        if (!rowStr) {
          if (rows.length > 0) {
            if (hasDoubleHlineBottom) rows[rows.length - 1].hasDoubleHlineBottom = true;
            else if (hasSingleHlineBottom || hasSingleHlineTop) rows[rows.length - 1].hasSingleHlineBottom = true;
          }
          continue;
        }

        let clineRanges = [];
        rowStr = rowStr.replace(/\\cline\{(\d+)\s*-\s*(\d+)\}/g, (m, start, end) => {
          clineRanges.push([parseInt(start, 10), parseInt(end, 10)]);
          return '';
        }).trim();

        const rawCells = [];
        let cellDepth = 0;
        let cellLastPos = 0;
        for (let c = 0; c < rowStr.length; c++) {
          if (rowStr[c] === '{') cellDepth++;
          else if (rowStr[c] === '}') cellDepth = Math.max(0, cellDepth - 1);
          else if (cellDepth === 0 && rowStr[c] === '&') {
            rawCells.push(rowStr.substring(cellLastPos, c).trim());
            cellLastPos = c + 1;
          }
        }
        if (cellLastPos <= rowStr.length) {
          rawCells.push(rowStr.substring(cellLastPos).trim());
        }

        const cells = [];
        let currentCellCol = 0;

        for (let cIdx = 0; cIdx < rawCells.length; cIdx++) {
          let cellStr = rawCells[cIdx].trim();
          let colspan = 1;
          let align = colAlignments[currentCellCol] || 'left';
          let isMulticolumn = false;
          let hasRightBorder = colBorders[currentCellCol] || false;

          const mcMatch = cellStr.match(/^\\multicolumn\{(\d+)\}\{([^}]+)\}\{([\s\S]*)\}$/);
          if (mcMatch) {
            colspan = parseInt(mcMatch[1], 10);
            const mcAlignSpec = mcMatch[2];
            if (mcAlignSpec.includes('r')) align = 'right';
            else if (mcAlignSpec.includes('c')) align = 'center';
            else if (mcAlignSpec.includes('l')) align = 'left';
            if (mcAlignSpec.includes('|')) hasRightBorder = true;
            cellStr = mcMatch[3].trim();
            isMulticolumn = true;
          }

          let hasClineTop = false;
          for (const [s, e] of clineRanges) {
            const colNum = currentCellCol + 1;
            if (colNum >= s && colNum <= e) hasClineTop = true;
          }

          cells.push({
            content: cellStr,
            colspan,
            align,
            isMulticolumn,
            hasRightBorder,
            hasClineTop
          });

          currentCellCol += colspan;
        }

        rows.push({
          cells,
          hasSingleHlineTop,
          hasSingleHlineBottom,
          hasDoubleHlineBottom
        });
      }

      let html = `<div class="math math-block math-mathjax accounting-table-wrapper" id="${mathId}" data-math-engine="mathjax" data-latex-table="true" data-math-raw="${this.escapeHtml(formula)}">`;
      html += '<table class="accounting-schedule-table"><tbody>';

      for (let rIdx = 0; rIdx < rows.length; rIdx++) {
        const row = rows[rIdx];
        let rowClasses = [];
        if (row.hasSingleHlineTop) rowClasses.push('border-single-top');
        if (row.hasDoubleHlineBottom) rowClasses.push('border-double-bottom');
        else if (row.hasSingleHlineBottom) rowClasses.push('border-single-bottom');

        const isHeaderRow = row.cells.some(c => c.isMulticolumn || c.content.includes('\\textbf{'));
        if (isHeaderRow) rowClasses.push('table-header-row');

        const classAttr = rowClasses.length ? ` class="${rowClasses.join(' ')}"` : '';
        html += `<tr${classAttr}>`;

        for (const cell of row.cells) {
          let cellClasses = [];
          if (cell.isMulticolumn) cellClasses.push('multicolumn-cell');
          if (cell.hasClineTop) cellClasses.push('border-cline-top');

          let formatted = cell.content;
          formatted = formatted.replace(/\\textbf\{([^{}]+)\}/g, '<strong>$1</strong>');
          formatted = formatted.replace(/\\textbf\{([^{}]+)\}/g, '<strong>$1</strong>');
          formatted = formatted.replace(/\\mathbf\{([^{}]+)\}/g, '<strong>$1</strong>');
          formatted = formatted.replace(/\\text\{([^{}]+)\}/g, '$1');
          formatted = formatted.replace(/\\text\{([^{}]+)\}/g, '$1');
          formatted = formatted.replace(/\\qquad/g, '&emsp;&emsp;');
          formatted = formatted.replace(/\\quad/g, '&emsp;');
          formatted = formatted.replace(/\\&/g, '&amp;');
          formatted = formatted.replace(/\\\$/g, '$');
          formatted = formatted.replace(/\\%/g, '%');
          if (formatted === '—' || formatted === '--') formatted = '—';

          // Render any embedded math constructs using KaTeX if available
          if (/\\frac|\\sqrt|\\sum|\\prod|_|\^/.test(formatted) && typeof window !== 'undefined' && window.katex && typeof window.katex.renderToString === 'function') {
            try {
              formatted = window.katex.renderToString(formatted, { throwOnError: false, displayMode: false, macros: this.katexMacros });
            } catch (e) {}
          }

          const isNumeric = /^[\$£€\(\)\d\.,\s\-\+—]+$/.test(formatted.trim()) && /\d/.test(formatted);
          if (isNumeric) cellClasses.push('cell-numeric');
          else cellClasses.push('cell-text');

          let style = `text-align: ${cell.align};`;
          if (cell.hasRightBorder) style += ' border-right: 1px solid var(--background-modifier-border, rgba(255,255,255,0.18));';

          const colspanAttr = cell.colspan > 1 ? ` colspan="${cell.colspan}"` : '';
          const cellClassAttr = cellClasses.length ? ` class="${cellClasses.join(' ')}"` : '';

          html += `<td${colspanAttr}${cellClassAttr} style="${style}">${formatted}</td>`;
        }

        html += '</tr>';
      }

      html += '</tbody></table></div>';
      return html;
    }

    /**
     * Marks MathJax as failed (e.g., CDN blocked, network down, or script error).
     * Triggers human-readable fallback across any pending MathJax placeholders.
     */
    onMathJaxFailed(reason = 'MathJax script unavailable') {
      this.mathJaxState = 'failed';
      this.mathJaxFailureReason = reason;
      this.handleMathJaxFailure(document);
    }

    onMathJaxLoaded() {
      this.mathJaxState = 'ready';
      this.mathJaxFailureReason = null;
    }

    /**
     * Generates a readable fallback UI card or inline badge for formulas when MathJax fails.
     */
    createReadableFallbackHtml(source, displayMode = false, mathId = '') {
      const cleanSource = this.escapeHtml(source);
      if (displayMode) {
        return `
          <div class="math math-block math-mathjax math-engine-fallback" id="${mathId}" data-math-engine="mathjax" data-math-status="fallback">
            <div class="math-fallback-banner">
              <span class="math-fallback-icon" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                </svg>
              </span>
              <span class="math-fallback-label">LaTeX Formula (Fallback Mode)</span>
            </div>
            <pre class="math-fallback-code"><code>${cleanSource}</code></pre>
          </div>
        `.trim();
      } else {
        return `<span class="math math-inline math-mathjax math-engine-fallback" id="${mathId}" data-math-engine="mathjax" data-math-status="fallback" title="Math source: ${cleanSource}"><code class="math-inline-fallback">${cleanSource}</code></span>`;
      }
    }

    /**
     * Renders a placeholder for MathJax typesetting.
     * If MathJax is confirmed failed, outputs the readable fallback immediately.
     */
    renderMathJaxPlaceholder(formula, displayMode, mathId) {
      this.metrics.mathJaxCount++;
      const source = this.prepareFormulaSource(formula);
      
      const isFailed = (this.mathJaxState === 'failed') || 
                       (typeof window !== 'undefined' && window.__MATHJAX_FAILED__ === true);

      if (isFailed) {
        this.metrics.fallbackCount++;
        return this.createReadableFallbackHtml(source, displayMode, mathId);
      }

      const delimiter = displayMode ? ['\\[', '\\]'] : ['\\(', '\\)'];
      const encoded = this.escapeHtml(`${delimiter[0]}${source}${delimiter[1]}`);
      const tag = displayMode ? 'div' : 'span';

      return `<${tag} class="math math-${displayMode ? 'block' : 'inline'} math-mathjax" id="${mathId}" data-math-engine="mathjax" data-math-raw="${this.escapeHtml(source)}" data-display-mode="${displayMode ? 'block' : 'inline'}">${encoded}</${tag}>`;
    }

    /**
     * Core hybrid expression renderer:
     * 1. Routes advanced tabular schedules with \multicolumn and \cline to renderLatexTable.
     * 2. Routes AMS constructs (\renewcommand, aligned, gathered, etc.) to MathJax.
     * 3. Attempts KaTeX for standard formulas.
     * 4. On any KaTeX parse error, falls back to MathJax preserving the complete original source.
     */
    renderExpression(formula, displayMode = false) {
      if (!formula) return '';
      const source = this.prepareFormulaSource(formula);
      if (!source) return '';

      const mathId = `math-${displayMode ? 'block' : 'inline'}-${++this.mathTokenIdx}`;

      // 0. Dedicated LaTeX Table & Tabular Schedule Engine
      if (this.isLatexTable(source)) {
        this.metrics.mathJaxCount++;
        return this.renderLatexTable(source, mathId);
      }

      // 1. Direct routing to MathJax for advanced AMS constructs
      if (this.requiresMathJax(source)) {
        return this.renderMathJaxPlaceholder(source, displayMode, mathId);
      }

      // 2. Default KaTeX renderer path
      if (typeof window !== 'undefined' && window.katex && typeof window.katex.renderToString === 'function') {
        try {
          const renderedKatex = window.katex.renderToString(source, {
            displayMode: displayMode,
            throwOnError: true, // Throw so unsupported syntax falls back cleanly to MathJax!
            errorColor: '#d08770',
            output: 'htmlAndMathml',
            trust: true,
            strict: false,
            maxExpand: 1000,
            macros: this.katexMacros
          });

          this.metrics.katexCount++;
          const wrapper = displayMode ? 'div' : 'span';
          return `<${wrapper} class="math math-${displayMode ? 'block' : 'inline'} math-katex" id="${mathId}">${renderedKatex}</${wrapper}>`;
        } catch (katexErr) {
          // 3. KaTeX could not render this formula -> Fallback to MathJax with preserved source!
          return this.renderMathJaxPlaceholder(source, displayMode, mathId);
        }
      }

      // If KaTeX is not loaded in environment, route to MathJax
      return this.renderMathJaxPlaceholder(source, displayMode, mathId);
    }

    /**
     * Scans and updates any unrendered MathJax elements with readable fallbacks.
     */
    handleMathJaxFailure(root = document) {
      const container = root.querySelector ? root : document;
      if (!container || !container.querySelectorAll) return;

      const unrendered = container.querySelectorAll('.math-mathjax:not([data-mathjax-rendered="true"])');
      unrendered.forEach(el => {
        const raw = el.getAttribute('data-math-raw') || el.textContent.replace(/^\\\[|\\\]$|^\\\(|\\\)$/g, '').trim();
        const isDisplay = el.getAttribute('data-display-mode') === 'block' || el.tagName.toLowerCase() === 'div' || el.classList.contains('math-block');
        const fallback = document.createElement(isDisplay ? 'div' : 'span');
        fallback.className = `math math-${isDisplay ? 'block' : 'inline'} math-mathjax math-engine-fallback`;
        fallback.setAttribute('data-math-engine', 'mathjax');
        fallback.setAttribute('data-math-status', 'fallback');
        
        if (isDisplay) {
          fallback.innerHTML = `
            <div class="math-fallback-banner">
              <span class="math-fallback-icon">📐</span>
              <span class="math-fallback-label">LaTeX Formula (Offline Fallback)</span>
            </div>
            <pre class="math-fallback-code"><code>${this.escapeHtml(raw)}</code></pre>
          `;
        } else {
          fallback.innerHTML = `<code class="math-inline-fallback">${this.escapeHtml(raw)}</code>`;
          fallback.title = `LaTeX: ${raw}`;
        }

        el.replaceWith(fallback);
      });
    }

    /**
     * Authentically extracts naked LaTeX environments while accounting for nesting.
     */
    extractNakedEnvironments(text) {
      let result = '';
      let i = 0;
      
      while (i < text.length) {
        const beginMatch = text.indexOf('\\begin{', i);
        if (beginMatch === -1) {
          result += text.slice(i);
          break;
        }
        
        result += text.slice(i, beginMatch);
        i = beginMatch;

        const envStart = beginMatch + 7;
        const envEnd = text.indexOf('}', envStart);
        if (envEnd === -1) {
          result += text[i];
          i++;
          continue;
        }
        
        const envName = text.slice(envStart, envEnd);
        const endTag = `\\end{${envName}}`;
        
        let depth = 1;
        let searchPos = envEnd + 1;
        let foundEnd = false;
        
        while (searchPos < text.length) {
          const nextBegin = text.indexOf(`\\begin{${envName}}`, searchPos);
          const nextEnd = text.indexOf(endTag, searchPos);
          
          if (nextEnd === -1) break;
          
          if (nextBegin !== -1 && nextBegin < nextEnd) {
            depth++;
            searchPos = nextBegin + `\\begin{${envName}}`.length;
          } else {
            depth--;
            searchPos = nextEnd + endTag.length;
            if (depth === 0) {
              foundEnd = true;
              break;
            }
          }
        }
        
        if (foundEnd) {
          const formula = text.slice(beginMatch, searchPos);
          const token = `@@KATEX_BLOCK_${++this.mathTokenIdx}@@`;
          this.currentBlocksMap.set(token, this.renderExpression(formula, true));
          result += `\n${token}\n`;
          i = searchPos;
        } else {
          result += text.slice(i, envEnd + 1);
          i = envEnd + 1;
        }
      }
      return result;
    }

    /**
     * Tokenizes Markdown text, shielding code blocks, inline code, and extracting formulas.
     */
    extractAndTokenize(rawText) {
      if (!rawText) return rawText;
      let text = rawText;

      const startTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;

      // 1. ISOLATE CODE BLOCKS (Protects fenced and inline code from math parsing)
      text = text.replace(/(^|\n)([ \t]*)```([\s\S]+?)\n[ \t]*```/g, (match) => {
        const token = `@@CODE_BLOCK_${++this.codeTokenIdx}@@`;
        this.currentCodeMap.set(token, match);
        return token;
      });
      text = text.replace(/`([^`\n]+)`/g, (match) => {
        const token = `@@CODE_INLINE_${++this.codeTokenIdx}@@`;
        this.currentCodeMap.set(token, match);
        return token;
      });

      // 2. EXTRACT DISPLAY MATH ($$ ... $$)
      text = text.replace(/(^|\n)([ \t]*)(?<!\\)\$\$([\s\S]*?)(?<!\\)\$\$/g, (match, prefix, indent, formula) => {
        if (/^\s*$/.test(formula)) return match;
        const token = `@@KATEX_BLOCK_${++this.mathTokenIdx}@@`;
        this.currentBlocksMap.set(token, this.renderExpression(formula, true));
        return `${prefix}\n${indent}${token}\n\n`;
      });

      // 3. EXTRACT LATEX DISPLAY BLOCKS (\[ ... \])
      text = text.replace(/(^|\n)([ \t]*)(?<!\\)\\\[([\s\S]*?)(?<!\\)\\\]/g, (match, prefix, indent, formula) => {
        if (/^\s*$/.test(formula)) return match;
        const token = `@@KATEX_BLOCK_${++this.mathTokenIdx}@@`;
        this.currentBlocksMap.set(token, this.renderExpression(formula, true));
        return `${prefix}\n${indent}${token}\n\n`;
      });

      // 4. EXTRACT NAKED ENVIRONMENTS (\begin{...} ... \end{...})
      text = this.extractNakedEnvironments(text);

      // 5. EXTRACT LATEX INLINE (\( ... \))
      text = text.replace(/(?<!\\)\\\(([\s\S]+?)(?<!\\)\\\)/g, (match, formula) => {
        const token = `@@KATEX_INLINE_${++this.mathTokenIdx}@@`;
        this.currentInlinesMap.set(token, this.renderExpression(formula, false));
        return token;
      });

      // 6. EXTRACT COMMONMARK $ ... $ (Protects standard currency like $100 and $200)
      text = text.replace(/(?<!\\|\$)\$(?!\s)((?:\\.|[^$\\\n])+?)(?<!\s)\$/g, (match, formula) => {
        const token = `@@KATEX_INLINE_${++this.mathTokenIdx}@@`;
        this.currentInlinesMap.set(token, this.renderExpression(formula, false));
        return token;
      });

      // 7. RESTORE SHIELDED CODE BLOCKS & INLINE CODE
      // Code was protected from math extraction, now restored so markdown parser renders authentic <pre><code>
      if (this.currentCodeMap.size > 0) {
        for (const [token, rawCode] of this.currentCodeMap.entries()) {
          text = text.replaceAll(token, () => rawCode);
        }
        this.currentCodeMap.clear();
      }

      if (startTime > 0) {
        this.metrics.lastRenderTimeMs = Math.round((performance.now() - startTime) * 10) / 10;
      }

      return text;
    }

    /**
     * Restores rendered math and code tokens into the generated HTML.
     */
    restoreTokens(html) {
      if (!html) return html;
      
      // 1. Restore Math Blocks
      if (this.currentBlocksMap.size > 0) {
        for (const [token, renderedMath] of this.currentBlocksMap.entries()) {
          const pRegex = new RegExp(`<p>\\s*${token}\\s*<\\/p>`, 'g');
          if (pRegex.test(html)) {
            html = html.replace(pRegex, () => renderedMath);
          } else {
            html = html.replaceAll(token, () => renderedMath);
          }
        }
      }
      
      // 2. Restore Math Inlines
      if (this.currentInlinesMap.size > 0) {
        for (const [token, renderedMath] of this.currentInlinesMap.entries()) {
          html = html.replaceAll(token, () => renderedMath);
        }
      }

      // 3. Restore Code Blocks last (Pristine code untouched by math parsing)
      if (this.currentCodeMap.size > 0) {
        for (const [token, rawCode] of this.currentCodeMap.entries()) {
          html = html.replaceAll(token, () => rawCode);
        }
      }

      return html;
    }

    /**
     * Provides diagnostic summary metrics without exposing raw user formulas.
     */
    getDiagnostics() {
      return {
        katexRendered: this.metrics.katexCount,
        mathJaxQueued: this.metrics.mathJaxCount,
        fallbacksActive: this.metrics.fallbackCount,
        mathJaxStatus: this.mathJaxState,
        renderTimeMs: this.metrics.lastRenderTimeMs
      };
    }
  }

  const instance = new ObsidianMathRenderer();
  window.ObsidianMathRenderer = instance;
})();