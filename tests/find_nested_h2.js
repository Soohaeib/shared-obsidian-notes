import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';
import katex from 'katex';
import { marked } from 'marked';

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="note-container"></div></body></html>');
global.window = dom.window;
global.document = dom.window.document;
window.katex = katex;
window.marked = marked;

eval(fs.readFileSync('site-lib/scripts/extended-markdown-features.js', 'utf8'));
eval(fs.readFileSync('site-lib/scripts/math-renderer.js', 'utf8'));
eval(fs.readFileSync('site-lib/scripts/callout-renderer.js', 'utf8'));

// Emulate full app-reader preprocessing & rendering
function renderFile(rawMarkdown) {
  let text = rawMarkdown;
  if (text.startsWith('---')) {
    const fmEnd = text.indexOf('\n---', 3);
    if (fmEnd !== -1) {
      text = text.substring(fmEnd + 4).trim();
    }
  }

  if (window.ObsidianCallouts) text = window.ObsidianCallouts.autoHealCallouts(text);
  if (window.ObsidianExtendedMarkdown) text = window.ObsidianExtendedMarkdown.preprocess(text);
  text = text.replace(/^(#{1,6})([^ \s#\n\r].*?\s+.*)$/gm, '$1 $2');
  text = text.replace(/([^\n\r])\r?\n(>[ \t]*[^\n\r]+)/g, '$1\n\n$2');
  text = text.replace(/([^\n\r])\r?\n([ \t]*\|[^\n\r]+\|\r?\n[ \t]*\|[\s\-:|]+\|)/g, '$1\n\n$2');
  text = text.replace(/([^\n\r])\r?\n(>[ \t]*\|[^\n\r]+\|\r?\n>[ \t]*\|[\s\-:|]+\|)/g, '$1\n\n$2');

  window.ObsidianMathRenderer.reset();
  window.ObsidianCallouts.reset();

  const codeBlocksMap = new Map();
  let codeBlockIdx = 0;
  text = text.replace(/```[\s\S]*?```/g, (match) => {
    const token = `@@OBS_FENCED_BLOCK_${codeBlockIdx++}@@`;
    codeBlocksMap.set(token, match);
    return token;
  });
  text = text.replace(/`[^`\n\r]+`/g, (match) => {
    const token = `@@OBS_INLINE_CODE_${codeBlockIdx++}@@`;
    codeBlocksMap.set(token, match);
    return token;
  });

  if (window.ObsidianCallouts) {
    text = window.ObsidianCallouts.processCallouts(text, codeBlocksMap);
  }

  if (window.ObsidianMathRenderer) {
    text = window.ObsidianMathRenderer.extractAndTokenize(text);
  }

  for (const [token, codeContent] of codeBlocksMap.entries()) {
    text = text.replaceAll(token, codeContent);
  }

  let renderedHtml = marked.parse(text);

  if (window.ObsidianCallouts) {
    renderedHtml = window.ObsidianCallouts.postprocessHtml(renderedHtml);
  }
  if (window.ObsidianMathRenderer) {
    renderedHtml = window.ObsidianMathRenderer.restoreTokens(renderedHtml);
  }
  if (window.ObsidianExtendedMarkdown) {
    renderedHtml = window.ObsidianExtendedMarkdown.postprocess(renderedHtml);
  }

  renderedHtml = renderedHtml.replace(/<h([1-6])([^>]*)id="([^"]*)"([^>]*)>/gi, (match, level, before, id, after) => {
    let cleanId = id.replace(/-?katex_(inline|block)_\d+/gi, '').replace(/-+$/, '').replace(/^-+/, '');
    if (!cleanId) cleanId = `heading-${level}`;
    return `<h${level}${before}id="${cleanId}"${after}>`;
  });

  return renderedHtml;
}

function findNotes(dir) {
  let res = [];
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) res.push(...findNotes(full));
    else if (f.name.endsWith('.md')) res.push(full);
  }
  return res;
}

const notes = findNotes('note-res');
console.log(`Scanning ${notes.length} notes for h2 containing div/ul...`);

for (const n of notes) {
  const content = fs.readFileSync(n, 'utf8');
  // quick check: does it have at least 10 headings?
  const headingMatches = content.match(/^## /gm);
  if (!headingMatches || headingMatches.length < 5) continue;

  const html = renderFile(content);
  dom.window.document.body.innerHTML = `
    <main>
      <section>
        <div id="note-viewport">
          <div id="note-container">
            <article class="markdown-rendered" id="note-article">
              ${html}
            </article>
          </div>
        </div>
      </section>
    </main>
  `;

  // Check if any h2 contains a div or ul
  const nestedH2 = dom.window.document.querySelectorAll('article#note-article h2 div, article#note-article h2 ul');
  if (nestedH2.length > 0) {
    console.log(`\n!!! FOUND NOTE WITH NESTED H2 CONTENT: ${n}`);
    console.log(`Nested elements in h2 count: ${nestedH2.length}`);
    const badH2 = dom.window.document.querySelectorAll('article#note-article h2');
    badH2.forEach((h, idx) => {
      if (h.querySelector('div, ul')) {
        console.log(`  h2 #${idx + 1} (id="${h.id}") contains: ${h.querySelectorAll('*').length} elements. Inner snippet: ${h.innerHTML.slice(0, 200)}`);
      }
    });

    const matchSel1 = dom.window.document.querySelector('main:nth-of-type(1) > section:nth-of-type(1) > div#note-viewport:nth-of-type(1) > div#note-container:nth-of-type(1) > article#note-article:nth-of-type(1) > h2#heading-2:nth-of-type(10) > div:nth-of-type(1) > div:nth-of-type(2) > ul:nth-of-type(12) > li:nth-of-type(2) > ul:nth-of-type(1) > li:nth-of-type(3) > p:nth-of-type(1)');
    console.log('Matches EXACT selector 1?', matchSel1 !== null);
  }
}
