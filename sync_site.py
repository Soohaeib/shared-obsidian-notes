#!/usr/bin/env python3
"""
Platform-Independent Obsidian Digital Garden Workspace Sync & Indexer
----------------------------------------------------------------------
Runs natively on Windows, macOS, and Linux with zero external dependencies.

Usage:
  python3 sync_site.py                 # Syncs, sanitizes, and builds indexes (default)
  python3 sync_site.py --watch         # Continuous file watcher & auto-builder
  python3 sync_site.py --from /path    # Safely copies notes from external Obsidian vault
  python3 sync_site.py --sanitize      # Only sanitizes file/folder names
"""

import os
import sys
import re
import json
import time
import shutil
import argparse
from pathlib import Path

# Base Paths
SCRIPT_DIR = Path(__file__).resolve().parent
PROTECTED_DIRS = {'.git', '.github', 'node_modules', 'site-lib', 'guide', '.obsidian', '.trash'}
PROTECTED_FILES = {
    'package.json', 'package-lock.json', 'metadata.json', 'server.js', 
    'generate_index.py', 'sync_site.py', '.gitignore', '.nojekyll', 
    'README.md', '.env.example'
}

def is_protected(name: str) -> bool:
    low = name.lower()
    if name in PROTECTED_DIRS or name.startswith('.'):
        return True
    if 'backup' in low or low.endswith('.bak'):
        return True
    return False

def clean_filename(name: str) -> str:
    """Sanitizes file and directory names for strict cross-platform & Git compatibility."""
    base, ext = os.path.splitext(name)
    base = base.replace(':', ' - ')
    base = base.replace('?', '').replace('*', '-').replace('"', "'")
    base = base.replace('|', '-').replace('<', '-').replace('>', '-').replace('\\', '-')
    base = re.sub(r'\s+', ' ', base)
    base = re.sub(r'-+', '-', base)
    base = base.strip(' .')
    
    reserved = {'con', 'prn', 'aux', 'nul', 'com1', 'com2', 'com3', 'com4', 
                'com5', 'com6', 'com7', 'com8', 'com9', 'lpt1', 'lpt2', 'lpt3', 
                'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'}
    if base.lower() in reserved:
        base = f"{base}_note"
        
    if not base:
        base = "untitled"
        
    return f"{base}{ext}"

def sanitize_workspace(target_dir: Path):
    """Walks the directory tree bottom-up to rename illegal characters safely."""
    print("🔍 [Sanitizer] Auditing filenames for cross-platform Git compatibility...")
    renamed_count = 0

    for root, dirs, files in os.walk(target_dir, topdown=False):
        # Exclude protected dirs from traversal
        dirs[:] = [d for d in dirs if not is_protected(d)]
        
        for fname in files:
            if is_protected(fname) or fname in PROTECTED_FILES:
                continue
            cleaned = clean_filename(fname)
            if cleaned != fname:
                old_path = Path(root) / fname
                new_path = Path(root) / cleaned
                if new_path.exists() and old_path != new_path:
                    count = 1
                    base, ext = os.path.splitext(cleaned)
                    while new_path.exists():
                        new_path = Path(root) / f"{base}_{count}{ext}"
                        count += 1
                try:
                    old_path.rename(new_path)
                    print(f"  ⚠️  Sanitized file: '{fname}' -> '{new_path.name}'")
                    renamed_count += 1
                except Exception as e:
                    print(f"  ❌ Failed to rename {fname}: {e}")

        for dname in dirs:
            if is_protected(dname):
                continue
            cleaned = clean_filename(dname)
            if cleaned != dname:
                old_path = Path(root) / dname
                new_path = Path(root) / cleaned
                if not new_path.exists():
                    try:
                        old_path.rename(new_path)
                        print(f"  ⚠️  Sanitized folder: '{dname}' -> '{cleaned}'")
                        renamed_count += 1
                    except Exception as e:
                        print(f"  ❌ Failed to rename folder {dname}: {e}")

    print(f"✅ [Sanitizer] Completed. {renamed_count} items sanitized.")

def safe_copy_notes(src_dir: Path, dst_dir: Path):
    """Safely copies markdown notes and assets from external Obsidian vault."""
    print(f"🔄 Copying notes from: {src_dir}")
    print(f"   Into workspace: {dst_dir}")
    
    copied = 0
    for root, dirs, files in os.walk(src_dir):
        dirs[:] = [d for d in dirs if not is_protected(d)]
        rel = os.path.relpath(root, src_dir)
        target = dst_dir / rel if rel != '.' else dst_dir
        target.mkdir(parents=True, exist_ok=True)

        for f in files:
            if is_protected(f) or f in PROTECTED_FILES:
                continue
            src_file = Path(root) / f
            dst_file = target / f
            try:
                shutil.copy2(src_file, dst_file)
                copied += 1
            except Exception as e:
                print(f"  ❌ Error copying {f}: {e}")
                
    print(f"✅ Safe sync completed ({copied} files copied).")

