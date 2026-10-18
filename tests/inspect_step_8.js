import fs from 'fs';
import { JSDOM } from 'jsdom';
import { marked } from 'marked';
import katex from 'katex';

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="note-container"></div></body></html>', {
  url: 'http://localhost:3000/'
});
global.window = dom.window;
global.document = dom.window.document;
global.performance = { now: () => Date.now() };
global.localStorage = dom.window.localStorage;
global.sessionStorage = dom.window.sessionStorage;
window.katex = katex;
window.marked = marked;

const mathRendererCode = fs.readFileSync('site-lib/scripts/math-renderer.js', 'utf8');
const calloutRendererCode = fs.readFileSync('site-lib/scripts/callout-renderer.js', 'utf8');
const extMdCode = fs.readFileSync('site-lib/scripts/extended-markdown-features.js', 'utf8');
const wikilinkCode = fs.readFileSync('site-lib/scripts/wikilink-resolver.js', 'utf8');
const appReaderCode = fs.readFileSync('site-lib/scripts/app-reader.js', 'utf8');

eval(mathRendererCode);
eval(calloutRendererCode);
eval(extMdCode);
eval(wikilinkCode);
eval(appReaderCode);

const reader = new window.ObsidianVaultApp();
const notePath = 'note-res/ai-comprehension/acc-304-cost-accounting-i/acc-304-notes-step-8.md';
const content = fs.readFileSync(notePath, 'utf8');

let bodyMarkdown = content;
if (content.startsWith('---')) {
  const fmEnd = content.indexOf('\n---', 3);
  if (fmEnd !== -1) {
    bodyMarkdown = content.substring(fmEnd + 4).trim();
  }
}

const processed = reader.preprocessObsidianMarkdown(bodyMarkdown);
const markedHtml = marked.parse(processed);
const finalHtml = reader.postprocessObsidianHtml(markedHtml);

const articleDom = new JSDOM(`<!DOCTYPE html><html><body><main><section><div id="note-viewport"><div id="note-container"><article class="markdown-rendered" id="note-article">${finalHtml}</article></div></div></section></main></body></html>`);
const doc = articleDom.window.document;

console.log('--- ALL H2s IN ARTICLE ---');
const allH2 = doc.querySelectorAll('article#note-article h2');
allH2.forEach((h, i) => {
  console.log(`H2 #${i+1}: id="${h.id}", outer HTML start: ${h.outerHTML.slice(0, 120)}`);
});

const sel1 = 'main:nth-of-type(1) > section:nth-of-type(1) > div#note-viewport:nth-of-type(1) > div#note-container:nth-of-type(1) > article#note-article:nth-of-type(1) > h2#heading-2:nth-of-type(10) > div:nth-of-type(1) > div:nth-of-type(2) > ul:nth-of-type(12) > li:nth-of-type(2) > ul:nth-of-type(1) > li:nth-of-type(3) > p:nth-of-type(1)';
const el1 = doc.querySelector(sel1);
console.log('\nExact Selector 1 match?', !!el1);
if (el1) console.log('El 1 text:', el1.textContent);

const sel2 = 'main:nth-of-type(1) > section:nth-of-type(1) > div#note-viewport:nth-of-type(1) > div#note-container:nth-of-type(1) > article#note-article:nth-of-type(1) > h2#heading-2:nth-of-type(10) > div:nth-of-type(1) > div:nth-of-type(2) > ul:nth-of-type(12) > li:nth-of-type(3) > p:nth-of-type(2)';
const el2 = doc.querySelector(sel2);
console.log('Exact Selector 2 match?', !!el2);
if (el2) console.log('El 2 text:', el2.textContent);
