#!/usr/bin/env python3
"""
Platform-Independent Obsidian Digital Garden Workspace Sync
---------------------------------------------------------
Two-Pass Sync with Source of Truth Manifest Architecture.
- Pass 1: Scan vaults, resolve slugs/collisions, and build a manifest.
- Pass 2: Physically sync files based on the manifest.
"""

import os
import json
import re
import html
import shutil
from pathlib import Path

def slugify(text: str, is_file=False) -> str:
    """Bulletproof slugification that handles ampersands, underscores, and preserves extensions."""
    text = html.unescape(text)
    text = text.replace('&', ' and ')
    
    if is_file and '.' in text:
        base, ext = text.rsplit('.', 1)
        base = base.lower().strip()
        base = re.sub(r'[\s_]+', '-', base)
        base = re.sub(r'[^a-z0-9-]', '', base)
        base = re.sub(r'-+', '-', base).strip('-')
        return f"{base}.{ext.lower()}"
    else:
        text = text.lower().strip()
        text = re.sub(r'[\s_]+', '-', text)
        text = re.sub(r'[^a-z0-9-]', '', text)
        text = re.sub(r'-+', '-', text)
        return text.strip('-')

def extract_metadata(file_path):
    """Extracts publish status and basic metadata from frontmatter."""
    is_home = False
    publish = True
    title = ""
    if not str(file_path).endswith('.md'):
        return publish, is_home, title
        
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read(8192)
            if content.startswith('---'):
                fm_end = content.find('\n---', 3)
                if fm_end != -1:
                    frontmatter = content[3:fm_end]
                    # If publish: false is found, DO NOT SYNC
                    if re.search(r'^\s*publish\s*:\s*(?:false|"false"|\'false\')\s*$', frontmatter, re.IGNORECASE | re.MULTILINE):
                        publish = False
                    # Home detection
                    if re.search(r'^\s*permalink\s*:\s*["\']?/(?:index\.md)?["\']?\s*$', frontmatter, re.IGNORECASE | re.MULTILINE):
                        is_home = True
                    if re.search(r'^\s*(?:home|entry|isHome)\s*:\s*(?:true|"true")\s*$', frontmatter, re.IGNORECASE | re.MULTILINE):
                        is_home = True
                    title_match = re.search(r'^\s*title\s*:\s*["\']?([^"\n\r\']+)', frontmatter, re.IGNORECASE | re.MULTILINE)
                    if title_match:
                        title = title_match.group(1).strip()
    except Exception:
        pass
    return publish, is_home, title

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
    source_paths = [os.path.abspath(os.path.expanduser(p)) for p in config.get('sourceVaultPaths', [])]
    
    # DEV FALLBACK for AI Studio environment
    if not any(os.path.exists(p) for p in source_paths):
        print("[!] Dev Mode: Source vaults not found. Building manifest from existing note-res.")
        source_paths = [target_dir]

    raw_exclusions = config.get('vaultExclusionPaths', config.get('sourceExclusionPaths', []))
    parsed_exclusions = []
    for excl in raw_exclusions:
        if not excl or not str(excl).strip():
            continue
        clean = str(excl).strip().replace('\\', '/')
        rel_clean = clean.lstrip('/')
        parsed_exclusions.append({
            'raw': clean,
            'rel': rel_clean.lower(),
            'slug': slugify(rel_clean, False) if '/' not in rel_clean else '/'.join([slugify(s, False) for s in rel_clean.split('/') if s]),
            'abs': os.path.abspath(os.path.expanduser(clean)) if (clean.startswith('~') or (os.path.isabs(clean) and not clean.startswith('/' + rel_clean))) else None
        })

    excluded_files = set(config.get('excludedFiles', []))
    excluded_folders = set(config.get('excludedFolders', ['.git', '.github', '.obsidian', '.trash', 'node_modules', 'guide']))
    
    def is_excluded(full_path, src_vault=""):
        p = Path(full_path)
        if any(part in excluded_folders for part in p.parts):
            return True
        if any(part.startswith('.') for part in p.parts if part not in ['.', '..']):
            return True

        norm_full = os.path.abspath(full_path).replace('\\', '/').rstrip('/')
        norm_full_low = norm_full.lower()

        rel_path_low = ""
        rel_slug = ""
        if src_vault:
            try:
                rel = os.path.relpath(full_path, src_vault).replace('\\', '/').strip('/')
                if rel != '.':
                    rel_path_low = rel.lower()
                    rel_slug = '/'.join([slugify(s, False) for s in rel.split('/') if s])
            except Exception:
                pass

        for ex in parsed_exclusions:
            # Absolute path match
            if ex['abs'] and norm_full.startswith(ex['abs']):
                return True
            # Relative path match from source vault
            if rel_path_low:
                if rel_path_low == ex['rel'] or rel_path_low.startswith(ex['rel'] + '/'):
                    return True
                if ex['slug'] and (rel_slug == ex['slug'] or rel_slug.startswith(ex['slug'] + '/')):
                    return True
            # Substring path component match (e.g. /expansion of class notes/ anywhere in path)
            ex_rel = ex['rel']
            if f"/{ex_rel}/" in f"/{norm_full_low}/" or norm_full_low.endswith(f"/{ex_rel}"):
                return True
            if ex['slug']:
                ex_slug = ex['slug']
                if f"/{ex_slug}/" in f"/{norm_full_low}/" or norm_full_low.endswith(f"/{ex_slug}"):
                    return True

        return False

    manifest = []
    
    print("[*] Pass 1: Scanning vaults and building manifest...")
    
    for src_vault in source_paths:
        if not os.path.exists(src_vault): continue
            
        for root, dirs, files in os.walk(src_vault):
            if is_excluded(root, src_vault):
                dirs[:] = []
                continue

            # Prevent traversing into excluded directories
            dirs[:] = [d for d in dirs if not is_excluded(os.path.join(root, d), src_vault)]

            # Process Folders for Manifest
            rel_folder = os.path.relpath(root, src_vault)
            if rel_folder != '.':
                parts = rel_folder.split(os.sep)
                slug_parts = [slugify(p, False) for p in parts]
                slug_path = "/".join(slug_parts)
                planet_slug = slug_parts[0]
                
                manifest.append({
                    "type": "folder",
                    "originalName": parts[-1],
                    "originalPath": rel_folder.replace(os.sep, "/"),
                    "slugPath": slug_path,
                    "planetSlug": planet_slug
                })

            # Process Files
            for file in files:
                if file.startswith('.') or file in excluded_files: continue
                
                src_file = os.path.join(root, file)
                publish, is_home, title = extract_metadata(src_file)
                
                if file.endswith('.md') and not publish: continue
                
                rel_file = os.path.relpath(src_file, src_vault)
                parts = rel_file.split(os.sep)
                
                slug_parts = []
                for i, part in enumerate(parts):
                    is_file_part = (i == len(parts) - 1)
                    slug_parts.append(slugify(part, is_file_part))
                
                slug_path = "/".join(slug_parts)
                
                # Collision safety check
                dest_abs = os.path.join(target_dir, *slug_parts)
                if os.path.exists(dest_abs) and os.path.isdir(dest_abs):
                    # Slug collision with a directory
                    base, ext = os.path.splitext(slug_parts[-1])
                    slug_parts[-1] = f"{base}-1{ext}"
                    slug_path = "/".join(slug_parts)
                
                planet_slug = slug_parts[0]
                
                manifest.append({
                    "type": "file",
                    "originalName": file.rsplit('.', 1)[0] if file.endswith('.md') else file,
                    "originalPath": rel_file.replace(os.sep, "/"),
                    "slugPath": slug_path,
                    "planetSlug": planet_slug,
                    "isHome": is_home,
                    "title": title,
                    "isMarkdown": file.endswith('.md'),
                    "fullSrcPath": src_file
                })

    print(f"[*] Pass 2: Syncing {len(manifest)} items to {target_dir}...")
    
    os.makedirs(target_dir, exist_ok=True)
    
    copied_md = 0
    copied_assets = 0
    
    for item in manifest:
        dest_path = os.path.join(target_dir, *item['slugPath'].split('/'))
        
        if item['type'] == 'folder':
            os.makedirs(dest_path, exist_ok=True)
        else:
            os.makedirs(os.path.dirname(dest_path), exist_ok=True)
            if os.path.abspath(item['fullSrcPath']) != os.path.abspath(dest_path):
                shutil.copy2(item['fullSrcPath'], dest_path)
            if item['isMarkdown']: copied_md += 1
            else: copied_assets += 1
            
    # Prune any excluded top-level directories or files from target_dir
    if os.path.exists(target_dir):
        for entry in os.listdir(target_dir):
            entry_path = os.path.join(target_dir, entry)
            if is_excluded(entry_path):
                print(f"[*] Pruning excluded path from target: {entry}")
                if os.path.isdir(entry_path):
                    shutil.rmtree(entry_path, ignore_errors=True)
                else:
                    try: os.remove(entry_path)
                    except Exception: pass

    # Save manifest
    lib_dir = os.path.join(source_dir, 'site-lib')
    os.makedirs(lib_dir, exist_ok=True)
    manifest_out = os.path.join(lib_dir, 'vault-manifest.json')
    
    # Clean up internal paths before saving
    for item in manifest:
        if 'fullSrcPath' in item: del item['fullSrcPath']
        
    with open(manifest_out, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)
        
    print(f"[v] Sync Complete: {copied_md} notes, {copied_assets} assets. Manifest saved to {manifest_out}")

    # Pass 3: Automatically invoke generate_index.py to rebuild landing page and viewers
    gen_script = os.path.join(source_dir, 'generate_index.py')
    if os.path.exists(gen_script):
        print("[*] Pass 3: Generating folder viewers and cosmic landing page...")
        import subprocess
        try:
            subprocess.run([sys.executable, gen_script], check=True)
        except Exception as e:
            print(f"[!] Notice: generate_index.py execution error: {e}")

if __name__ == '__main__':
    import sys
    sync_vault()
