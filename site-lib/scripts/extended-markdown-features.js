/**
 * ============================================================================
 * Beyond-Obsidian Extended Markdown & Exam Formatting Engine
 * (extended-markdown-features.js)
 * 
 * Standalone module dedicated to Beyond-Obsidian formatting extensions:
 * 1. Sublist Marker Engine: Alphanumeric and Roman numeral sub-lists
 *    (- i., - ii., - (a), - (b), - 1), - a., - I., etc.) converted to
 *    bullet-free custom markers with typography alignment.
 * 2. Exam Directives & Section Headers: (**Required:**, **Instructions:**,
 *    **Data:**, **Scenario:**, **Requirements:**, **Note:**) styled as
 *    structured visual badges/section headers.
 * 3. Exam Mark Badges: (**[03]**, **[05]**, **[15]**) transformed into
 *    modern exam score badges.
 * 4. Line Break & Indentation Boundary Reconciler: Eliminates paragraph
 *    conflation and prevents accidental indented <pre><code> blocks after
 *    LaTeX array tables or math blocks.
 * ============================================================================
 */

(function() {
  'use strict';

  class ExtendedMarkdownEngine {
    constructor() {
      this.enabled = true;
    }

    /**
     * Preprocesses raw Markdown text before marked.parse
     * Reconciles line breaks, prevents accidental code blocks, protects currency values, and prepares sublists.
     */
    preprocess(text) {
      if (!text || typeof text !== 'string') return text;

      // 0. Protect currency symbols ($10, $50,000, \$10) before markdown/math parsers
      text = text.replace(/\\(\$)/g, '&#36;');
      text = text.replace(/(?<![\$\w\\])\$(?=\s*\d)(?:\s*)(\d[\d,]*(?:\.\d+)?(?:\s*(?:million|billion|trillion|thousand|USD|EUR|GBP|k|m|b))?(?:\/(?:share|unit|hour|day|month|year|item|kg|lb))?)(?!\$|[a-zA-Z0-9_\^])/gi, '&#36;$1');

      // 1. Separate directives (**Required:**, **Instructions:**, **Data:**, etc.) from preceding lines
      text = text.replace(/([^\n\r])\r?\n([ \t]*\*\*(?:Required|Instructions|Requirements|Data|Scenario|Note|Additional Information|Given|Case):\*\*)/gi, '$1\n\n  $2');

      // 2. Prevent 4-space indented lists, directives, or stems from becoming unintended <pre><code> blocks
      text = text.replace(/^([ \t]{4,})(\*\*(?:Required|Instructions|Requirements|Data|Scenario|Note|Additional Information|Given|Case):\*\*)/gim, '  $2');
      text = text.replace(/([^\n\r])\r?\n[ \t]{4,}(\*\*(?:Required|Instructions|Requirements|Data|Scenario|Note|Additional Information|Given|Case):\*\*)/gi, '$1\n\n  $2');
      text = text.replace(/^([ \t]{4,})([*+-]|\d+[\.\)]|[a-zA-Z][\.\)]|[ivxlcdmIVXLCDM]+[\.\)])\s+/gm, '  $2 ');
      text = text.replace(/([^\n\r])\r?\n[ \t]{4,}([*+-]|\d+[\.\)]|[a-zA-Z][\.\)]|[ivxlcdmIVXLCDM]+[\.\)])\s+/g, '$1\n\n  $2 ');

      // 3. Ensure list items directly attached to paragraph text start on their own list block
      text = text.replace(/([^\n\r])\r?\n([ \t]*[-*+]\s+[^\n\r]+)/g, '$1\n\n$2');
      text = text.replace(/([^\n\r])\r?\n([ \t]*\d+[\.\)]\s+[^\n\r]+)/g, '$1\n\n$2');
      text = text.replace(/([^\n\r])\r?\n([ \t]*[a-zA-Z][\.\)]\s+[^\n\r]+)/g, '$1\n\n$2');
      text = text.replace(/([^\n\r])\r?\n([ \t]*[ivxlcdmIVXLCDM]+[\.\)]\s+[^\n\r]+)/g, '$1\n\n$2');

      // 4. Ensure non-list text following a list item starts on its own paragraph block
      text = text.replace(/([ \t]*(?:[-*+]|\d+[\.\)]|[a-zA-Z][\.\)]|[ivxlcdmIVXLCDM]+[\.\)])\s+[^\n\r]+)\r?\n([^\s\-*+\d>#`~|][^\n\r]*)/g, '$1\n\n$2');

      return text;
    }

    /**
     * Postprocesses rendered HTML after marked.parse and KaTeX restoration
     */
    postprocess(html) {
      if (!html || typeof html !== 'string') return html;

      // 1. Transform sub-list items starting with (a), a., i., I., 1), (1), etc. into styled list items
      const sublistMarkerRegex = /<li>(\s*(?:<p>\s*)?)((?:\([a-zA-Z0-9ivxlcdmIVXLCDM]+\)|(?:[a-zA-Z]|\d+|[ivxlcdmIVXLCDM]+)[\.\)])(?:\s*[-–—]\s*)?)\s*/g;
      html = html.replace(sublistMarkerRegex, (match, pTag, marker) => {
        const cleanMarker = marker.trim().replace(/[-–—]$/, '').trim();
        return `<li class="sublist-item">${pTag || ''}<span class="sublist-marker">${cleanMarker}</span> `;
      });

      // 2. Identify and style question section headers (**Required:**, **Instructions:**, **Data:**, etc.)
      const labelRegex = /<strong>(Required|Instructions|Requirements|Data|Scenario|Note|Additional Information|Given|Case):<\/strong>/gi;
      html = html.replace(labelRegex, (match, label) => {
        const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        return `<strong class="question-label label-${slug}">${label}:</strong>`;
      });

      // 3. Transform mark allocations like <strong>[05]</strong>, <strong>[15]</strong>, <strong>[03 Marks]</strong> into styled exam mark badges
      html = html.replace(/<strong>\[(\d{1,2}(?:\s*(?:marks?|pts?|points?))?)\]<\/strong>/gi, (match, marks) => {
        return `<span class="exam-mark-badge" title="Marks: ${marks}">[${marks}]</span>`;
      });

      return html;
    }
  }

  window.ObsidianExtendedMarkdown = new ExtendedMarkdownEngine();
})();
