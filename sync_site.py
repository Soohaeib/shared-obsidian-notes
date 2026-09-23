#!/usr/bin/env python3
"""
Platform-Independent Obsidian Digital Garden Workspace Sync & Indexer
----------------------------------------------------------------------
Runs natively on Windows, macOS, and Linux with zero external dependencies.
Reads structure & ignore configurations directly from locations.json.

Automated Sync Workflow:
  1. Checks external Obsidian Vault path(s) listed in locations.json
  2. Copies updated notes into the organized 'note-res' container
  3. Sanitizes filenames for Git / cross-platform safety
  4. Generates vault-index.json and folder viewer index.html files

Usage:
  python3 sync_site.py                 # Automated sync & build (default)
  python3 sync_site.py --watch         # Continuous file watcher & auto-builder
  python3 sync_site.py --from /path    # Explicit external Obsidian vault path
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

def load_locations_config(base_dir: Path):
    """Loads and parses locations.json configuration."""
    loc_file = base_dir / "locations.json"
    config = {
        'targetVaultDirectory': 'note-res',
        'sourceVaultPaths': ['~/Documents/Obsidian Vault/BBA Study'],
        'sourceExclusionPaths': [
            '~/Documents/Obsidian Vault/BBA Study/Expansion of class notes'
        ],
        'sourceExclusionFiles': [],
        'excludedFolders': [
            '.git', '.github', '.obsidian', '.trash', 'node_modules', 
            'guide', 'site-lib', 'backup', 'backups', 'backup-directory', '__pycache__'
        ],
        'excludedFiles': [
            '.DS_Store', 'desktop.ini', 'Thumbs.db', 'ehthumbs.db', 
            'package-lock.json', 'bun.lock'
        ],
        'excludedPatterns': [r'^\..*', r'.*\.bak$', r'.*\.tmp$', r'.*~$']
    }

    if loc_file.exists():
        try:
            with open(loc_file, 'r', encoding='utf-8') as f:
                parsed = json.load(f)
                config.update(parsed)
        except Exception as e:
            print(f"Notice: Could not parse locations.json ({e}), using default vault config.")
    return config

config = load_locations_config(SCRIPT_DIR)
VAULT_CONTAINER = config.get('targetVaultDirectory', 'note-res')
SOURCE_EXCLUSION_PATHS = set(config.get('sourceExclusionPaths', []))
SOURCE_EXCLUSION_FILES = set(config.get('sourceExclusionFiles', []))
EXCLUDED_FOLDERS = set(config.get('excludedFolders', []))
EXCLUDED_FILES = set(config.get('excludedFiles', []))
EXCLUDED_PATTERNS = [re.compile(p) for p in config.get('excludedPatterns', [])]
SOURCE_VAULT_PATHS = config.get('sourceVaultPaths', [])

PROTECTED_FILES = {
    'package.json', 'package-lock.json', 'metadata.json', 'server.js', 
    'generate_index.py', 'sync_site.py', 'locations.json', '.gitignore', 
    '.nojekyll', 'README.md', '.env.example'
}

def is_excluded(item: str, full_path: str = "") -> bool:
    low_name = item.lower().strip()
    if item.startswith('.') and item != '.':
        return True
    
    # Check folder and source exclusion path matches
    all_excluded_folders = EXCLUDED_FOLDERS.union(SOURCE_EXCLUSION_PATHS)
    for folder in all_excluded_folders:
        f_clean = folder.strip().lower()
        if not f_clean:
            continue
        if low_name == f_clean or item == folder:
            return True
        if full_path:
            full_norm = str(Path(full_path).resolve()).lower().replace('\\', '/')
            target_norm = folder.lower().replace('\\', '/')
            if target_norm.startswith('~'):
                target_norm = str(Path(os.path.expanduser(folder)).resolve()).lower().replace('\\', '/')
            if target_norm in full_norm or f"/{f_clean}/" in f"/{full_norm}/" or full_norm.endswith(f"/{f_clean}"):
                return True
                
    # Check file and source exclusion file matches
    all_excluded_files = EXCLUDED_FILES.union(SOURCE_EXCLUSION_FILES)
    for file in all_excluded_files:
        f_clean = file.strip().lower()
        if not f_clean:
            continue
        if low_name == f_clean or item == file:
            return True
        if full_path:
            full_norm = str(Path(full_path).resolve()).lower().replace('\\', '/')
            target_norm = file.lower().replace('\\', '/')
            if target_norm.startswith('~'):
                target_norm = str(Path(os.path.expanduser(file)).resolve()).lower().replace('\\', '/')
            if target_norm == full_norm or full_norm.endswith(f"/{f_clean}"):
                return True
            
    if any(p.match(item) for p in EXCLUDED_PATTERNS):
        return True
    if 'backup' in low_name or low_name.endswith('.bak'):
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
    print(f"🔍 [Sanitizer] Auditing filenames in {target_dir} for Git compatibility...")
    renamed_count = 0

    if not target_dir.exists():
        return

    for root, dirs, files in os.walk(target_dir, topdown=False):
        dirs[:] = [d for d in dirs if not is_excluded(d, os.path.join(root, d))]
        
        for fname in files:
            full_file = os.path.join(root, fname)
            if is_excluded(fname, full_file) or fname in PROTECTED_FILES or fname in EXCLUDED_FILES:
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
            if is_excluded(dname, os.path.join(root, dname)):
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

def sync_from_source_vault(src_path_str: str, dst_root: Path):
    """Automatically pulls and syncs notes from an external Obsidian Vault path."""
    expanded_path = Path(os.path.expanduser(src_path_str)).resolve()
    if not expanded_path.exists() or not expanded_path.is_dir():
        return False

    container_target = dst_root / VAULT_CONTAINER
    container_target.mkdir(parents=True, exist_ok=True)
    
    print(f"🔄 Auto-syncing from Obsidian Vault: {expanded_path}")
    print(f"   Destination: {container_target}")
    
    copied = 0
    for root, dirs, files in os.walk(expanded_path):
        dirs[:] = [d for d in dirs if not is_excluded(d, os.path.join(root, d))]
        rel = os.path.relpath(root, expanded_path)
        target = container_target / rel if rel != '.' else container_target
        target.mkdir(parents=True, exist_ok=True)

        for f in files:
            full_f = os.path.join(root, f)
            if is_excluded(f, full_f) or f in PROTECTED_FILES or f in EXCLUDED_FILES:
                continue
            src_file = Path(root) / f
            dst_file = target / f
            try:
                if not dst_file.exists() or src_file.stat().st_mtime > dst_file.stat().st_mtime:
                    shutil.copy2(src_file, dst_file)
                    copied += 1
            except Exception as e:
                print(f"  ❌ Error copying {f}: {e}")
                
    print(f"✅ Auto-sync completed ({copied} files updated from Obsidian Vault).")
    return True

def run_index_generation(app_dir: Path):
    """Executes generate_index.py to rebuild vault-index.json and index.html."""
    generate_py = app_dir / "generate_index.py"
    if generate_py.exists():
        os.system(f'"{sys.executable}" "{generate_py}" "{app_dir}" "{app_dir / "index.html"}"')
    else:
        print("❌ generate_index.py not found.")

def watch_directory(app_dir: Path, source_dirs: list):
    """Zero-dependency cross-platform file watcher."""
    container_dir = app_dir / VAULT_CONTAINER
    print("👁️ Starting platform-independent file watcher...")
    print(f"   Monitoring container: {container_dir}")
    print("   Press Ctrl+C to stop.")

    def get_snapshot(directory: Path):
        snapshot = {}
        if not directory.exists():
            return snapshot
        for root, dirs, files in os.walk(directory):
            dirs[:] = [d for d in dirs if not is_excluded(d)]
            for f in files:
                if f.endswith('.md') or f.endswith('.json') or f.endswith('.css') or f.endswith('.js'):
                    fp = os.path.join(root, f)
                    try:
                        snapshot[fp] = os.path.getmtime(fp)
                    except OSError:
                        pass
        return snapshot

    last_snapshot = get_snapshot(container_dir)
    
    while True:
        try:
            time.sleep(2.5)
            for src in source_dirs:
                sync_from_source_vault(src, app_dir)

            current_snapshot = get_snapshot(container_dir)
            if current_snapshot != last_snapshot:
                print("\n🔄 Detected changes in notes or configuration. Rebuilding...")
                sanitize_workspace(container_dir)
                run_index_generation(app_dir)
                last_snapshot = get_snapshot(container_dir)
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
    target_vault_dir = app_dir / VAULT_CONTAINER

    if args.sanitize:
        sanitize_workspace(target_vault_dir)
        return

    all_sources = list(SOURCE_VAULT_PATHS)
    if args.from_vault:
        all_sources.insert(0, args.from_vault)

    for src in all_sources:
        sync_from_source_vault(src, app_dir)

    sanitize_workspace(target_vault_dir)
    run_index_generation(app_dir)

    if args.watch:
        watch_directory(app_dir, all_sources)

if __name__ == "__main__":
    main()
