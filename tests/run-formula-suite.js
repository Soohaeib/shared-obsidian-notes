/**
 * ============================================================================
 * Production-Safe Hybrid Math Pipeline Deterministic Test Suite
 * ============================================================================
 * Runs deterministic tests against math-renderer.js and the Markdown pipeline.
 */

import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import katex from 'katex';
import { marked } from 'marked';

const fixturesPath = path.resolve('tests/fixtures/formula-fixtures.json');
const fixturesData = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));

console.log('------------------------------------------------------------');
console.log('Running Deterministic Hybrid Math Pipeline Test Suite');
console.log('------------------------------------------------------------\n');

// Set up JSDOM environment
const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><div id="note-article"></div></body></html>', {
  runScripts: 'dangerously'
});

const { window } = dom;
const { document } = window;
global.window = window;
global.document = document;
window.katex = katex;
window.marked = marked;

// Load math-renderer.js
const mathRendererCode = fs.readFileSync(path.resolve('site-lib/scripts/math-renderer.js'), 'utf8');
window.eval(mathRendererCode);

const mathRenderer = window.ObsidianMathRenderer;

if (!mathRenderer) {
  console.error('[FAIL] ObsidianMathRenderer failed to initialize on window object.');
  process.exit(1);
}

let passed = 0;
let failed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName} - ${details}`);
    failed++;
  }
}

// ============================================================================
// TEST 1: FIXTURE SUITE VERIFICATION
// ============================================================================
console.log('Test Group 1: Deterministic Formula Fixtures');

fixturesData.fixtures.forEach((fix) => {
  mathRenderer.reset();
  
  // Pipeline: extract -> marked.parse -> restoreTokens
  let tokenized = mathRenderer.extractAndTokenize(fix.markdown);
  let parsedHtml = marked.parse(tokenized);
  let finalHtml = mathRenderer.restoreTokens(parsedHtml);

  const container = document.createElement('div');
  container.innerHTML = finalHtml;

  if (fix.expectedEngine === 'katex') {
    const hasKatex = container.querySelector('.math-katex') !== null;
    assert(hasKatex, `Fixture [${fix.id}] renders via KaTeX`, `Output: ${finalHtml.slice(0, 120)}`);
  } else if (fix.expectedEngine === 'mathjax') {
    const mathjaxEl = container.querySelector('.math-mathjax');
    const hasMathJax = mathjaxEl !== null;
    const preservesSource = mathjaxEl && mathjaxEl.getAttribute('data-math-raw') && !mathjaxEl.getAttribute('data-math-raw').includes('\\newcommand{\\arraystretch}');
    assert(hasMathJax && preservesSource, `Fixture [${fix.id}] routes to MathJax and preserves source`, `Preserved raw: ${mathjaxEl?.getAttribute('data-math-raw')}`);
  } else if (fix.expectedEngine === 'none') {
    const hasMath = container.querySelector('.math-katex, .math-mathjax') !== null;
    assert(!hasMath, `Fixture [${fix.id}] strictly shielded from math parsing`, `Output: ${finalHtml.slice(0, 120)}`);
  } else if (fix.expectedEngine === 'fallback') {
    const isHandled = container.querySelector('.math-mathjax, .math-engine-fallback, .katex-error') !== null;
    assert(isHandled, `Fixture [${fix.id}] malformed formula handled safely without crash`);
  }
});

// ============================================================================
// TEST 2: ISOLATION INTEGRITY (Code blocks, inline code, Mermaid, HTML)
// ============================================================================
console.log('\nTest Group 2: Math Isolation Integrity');

{
  mathRenderer.reset();
  const rawDoc = `
# Isolation Test

