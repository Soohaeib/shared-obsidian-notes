/**
 * ============================================================================
 * Obsidian Dedicated Math & LaTeX Engine (math-renderer.js)
 * ============================================================================
 * An authentic, native KaTeX rendering pipeline for Obsidian-like Markdown.
 * Correctly isolates code blocks, supports standard delimiters ($$, $, \[\], \(\)),
 * authentically parses nested environments, allows LaTeX comments (%), 
 * and preserves custom macros (\def, \newcommand) natively.
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
      
      // Preserved user's custom macros for convenience, avoiding hacky syntax overrides.
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
      this.mathTokenIdx = 0;
      this.codeTokenIdx = 0;
      this.currentBlocksMap.clear();
      this.currentInlinesMap.clear();
      this.currentCodeMap.clear();
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
     * Prepares formula for KaTeX parsing without mutating structural LaTeX syntax.
     */
    sanitizeFormula(formula) {
      if (!formula) return '';
      let clean = formula.trim();

      // Clean leading blockquote markers if math is inside a markdown callout (e.g., "> $$")
      clean = clean.replace(/^[ \t]*>+[ \t]*/gm, '');

      // Unescape HTML entities manually injected by some markdown platforms
      clean = clean.replace(/&#36;/g, '\\$');
      
      // Auto-heal common Greek letter typos safely (User requested preservation)
      clean = clean.replace(/\\hat\{[ \t]*(?:eta|beta)\}/g, '\\hat{\\beta}');
      clean = clean.replace(/\\hat\{[ \t]*(?:lpha|alpha)\}/g, '\\hat{\\alpha}');
      clean = clean.replace(/\\hat\{[ \t]*(?:sigma)\}/g, '\\hat{\\sigma}');

      return clean;
    }

    renderExpression(formula, displayMode = false) {
      if (!formula) return '';
      const clean = this.sanitizeFormula(formula);
      if (!clean) return '';

      const mathId = `math-${displayMode ? 'block' : 'inline'}-${this.mathTokenIdx}`;
      let renderedKatex = '';
      let hasError = false;

      try {
        if (window.katex && typeof window.katex.renderToString === 'function') {
          renderedKatex = window.katex.renderToString(clean, {
            displayMode: displayMode,
            throwOnError: false,
            errorColor: '#d08770',
            output: 'htmlAndMathml',
            trust: true, // Crucial for \newcommand, \def to work natively
            strict: false,
            maxExpand: 1000,
            macros: this.katexMacros
          });
        } else {
          // Fallback if KaTeX is missing
          renderedKatex = displayMode ? `$$${this.escapeHtml(clean)}$$` : `$${this.escapeHtml(clean)}$`;
        }
      } catch (err) {
        console.warn('KaTeX safe fallback triggered:', err);
        hasError = true;
        renderedKatex = `<span class="math-fallback" title="KaTeX parse warning: ${this.escapeHtml(err.message || 'Syntax error')}">${this.escapeHtml(clean)}</span>`;
      }

      const wrapper = displayMode ? 'div' : 'span';
      return `<${wrapper} class="math math-${displayMode ? 'block' : 'inline'}${hasError ? ' math-has-error' : ''}" id="${mathId}">${renderedKatex}</${wrapper}>`;
    }

    /**
     * Authentically extracts naked LaTeX environments while accounting for nesting.
     * Prevents the "Greedy Regex" bug where nested \begin{array} breaks the parser.
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
          
          if (nextEnd === -1) break; // Unclosed syntax error
          
          if (nextBegin !== -1 && nextBegin < nextEnd) {
            // Nested environment of the same type found
            depth++;
            searchPos = nextBegin + `\\begin{${envName}}`.length;
          } else {
            // End tag found
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
          const token = `@@KATEX_BLOCK_${this.mathTokenIdx++}@@`;
          this.currentBlocksMap.set(token, this.renderExpression(formula, true));
          result += `\n${token}\n`;
          i = searchPos;
        } else {
          // If unclosed, leave as text to prevent infinite loops
          result += text.slice(i, envEnd + 1);
          i = envEnd + 1;
        }
      }
      return result;
    }

    extractAndTokenize(rawText) {
      if (!rawText) return rawText;
      let text = rawText;

      this.reset();

      // ====================================================================
      // 1. ISOLATE CODE BLOCKS 
      // Protects backticks so equations inside code blocks are bypassed
      // ====================================================================
      text = text.replace(/(^|\n)([ \t]*)```([\s\S]+?)\n[ \t]*```/g, (match) => {
        const token = `@@CODE_BLOCK_${this.codeTokenIdx++}@@`;
        this.currentCodeMap.set(token, match);
        return token;
      });
      text = text.replace(/`([^`\n]+)`/g, (match) => {
        const token = `@@CODE_INLINE_${this.codeTokenIdx++}@@`;
        this.currentCodeMap.set(token, match);
        return token;
      });

      // ====================================================================
      // 2. EXTRACT BLOCK MATH
      // ====================================================================
      
      // Extract standard $$ ... $$
      text = text.replace(/(^|\n)([ \t]*)(?<!\\)\$\$([\s\S]*?)(?<!\\)\$\$/g, (match, prefix, indent, formula) => {
        if (/^\s*$/.test(formula)) return match;
        const token = `@@KATEX_BLOCK_${this.mathTokenIdx++}@@`;
        this.currentBlocksMap.set(token, this.renderExpression(formula, true));
        return `${prefix}\n${indent}${token}\n\n`;
      });

      // Extract standard LaTeX block \[ ... \]
      text = text.replace(/(^|\n)([ \t]*)(?<!\\)\\\[([\s\S]*?)(?<!\\)\\\]/g, (match, prefix, indent, formula) => {
        if (/^\s*$/.test(formula)) return match;
        const token = `@@KATEX_BLOCK_${this.mathTokenIdx++}@@`;
        this.currentBlocksMap.set(token, this.renderExpression(formula, true));
        return `${prefix}\n${indent}${token}\n\n`;
      });

      // Safely extract naked \begin{env} ... \end{env}
      text = this.extractNakedEnvironments(text);

      // ====================================================================
      // 3. EXTRACT INLINE MATH
      // ====================================================================
      
      // Extract standard LaTeX inline \( ... \)
      text = text.replace(/(?<!\\)\\\(([\s\S]+?)(?<!\\)\\\)/g, (match, formula) => {
        const token = `@@KATEX_INLINE_${this.mathTokenIdx++}@@`;
        this.currentInlinesMap.set(token, this.renderExpression(formula, false));
        return token;
      });

      // Extract CommonMark compliant $ ... $ 
      // Rule: Opening $ not followed by space. Closing $ not preceded by space.
      // This intrinsically protects standard financing like "$100 and $200".
      text = text.replace(/(?<!\\|\$)\$(?!\s)([^$\n]+?)(?<!\s)\$/g, (match, formula) => {
        const token = `@@KATEX_INLINE_${this.mathTokenIdx++}@@`;
        this.currentInlinesMap.set(token, this.renderExpression(formula, false));
        return token;
      });

      return text;
    }

    restoreTokens(html) {
      if (!html) return html;
      
      // 1. Restore Math Blocks
      if (this.currentBlocksMap.size > 0) {
        for (const [token, renderedMath] of this.currentBlocksMap.entries()) {
          // Un-wrap <p> tags if the Markdown parser wrapped the standalone block
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

      // 3. Restore Code Blocks last (Safe from math replacements!)
      if (this.currentCodeMap.size > 0) {
        for (const [token, rawCode] of this.currentCodeMap.entries()) {
          html = html.replaceAll(token, () => rawCode);
        }
      }

      return html;
    }
  }

  window.ObsidianMathRenderer = new ObsidianMathRenderer();
})();