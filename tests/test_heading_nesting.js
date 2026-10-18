import fs from 'fs';
import path from 'path';
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

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);
  arrayOfFiles = arrayOfFiles || [];
  files.forEach(function(file) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else if (file.endsWith('.md')) {
      arrayOfFiles.push(fullPath);
    }
  });
  return arrayOfFiles;
}

const allNotes = getAllFiles('note-res');
console.log(`Checking ${allNotes.length} notes...`);

for (const notePath of allNotes) {
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

  const nestedInH2 = doc.querySelectorAll('h2 div, h2 p, h2 ul, h2 table');
  if (nestedInH2.length > 0) {
    console.log(`FOUND NESTED IN H2 in ${notePath}: count = ${nestedInH2.length}`);
    const h2WithChildren = doc.querySelectorAll('h2');
    h2WithChildren.forEach((h, i) => {
      if (h.children.length > 0) {
        console.log(`  h2 #${i+1} [id=${h.id}]:`, h.innerHTML.slice(0, 100));
      }
    });
  }

  const h2Count = doc.querySelectorAll('h2').length;
  if (h2Count >= 10) {
    const nth10 = doc.querySelector('h2:nth-of-type(10)');
    if (nth10 && (nth10.id === 'heading-2' || nth10.children.length > 0)) {
      console.log(`FOUND 10th H2 in ${notePath}: id=${nth10.id}, children=${nth10.children.length}`);
    }
  }
}
console.log('Done scanning.');
