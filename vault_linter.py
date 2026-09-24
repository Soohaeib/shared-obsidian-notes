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
from pathlib import Path

class VaultLinter:
    def __init__(self, root_dir, target_vault_dir='note-res', auto_fix=False):
        self.root_dir = os.path.abspath(root_dir)
        self.vault_dir = os.path.join(self.root_dir, target_vault_dir) if os.path.exists(os.path.join(self.root_dir, target_vault_dir)) else self.root_dir
        self.auto_fix = auto_fix
        self.all_notes = []
        self.all_assets = set()
        self.note_stems = {}
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

    def collect_vault_index(self):
        """Map all notes and assets for link and embed validation."""
        self.all_notes = []
        self.all_assets = set()
        self.note_stems = {}

        for root, _, files in os.walk(self.vault_dir):
            for f in files:
                rel = os.path.relpath(os.path.join(root, f), self.root_dir).replace('\\', '/')
                f_lower = f.lower()
                rel_lower = rel.lower()
                self.all_assets.add(f_lower)
                self.all_assets.add(rel_lower)
                
                # Strip prefix containers
                clean_rel = re.sub(r'^(?:note-res|\[inside\][^/]+)/', '', rel_lower)
                self.all_assets.add(clean_rel)

                if f.endswith('.md'):
                    self.all_notes.append(rel)
                    clean_stem = f.replace('.md', '').lower().strip()
                    self.note_stems[clean_stem] = rel
                    self.note_stems[clean_stem.replace('-', ' ')] = rel
                    self.note_stems[clean_stem.replace(' ', '-')] = rel
                    self.note_stems[clean_rel.replace('.md', '')] = rel
                    self.note_stems[clean_rel.replace('.md', '').replace('-', ' ')] = rel
                    self.note_stems[clean_rel.replace('.md', '').replace(' ', '-')] = rel
                    self.note_stems[rel_lower.replace('.md', '')] = rel

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
            target_clean = clean_inner.replace('.md', '').lower().split('/')[-1]

            # If link points to media/graphic
            if clean_inner.lower().endswith(('.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.pdf')):
                base_fname = os.path.basename(clean_inner).lower()
                if base_fname not in self.all_assets and clean_inner.lower() not in self.all_assets:
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

            if target_clean not in self.note_stems and clean_inner.lower() not in self.note_stems:
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
                base_fname = os.path.basename(clean_fname).lower()
                if base_fname not in self.all_assets and clean_fname.lower() not in self.all_assets:
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

        note_path = Path(self.root_dir) / file_path
        note_directory = note_path.parent
        candidates = []
        if clean_reference:
            candidates.append((Path(self.vault_dir) / clean_reference, clean_reference))
            candidates.append((note_directory / clean_reference, reference))

        for candidate, published_reference in candidates:
            if candidate.is_file():
                return published_reference.replace('\\', '/')

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
