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

const candidateFiles = [
  'note-res/4th-semester/bcc-207/pyq-bcc-207.md',
  'note-res/4th-semester/bcc-208/ed-lo-notes.md',
  'note-res/4th-semester/bcc-208/pyq-bcc-208.md',
  'note-res/4th-semester/bcc-206/pyq-bcc-206.md',
  'note-res/4th-semester/bcc-209/pyq-bcc-209.md',
  'note-res/4th-semester/bcc-209/ob-lo-notes.md',
  'note-res/5th-semester/acc-303/pyq-acc-303.md',
  'note-res/5th-semester/acc-301/pyq-acc-301.md',
  'note-res/ai-comprehension/acc-304-cost-accounting-i/acc-304-notes-step-4.md'
];

for (const notePath of candidateFiles) {
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

  const articleDom = new JSDOM(`<!DOCTYPE html><html><body><article id="note-article">${finalHtml}</article></body></html>`);
  const doc = articleDom.window.document;

  const target1 = doc.querySelector('article#note-article > h2#heading-2:nth-of-type(10) > div:nth-of-type(1) > div:nth-of-type(2) > ul:nth-of-type(12) > li:nth-of-type(2) > ul:nth-of-type(1) > li:nth-of-type(3) > p:nth-of-type(1)');
  if (target1) {
    console.log('MATCH FOUND FOR TARGET 1 IN:', notePath);
    console.log('Content:', target1.textContent);
  }

  const nth10 = doc.querySelector('h2#heading-2:nth-of-type(10)');
  if (nth10) {
    console.log(`h2#heading-2:nth-of-type(10) FOUND IN: ${notePath}`);
    console.log('nth10 tag:', nth10.tagName, 'children:', nth10.children.length);
  }
}
