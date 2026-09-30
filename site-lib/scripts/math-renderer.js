/**
 * ============================================================================
 * Obsidian Dedicated Math & LaTeX Engine (math-renderer.js)
 * Supports KaTeX rendering, inline math ($...$), block math ($$...$$),
 * LaTeX environments (\begin{...}...\end{...}), chemistry formulas (\ce{...}),
 * and accounting multi-column/cline schedules.
 * ============================================================================
 */

(function() {
  'use strict';

  class ObsidianMathRenderer {
    constructor() {
      this.mathTokenIdx = 0;
      this.mathIdCounter = 0;
      this.currentBlocksMap = new Map();
      this.currentInlinesMap = new Map();
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
        "\\cline": "\\hline",
        "\\c": "\\hline",
        "\\mc": "\\multicolumn",
        "\\mr": "\\multirow",
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
      this.mathTokenIdx = 0;
      this.mathIdCounter = 0;
      this.currentBlocksMap = new Map();
      this.currentInlinesMap = new Map();
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

    extractBalanced(str, startIndex) {
      if (str[startIndex] !== '{') return null;
      let depth = 0;
      for (let i = startIndex; i < str.length; i++) {
        if (str[i] === '{') depth++;
        else if (str[i] === '}') {
          depth--;
          if (depth === 0) return { content: str.slice(startIndex + 1, i), endIndex: i };
        }
      }
      return null;
    }

    preprocessMulticolumn(latex) {
      let result = '';
      let i = 0;
      while (i < latex.length) {
        if (latex.startsWith('\\multicolumn', i) || latex.startsWith('\\mc', i)) {
          const isMc = latex.startsWith('\\mc', i) && !latex.startsWith('\\multicolumn', i);
          const cmdLen = isMc ? 3 : 12;
          let pos = i + cmdLen;
          while (pos < latex.length && /\s/.test(latex[pos])) pos++;
          const g1 = this.extractBalanced(latex, pos);
          if (g1) {
            pos = g1.endIndex + 1;
            while (pos < latex.length && /\s/.test(latex[pos])) pos++;
            const g2 = this.extractBalanced(latex, pos);
            if (g2) {
              pos = g2.endIndex + 1;
              while (pos < latex.length && /\s/.test(latex[pos])) pos++;
              const g3 = this.extractBalanced(latex, pos);
              if (g3) {
                const span = parseInt(g1.content, 10) || 1;
                const content = g3.content;
                result += content;
                if (span > 1) {
                  result += ' &'.repeat(span - 1);
                }
                i = g3.endIndex + 1;
                continue;
              }
            }
          }
        }
        result += latex[i];
        i++;
      }
      return result;
    }

    renderExpression(formula, displayMode = false) {
      if (!formula) return '';
      let clean = formula.trim();
      if (!clean) return '';

      // Clean leading blockquote markers if inside callout
      clean = clean.replace(/^[ \t]*>+[ \t]*/gm, '');

      clean = clean.replace(/&#36;/g, '\\$');
      clean = clean.replace(/\\hat\{[ \t]*(?:eta|beta)\}/g, '\\hat{\\beta}');
      clean = clean.replace(/\\hat\{[ \t]*(?:lpha|alpha)\}/g, '\\hat{\\alpha}');
      clean = clean.replace(/\\hat\{[ \t]*(?:sigma)\}/g, '\\hat{\\sigma}');
      clean = clean.replace(/(^|[^\\a-zA-Z])(?:lpha)\b/g, '$1\\alpha');
      clean = clean.replace(/(^|[^\\a-zA-Z])(?:eta)\b/g, '$1\\beta');
      clean = clean.replace(/(^|[^\\a-zA-Z])(?:heta)\b/g, '$1\\theta');

      // Preprocess \cline to \hline for KaTeX
      clean = clean.replace(/\\cline\s*\{?\s*\d+\s*-\s*\d+\s*\}?/g, '\\hline');

      // Strip or neutralize \renewcommand macros
      clean = clean.replace(/\\renewcommand\{[^}]+\}\{[^}]+\}/g, '');

      // Preprocess \multicolumn to span columns in array
      if (clean.includes('\\multicolumn') || clean.includes('\\mc')) {
        clean = this.preprocessMulticolumn(clean);
      }

      const mathId = `math-${displayMode ? 'block' : 'inline'}-${this.mathIdCounter++}`;

      let renderedKatex = '';
      try {
        if (window.katex && typeof window.katex.renderToString === 'function') {
          renderedKatex = window.katex.renderToString(clean, {
            displayMode: displayMode,
            throwOnError: false,
            errorColor: '#cc0000',
            output: 'htmlAndMathml',
            trust: true,
            strict: false,
            macros: {
              ...this.katexMacros,
              "\\cline": "\\hline"
            }
          });
        } else {
          renderedKatex = displayMode ? `$$${clean}$$` : `$${clean}$`;
        }
      } catch (err) {
        console.warn('KaTeX render warning:', err);
        renderedKatex = `<span class="math-fallback">${this.escapeHtml(clean)}</span>`;
      }

      if (displayMode) {
        return `<div class="math math-block" id="${mathId}">${renderedKatex}</div>`;
      } else {
        return `<span class="math math-inline" id="${mathId}">${renderedKatex}</span>`;
      }
    }

    extractAndTokenize(text) {
      if (!text) return text;

      // 0. Protect escaped dollar signs and currency amounts before any math parsing
      text = text.replace(/\\(\$)/g, '&#36;');
      text = text.replace(/(?<![\$\w\\])\$(?=\s*\d)(?:\s*)(\d[\d,]*(?:\.\d+)?(?:\s*(?:million|billion|trillion|thousand|USD|EUR|GBP|k|m|b))?(?:\/(?:share|unit|hour|day|month|year|item|kg|lb))?)(?!\$|[a-zA-Z0-9_\^])/gi, '&#36;$1');

      // 1. Process line by line: Tables, inline $$ on continuous lines, and syntax heals
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // 1a. Math inside table rows (lines containing |): NEVER insert newlines!
        if (line.includes('|')) {
          // Double dollar math inside table cells -> render as inline math token
          line = line.replace(/\$\$([^\$\n\r]+?)\$\$/g, (match, formula) => {
            const cleanFormula = formula.trim();
            const token = `@@KATEX_INLINE_${this.mathTokenIdx++}@@`;
            const html = this.renderExpression(cleanFormula, false);
            this.currentInlinesMap.set(token, html);
            return token;
          });
          // Single dollar math inside table cells -> render as inline math token
          line = line.replace(/(?<![\$\w\\])\$(?!\s)((?:\\\$|[^\$\n\r])+?)(?<!\s|\\)\$(?!\d)/g, (match, formula) => {
            const trimmed = formula.trim();
            if (!trimmed || /\b(?:shares?|company|corporation|issued|authorized|dividend|par|value|cost|price|exchange|traded|sold|purchased|received|interest|note|statement|balance|total|equity|cash|allowance|receivable|payable|income|expense|revenue|amortization|method|ordinary|preference|transaction|discount|terms|gross|net|bankrupt|account|carrying|asset|liability|the|and|for|with|from|after|before|during|approximately|totaling|merchandise|recorded|prepare)\b/i.test(trimmed)) {
              return match;
            }
            const token = `@@KATEX_INLINE_${this.mathTokenIdx++}@@`;
            const html = this.renderExpression(trimmed, false);
            this.currentInlinesMap.set(token, html);
            return token;
          });
          lines[i] = line;
          continue;
        }

        // 1b. Inline $$...$$ on continuous text lines (e.g. within list items or with punctuation)
        if (line.includes('$$')) {
          const isStandaloneBlock = /^[ \t]*(?:>+[ \t]*)?\$\$[\s\S]*?\$\$[ \t]*$/.test(line);
          if (!isStandaloneBlock) {
            line = line.replace(/\$\$((?:\\\$|[^\$\n\r])+?)\$\$/g, (match, formula) => {
              const cleanFormula = formula.trim();
              const token = `@@KATEX_INLINE_${this.mathTokenIdx++}@@`;
              const html = this.renderExpression(cleanFormula, false);
              this.currentInlinesMap.set(token, html);
              return token;
            });
          }
        }

        lines[i] = line;
      }
      text = lines.join('\n');

      // 2. Block math: $$ ... $$ (standalone multi-line or block math outside tables)
      text = text.replace(/(^|\n)([ \t]*)(?<!\\)\$\$([\s\S]*?)(?<!\\)\$\$/g, (match, prefix, indent, formula) => {
        if (/^\s*$/.test(formula) || /\n\s*#{1,6}\s+[^\n]+/.test(formula)) return match;
        const cleanFormula = formula.replace(/^[ \t]*>+[ \t]*/gm, '').trim();
        const token = `@@KATEX_BLOCK_${this.mathTokenIdx++}@@`;
        const html = this.renderExpression(cleanFormula, true);
        this.currentBlocksMap.set(token, html);
        return `${prefix}\n${indent}${token}\n\n`;
      });

      // 3. LaTeX environments: \begin{...} ... \end{...}
      text = text.replace(/(^|\n)([ \t]*)(?<!\\)\\begin\{([a-zA-Z0-9*]+)\}([\s\S]*?)\\end\{\3\}/g, (match, prefix, indent, env, body) => {
        const full = `\\begin{${env}}${body}\\end{${env}}`;
        const cleanFormula = full.replace(/^[ \t]*>+[ \t]*/gm, '').trim();
        const token = `@@KATEX_BLOCK_${this.mathTokenIdx++}@@`;
        const html = this.renderExpression(cleanFormula, true);
        this.currentBlocksMap.set(token, html);
        return `${prefix}\n${indent}${token}\n\n`;
      });

      // 4. Inline math: $ ... $ (Obsidian / CommonMark math spec)
      text = text.replace(/(?<![\$\w\\])\$(?!\s)((?:\\\$|[^\$\n\r])+?)(?<!\s|\\)\$(?!\d)/g, (match, formula) => {
        const trimmed = formula.trim();
        if (!trimmed || /\b(?:shares?|company|corporation|issued|authorized|dividend|par|value|cost|price|exchange|traded|sold|purchased|received|interest|note|statement|balance|total|equity|cash|allowance|receivable|payable|income|expense|revenue|amortization|method|ordinary|preference|transaction|discount|terms|gross|net|bankrupt|account|carrying|asset|liability|the|and|for|with|from|after|before|during|approximately|totaling|merchandise|recorded|prepare)\b/i.test(trimmed)) {
          return match;
        }
        const token = `@@KATEX_INLINE_${this.mathTokenIdx++}@@`;
        const html = this.renderExpression(trimmed, false);
        this.currentInlinesMap.set(token, html);
        return token;
      });

      return text;
    }

    restoreTokens(html) {
      if (!html) return html;
      if (this.currentBlocksMap && this.currentBlocksMap.size > 0) {
        for (const [token, renderedMath] of this.currentBlocksMap.entries()) {
          const pRegex = new RegExp(`<p>\\s*${token}\\s*<\\/p>`, 'g');
          if (pRegex.test(html)) html = html.replace(pRegex, () => renderedMath);
          else html = html.replaceAll(token, () => renderedMath);
        }
      }
      if (this.currentInlinesMap && this.currentInlinesMap.size > 0) {
        for (const [token, renderedMath] of this.currentInlinesMap.entries()) {
          html = html.replaceAll(token, () => renderedMath);
        }
      }
      return html;
    }
  }

  window.ObsidianMathRenderer = new ObsidianMathRenderer();
})();
