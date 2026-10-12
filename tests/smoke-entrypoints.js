/**
 * ============================================================================
 * Semester Entrypoint Browser Smoke Tests (smoke-entrypoints.js)
 * ============================================================================
 * Verifies that every semester entrypoint and the root landing page load
 * valid DOM, scripts, MathJax configuration, styles, and rendering containers.
 */

import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

const entrypoints = [
  { name: 'Root Landing Page', file: 'index.html', isViewer: false },
  { name: '4th Semester Entrypoint', file: 'note-res/4th-semester/index.html', isViewer: true },
  { name: '5th Semester Entrypoint', file: 'note-res/5th-semester/index.html', isViewer: true },
  { name: 'AI Comprehension Entrypoint', file: 'note-res/ai-comprehension/index.html', isViewer: true }
];

console.log('============================================================');
console.log('Running Browser Smoke Tests for Semester Entrypoints');
console.log('============================================================\n');

let passed = 0;
let failed = 0;

function assert(condition, name, details = '') {
  if (condition) {
    console.log(`  [PASS] ${name}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${name} - ${details}`);
    failed++;
  }
}

for (const entry of entrypoints) {
  const fullPath = path.resolve(entry.file);
  console.log(`Testing [${entry.name}] (${entry.file})...`);

  assert(fs.existsSync(fullPath), `File exists: ${entry.file}`);

  const htmlContent = fs.readFileSync(fullPath, 'utf8');
  assert(htmlContent.length > 500, `HTML content is non-empty (${htmlContent.length} bytes)`);

  const dom = new JSDOM(htmlContent, {
    url: `http://localhost:3000/${entry.file}`,
    runScripts: 'outside-only'
  });
  const doc = dom.window.document;

  if (entry.isViewer) {
    // 1. Verify MathJax script tag and configuration
    const mathjaxScript = doc.getElementById('mathjax-script') || doc.querySelector('script[src*="mathjax"]');
    assert(mathjaxScript !== null, `MathJax script tag loaded in ${entry.file}`);
    assert(mathjaxScript?.getAttribute('onerror')?.includes('__MATHJAX_FAILED__'), `MathJax onerror handler present in ${entry.file}`);

    // Verify inline window.MathJax configuration exists
    const scripts = Array.from(doc.querySelectorAll('script')).map(s => s.textContent);
    const hasMathJaxConfig = scripts.some(s => s.includes('window.MathJax') && s.includes('inlineMath'));
    assert(hasMathJaxConfig, `MathJax configuration block present in ${entry.file}`);

    // 2. Verify KaTeX script tags
    const katexScript = doc.querySelector('script[src*="katex"]');
    assert(katexScript !== null, `KaTeX script tag present in ${entry.file}`);

    // 3. Verify Article & App Reader DOM Elements
    const noteContainer = doc.getElementById('note-container');
    assert(noteContainer !== null, `#note-container article canvas present in ${entry.file}`);

    const sidebar = doc.getElementById('sidebar-left');
    assert(sidebar !== null, `Navigation sidebar present in ${entry.file}`);

    const searchModal = doc.getElementById('search-modal');
    assert(searchModal !== null, `Search modal dialog present in ${entry.file}`);

    const healthModal = doc.getElementById('vault-health-modal');
    assert(healthModal !== null, `Vault health modal dialog present in ${entry.file}`);

    // 4. Verify Theme & Style links
    const appCustomCss = doc.querySelector('link[href*="app-custom.css"]');
    assert(appCustomCss !== null, `app-custom.css linked for theme & math fallback styles`);
  } else {
    // Root landing page
    const title = doc.querySelector('title');
    assert(title !== null && title.textContent.length > 0, `Page title defined: "${title?.textContent}"`);
    assert(htmlContent.includes('4th-semester') && htmlContent.includes('5th-semester'), `Landing page links to all semester vaults`);
  }

  console.log('');
}

console.log('============================================================');
console.log(`Smoke Test Results: ${passed} passed, ${failed} failed`);
console.log('============================================================\n');

process.exit(failed > 0 ? 1 : 0);