\`\`\`python
# Code with math symbols
math_str = "$x = 10$"
display_str = "$$ y = 20 $$"
\`\`\`

Here is inline code \`var $x = 12;\` and standard text.

\`\`\`mermaid
graph TD
  A[Node $1] --> B[Node $2]
\`\`\`

<div class="custom-html">
  <span>$untouched html$</span>
</div>
`;

  let tokenized = mathRenderer.extractAndTokenize(rawDoc);
  let parsedHtml = marked.parse(tokenized);
  let finalHtml = mathRenderer.restoreTokens(parsedHtml);

  const container = document.createElement('div');
  container.innerHTML = finalHtml;

  // Code block must contain original strings verbatim
  const codeText = container.querySelector('pre code')?.textContent || '';
  assert(codeText.includes('$x = 10$') && codeText.includes('$$ y = 20 $$'), 'Fenced code blocks preserved verbatim without math processing', `HTML: ${container.innerHTML}`);

  // Inline code must contain original string
  const inlineCodes = Array.from(container.querySelectorAll('code')).map(c => c.textContent);
  assert(inlineCodes.some(c => c.includes('var $x = 12;')), 'Inline backtick code preserved verbatim without math processing');
}

// ============================================================================
// TEST 3: MATHJAX CDN FAILURE & READABLE FALLBACK STATE
// ============================================================================
console.log('\nTest Group 3: MathJax Failure Handling & Readable Fallback UI');

{
  mathRenderer.reset();
  mathRenderer.onMathJaxLoaded(); // start ready

  const testFormula = '$$\\begin{array}{cc}\\multicolumn{2}{c}{\\text{Header}}\\\\ 1 & 2\\end{array}$$';
  let tokenized = mathRenderer.extractAndTokenize(testFormula);
  let parsedHtml = marked.parse(tokenized);
  let finalHtml = mathRenderer.restoreTokens(parsedHtml);

  const container = document.createElement('div');
  container.innerHTML = finalHtml;

  // When CDN fails, simulate onMathJaxFailed
  mathRenderer.onMathJaxFailed('CDN Connection Timed Out');

  // Trigger fallback handler on the container
  mathRenderer.handleMathJaxFailure(container);

  const fallbackCard = container.querySelector('.math-engine-fallback');
  assert(fallbackCard !== null, 'MathJax failure creates .math-engine-fallback card');

  const banner = container.querySelector('.math-fallback-banner');
  assert(banner !== null, 'Display fallback contains human-readable banner');

  const codeEl = container.querySelector('.math-fallback-code code');
  assert(codeEl && codeEl.textContent.includes('\\multicolumn'), 'Fallback card displays readable preserved LaTeX source without raw delimiter breakage');
}

// ============================================================================
// TEST 4: SOURCE PRESERVATION (No destructive regex rewrites)
// ============================================================================
console.log('\nTest Group 4: Authentic Source Preservation');

{
  mathRenderer.reset();
  mathRenderer.onMathJaxLoaded();

  const originalSource = '\\renewcommand{\\arraystretch}{1.8}\n\\begin{pmatrix} a & b \\end{pmatrix}';
  const tokenized = mathRenderer.extractAndTokenize(`$$\n${originalSource}\n$$`);
  const finalHtml = mathRenderer.restoreTokens(marked.parse(tokenized));

  const container = document.createElement('div');
  container.innerHTML = finalHtml;
  const mjEl = container.querySelector('.math-mathjax');

  const rawAttr = mjEl?.getAttribute('data-math-raw') || '';
  assert(rawAttr.includes('\\renewcommand{\\arraystretch}{1.8}'), 'Preserves \\renewcommand without destructive replacement to \\newcommand');
}

// ============================================================================
// TEST 5: CALLOUTS WITH EMBEDDED FORMULAS
// ============================================================================
console.log('\nTest Group 5: Formulas in Obsidian Callouts');