def generate_vault_index_and_html(app_dir: Path):
    """Generates site-lib/vault-index.json, syncs folder index.html files, and builds root index.html."""
    print(f"🪐 Building digital garden workspace at: {app_dir}")
    
    # 1. Discover workspace directories
    entries = []
    all_md_files = []
    
    for item in sorted(os.listdir(app_dir)):
        item_path = app_dir / item
        if not item_path.is_dir() or is_protected(item):
            continue
            
        md_count = 0
        for root, dirs, files in os.walk(item_path):
            dirs[:] = [d for d in dirs if not is_protected(d)]
            for f in files:
                if f.endswith('.md'):
                    md_count += 1
                    rel_p = os.path.relpath(os.path.join(root, f), app_dir)
                    all_md_files.append(rel_p.replace('\\', '/'))
                    
        if md_count > 0 or (item_path / "index.md").exists():
            entries.append((item, md_count))

    # 2. Update site-lib/vault-index.json
    vault_index_path = app_dir / "site-lib" / "vault-index.json"
    vault_index_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with open(vault_index_path, 'w', encoding='utf-8') as fh:
            json.dump({'files': sorted(all_md_files)}, fh, indent=2)
        print(f"✅ Updated {vault_index_path.name} with {len(all_md_files)} markdown notes.")
    except Exception as e:
        print(f"❌ Could not write {vault_index_path.name}: {e}")

    # 3. Ensure viewer index.html in each workspace folder
    viewer_template_path = app_dir / "site-lib" / "html" / "viewer.html"
    if viewer_template_path.exists():
        with open(viewer_template_path, 'r', encoding='utf-8') as fh:
            viewer_html_content = fh.read()
            
        for name, _ in entries:
            folder_index = app_dir / name / "index.html"
            try:
                with open(folder_index, 'w', encoding='utf-8') as fh:
                    fh.write(viewer_html_content)
                print(f"  • Verified viewer in: {name}/")
            except Exception as e:
                print(f"  ❌ Failed to write {folder_index}: {e}")

    # 4. Generate Root index.html Cosmic Graph
    nodes_data = [{"id": "root", "label": "Shared Vault", "url": None, "isRoot": True, "moons": 0}]
    for name, sub_count in entries:
        label = name.replace('-', ' ').replace('_', ' ').title()
        nodes_data.append({
            "id": name,
            "label": label,
            "url": f"./{name}/",
            "isRoot": False,
            "moons": sub_count
        })

    # Call generate_index.py if present or write index.html directly
    generate_py = app_dir / "generate_index.py"
    if generate_py.exists():
        os.system(f'"{sys.executable}" "{generate_py}" "{app_dir}" "{app_dir / "index.html"}"')
    
    print(f"🎉 Workspace generated with {len(entries)} folders and {len(all_md_files)} notes.")

def watch_directory(app_dir: Path, source_dir: Path = None):
    """Zero-dependency cross-platform file watcher."""
    print("👁️ Starting platform-independent file watcher...")
    print(f"   Monitoring: {source_dir or app_dir}")
    print("   Press Ctrl+C to stop.")

    def get_snapshot(directory: Path):
        snapshot = {}
        for root, dirs, files in os.walk(directory):
            dirs[:] = [d for d in dirs if not is_protected(d)]
            for f in files:
                if f.endswith('.md') or f.endswith('.json') or f.endswith('.css') or f.endswith('.js'):
                    fp = os.path.join(root, f)
                    try:
                        snapshot[fp] = os.path.getmtime(fp)
                    except OSError:
                        pass
        return snapshot

    watch_target = source_dir if source_dir and source_dir.exists() else app_dir
    last_snapshot = get_snapshot(watch_target)
    
    while True:
        try:
            time.sleep(2.5)
            current_snapshot = get_snapshot(watch_target)
            if current_snapshot != last_snapshot:
                print("\n🔄 Detected changes in notes or configuration. Rebuilding...")
                if source_dir and source_dir.exists():
                    safe_copy_notes(source_dir, app_dir)
                sanitize_workspace(app_dir)
                generate_vault_index_and_html(app_dir)
                last_snapshot = get_snapshot(watch_target)
        except KeyboardInterrupt:
            print("\n🛑 Watcher stopped.")
            break

def main():
    parser = argparse.ArgumentParser(description="Platform-Independent Digital Garden Workspace Manager")
    parser.add_argument("--once", action="store_true", default=True, help="Run single sync and build (default)")
    parser.add_argument("--watch", action="store_true", help="Watch for changes and auto-sync")
    parser.add_argument("--from-vault", dest="from_vault", type=str, default="", help="Path to external Obsidian vault")
    parser.add_argument("--sanitize", action="store_true", help="Only sanitize filenames")
    
    args = parser.parse_args()

    app_dir = SCRIPT_DIR
    src_vault = Path(args.from_vault).resolve() if args.from_vault else None

    if args.sanitize:
        sanitize_workspace(app_dir)
        return

    if src_vault and src_vault.exists():
        safe_copy_notes(src_vault, app_dir)

    sanitize_workspace(app_dir)
    generate_vault_index_and_html(app_dir)

    if args.watch:
        watch_directory(app_dir, src_vault)

if __name__ == "__main__":
    main()
