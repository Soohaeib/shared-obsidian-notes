#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Self-Contained Obsidian Digital Garden Workspace Sync & Setup
# Automatically locates its parent folder and manages the site entirely in-place.
# ==============================================================================

# 1. Dynamically locate the repository / parent folder
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

# Source directory for external Obsidian notes (optional)
# If not provided, the script operates directly on note folders inside $APP_DIR.
SOURCE_DIR="${OBSIDIAN_SOURCE:-}"

# Parse command line flags
COMMAND="once"
RESTORE_SOURCE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --setup)
      COMMAND="setup"
      shift
      ;;
    --watch)
      COMMAND="watch"
      shift
      ;;
    --once)
      COMMAND="once"
      shift
      ;;
    --stop)
      COMMAND="stop"
      shift
      ;;
    --from)
      SOURCE_DIR="$2"
      shift 2
      ;;
    --restore-from)
      COMMAND="restore"
      RESTORE_SOURCE="$2"
      shift 2
      ;;
    *)
      if [ -d "$1" ]; then
        SOURCE_DIR="$1"
      fi
      shift
      ;;
  esac
done

if [[ "$COMMAND" == "stop" ]]; then
  echo "🛑 Stopping any background vault watcher processes..."
  pkill -f "sync-site.sh.*--watch" >/dev/null 2>&1 || true
  exit 0
fi

# ------------------------------------------------------------------------------
# 2. Package & Environment Setup inside $APP_DIR
# ------------------------------------------------------------------------------
setup_npm_environment() {
  echo "📦 Ensuring NPM package environment inside: $APP_DIR"
  if [ -f "$APP_DIR/package.json" ]; then
    if [ ! -d "$APP_DIR/node_modules" ]; then
      echo "📥 Installing NPM dependencies in $APP_DIR..."
      if command -v npm >/dev/null 2>&1; then
        npm install --prefix "$APP_DIR"
      elif command -v bun >/dev/null 2>&1; then
        bun install
      fi
    else
      echo "✅ node_modules already present in $APP_DIR."
    fi
  fi
}

# ------------------------------------------------------------------------------
# 3. Restore Helper (Non-destructive recovery from backup)
# ------------------------------------------------------------------------------
restore_from_backup() {
  local bkp_path="$1"
  if [ -z "$bkp_path" ] || [ ! -d "$bkp_path" ]; then
    echo "❌ Error: Backup directory '$bkp_path' does not exist."
    exit 1
  fi
  echo "🛡️ Safely restoring files from backup: $bkp_path -> $APP_DIR"
  echo "   (No existing files outside the backup will be removed)"

  python3 -c "
import os, sys, shutil
src = os.path.abspath('$bkp_path')
dst = os.path.abspath('$APP_DIR')
ignored = {'.git', '.github', 'node_modules', 'site-lib', 'package.json', 'package-lock.json', 'bun.lock'}

for root, dirs, files in os.walk(src):
    dirs[:] = [d for d in dirs if d not in ignored and not d.startswith('.')]
    rel = os.path.relpath(root, src)
    target_dir = os.path.join(dst, rel) if rel != '.' else dst
    os.makedirs(target_dir, exist_ok=True)
    for f in files:
        if f.startswith('.'): continue
        s_file = os.path.join(root, f)
        d_file = os.path.join(target_dir, f)
        shutil.copy2(s_file, d_file)
        print(f'   Restored: {os.path.relpath(d_file, dst)}')
"
  echo "✅ Restore completed successfully."
}

# ------------------------------------------------------------------------------
# 4. Safe Sync Routine (Never deletes any files or backup directories)
# ------------------------------------------------------------------------------
safe_copy_vault() {
  local src="$1"
  local dst="$2"

  echo "🔄 Copying vault notes from: $src"
  echo "   Into workspace: $dst"
  echo "   (Safety lock active: NO files or backup directories will be deleted)"

  python3 -c "
import os, sys, shutil
src = os.path.abspath('$src')
dst = os.path.abspath('$dst')

# Strictly protected directories and files that can NEVER be overwritten or deleted
protected_dirs = {'.git', '.github', 'node_modules', 'site-lib', 'guide', '.obsidian', '.trash'}

def is_protected(name):
    low = name.lower()
    if name in protected_dirs or name.startswith('.'):
        return True
    if 'backup' in low or low.endswith('.bak'):
        return True
    return False

for root, dirs, files in os.walk(src):
    dirs[:] = [d for d in dirs if not is_protected(d)]
    rel = os.path.relpath(root, src)
    dest_dir = os.path.join(dst, rel) if rel != '.' else dst
    os.makedirs(dest_dir, exist_ok=True)
    for f in files:
        low_f = f.lower()
        if f.startswith('.') or is_protected(f):
            continue
        # Infrastructure files inside target are untouchable
        if f in {'package.json', 'package-lock.json', 'bun.lock', 'server.js', 'generate_index.py', 'sync-site.sh', 'inject-gatekeeper.sh', 'isolate-navigation.sh', 'index.html'}:
            continue
        shutil.copy2(os.path.join(root, f), os.path.join(dest_dir, f))
"
  echo "✅ Note synchronization finished safely."
}

