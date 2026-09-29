#!/usr/bin/env python3
"""
Vault Health & Markdown Syntax Diagnostic Engine
------------------------------------------------
Scans, lints, and auto-resolves Obsidian Markdown syntax errors:
- Unbalanced/mismatched LaTeX display math delimiters ($$)
- Malformed Obsidian callouts (> [!type])
- Broken WikiLinks, transclusions, and missing attachment embeds
- Unformatted headings (missing space after #, while protecting tags)
- Unbalanced code fences (```)
- SVG font family normalization
"""

import os
import re
import json
import html
from pathlib import Path

class VaultLinter:
    def __init__(self, root_dir, target_vault_dir='note-res', auto_fix=False):
        self.root_dir = os.path.abspath(root_dir)
        self.vault_dir = os.path.join(self.root_dir, target_vault_dir) if os.path.exists(os.path.join(self.root_dir, target_vault_dir)) else self.root_dir
        self.auto_fix = auto_fix
        self.all_notes = []
        self.all_assets = set()
        self.asset_basename_cache = {}
        self.note_stems = {}
        self.vault_lookup = {}
        self.report = {
            "summary": {
                "totalFiles": 0,
                "cleanFiles": 0,
                "filesWithWarnings": 0,
                "totalIssues": 0,
                "autoFixedIssues": 0,
                "healthScore": 100
            },
            "issues": []
        }

    def slugify(self, text: str, is_directory: bool = False) -> str:
        """Standard URL-safe kebab-case slugification supporting full Unicode/i18n."""
        if not text:
            return ""
        if not is_directory:
            base, ext = os.path.splitext(text)
            if base.lower() == 'index':
                return f"index{ext.lower()}"
            t = html.unescape(base).replace('&', ' and ').lower()
            t = re.sub(r'[^\w\s_-]', '', t, flags=re.UNICODE)
            t = re.sub(r'[\s_]+', '-', t)
            t = re.sub(r'-+', '-', t)
            slug = t.strip('-') or 'untitled'
            return f"{slug}{ext.lower()}"
        else:
            t = html.unescape(text).replace('&', ' and ').lower()
            t = re.sub(r'[^\w\s_-]', '', t, flags=re.UNICODE)
            t = re.sub(r'[\s_]+', '-', t)
            t = re.sub(r'-+', '-', t)
            slug = t.strip('-') or 'untitled-folder'
            return slug

    def slugify_path(self, path_str: str) -> str:
        clean = re.sub(r'^(?:bba study|note-res|vault|\[inside\][^/]+)/', '', path_str, flags=re.IGNORECASE).strip('/\\')
        parts = clean.replace('\\', '/').split('/')
        if not parts or not parts[0]:
            return path_str
        slug_parts = [self.slugify(p, is_directory=True) for p in parts[:-1]]
        slug_parts.append(self.slugify(parts[-1], is_directory=False))
        return '/'.join(slug_parts)

    def load_vault_index(self):
        """Read site-lib/vault-index.json to utilize rich lookup dictionaries."""
        index_path = os.path.join(self.root_dir, 'site-lib', 'vault-index.json')
        if os.path.exists(index_path):
            try:
                with open(index_path, 'r', encoding='utf-8') as fh:
                    data = json.load(fh)
                    if isinstance(data, dict):
                        self.vault_lookup = data.get('lookup', {})
            except Exception as e:
                print(f"Notice: Could not load vault-index.json for linter: {e}")

    def collect_vault_index(self):
        """Single-pass I/O map of all notes and assets for link and embed validation."""
        self.load_vault_index()
        self.all_notes = []
        self.all_assets = set()
        self.asset_basename_cache = {}
        self.note_stems = {}

        md_files = []

        # 1. Walk filesystem to map raw assets and filenames
        for root, _, files in os.walk(self.vault_dir):
            for f in files:
                abs_f = os.path.join(root, f)
                rel = os.path.relpath(abs_f, self.root_dir).replace('\\', '/')
                f_lower = f.lower()
                rel_lower = rel.lower()
                clean_rel = re.sub(r'^(?:note-res|\[inside\][^/]+)/', '', rel_lower)
                
                self.all_assets.add(f_lower)
                self.all_assets.add(rel_lower)
                self.all_assets.add(clean_rel)
                self.all_assets.add(self.slugify(f, is_directory=False))
                self.all_assets.add(self.slugify_path(clean_rel))
                
                # Cache alphanumeric base for O(1) asset resolution (Supports Unicode/i18n)
                base_clean = re.sub(r'[^\w]', '', f_lower, flags=re.UNICODE)
                self.all_assets.add(base_clean)
                self.all_assets.add(re.sub(r'[^\w]', '', clean_rel, flags=re.UNICODE))

                if base_clean not in self.asset_basename_cache:
                    rel_to_vault = re.sub(r'^(?:note-res|\[inside\][^/]+)/', '', rel)
                    self.asset_basename_cache[base_clean] = rel_to_vault

                if f.endswith('.md'):
                    md_files.append((abs_f, rel, clean_rel, f))

        # 2. Single rapid-read pass for markdown frontmatter/metadata
        for abs_f, rel, clean_rel, f in md_files:
            try:
                with open(abs_f, 'r', encoding='utf-8', errors='ignore') as fh:
                    content = fh.read()
            except Exception:
                continue

            # Respect publish: false 
            m_pub = re.search(r'^publish:\s*(false|true)', content, flags=re.MULTILINE | re.IGNORECASE)
            if m_pub and m_pub.group(1).lower() == 'false':
                continue

            self.all_notes.append(rel)
            clean_stem = f.replace('.md', '').lower().strip()
            stems_to_add = [clean_stem, clean_rel.replace('.md', '')]
            
            # Extract YAML Aliases
            m_aliases = re.search(r'^aliases:\s*\[(.*?)\]', content, flags=re.MULTILINE | re.IGNORECASE)
            if m_aliases:
                for al in m_aliases.group(1).split(','):
                    v = al.strip().strip("'\"")
                    if v: stems_to_add.append(v.lower())
            else:
                m_aliases_multi = re.search(r'^aliases:\s*\n((?:[ \t]+-.*\n)+)', content, flags=re.MULTILINE | re.IGNORECASE)
                if m_aliases_multi:
                    for line in m_aliases_multi.group(1).split('\n'):
                        v = line.replace('-', '').strip().strip("'\"")
                        if v: stems_to_add.append(v.lower())

            # Extract Primary H1 Heading
            m_h1 = re.search(r'^#[ \t]+([^#\n\r]+)', content, flags=re.MULTILINE)
            if m_h1:
                stems_to_add.append(m_h1.group(1).strip().lower())

            # Register lookup stems
            for st in stems_to_add:
                if not st: 
                    continue
                self.note_stems[st] = rel
                self.note_stems[st.replace('-', ' ')] = rel
                self.note_stems[st.replace(' ', '-')] = rel
                self.note_stems[st.replace('_', '-')] = rel
                self.note_stems[st.replace('_', ' ')] = rel
                self.note_stems[re.sub(r'[^\w]', '', st, flags=re.UNICODE)] = rel

    def is_wikilink_resolved(self, inner):
        """Check if internal wikilink target exists via lookup dictionary or stem mapping."""
        if not inner:
            return True
        
        clean_target = inner.split('#')[0].split('^')[0].strip()
        if not clean_target:
            return True # Same-file anchor link [[#Heading]]

        clean_inner = re.sub(r'^(?:bba study|note-res|vault)/', '', clean_target, flags=re.IGNORECASE).strip()
        
        if self.vault_lookup:
            keys_to_check = [
                clean_target, clean_target.lower(), clean_inner, clean_inner.lower(),
                self.slugify(clean_inner), clean_inner.replace('_', ' '),
                clean_inner.replace('_', '-'), clean_inner.replace('-', ' '),
                re.sub(r'[^\w]', '', clean_inner.lower(), flags=re.UNICODE),
                os.path.basename(clean_inner).lower(), self.slugify(os.path.basename(clean_inner))
            ]
            for k in keys_to_check:
                if k in self.vault_lookup: return True

        target_clean = clean_inner.replace('.md', '').lower().split('/')[-1]
        stems_to_check = [
            target_clean, clean_inner.lower(), self.slugify(target_clean),
            target_clean.replace('_', '-'), target_clean.replace('_', ' '),
            target_clean.replace('-', ' '),
            re.sub(r'[^\w]', '', target_clean, flags=re.UNICODE),
            re.sub(r'[^\w]', '', clean_inner.lower(), flags=re.UNICODE)
        ]
        for s in stems_to_check:
            if s in self.note_stems: return True

        return False

    def is_asset_resolved(self, fname):
        """Check if asset or media file exists in all_assets."""
        clean_fname = re.sub(r'^(?:bba study|note-res|vault)/', '', fname, flags=re.IGNORECASE).strip().lower()
        base_fname = os.path.basename(clean_fname)

        candidates = [
            clean_fname, base_fname, self.slugify_path(clean_fname),
            self.slugify(base_fname, is_directory=False),
            re.sub(r'[^\w]', '', base_fname, flags=re.UNICODE),
            re.sub(r'[^\w]', '', clean_fname, flags=re.UNICODE)
        ]
        return any(c in self.all_assets for c in candidates)

    def check_unbalanced_display_math(self, content, file_path):
        """Global scanner for detecting unbalanced $$ display blocks."""
        # Mask out code fences robustly
        text = re.sub(r'(?m)^[ \t]*(`{3,}|~{3,}).*?^\1', '', content, flags=re.DOTALL)
        # Mask out inline code
        text = re.sub(r'`[^`\n]+`', '', text)
        # Mask out escaped dollars
        text = text.replace(r'\$', '')
        
        display_math_count = len(re.findall(r'\$\$', text))
        if display_math_count % 2 != 0:
            return [{
                "file": file_path,
                "line": content.count('\n') + 1,
                "category": "LaTeX / Math",
                "severity": "error",
                "message": f"Unbalanced display math delimiters: odd number ({display_math_count}) of '$$' markers found.",
                "snippet": "$$",
                "suggestion": "Ensure all '$$' blocks are properly closed.",
                "autoFixed": False
            }]
        return []

    def lint_file(self, file_path):
        """Lint an individual markdown file and optionally auto-fix safe typos."""
        abs_path = os.path.join(self.root_dir, file_path) if not os.path.isabs(file_path) else file_path
        if not os.path.exists(abs_path):
            return []

        try:
            with open(abs_path, 'r', encoding='utf-8') as fh:
                content = fh.read()
        except Exception as e:
            return [{
                "file": file_path, "line": 1, "category": "File Error", "severity": "error",
                "message": f"Could not read file: {e}", "snippet": "", "suggestion": "", "autoFixed": False
            }]

        file_issues = []
        is_file_modified = False

        # --- 1. Math Balance Check ---
        file_issues.extend(self.check_unbalanced_display_math(content, file_path))

        # --- 2. Code Fence Check ---
        code_fence_count = len(re.findall(r'(?m)^[ \t]*(`{3,}|~{3,})', content))
        if code_fence_count % 2 != 0:
            file_issues.append({
                "file": file_path, "line": content.count('\n') + 1, "category": "Code Fence", "severity": "error",
                "message": f"Unbalanced code fences detected ({code_fence_count} block markers).",
                "snippet": "```", "suggestion": "Ensure all code blocks are properly closed.", "autoFixed": False
            })

        # --- Line-by-line processing for Headings & Callouts ---
        lines = content.split('\n')
        in_code_block = False
        fence_str = ""
        
        for idx, line in enumerate(lines, start=1):
            # Strict logic for nested code blocks
            m_fence = re.match(r'^[ \t]*(`{3,}|~{3,})', line)
            if not in_code_block and m_fence:
                in_code_block = True
                fence_str = m_fence.group(1)
                continue
            elif in_code_block and m_fence and m_fence.group(1) == fence_str:
                in_code_block = False
                continue
                
            if in_code_block:
                continue

            # Heading Check (Must contain space elsewhere in the line to actively avoid stripping #tags)
            m_head = re.match(r'^(#{1,6})([^ \s#\n\r].*?\s+.*)$', line)
            if m_head and not line.startswith('#!'):
                fixed_line = f"{m_head.group(1)} {m_head.group(2)}"
                file_issues.append({
                    "file": file_path, "line": idx, "category": "Heading", "severity": "warning",
                    "message": "Heading missing space after '#' delimiter.", "snippet": line[:100],
                    "suggestion": f"Change to: '{fixed_line[:100]}'", "autoFixed": self.auto_fix
                })
                if self.auto_fix:
                    lines[idx-1] = fixed_line
                    is_file_modified = True

            # Callout Check
            m_callout = re.match(r'^[ \t]*> ?\[!([a-zA-Z0-9_\-]+)\]([+-]?)(?:[ \t]*(.*))?$', line)
            if m_callout:
                ctype, fold, title = m_callout.group(1), m_callout.group(2) or "", m_callout.group(3) or ""
                normalized = f"> [!{ctype}]{fold}" + (f" {title}" if title else "")
                if normalized != line.rstrip('\r\n'):
                    file_issues.append({
                        "file": file_path, "line": idx, "category": "Callout", "severity": "warning",
                        "message": "Callout missing standard spacing after '>' or '[!type]'.", "snippet": line[:100],
                        "suggestion": f"Change to: '{normalized[:100]}'", "autoFixed": self.auto_fix
                    })
                    if self.auto_fix:
                        lines[idx-1] = normalized
                        is_file_modified = True

        modified_content = '\n'.join(lines)

        # --- 3. Media Embed Normalization (with exact line numbers) ---
        def normalize_media_embed(match):
            nonlocal is_file_modified
            embed = match.group(1)
            reference, separator, options = embed.partition('|')
            reference = reference.strip()
            normalized = self.normalize_media_reference(file_path, reference)
            if not normalized or normalized == reference:
                return match.group(0)

            line_no = modified_content.count('\n', 0, match.start()) + 1
            file_issues.append({
                "file": file_path, "line": line_no, "category": "Media Embed", "severity": "info",
                "message": f"Normalized media path '{reference}' for the published reader.",
                "snippet": f"![[{embed}]]", "suggestion": f"Use '![[{normalized}{separator}{options}]]'.",
                "autoFixed": self.auto_fix
            })
            if self.auto_fix:
                is_file_modified = True
                suffix = f"{separator}{options}" if separator else ''
                return f"![[{normalized}{suffix}]]"
            return match.group(0)

        modified_content = re.sub(r'!\[\[([^\]\n]+)\]\]', normalize_media_embed, modified_content)

        # --- 4. Validation of Links and Transclusions ---
        def mask_code(m): return "\x00" * len(m.group(0))
        masked_content = re.sub(r'(?m)^[ \t]*(`{3,}|~{3,}).*?^\1', mask_code, modified_content, flags=re.DOTALL)
        masked_content = re.sub(r'`[^`\n]+`', mask_code, masked_content)

        # Find WikiLinks [[Target]]
        for match in re.finditer(r'(?<!!)\[\[([^\]\n]+)\]\]', masked_content):
            line_no = masked_content.count('\n', 0, match.start()) + 1
            inner = match.group(1).split('|')[0].strip()
            if inner.startswith('#') or inner.startswith('^'): continue
            
            target_base = inner.split('#')[0].split('^')[0].strip()
            if not target_base: continue
            
            clean_target = re.sub(r'^(?:bba study|note-res|vault)/', '', target_base, flags=re.IGNORECASE).strip()

            if clean_target.lower().endswith(('.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.pdf')):
                if not self.is_asset_resolved(clean_target):
                    file_issues.append({
                        "file": file_path, "line": line_no, "category": "Media Embed", "severity": "warning",
                        "message": f"Asset '{inner}' not found in vault.", "snippet": f"[[{match.group(1)}]]",
                        "suggestion": f"Ensure '{inner}' exists.", "autoFixed": False
                    })
                continue

            if not self.is_wikilink_resolved(clean_target):
                file_issues.append({
                    "file": file_path, "line": line_no, "category": "WikiLink", "severity": "info",
                    "message": f"Unresolved internal link to '[[{inner}]]'.", "snippet": f"[[{match.group(1)}]]",
                    "suggestion": f"Verify note '{inner}.md' exists.", "autoFixed": False
                })

        # Find Media/Transclusions ![[Target]]
        for match in re.finditer(r'!\[\[([^\]\n]+)\]\]', masked_content):
            line_no = masked_content.count('\n', 0, match.start()) + 1
            embed = match.group(1)
            fname = embed.split('|')[0].strip()
            clean_fname = re.sub(r'^(?:bba study|note-res|vault)/', '', fname, flags=re.IGNORECASE).strip()
            
            if clean_fname.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.mp4', '.webm')):
                if not self.is_asset_resolved(clean_fname):
                    file_issues.append({
                        "file": file_path, "line": line_no, "category": "Media Embed", "severity": "warning",
                        "message": f"Missing image or attachment asset '{fname}'.", "snippet": f"![[{embed}]]",
                        "suggestion": f"Ensure '{fname}' is in vault.", "autoFixed": False
                    })
            else:
                if not self.is_wikilink_resolved(clean_fname):
                    file_issues.append({
                        "file": file_path, "line": line_no, "category": "Transclusion", "severity": "info",
                        "message": f"Unresolved note transclusion '![[{fname}]]'.", "snippet": f"![[{embed}]]",
                        "suggestion": f"Verify note '{clean_fname}.md' exists.", "autoFixed": False
                    })

        if self.auto_fix and is_file_modified:
            try:
                with open(abs_path, 'w', encoding='utf-8') as out_f:
                    out_f.write(modified_content)
            except Exception as e:
                print(f"Notice: Could not write auto-fixed file {file_path}: {e}")

        return file_issues

    def normalize_media_reference(self, file_path, reference):
        """Return a published-vault media path only when the asset exists."""
        if not reference.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.mp4', '.webm')):
            return reference

        clean_reference = reference.replace('\\', '/').strip()
        clean_reference = re.sub(r'^\./', '', clean_reference)
        clean_reference = re.sub(r'^(?:bba study|vault)/', '', clean_reference, flags=re.IGNORECASE)
        clean_reference = re.sub(r'^note-res/', '', clean_reference, flags=re.IGNORECASE)

        slugified_ref = self.slugify_path(clean_reference)

        note_path = Path(self.root_dir) / file_path
        note_directory = note_path.parent
        candidates = []
        if clean_reference:
            candidates.append((Path(self.vault_dir) / clean_reference, clean_reference))
            candidates.append((note_directory / clean_reference, reference))
            candidates.append((Path(self.vault_dir) / slugified_ref, slugified_ref))
            candidates.append((note_directory / os.path.basename(slugified_ref), os.path.basename(slugified_ref)))

        for candidate, published_reference in candidates:
            if candidate.is_file():
                return published_reference.replace('\\', '/')

        base_clean = re.sub(r'[^\w]', '', os.path.basename(clean_reference).lower(), flags=re.UNICODE)
        if base_clean in self.asset_basename_cache:
            return self.asset_basename_cache[base_clean]

        return reference

    def normalize_svg_fonts(self):
        """Normalize SVG font declarations to the bundled reader font."""
        fixes = []
        for root, _, files in os.walk(self.vault_dir):
            for name in files:
                if not name.lower().endswith('.svg'):
                    continue

                abs_path = os.path.join(root, name)
                rel_path = os.path.relpath(abs_path, self.root_dir).replace('\\', '/')
                try:
                    with open(abs_path, 'r', encoding='utf-8') as fh:
                        content = fh.read()
                except (OSError, UnicodeDecodeError):
                    continue

                normalized = re.sub(
                    r'(font-family\s*:\s*)[^;}]+(?=;|})',
                    r'\1Inter, sans-serif',
                    content,
                    flags=re.IGNORECASE
                )
                normalized = re.sub(
                    r'(font-family\s*=\s*["\'])[^"\']+(["\'])',
                    r'\1Inter, sans-serif\2',
                    normalized,
                    flags=re.IGNORECASE
                )
                if normalized == content:
                    continue

                fixes.append({
                    "file": rel_path,
                    "line": 1,
                    "category": "Diagram Font",
                    "severity": "info",
                    "message": "Normalized SVG font declarations to the bundled Inter font.",
                    "snippet": "font-family",
                    "suggestion": "Use Inter, sans-serif for diagram labels.",
                    "autoFixed": self.auto_fix
                })
                if self.auto_fix:
                    try:
                        with open(abs_path, 'w', encoding='utf-8') as fh:
                            fh.write(normalized)
                    except OSError:
                        fixes[-1]["autoFixed"] = False

        return fixes

    def run_all(self):
        """Run full scan and produce health report."""
        self.collect_vault_index()
        all_issues = []
        clean_count = 0
        fixed_count = 0

        asset_issues = self.normalize_svg_fonts()
        fixed_count += sum(1 for issue in asset_issues if issue.get('autoFixed'))
        all_issues.extend(issue for issue in asset_issues if not issue.get('autoFixed'))

        for note_path in sorted(self.all_notes):
            issues = self.lint_file(note_path)
            fixed_issues = [issue for issue in issues if issue.get('autoFixed')]
            unresolved_issues = [issue for issue in issues if not issue.get('autoFixed')]
            fixed_count += len(fixed_issues)
            all_issues.extend(unresolved_issues)
            if not unresolved_issues:
                clean_count += 1

        total_files = len(self.all_notes)
        files_with_issues = total_files - clean_count
        
        health_score = int((clean_count / max(1, total_files)) * 100) if total_files > 0 else 100

        self.report = {
            "summary": {
                "totalFiles": total_files,
                "cleanFiles": clean_count,
                "filesWithWarnings": files_with_issues,
                "totalIssues": len(all_issues),
                "autoFixedIssues": fixed_count,
                "healthScore": health_score
            },
            "issues": all_issues
        }

        site_lib_dir = os.path.join(self.root_dir, 'site-lib')
        os.makedirs(site_lib_dir, exist_ok=True)
        health_json_path = os.path.join(site_lib_dir, 'vault-health.json')
        try:
            with open(health_json_path, 'w', encoding='utf-8') as out_h:
                json.dump(self.report, out_h, indent=2)
        except Exception as e:
            print(f"Notice: Could not write vault-health.json: {e}")

        return self.report

if __name__ == '__main__':
    import sys
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    root = args[0] if len(args) > 0 else '.'
    fix = '--fix' in sys.argv or '--auto-fix' in sys.argv
    linter = VaultLinter(root, auto_fix=fix)
    rep = linter.run_all()
    print(f"Vault Health Scan Complete: Score {rep['summary']['healthScore']}% | {rep['summary']['totalFiles']} Files | {rep['summary']['totalIssues']} Issues ({rep['summary']['autoFixedIssues']} Auto-Fixed)")
