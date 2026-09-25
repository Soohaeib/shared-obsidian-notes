#!/usr/bin/env python3
"""
Platform-Independent Obsidian Digital Garden Workspace Sync
---------------------------------------------------------
Strict Opt-In Sync: Only copies notes with `publish: true`.
One-Pass Slugification: Paths are sanitized during the copy phase,
eliminating dangerous in-place directory merges and collisions.
"""

import os
import json
import re
import html
import shutil
import sys
from pathlib import Path

def slugify(text: str, is_file=False) -> str:
    """Bulletproof slugification that handles ampersands and preserves extensions."""
    text = html.unescape(text)
    text = text.replace('&', ' and ')
    
    if is_file and '.' in text:
        base, ext = text.rsplit('.', 1)
        base = base.lower().strip()
        base = re.sub(r'[^a-z0-9\s-]', '', base)
        base = re.sub(r'[\s_-]+', '-', base).strip('-')
        return f"{base}.{ext.lower()}"
    else:
        text = text.lower().strip()
        text = re.sub(r'[^a-z0-9\s-]', '', text)
        text = re.sub(r'[\s_-]+', '-', text)
        return text.strip('-')

def is_published(file_path):
    """Strict Opt-In: Only returns True if `publish: true` is explicitly in the YAML."""
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read(8192)
            if content.startswith('---'):
                fm_end = content.find('\n---', 3)
                if fm_end != -1:
                    frontmatter = content[3:fm_end]
                    if re.search(r'^\s*publish\s*:\s*["\']?true["\']?', frontmatter, re.IGNORECASE | re.MULTILINE):
                        return True
    except Exception:
        pass
    return False

def sync_vault():
    source_dir = os.path.abspath('.')
    loc_file = os.path.join(source_dir, 'locations.json')
    
    try:
        with open(loc_file, 'r', encoding='utf-8') as f:
            config = json.load(f)
    except Exception as e:
        print(f"[!] Error loading locations.json: {e}")
        return

    target_dir = os.path.join(source_dir, config.get('targetVaultDirectory', 'note-res'))
    source_paths = [os.path.expanduser(p) for p in config.get('sourceVaultPaths', [])]
    
    # Safely load the renamed vaultExclusionPaths
    exclusion_paths = [os.path.abspath(os.path.expanduser(p)) for p in config.get('vaultExclusionPaths', config.get('sourceExclusionPaths', []))]
    excluded_files = set(config.get('excludedFiles', []))
    
    name_map = {}
    copied_md = 0
    copied_assets = 0
    
    print("[*] Starting Strict Opt-In Sync...")

    for src_vault in source_paths:
        src_vault = os.path.abspath(src_vault)
        if not os.path.exists(src_vault):
            continue
            
        for root, dirs, files in os.walk(src_vault):
            # 1. Check if current directory is in the exclusion list
            if any(root.startswith(ex) for ex in exclusion_paths):
                continue
                
            # Skip hidden/system folders
            if '.obsidian' in root or '.git' in root or '.trash' in root:
                continue

            for file in files:
                if file.startswith('.') or file in excluded_files:
                    continue
                    
                src_file = os.path.join(root, file)
                is_md = file.endswith('.md')
                
                # 2. Strict Opt-In for Markdown files
                if is_md and not is_published(src_file):
                    continue

                # 3. Slugify the path segment by segment
                rel_path = os.path.relpath(src_file, src_vault)
                parts = rel_path.split(os.sep)
                
                slug_parts = []
                for i, part in enumerate(parts):
                    is_file_part = (i == len(parts) - 1)
                    slug_part = slugify(part, is_file_part)
                    slug_parts.append(slug_part)
                    
                    # Store original pristine names for the frontend
                    clean_original = part.rsplit('.', 1)[0] if is_file_part else part
                    clean_slug = slug_part.replace('.md', '')
                    name_map[slug_part] = clean_original
                    name_map[clean_slug] = clean_original

                # 4. Copy File safely
                dest_file = os.path.join(target_dir, *slug_parts)
                os.makedirs(os.path.dirname(dest_file), exist_ok=True)
                
                # Collision safety: if a folder has the exact same slug as this file
                if os.path.exists(dest_file) and os.path.isdir(dest_file):
                    base, ext = os.path.splitext(dest_file)
                    count = 1
                    while os.path.exists(f"{base}-{count}{ext}"):
                        count += 1
                    dest_file = f"{base}-{count}{ext}"
                
                shutil.copy2(src_file, dest_file)
                if is_md:
                    copied_md += 1
                else:
                    copied_assets += 1

    # Save name-map for the frontend
    os.makedirs(os.path.join(source_dir, 'site-lib'), exist_ok=True)
    with open(os.path.join(source_dir, 'site-lib', 'name-map.json'), 'w', encoding='utf-8') as f:
        json.dump(name_map, f, indent=2)
        
    print(f"[v] Sync Complete: {copied_md} published notes and {copied_assets} assets synced.")

if __name__ == '__main__':
    sync_vault()