# ------------------------------------------------------------------------------
# 5. GitHub File Naming Compatibility Sanitizer (In-Place)
# ------------------------------------------------------------------------------
sanitize_github_filenames() {
  local target_path="$1"
  echo "🔍 [GitHub File Check] Auditing filenames for Git/GitHub compatibility..."

  python3 - << 'PYEOF' "$target_path"
import os
import sys
import re

target_dir = os.path.abspath(sys.argv[1])
ignored = {'.git', '.github', '.DS_Store', 'site-lib', 'guide', 'node_modules'}

def is_ignored(name):
    low = name.lower()
    if name in ignored or name.startswith('.'):
        return True
    if 'backup' in low or low.endswith('.bak'):
        return True
    return False

def clean_name(name):
    base, ext = os.path.splitext(name)
    base = base.replace(':', ' - ')
    base = base.replace('?', '').replace('*', '-').replace('"', "'")
    base = base.replace('|', '-').replace('<', '-').replace('>', '-').replace('\\', '-')
    base = re.sub(r'\s+', ' ', base)
    base = re.sub(r'-+', '-', base)
    base = base.strip(' .')
    
    reserved = {'con', 'prn', 'aux', 'nul', 'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9', 'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'}
    if base.lower() in reserved:
        base = f"{base}_note"
        
    if not base:
        base = "untitled"
        
    return f"{base}{ext}"

# Walk bottom-up so file names change before folder names
for root, dirs, files in os.walk(target_dir, topdown=False):
    dirs[:] = [d for d in dirs if not is_ignored(d)]
    
    for fname in files:
        if is_ignored(fname) or fname in {'generate_index.py', 'server.js', 'package.json', 'package-lock.json', 'bun.lock', 'sync-site.sh', 'inject-gatekeeper.sh', 'isolate-navigation.sh', 'index.html'}:
            continue
        cleaned = clean_name(fname)
        if cleaned != fname:
            old_fpath = os.path.join(root, fname)
            new_fpath = os.path.join(root, cleaned)
            if os.path.exists(new_fpath) and old_fpath != new_fpath:
                count = 1
                base, ext = os.path.splitext(cleaned)
                while os.path.exists(new_fpath):
                    new_fpath = os.path.join(root, f"{base}_{count}{ext}")
                    count += 1
            os.rename(old_fpath, new_fpath)
            print(f"  ⚠️  Sanitized file: '{fname}' -> '{os.path.basename(new_fpath)}'")

    for dname in dirs:
        if is_ignored(dname):
            continue
        cleaned = clean_name(dname)
        if cleaned != dname:
            old_dpath = os.path.join(root, dname)
            new_dpath = os.path.join(root, cleaned)
            if not os.path.exists(new_dpath):
                os.rename(old_dpath, new_dpath)
                print(f"  ⚠️  Sanitized folder: '{dname}' -> '{cleaned}'")
PYEOF
  echo "✅ [GitHub File Check] Audit completed."
}

# ------------------------------------------------------------------------------
# 6. Main Execution Pipeline
# ------------------------------------------------------------------------------
run_pipeline() {
  echo "========================================================"
  echo "🚀 Workspace Digital Garden Manager"
  echo "📂 Location: $APP_DIR"
  echo "🕒 Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "========================================================"

  # 1. Setup NPM if needed
  setup_npm_environment

  # 2. If an external source is explicitly provided and exists, copy notes safely
  if [ -n "$SOURCE_DIR" ] && [ -d "$SOURCE_DIR" ]; then
    safe_copy_vault "$SOURCE_DIR" "$APP_DIR"
  fi

  # 3. Sanitize file names for GitHub and cross-platform compatibility
  sanitize_github_filenames "$APP_DIR"

  # 4. Generate cosmic landing page & update vault index
  if [ -f "$APP_DIR/generate_index.py" ]; then
    echo "🪐 Generating cosmic landing page & updating site-lib/vault-index.json..."
    python3 "$APP_DIR/generate_index.py" "$APP_DIR" "$APP_DIR/index.html"
  fi

  # 5. Inject Gatekeeper into any note folder viewers (skipping backups & site-lib)
  if [ -f "$APP_DIR/inject-gatekeeper.sh" ]; then
    bash "$APP_DIR/inject-gatekeeper.sh" "$APP_DIR"
  fi

  # 6. Apply navigation isolation
  if [ -f "$APP_DIR/isolate-navigation.sh" ]; then
    bash "$APP_DIR/isolate-navigation.sh" "$APP_DIR"
  fi

  # 7. Git check (if Git repo is initialized)
  if [ -d "$APP_DIR/.git" ]; then
    echo "📦 Checking Git status in $APP_DIR..."
    git -C "$APP_DIR" add -A
    if ! git -C "$APP_DIR" diff --cached --quiet; then
      echo "ℹ️  Changes detected in workspace. Run git commit & push when ready."
    else
      echo "✨ Working tree is clean."
    fi
  fi

  echo "🎉 Digital garden workspace is up to date and ready!"
}

# Execute based on command
if [[ "$COMMAND" == "restore" ]]; then
  restore_from_backup "$RESTORE_SOURCE"
  run_pipeline
  exit 0
fi

if [[ "$COMMAND" == "setup" ]]; then
  setup_npm_environment
  run_pipeline
  exit 0
fi

if [[ "$COMMAND" == "once" ]]; then
  run_pipeline
  exit 0
fi

if [[ "$COMMAND" == "watch" ]]; then
  WATCH_PATH="${SOURCE_DIR:-$APP_DIR}"
  echo "👁️ Starting file watcher on: $WATCH_PATH"
  echo "Press Ctrl+C to stop."
  run_pipeline
  while true; do
    if command -v inotifywait >/dev/null 2>&1; then
      inotifywait -r -e modify,create,delete,move "$WATCH_PATH" \
        --exclude '\.git' \
        --exclude 'node_modules' \
        --exclude 'backup.*' \
        --exclude '\.DS_Store' >/dev/null 2>&1 || true
      run_pipeline
    else
      sleep 15
      run_pipeline
    fi
  done
fi
