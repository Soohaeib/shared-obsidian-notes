#!/usr/bin/env python3
"""
Vault Health & Markdown Syntax Diagnostic Engine
------------------------------------------------
Scans, lints, and auto-resolves Obsidian Markdown syntax errors:
- Nested/unbalanced math delimiters ($...$$)
- Malformed Obsidian callouts (> [!type])
- Broken WikiLinks and missing attachment embeds
- Unformatted headings (missing space after #)
- Unbalanced code fences (```)
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
        """Standard URL-safe kebab-case slugification matching sync_site.py."""
        if not text:
            return ""
        if not is_directory:
            base, ext = os.path.splitext(text)
            if base.lower() == 'index':
                return f"index{ext.lower()}"
            t = html.unescape(base).replace('&', ' and ').lower()
            t = re.sub(r'[^a-z0-9\s_-]', '', t)
            t = re.sub(r'[\s_]+', '-', t)
            t = re.sub(r'-+', '-', t)
            slug = t.strip('-') or 'untitled'
            return f"{slug}{ext.lower()}"
        else:
            t = html.unescape(text).replace('&', ' and ').lower()
            t = re.sub(r'[^a-z0-9\s_-]', '', t)
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

    def is_publishable(self, abs_path):
        """Returns False ONLY if markdown file has publish: false in its YAML frontmatter."""
        try:
            with open(abs_path, 'r', encoding='utf-8', errors='ignore') as f:
                first_line = f.readline()
                if not first_line.startswith('---'):
                    return True
                
                frontmatter_lines = []
                for line in f:
                    if line.startswith('---'):
                        break
                    frontmatter_lines.append(line)
                
                for line in frontmatter_lines:
                    line = line.strip()
                    if not line or line.startswith('#'):
                        continue
                    if ':' in line:
                        key, val = line.split(':', 1)
                        if key.strip().lower() == 'publish':
                            val_cleaned = val.strip().strip("'\"").lower()
                            if val_cleaned == 'false':
                                return False
        except Exception:
            pass
        return True

    def collect_vault_index(self):
        """Map all notes and assets for link and embed validation."""
        self.load_vault_index()
        self.all_notes = []
        self.all_assets = set()
        self.note_stems = {}

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
                self.all_assets.add(re.sub(r'[^a-z0-9]', '', f_lower))
                self.all_assets.add(re.sub(r'[^a-z0-9]', '', clean_rel))

                if f.endswith('.md'):
                    # Only lints and resolves targets of publishable notes
                    if self.is_publishable(abs_f):
                        self.all_notes.append(rel)
                        clean_stem = f.replace('.md', '').lower().strip()
                        self.note_stems[clean_stem] = rel
                        self.note_stems[clean_stem.replace('-', ' ')] = rel
                        self.note_stems[clean_stem.replace(' ', '-')] = rel
                        self.note_stems[clean_stem.replace('_', '-')] = rel
                        self.note_stems[clean_stem.replace('_', ' ')] = rel
                        self.note_stems[clean_rel.replace('.md', '')] = rel
                        self.note_stems[clean_rel.replace('.md', '').replace('-', ' ')] = rel
                        self.note_stems[clean_rel.replace('.md', '').replace(' ', '-')] = rel
                        self.note_stems[rel_lower.replace('.md', '')] = rel

    def is_wikilink_resolved(self, inner):
        """Check if internal wikilink target exists via lookup dictionary or stem mapping."""
        if not inner:
            return True
        clean_inner = re.sub(r'^(?:bba study|note-res|vault)/', '', inner, flags=re.IGNORECASE).strip()
        
        # 1. Try vault_lookup dictionary from vault-index.json
        if self.vault_lookup:
            keys_to_check = [
                inner,
                inner.lower(),
                clean_inner,
                clean_inner.lower(),
                self.slugify(clean_inner),
                clean_inner.replace('_', ' '),
                clean_inner.replace('_', '-'),
                clean_inner.replace('-', ' '),
                re.sub(r'[^a-z0-9]', '', clean_inner.lower()),
                os.path.basename(clean_inner),
                os.path.basename(clean_inner).lower(),
                self.slugify(os.path.basename(clean_inner)),
                re.sub(r'[^a-z0-9]', '', os.path.basename(clean_inner).lower())
            ]
            for k in keys_to_check:
                if k in self.vault_lookup:
                    return True

        # 2. Fallback check against note_stems
        target_clean = clean_inner.replace('.md', '').lower().split('/')[-1]
        stems_to_check = [
            target_clean,
            clean_inner.lower(),
            self.slugify(target_clean),
            target_clean.replace('_', '-'),
            target_clean.replace('_', ' '),
            target_clean.replace('-', ' '),
            re.sub(r'[^a-z0-9]', '', target_clean)
        ]
        for s in stems_to_check:
            if s in self.note_stems:
                return True

        return False

    def is_asset_resolved(self, fname):
        """Check if asset or media file exists in all_assets."""
        clean_fname = re.sub(r'^(?:bba study|note-res|vault)/', '', fname, flags=re.IGNORECASE).strip().lower()
        base_fname = os.path.basename(clean_fname)

        candidates = [
            clean_fname,
            base_fname,
            self.slugify_path(clean_fname),
            self.slugify(base_fname, is_directory=False),
            re.sub(r'[^a-z0-9]', '', base_fname),
            re.sub(r'[^a-z0-9]', '', clean_fname)
        ]
        return any(c in self.all_assets for c in candidates)

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
                "file": file_path,
                "line": 1,
                "category": "File Error",
                "severity": "error",
                "message": f"Could not read file: {e}",
                "snippet": "",
                "autoFixed": False
            }]

        lines = content.split('\n')
        file_issues = []
        is_file_modified = False

        # 1. Check & Repair Heading format (e.g., "###Heading" -> "### Heading")
        for idx, line in enumerate(lines, start=1):
            m = re.match(r'^(#{1,6})([^\s#\n\r].*)$', line)
            if m and not line.startswith('#!'):
                fixed_line = f"{m.group(1)} {m.group(2)}"
                file_issues.append({
                    "file": file_path,
                    "line": idx,
                    "category": "Callout",
                    "severity": "warning",
                    "message": "Heading missing space after '#' delimiter.",
                    "snippet": line[:100],
                    "suggestion": f"Change to: '{fixed_line[:100]}'",
                    "autoFixed": self.auto_fix
                })
                if self.auto_fix:
                    lines[idx-1] = fixed_line
                    is_file_modified = True

        # 2. Check & Repair Malformed Callouts (e.g., ">[!note]Title" -> "> [!note] Title")
        for idx, line in enumerate(lines, start=1):
            m = re.match(r'^[ \t]*>\[!([a-zA-Z0-9_\-]+)\]([^\s\n<].*)$', line)
            if m:
                fixed_line = re.sub(r'^[ \t]*>\[!([a-zA-Z0-9_\-]+)\]([^\s\n<].*)$', r'> [!\1] \2', line)
                file_issues.append({
                    "file": file_path,
                    "line": idx,
                    "category": "Callout",
                    "severity": "warning",
                    "message": "Callout missing spacing after '[!type]'.",
                    "snippet": line[:100],
                    "suggestion": f"Change to: '{fixed_line[:100]}'",
                    "autoFixed": self.auto_fix
                })
                if self.auto_fix:
                    lines[idx-1] = fixed_line
                    is_file_modified = True

        # Re-join lines for block-level checks
        modified_content = '\n'.join(lines)

        # 4. Check Code Fences (odd count of ```)
        code_fence_count = len(re.findall(r'^[ \t]*```', modified_content, flags=re.MULTILINE))
        if code_fence_count % 2 != 0:
            file_issues.append({
                "file": file_path,
                "line": len(lines),
                "category": "Callout",
                "severity": "error",
                "message": f"Unbalanced code fences detected ({code_fence_count} triple backtick markers).",
                "snippet": "```",
                "suggestion": "Ensure all code blocks are properly closed with ```.",
                "autoFixed": False
            })

        # 5. Check WikiLinks: [[Target]]
        wikilinks = re.findall(r'\[\[([^\]\n]+)\]\]', modified_content)
        for link in wikilinks:
            inner = link.split('|')[0].strip()
            if inner.startswith('#'):
                continue
            if '#' in inner:
                inner = inner.split('#')[0].strip()
            if not inner:
                continue

            # Strip vault prefixes
            clean_inner = re.sub(r'^(?:bba study|note-res|vault)/', '', inner, flags=re.IGNORECASE).strip()

            # If link points to media/graphic
            if clean_inner.lower().endswith(('.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.pdf')):
                if not self.is_asset_resolved(clean_inner):
                    file_issues.append({
                        "file": file_path,
                        "line": 1,
                        "category": "Media Embed",
                        "severity": "warning",
                        "message": f"Asset '{inner}' not found in vault.",
                        "snippet": f"[[{link}]]",
                        "suggestion": f"Ensure '{inner}' exists in the attachments directory.",
                        "autoFixed": False
                    })
                continue

            if not self.is_wikilink_resolved(clean_inner):
                file_issues.append({
                    "file": file_path,
                    "line": 1,
                    "category": "WikiLink",
                    "severity": "info",
                    "message": f"Unresolved internal link to '[[{inner}]]'.",
                    "snippet": f"[[{link}]]",
                    "suggestion": f"Verify note '{inner}.md' exists or update the target name.",
                    "autoFixed": False
                })

        # 6. Check Media Embeds: ![[image.png]]
        def normalize_media_embed(match):
            nonlocal is_file_modified

            embed = match.group(1)
            reference, separator, options = embed.partition('|')
            reference = reference.strip()
            normalized = self.normalize_media_reference(file_path, reference)
            if not normalized or normalized == reference:
                return match.group(0)

            file_issues.append({
                "file": file_path,
                "line": 1,
                "category": "Media Embed",
                "severity": "info",
                "message": f"Normalized media path '{reference}' for the published reader.",
                "snippet": f"![[{embed}]]",
                "suggestion": f"Use '![[{normalized}{separator}{options}]]'.",
                "autoFixed": True
            })
            is_file_modified = True
            suffix = f"{separator}{options}" if separator else ''
            return f"![[{normalized}{suffix}]]"

        modified_content = re.sub(
            r'!\[\[([^\]\n]+)\]\]',
            normalize_media_embed,
            modified_content
        )

        media_embeds = re.findall(r'!\[\[([^\]\n]+)\]\]', modified_content)
        for embed in media_embeds:
            fname = embed.split('|')[0].strip()
            clean_fname = re.sub(r'^(?:bba study|note-res|vault)/', '', fname, flags=re.IGNORECASE).strip()
            if clean_fname.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.mp4', '.webm')):
                if not self.is_asset_resolved(clean_fname):
                    file_issues.append({
                        "file": file_path,
                        "line": 1,
                        "category": "Media Embed",
                        "severity": "warning",
                        "message": f"Missing image or attachment asset '{fname}'.",
                        "snippet": f"![[{embed}]]",
                        "suggestion": f"Ensure '{fname}' is copied into the vault or note-res asset directory.",
                        "autoFixed": False
                    })

        # Save file if modified by auto-fix
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

        # Fuzzy search in vault_dir for file with matching alphanumeric basename
        base_clean = re.sub(r'[^a-z0-9]', '', os.path.basename(clean_reference).lower())
        for root, _, files in os.walk(self.vault_dir):
            for f in files:
                f_clean = re.sub(r'[^a-z0-9]', '', f.lower())
                if f_clean == base_clean:
                    found_abs = os.path.join(root, f)
                    rel_to_root = os.path.relpath(found_abs, self.root_dir).replace('\\', '/')
                    rel_to_vault = re.sub(r'^(?:note-res|\[inside\][^/]+)/', '', rel_to_root)
                    return rel_to_vault

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

        # Write site-lib/vault-health.json
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