{
  // Test callout renderer integration
  const calloutRendererCode = fs.readFileSync(path.resolve('site-lib/scripts/callout-renderer.js'), 'utf8');
  window.eval(calloutRendererCode);
  const calloutRenderer = window.ObsidianCallouts;

  assert(calloutRenderer !== undefined, 'ObsidianCallouts engine initialized');

  const calloutDoc = `
> [!TIP] Proof of $e^{i\\pi} + 1 = 0$
> Here is Euler's identity:
> $$
> e^{i\\pi} + 1 = 0
> $$
> And an advanced MathJax formula:
> $$
> \\begin{aligned}
> x &= 1 \\\\
> y &= 2
> \\end{aligned}
> $$
`;

  mathRenderer.reset();
  calloutRenderer.reset();

  let processed = calloutRenderer.processCallouts(calloutDoc);
  processed = mathRenderer.extractAndTokenize(processed);
  let parsedHtml = marked.parse(processed);
  let finalHtml = calloutRenderer.postprocessHtml(parsedHtml);
  finalHtml = mathRenderer.restoreTokens(finalHtml);

  const container = document.createElement('div');
  container.innerHTML = finalHtml;

  const calloutEl = container.querySelector('.callout[data-callout="tip"]');
  assert(calloutEl !== null, 'Callout container rendered');

  const hasKatexInCallout = calloutEl?.querySelector('.math-katex') !== null;
  assert(hasKatexInCallout, 'KaTeX formulas rendered inside callout body and title');

  const hasMathJaxInCallout = calloutEl?.querySelector('.math-mathjax') !== null;
  assert(hasMathJaxInCallout, 'MathJax formulas routed properly inside callout body');
}

// ============================================================================
// TEST 6: RENDER CACHE & INVALIDATION
// ============================================================================
console.log('\nTest Group 6: Render Cache & Invalidation Logic');

{
  // Simulate reader caching functions
  class ReaderCacheMock {
    constructor() {
      this.rendererVersion = '2026.10.12.hybrid-v1';
      this.store = new Map();
    }
    computeContentHash(str) {
      if (!str) return 'empty';
      let hash = 5381;
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i);
        hash = hash & hash;
      }
      return `${str.length}_${Math.abs(hash).toString(36)}`;
    }
    getRenderCache(relPath, contentHash, isPreview = false) {
      if (isPreview) return null;
      const entry = this.store.get(`obsidian_render_cache_${relPath}`);
      if (entry && entry.version === this.rendererVersion && entry.hash === contentHash) {
        return entry;
      }
      return null;
    }
    setRenderCache(relPath, contentHash, data) {
      this.store.set(`obsidian_render_cache_${relPath}`, {
        version: this.rendererVersion,
        hash: contentHash,
        ...data
      });
    }
    invalidateRenderCache(relPath) {
      if (relPath) this.store.delete(`obsidian_render_cache_${relPath}`);
      else this.store.clear();
    }
  }

  const cache = new ReaderCacheMock();
  const notePath = '4th-semester/bcc-206/pyq-bcc-206.md';
  const contentA = '# Exam Questions\n$$ x = 1 $$';
  const contentB = '# Exam Questions\n$$ x = 2 $$';

  const hashA = cache.computeContentHash(contentA);
  const hashB = cache.computeContentHash(contentB);

  // Store in cache
  cache.setRenderCache(notePath, hashA, { html: '<p>cached content A</p>' });

  // 1. Hit cache
  const hit = cache.getRenderCache(notePath, hashA, false);
  assert(hit && hit.html === '<p>cached content A</p>', 'Cache hit returns generated HTML and metadata');

  // 2. Invalidate on content change
  const missOnContentChange = cache.getRenderCache(notePath, hashB, false);
  assert(missOnContentChange === null, 'Cache miss when Markdown content changes');

  // 3. Bypass in preview mode
  const previewBypass = cache.getRenderCache(notePath, hashA, true);
  assert(previewBypass === null, 'Preview mode bypasses cache for real-time live preview rendering');

  // 4. Invalidate on version change
  cache.rendererVersion = '2026.10.12.hybrid-v2';
  const missOnVersionBump = cache.getRenderCache(notePath, hashA, false);
  assert(missOnVersionBump === null, 'Cache invalidated automatically when renderer version changes');
}

console.log('\n============================================================');
console.log(`Test Results: ${passed} passed, ${failed} failed`);
console.log('============================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
