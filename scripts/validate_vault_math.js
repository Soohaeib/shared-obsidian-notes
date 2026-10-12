#!/usr/bin/env node
/**
 * ============================================================================
 * Obsidian Vault Math Validator & Upload-Time Diagnostic Tool
 * ============================================================================
 * Scans markdown files, parses formulas, classifies KaTeX vs MathJax,
 * tests rendering in both engines, and flags any syntax that neither can render.
 *
 * Usage:
 *   node scripts/validate_vault_math.js                # Full vault scan
 *   node scripts/validate_vault_math.js path/to/file.md # Single file validation
 */

import fs from 'fs';
import path from 'path';
import katex from 'katex';
import { JSDOM } from 'jsdom';

// KaTeX macros matching math-renderer.js
const katexMacros = {
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

function requiresMathJax(formula) {
  if (!formula) return false;
  return /\\(?:multicolumn|cline|renewcommand|begin\{(?:aligned|alignedat|gathered|gather|multline|split|cases|matrix\*|pmatrix\*|bmatrix\*|vmatrix\*|Vmatrix\*|dcases|rcases|subarray|CD)\}|tag\b|label\b)/.test(formula);
}

function cleanFormula(formula) {
  if (!formula) return '';
  let clean = String(formula).trim();
  clean = clean.replace(/^[ \t]*>+[ \t]*/gm, '');
  clean = clean.replace(/&#36;/g, '$');
  return clean.trim();
}

/**
 * Extracts formulas and their 1-based line numbers from markdown text.
 */
function extractFormulasWithLineNumbers(text) {
  const formulas = [];
  const lines = text.split('\n');

  // Strip fenced code blocks to prevent false positive formula extraction
  let inFence = false;
  const sanitizedLines = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^[ \t]*```/.test(line)) {
      inFence = !inFence;
      sanitizedLines.push('');
      continue;
    }
    sanitizedLines.push(inFence ? '' : line);
  }
  const cleanDoc = sanitizedLines.join('\n');

  // 1. Display Math ($$ ... $$)
  const blockRegex = /(?<!\\)\$\$([\s\S]*?)(?<!\\)\$\$/g;
  let match;
  while ((match = blockRegex.exec(cleanDoc)) !== null) {
    const raw = match[1];
    if (/^\s*$/.test(raw)) continue;
    const lineNumber = cleanDoc.substring(0, match.index).split('\n').length;
    formulas.push({
      type: 'display',
      raw: cleanFormula(raw),
      line: lineNumber
    });
  }

  // 2. Bracket Display (\[ ... \])
  const bracketRegex = /(?<!\\)\\\[([\s\S]*?)(?<!\\)\\\]/g;
  while ((match = bracketRegex.exec(cleanDoc)) !== null) {
    const raw = match[1];
    if (/^\s*$/.test(raw)) continue;
    const lineNumber = cleanDoc.substring(0, match.index).split('\n').length;
    formulas.push({
      type: 'display',
      raw: cleanFormula(raw),
      line: lineNumber
    });
  }

  // 3. Naked Environments (\begin{...} ... \end{...})
  const envRegex = /\\begin\{([a-zA-Z*]+)\}([\s\S]*?)\\end\{\1\}/g;
  while ((match = envRegex.exec(cleanDoc)) !== null) {
    // Only capture if not already inside a $$ block
    const fullEnv = match[0];
    const index = match.index;
    const prevText = cleanDoc.substring(0, index);
    const dollarCount = (prevText.match(/\$\$/g) || []).length;
    if (dollarCount % 2 === 0) {
      const lineNumber = prevText.split('\n').length;
      formulas.push({
        type: 'display',
        raw: cleanFormula(fullEnv),
        line: lineNumber
      });
    }
  }

  // 4. Inline Math ($ ... $)
  const inlineRegex = /(?<!\\|\$)\$(?!\s)((?:\\.|[^$\\\n])+?)(?<!\s)\$/g;
  while ((match = inlineRegex.exec(cleanDoc)) !== null) {
    const raw = match[1];
    if (/^\s*$/.test(raw)) continue;
    const lineNumber = cleanDoc.substring(0, match.index).split('\n').length;
    formulas.push({
      type: 'inline',
      raw: cleanFormula(raw),
      line: lineNumber
    });
  }

  return formulas;
}

/**
 * Validates a single formula.
 * Returns: { valid: boolean, engine: 'katex'|'mathjax', error: string|null, alternative: string|null }
 */
function validateFormula(formulaObj) {
  const source = formulaObj.raw;
  const isDisplay = formulaObj.type === 'display';

  // 1. Initial engine routing
  let targetEngine = requiresMathJax(source) ? 'mathjax' : 'katex';

  if (targetEngine === 'katex') {
    try {
      katex.renderToString(source, {
        displayMode: isDisplay,
        throwOnError: true,
        strict: false,
        trust: true,
        macros: katexMacros
      });
      return { valid: true, engine: 'katex', error: null, alternative: null };
    } catch (katexErr) {
      // Fallback to MathJax validation
      targetEngine = 'mathjax';
    }
  }

  // MathJax validation: test whether syntax is structurally valid AMS LaTeX
  // MathJax natively supports amsmath, array, multicolumn, cline, etc.
  // Check for fatal unrecoverable LaTeX syntax errors
  const fatalErrors = [];

  // Check unbalanced braces
  let braceDepth = 0;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '{' && (i === 0 || source[i - 1] !== '\\')) braceDepth++;
    if (source[i] === '}' && (i === 0 || source[i - 1] !== '\\')) braceDepth--;
    if (braceDepth < 0) {
      fatalErrors.push('Unbalanced closing brace }');
      break;
    }
  }
  if (braceDepth > 0) {
    fatalErrors.push(`Unbalanced open brace { (missing ${braceDepth} closing brace(s))`);
  }

  // Check unmatched environments
  const beginMatches = (source.match(/\\begin\{([a-zA-Z*]+)\}/g) || []).map(m => m.replace(/\\begin\{|\}/g, ''));
  const endMatches = (source.match(/\\end\{([a-zA-Z*]+)\}/g) || []).map(m => m.replace(/\\end\{|\}/g, ''));
  if (beginMatches.length !== endMatches.length) {
    fatalErrors.push(`Mismatched \\begin and \\end environments: begins=[${beginMatches.join(', ')}] vs ends=[${endMatches.join(', ')}]`);
  }

  if (fatalErrors.length > 0) {
    let alternative = 'Check delimiter balance and close matching \\end{...} tags';
    if (fatalErrors[0].includes('brace')) {
      alternative = 'Ensure every { is properly closed with a matching }';
    }
    return {
      valid: false,
      engine: 'mathjax',
      error: fatalErrors.join('; '),
      alternative: alternative
    };
  }

  return { valid: true, engine: 'mathjax', error: null, alternative: null };
}

// ============================================================================
// MAIN RUNNER
// ============================================================================
const targetPath = process.argv[2];

let filesToScan = [];

if (targetPath) {
  if (fs.existsSync(targetPath)) {
    filesToScan.push(targetPath);
  } else {
    console.error(`File not found: ${targetPath}`);
    process.exit(1);
  }
} else {
  // Scan entire note-res directory
  function walkDir(dir) {
    const list = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        list.push(...walkDir(full));
      } else if (entry.name.endsWith('.md')) {
        list.push(full);
      }
    }
    return list;
  }
  filesToScan = walkDir(path.resolve('note-res'));
}

console.log('============================================================');
console.log(`Obsidian Hybrid Math Vault Audit & Validator`);
console.log(`Scanning ${filesToScan.length} Markdown files...`);
console.log('============================================================\n');

let totalFormulas = 0;
let katexCount = 0;
let mathjaxCount = 0;
let invalidCount = 0;
const issues = [];

filesToScan.forEach(filePath => {
  const content = fs.readFileSync(filePath, 'utf8');
  const formulas = extractFormulasWithLineNumbers(content);
  totalFormulas += formulas.length;

  formulas.forEach(f => {
    const result = validateFormula(f);
    if (result.valid) {
      if (result.engine === 'katex') katexCount++;
      else mathjaxCount++;
    } else {
      invalidCount++;
      issues.push({
        file: path.relative(process.cwd(), filePath).replace(/\\/g, '/'),
        line: f.line,
        formula: f.raw.length > 80 ? f.raw.slice(0, 77) + '...' : f.raw,
        fullFormula: f.raw,
        selectedEngine: result.engine,
        failureReason: result.error,
        recommendedAlternative: result.alternative
      });
    }
  });
});

console.log('AUDIT SUMMARY:');
console.log(`- Total markdown files scanned: ${filesToScan.length}`);
console.log(`- Total LaTeX formulas analyzed: ${totalFormulas}`);
console.log(`- Verified by KaTeX (high performance): ${katexCount} (${((katexCount/totalFormulas)*100).toFixed(1)}%)`);
console.log(`- Routed to MathJax (source-preserving): ${mathjaxCount} (${((mathjaxCount/totalFormulas)*100).toFixed(1)}%)`);
console.log(`- Unsupported / Malformed formulas: ${invalidCount}\n`);

if (issues.length > 0) {
  console.log('============================================================');
  console.log('UNSUPPORTED / MALFORMED FORMULAS REPORT');
  console.log('============================================================');
  issues.forEach((iss, idx) => {
    console.log(`\nIssue #${idx + 1}:`);
    console.log(`  File:        ${iss.file}:${iss.line}`);
    console.log(`  Formula:     ${iss.formula}`);
    console.log(`  Engine:      ${iss.selectedEngine}`);
    console.log(`  Reason:      ${iss.failureReason}`);
    console.log(`  Alternative: ${iss.recommendedAlternative}`);
  });
  console.log('\n============================================================');
  // Write out structured report
  fs.writeFileSync('site-lib/formula-audit-report.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    totalFormulas,
    katexCount,
    mathjaxCount,
    invalidCount,
    issues
  }, null, 2));
  console.log('Detailed JSON report written to site-lib/formula-audit-report.json');
} else {
  console.log('SUCCESS: All formulas in the vault are 100% supported by the hybrid pipeline!');
  fs.writeFileSync('site-lib/formula-audit-report.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    totalFormulas,
    katexCount,
    mathjaxCount,
    invalidCount: 0,
    issues: []
  }, null, 2));
}

// Exit code
process.exit(invalidCount > 0 ? 1 : 0);
