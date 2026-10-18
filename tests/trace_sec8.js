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

const codeBlocksMap = new Map();
let codeBlockIdx = 0;
text = text.replace(/```[\s\S]*?```/g, (match) => {
  return `@@OBS_FENCED_BLOCK_${codeBlockIdx++}@@`;
});
text = text.replace(/`[^`\n\r]+`/g, (match) => {
  return `@@OBS_INLINE_CODE_${codeBlockIdx++}@@`;
});

text = window.ObsidianCallouts.processCallouts(text, codeBlocksMap);

const processedLines = text.split('\n');
for (let i = 0; i < processedLines.length; i++) {
  if (processedLines[i].includes('8. Comprehensive')) {
    console.log('\nProcessed lines around Section 8:');
    console.log(processedLines.slice(Math.max(0, i - 2), i + 8).join('\n'));
    break;
  }
}
