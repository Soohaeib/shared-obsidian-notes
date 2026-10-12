#!/usr/bin/env python3
import glob
import re
from collections import Counter

md_files = glob.glob('note-res/**/*.md', recursive=True)
print(f'Total markdown files: {len(md_files)}')

block_pat = re.compile(r'\$\$([\s\S]*?)\$\$')
inline_pat = re.compile(r'(?<![\$\\])\$(?!\s)((?:\\.|[^$\\\n])+?)(?<!\s)\$')

env_counter = Counter()
advanced_constructs = Counter()
total_blocks = 0
total_inlines = 0

notes_with_mathjax = []

for f in md_files:
    with open(f, 'r', encoding='utf-8') as fh:
        text = fh.read()
    
    # Strip code blocks
    text_no_code = re.sub(r'```[\s\S]*?```', '', text)
    text_no_code = re.sub(r'`[^`\n]+`', '', text_no_code)

    has_mj = False
    for m in block_pat.finditer(text_no_code):
        formula = m.group(1).strip()
        if formula:
            total_blocks += 1
            if r'\multicolumn' in formula: 
                advanced_constructs['multicolumn'] += 1
                has_mj = True
            if r'\cline' in formula: 
                advanced_constructs['cline'] += 1
                has_mj = True
            if r'\renewcommand' in formula: 
                advanced_constructs['renewcommand'] += 1
                has_mj = True
            for env in re.findall(r'\\begin\{([a-zA-Z*0-9]+)\}', formula):
                env_counter[env] += 1
                if env in ['aligned', 'alignedat', 'gathered', 'gather', 'multline', 'split', 'cases']:
                    has_mj = True

    for m in inline_pat.finditer(text_no_code):
        formula = m.group(1).strip()
        if formula:
            total_inlines += 1
            if r'\multicolumn' in formula or r'\cline' in formula or r'\renewcommand' in formula:
                has_mj = True

    if has_mj:
        notes_with_mathjax.append(f)

print(f'Total block math: {total_blocks}')
print(f'Total inline math: {total_inlines}')
print('Environments found:', env_counter.most_common(20))
print('Advanced constructs:', advanced_constructs)
print(f'Notes requiring MathJax fallback: {len(notes_with_mathjax)}')
for n in notes_with_mathjax[:10]:
    print(' -', n)
