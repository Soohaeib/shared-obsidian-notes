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
        "\\bold": "\\mathbf"
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

    parseLatexArrayToHtmlTable(latex) {
      if (!latex || (!latex.includes('\\multicolumn') && !latex.includes('\\cline')) || !latex.includes('\\begin{array}')) {
        return null;
      }

      try {
        const cleanLatex = latex.replace(/^[ \t]*>+[ \t]*/gm, '').trim();
        const bodyMatch = cleanLatex.match(/\\begin\{array\}\{([lrc|]+)\}([\s\S]*?)\\end\{array\}/);
        if (!bodyMatch) return null;

        const colAlignments = bodyMatch[1].replace(/\|/g, '').split('').map(c => c === 'r' ? 'right' : (c === 'c' ? 'center' : 'left'));
        const rawBody = bodyMatch[2].trim();
        const rawRows = rawBody.split(/\\\\/);
        const processedRows = [];

        for (let r = 0; r < rawRows.length; r++) {
          let rowStr = rawRows[r].trim();
          if (!rowStr) continue;

          let borderTop = false, borderBottom = false, clineCols = null;

          if (rowStr.includes('\\hline \\hline') || rowStr.includes('\\hline\\hline')) {
            borderBottom = true;
            rowStr = rowStr.replace(/\\hline\s*\\hline/g, '').trim();
          }
          if (rowStr.includes('\\hline')) {
            borderTop = true;
            rowStr = rowStr.replace(/\\hline/g, '').trim();
          }

          const clineMatch = rowStr.match(/\\cline\{(\d+)-(\d+)\}/);
          if (clineMatch) {
            clineCols = { start: parseInt(clineMatch[1], 10), end: parseInt(clineMatch[2], 10) };
            rowStr = rowStr.replace(/\\cline\{\d+-\d+\}/g, '').trim();
          }

          if (!rowStr) {
            if (borderBottom && processedRows.length > 0) processedRows[processedRows.length - 1].borderBottom = true;
            if (borderTop && processedRows.length > 0) processedRows[processedRows.length - 1].borderTop = true;
            continue;
          }

          processedRows.push({ text: rowStr, borderTop, borderBottom, clineCols });
        }

        let html = '<div class="accounting-table-wrapper"><table class="accounting-schedule-table"><tbody>';
        for (const row of processedRows) {
          const { text: rowStr, borderTop, borderBottom, clineCols } = row;
          const borderClasses = [];
          if (borderTop) borderClasses.push('border-single-top');
          if (borderBottom) borderClasses.push('border-double-bottom');
          const trClass = borderClasses.join(' ');

          const multiMatch = rowStr.match(/^\\multicolumn\{(\d+)\}\{([lrc])\}\{([\s\S]+?)\}$/);
          if (multiMatch) {
            const colspan = multiMatch[1];
            const align = multiMatch[2] === 'r' ? 'right' : (multiMatch[2] === 'c' ? 'center' : 'left');
            let content = multiMatch[3];
            content = content.replace(/\\textbf\{([^}]+)\}/g, '<strong>$1</strong>');
            content = content.replace(/\\mathbf\{([^}]+)\}/g, '<strong>$1</strong>');
            content = content.replace(/\\text\{([^}]+)\}/g, '$1');
            content = content.replace(/\\(\$)/g, '$');
            content = content.replace(/[{}]/g, '');
            html += `<tr class="table-header-row ${trClass}"><td colspan="${colspan}" style="text-align: ${align};" class="multicolumn-cell">${content}</td></tr>`;
            continue;
          }

          const cells = rowStr.split('&');
          html += `<tr class="${trClass}">`;
          for (let c = 0; c < cells.length; c++) {
            let cell = cells[c].trim();
            const align = colAlignments[c] || (c > 0 ? 'right' : 'left');
            let isBold = /\\textbf\{([^}]+)\}/.test(cell) || /\\mathbf\{([^}]+)\}/.test(cell);
            
            cell = cell.replace(/\\textbf\{([^}]+)\}/g, '$1');
            cell = cell.replace(/\\mathbf\{([^}]+)\}/g, '$1');
            cell = cell.replace(/\\text\{([^}]+)\}/g, '$1');
            cell = cell.replace(/\\quad/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
            cell = cell.replace(/\\qquad/g, '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;');
            cell = cell.replace(/\\(\$)/g, '$');
            cell = cell.replace(/[{}]/g, '');

            let style = `text-align: ${align};`;
            if (isBold) style += ' font-weight: 600;';
            const cellClasses = [];
            if (/^[\$]?[\d,.-]+[\%]?$/.test(cell)) cellClasses.push('cell-numeric');
            else cellClasses.push('cell-text');
            if (clineCols && (c + 1) >= clineCols.start && (c + 1) <= clineCols.end) cellClasses.push('border-cline-top');

            html += `<td class="${cellClasses.join(' ')}" style="${style}">${cell}</td>`;
          }
          html += '</tr>';
        }
        html += '</tbody></table></div>';
        return html;
      } catch (e) {
        console.warn('Accounting array table conversion error:', e);
        return null;
      }
    }

    renderExpression(formula, displayMode = false) {
      if (!formula) return '';
      let clean = formula.trim();
      if (!clean) return '';

      clean = clean.replace(/&#36;/g, '\\$');
      clean = clean.replace(/\\hat\{[ \t]*(?:eta|beta)\}/g, '\\hat{\\beta}');
      clean = clean.replace(/\\hat\{[ \t]*(?:lpha|alpha)\}/g, '\\hat{\\alpha}');
      clean = clean.replace(/\\hat\{[ \t]*(?:sigma)\}/g, '\\hat{\\sigma}');
      clean = clean.replace(/(^|[^\\a-zA-Z])(?:lpha)\b/g, '$1\\alpha');
      clean = clean.replace(/(^|[^\\a-zA-Z])(?:eta)\b/g, '$1\\beta');
      clean = clean.replace(/(^|[^\\a-zA-Z])(?:heta)\b/g, '$1\\theta');

      const mathId = `math-${displayMode ? 'block' : 'inline'}-${this.mathIdCounter++}`;

      if (displayMode && (clean.includes('\\multicolumn') || clean.includes('\\cline')) && clean.includes('\\begin{array}')) {
        const htmlTable = this.parseLatexArrayToHtmlTable(clean);
        if (htmlTable) {
          return `<div class="math math-block accounting-table-container" id="${mathId}"><span class="katex-display">${htmlTable}</span></div>`;
        }
      }

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
            macros: this.katexMacros
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

      // 1. Block math: $$ ... $$
      text = text.replace(/(?<!\\)\$\$([\s\S]*?)(?<!\\)\$\$/g, (match, formula) => {
        if (/^\s*$/.test(formula) || /\n\s*#{1,6}\s+[^\n]+/.test(formula)) return match;
        const cleanFormula = formula.replace(/^[ \t]*>+[ \t]*/gm, '').trim();
        const token = `@@KATEX_BLOCK_${this.mathTokenIdx++}@@`;
        const html = this.renderExpression(cleanFormula, true);
        this.currentBlocksMap.set(token, html);
        return `\n\n${token}\n\n`;
      });

      // 2. LaTeX environments: \begin{...} ... \end{...}
      text = text.replace(/(?<!\\)\\begin\{([a-zA-Z0-9*]+)\}([\s\S]*?)\\end\{\1\}/g, (match, env, body) => {
        const full = `\\begin{${env}}${body}\\end{${env}}`;
        const cleanFormula = full.replace(/^[ \t]*>+[ \t]*/gm, '').trim();
        const token = `@@KATEX_BLOCK_${this.mathTokenIdx++}@@`;
        const html = this.renderExpression(cleanFormula, true);
        this.currentBlocksMap.set(token, html);
        return `\n\n${token}\n\n`;
      });

      // 3. Inline math: $ ... $
      text = text.replace(/(?<![\\\$])\$(?!\s)((?:\\\$|[^\$\n\r])+?)(?<![\s\\\$])\$(?!\$)/g, (match, formula) => {
        const trimmed = formula.trim();
        // Guard financial currency mentions ($100, $5.5 million, etc.)
        if (/^(?:&#36;|\$|\\\$)?\s*[\d,.]+(?:\s*(?:million|billion|trillion|USD|EUR|GBP|k|m|b|%))?$/i.test(trimmed)) {
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
