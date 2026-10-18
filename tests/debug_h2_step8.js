import fs from 'fs';
import { JSDOM } from 'jsdom';
import katex from 'katex';
import { marked } from 'marked';

const dom = new JSDOM();
global.window = dom.window;
global.document = dom.window.document;
window.katex = katex;
window.marked = marked;

eval(fs.readFileSync('site-lib/scripts/extended-markdown-features.js', 'utf8'));
eval(fs.readFileSync('site-lib/scripts/math-renderer.js', 'utf8'));
eval(fs.readFileSync('site-lib/scripts/callout-renderer.js', 'utf8'));

const content = fs.readFileSync('note-res/ai-comprehension/acc-304-cost-accounting-i/acc-304-notes-step-8.md', 'utf8');

let text = content;
if (text.startsWith('---')) {
  const fmEnd = text.indexOf('\n---', 3);
  if (fmEnd !== -1) text = text.substring(fmEnd + 4).trim();
}

text = window.ObsidianCallouts.autoHealCallouts(text);
text = window.ObsidianExtendedMarkdown.preprocess(text);
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

text = window.ObsidianCallouts.processCallouts(text, codeBlocksMap);
text = window.ObsidianMathRenderer.extractAndTokenize(text);

for (const [token, codeContent] of codeBlocksMap.entries()) {
  text = text.replaceAll(token, codeContent);
}

let renderedHtml = marked.parse(text);
renderedHtml = window.ObsidianCallouts.postprocessHtml(renderedHtml);
renderedHtml = window.ObsidianMathRenderer.restoreTokens(renderedHtml);
renderedHtml = window.ObsidianExtendedMarkdown.postprocess(renderedHtml);

dom.window.document.body.innerHTML = renderedHtml;
const allH2 = dom.window.document.querySelectorAll('h2');
console.log('Total h2 found:', allH2.length);
allH2.forEach((h, i) => {
  console.log(`h2 #${i + 1}: length=${h.innerHTML.length} text="${h.textContent.trim().slice(0, 40)}" hasDiv=${h.querySelector('div') !== null}`);
  if (h.querySelector('div')) {
    console.log(`   --> First 200 chars of innerHTML: ${h.innerHTML.slice(0, 200).replace(/\n/g, ' ')}`);
  }
});
