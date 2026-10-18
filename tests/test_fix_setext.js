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
text = window.ObsidianCallouts.autoHealCallouts(text);
text = window.ObsidianExtendedMarkdown.preprocess(text);
text = text.replace(/^(#{1,6})([^ \s#\n\r].*?\s+.*)$/gm, '$1 $2');
text = text.replace(/([^\n\r])\r?\n(>[ \t]*[^\n\r]+)/g, '$1\n\n$2');
text = text.replace(/([^\n\r])\r?\n([ \t]*\|[^\n\r]+\|\r?\n[ \t]*\|[\s\-:|]+\|)/g, '$1\n\n$2');
text = text.replace(/([^\n\r])\r?\n(>[ \t]*\|[^\n\r]+\|\r?\n>[ \t]*\|[\s\-:|]+\|)/g, '$1\n\n$2');

// Ensure horizontal rules (---) have blank lines before and after so they don't form setext headings
text = text.replace(/([^\n\r])\r?\n([ \t]*-{3,}[ \t]*)\r?\n([^\n\r])/g, '$1\n\n$2\n\n$3');
text = text.replace(/([^\n\r])\r?\n([ \t]*-{3,}[ \t]*)$/gm, '$1\n\n$2');

const codeBlocksMap = new Map();
let codeBlockIdx = 0;
text = text.replace(/```[\s\S]*?```/g, (match) => {
  return `@@OBS_FENCED_BLOCK_${codeBlockIdx++}@@`;
});
text = text.replace(/`[^`\n\r]+`/g, (match) => {
  return `@@OBS_INLINE_CODE_${codeBlockIdx++}@@`;
});

text = window.ObsidianCallouts.processCallouts(text, codeBlocksMap);
// Ensure callout tokens have blank lines before and after
text = text.replace(/([^\n\r])\r?\n(@@OBS_CALLOUT_BLOCK_\d+@@)/g, '$1\n\n$2');
text = text.replace(/(@@OBS_CALLOUT_BLOCK_\d+@@)\r?\n([^\n\r])/g, '$1\n\n$2');
// Also ensure horizontal rules after callouts have blank line
text = text.replace(/(@@OBS_CALLOUT_BLOCK_\d+@@)\s*\n\s*(-{3,})/g, '$1\n\n$2\n\n');

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
});
