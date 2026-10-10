/**
 * ============================================================================
 * Obsidian Dedicated Math & LaTeX Engine (math-renderer.js)
 * ============================================================================
 * Resilient KaTeX rendering with syntax healing, unpaired delimiter recovery,
 * timeout safeguards, accounting table/multicolumn preprocessing, and
 * error isolation boundaries to prevent rendering freezes.
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

    /**
     * Auto-heals and sanitizes raw LaTeX formula strings before KaTeX parsing:
     * - Fixes unescaped percent symbols ($2.0%$ => $2.0\%$)
     * - Auto-closes unclosed environments (\begin{array} without \end{array})
     * - Converts \cline to \hline
     * - Repairs missing backslashes on Greek letters
     * - Strips dangerous or unsupported macro definitions
     */
    sanitizeFormula(formula) {
      if (!formula) return '';
      let clean = formula.trim();

      // Clean leading blockquote markers if inside callout
      clean = clean.replace(/^[ \t]*>+[ \t]*/gm, '');

      // Unescape entity dollars
      clean = clean.replace(/&#36;/g, '\\$');

      // Repair damaged Greek variables and accents
      clean = clean.replace(/\\hat\{[ \t]*(?:eta|beta)\}/g, '\\hat{\\beta}');
      clean = clean.replace(/\\hat\{[ \t]*(?:lpha|alpha)\}/g, '\\hat{\\alpha}');
      clean = clean.replace(/\\hat\{[ \t]*(?:sigma)\}/g, '\\hat{\\sigma}');
      clean = clean.replace(/(^|[^\\a-zA-Z])(?:lpha)\b/g, '$1\\alpha');
      clean = clean.replace(/(^|[^\\a-zA-Z])(?:eta)\b/g, '$1\\beta');
      clean = clean.replace(/(^|[^\\a-zA-Z])(?:heta)\b/g, '$1\\theta');

      // Preprocess \cline to \hline for KaTeX
      clean = clean.replace(/\\cline\s*\{?\s*\d+\s*-\s*\d+\s*\}?/g, '\\hline');

      // Strip \renewcommand or \def macros that could cause recursion
      clean = clean.replace(/\\renewcommand\{[^}]+\}\{[^}]*\}/g, '');
      clean = clean.replace(/\\def\\[a-zA-Z]+\{[^}]*\}/g, '');

      // Escape raw percent signs (e.g., 2.0% => 2.0\%) so KaTeX doesn't treat as comment
      clean = clean.replace(/(?<!\\)%/g, '\\%');

      // Auto-heal unclosed LaTeX environments
      const envMatches = Array.from(clean.matchAll(/\\begin\{([a-zA-Z0-9*]+)\}/g));
      const closedEnvMatches = Array.from(clean.matchAll(/\\end\{([a-zA-Z0-9*]+)\}/g));
      const openEnvs = envMatches.map(m => m[1]);
      const closedEnvs = closedEnvMatches.map(m => m[1]);

      for (let j = openEnvs.length - 1; j >= 0; j--) {
        const env = openEnvs[j];
        const matchIdx = closedEnvs.indexOf(env);
        if (matchIdx !== -1) {
          closedEnvs.splice(matchIdx, 1);
        } else {
          // Missing closing tag, automatically append
          clean += `\n\\end{${env}}`;
        }
      }

      // Preprocess \multicolumn to span columns in array
      if (clean.includes('\\multicolumn') || clean.includes('\\mc')) {
        clean = this.preprocessMulticolumn(clean);
      }

      return clean;
    }

    /**
     * Safe KaTeX render executor with error isolation and timeout protection.
     */
    renderExpression(formula, displayMode = false) {
      if (!formula) return '';
      const clean = this.sanitizeFormula(formula);
      if (!clean) return '';

      const mathId = `math-${displayMode ? 'block' : 'inline'}-${this.mathIdCounter++}`;
      let renderedKatex = '';
      let hasError = false;

      try {
        if (window.katex && typeof window.katex.renderToString === 'function') {
          // Render with defensive configuration
          renderedKatex = window.katex.renderToString(clean, {
            displayMode: displayMode,
            throwOnError: false,
            errorColor: '#d08770',
            output: 'htmlAndMathml',
            trust: true,
            strict: false,
            maxExpand: 1000,
            macros: {
              ...this.katexMacros,
              "\\cline": "\\hline"
            }
          });
        } else {
          renderedKatex = displayMode ? `$$${this.escapeHtml(clean)}$$` : `$${this.escapeHtml(clean)}$`;
        }
      } catch (err) {
        console.warn('KaTeX safe fallback triggered:', err);
        hasError = true;
        renderedKatex = `<span class="math-fallback" title="KaTeX parse warning: ${this.escapeHtml(err.message || 'Syntax error')}">${this.escapeHtml(clean)}</span>`;
      }

      if (displayMode) {
        return `<div class="math math-block${hasError ? ' math-has-error' : ''}" id="${mathId}">${renderedKatex}</div>`;
      } else {
        return `<span class="math math-inline${hasError ? ' math-has-error' : ''}" id="${mathId}">${renderedKatex}</span>`;
      }
    }

    /**
     * Repairs and normalizes document text to prevent unbalanced display math
     * delimiters ($$) from swallowing paragraphs or causing infinite scans.
     */
    healDocumentMathDelimiters(text) {
      if (!text || !text.includes('$$')) return text;

      const lines = text.split('\n');
      let inBlockMath = false;
      let blockStartLine = -1;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // 1. Detect structural break boundaries (Headings, Horizontal Rules)
        const isHeader = /^#{1,6}\s+/.test(trimmed);
        const isHr = /^(?:---|\*\*\*|___)\s*$/.test(trimmed);

        if (inBlockMath && (isHeader || isHr)) {
          // Unclosed $$ encountered a heading or HR!
          // Heal by closing the unclosed $$ right before this line
          lines[i - 1] = (lines[i - 1] || '') + '\n$$';
          inBlockMath = false;
          blockStartLine = -1;
        }

        // Count unescaped $$ occurrences on this line
        const matches = line.match(/(?<!\\)\$\$/g);
        if (!matches) continue;

        const count = matches.length;
        if (count % 2 === 1) {
          // Odd number of $$ on this line toggles block math state
          if (inBlockMath) {
            inBlockMath = false;
            blockStartLine = -1;
          } else {
            inBlockMath = true;
            blockStartLine = i;
          }
        }
      }

      // If document ended while still in an unclosed block math, heal at the end
      if (inBlockMath && blockStartLine !== -1) {
        lines.push('$$');
      }

      return lines.join('\n');
    }

    extractAndTokenize(rawText) {
      if (!rawText) return rawText;

      // 0. Protect escaped dollar signs and currency amounts before any math parsing
      let text = rawText.replace(/\\(\$)/g, '&#36;');
      text = text.replace(/(?<![\$\w\\])\$(?=\s*\d)(?:\s*)(\d[\d,]*(?:\.\d+)?(?:\s*(?:million|billion|trillion|thousand|USD|EUR|GBP|k|m|b))?(?:\/(?:share|unit|hour|day|month|year|item|kg|lb))?)(?!\$|[a-zA-Z0-9_\^])/gi, '&#36;$1');

      // 1. Apply structural delimiter healing to guarantee balanced $$
      text = this.healDocumentMathDelimiters(text);

      // 2. Process line by line: Tables and inline $$ on continuous lines
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // 2a. Math inside table rows (lines containing |): NEVER insert newlines!
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

        // 2b. Inline $$...$$ on continuous text lines (e.g. within list items or with punctuation)
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

      // 3. Block math: $$ ... $$ (standalone multi-line or block math outside tables)
      // Guarded so it cannot match across headings or section breaks
      text = text.replace(/(^|\n)([ \t]*)(?<!\\)\$\$([\s\S]*?)(?<!\\)\$\$/g, (match, prefix, indent, formula) => {
        if (/^\s*$/.test(formula) || /\n\s*#{1,6}\s+[^\n]+/.test(formula)) return match;
        const cleanFormula = formula.replace(/^[ \t]*>+[ \t]*/gm, '').trim();
        const token = `@@KATEX_BLOCK_${this.mathTokenIdx++}@@`;
        const html = this.renderExpression(cleanFormula, true);
        this.currentBlocksMap.set(token, html);
        return `${prefix}\n${indent}${token}\n\n`;
      });

      // 4. LaTeX environments: \begin{...} ... \end{...}
      text = text.replace(/(^|\n)([ \t]*)(?<!\\)\\begin\{([a-zA-Z0-9*]+)\}([\s\S]*?)\\end\{\3\}/g, (match, prefix, indent, env, body) => {
        const full = `\\begin{${env}}${body}\\end{${env}}`;
        const cleanFormula = full.replace(/^[ \t]*>+[ \t]*/gm, '').trim();
        const token = `@@KATEX_BLOCK_${this.mathTokenIdx++}@@`;
        const html = this.renderExpression(cleanFormula, true);
        this.currentBlocksMap.set(token, html);
        return `${prefix}\n${indent}${token}\n\n`;
      });

      // 5. Inline math: $ ... $ (Obsidian / CommonMark math spec)
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
