#!/usr/bin/env bash
set -euo pipefail

# Self-locate the script directory (parent website folder)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${1:-$SCRIPT_DIR}"
JS_DIR="$TARGET_DIR/site-lib/scripts"
JS_PATH="$JS_DIR/isolate-nav.js"

# 1. Ensure scripts directory exists
mkdir -p "$JS_DIR"

# 2. Create the updated JavaScript patch
cat << 'EOF' > "$JS_PATH"
document.addEventListener("DOMContentLoaded", () => {
    // If running in the SPA app-reader environment, folder isolation is native
    if (document.getElementById('file-tree-container')) return;

    const metaPath = document.querySelector('meta[name="pathname"]');
    if (!metaPath) return;
    
    const currentPath = metaPath.getAttribute('content');
    if (!currentPath.includes('/')) return; // Skip if we are at the vault root
    
    const currentTopFolder = currentPath.split('/')[0];
    const sidebar = document.getElementById('left-sidebar-content');
    if (!sidebar) return;
    
    let processed = false;
    
    const processSidebar = () => {
        if (processed) return true;
        
        const treeContainer = sidebar.querySelector('.tree-container');
        if (!treeContainer) return false;
        
        const allLinks = Array.from(treeContainer.querySelectorAll('.tree-item-self'));
        if (allLinks.length === 0) return false; // Sidebar content hasn't fetched yet
        
        const matchName = decodeURIComponent(currentTopFolder);
        const matchNameSpace = matchName.replace(/-/g, ' ').toLowerCase();
        
        // Find the node that corresponds exactly to our current active folder (e.g., "4th-semester")
        const targetLink = allLinks.find(link => {
            const dataPath = decodeURIComponent(link.getAttribute('data-path') || '');
            if (dataPath === matchName || dataPath === matchName + '/' || dataPath.startsWith(matchName + '/index.html')) {
                return true;
            }
            const text = link.innerText.trim().toLowerCase();
            if (text === matchNameSpace || text === matchName.toLowerCase()) {
                return true;
            }
            return false;
        });
        
        if (targetLink) {
            const targetItem = targetLink.closest('.tree-item');
            const childrenContainer = targetItem.querySelector('.tree-item-children');
            
            if (childrenContainer) {
                const fragment = document.createDocumentFragment();
                
                const baseDepth = parseInt(targetItem.getAttribute('data-depth') || '0', 10);
                
                const adjustDepth = (element, offset) => {
                    if (element.hasAttribute && element.hasAttribute('data-depth')) {
                        const currentDepth = parseInt(element.getAttribute('data-depth'), 10);
                        element.setAttribute('data-depth', Math.max(1, currentDepth - offset));
                    }
                    if (element.children) {
                        Array.from(element.children).forEach(child => adjustDepth(child, offset));
                    }
                };
                
                while (childrenContainer.firstChild) {
                    const child = childrenContainer.firstChild;
                    if (child.nodeType === 1) adjustDepth(child, baseDepth);
                    fragment.appendChild(child);
                }
                
                const rootItems = Array.from(treeContainer.children).filter(el => el.classList.contains('tree-item'));
                rootItems.forEach(el => el.remove());
                
                treeContainer.appendChild(fragment);
                
                processed = true;
                return true;
            }
        }
        
        if (allLinks.length > 3) {
            processed = true;
            return true;
        }
        
        return false;
    };

    if (!processSidebar()) {
        const observer = new MutationObserver((mutations, obs) => {
            if (processSidebar()) {
                obs.disconnect();
            }
        });
        observer.observe(sidebar, { childList: true, subtree: true });
    }
});
EOF

# 3. Inject the script into note viewer HTML files (skipping backups, node_modules, root index)
find "$TARGET_DIR" -type f -name "*.html" -print0 | while IFS= read -r -d '' file; do
    if [[ "$file" == "$TARGET_DIR/index.html" ]] || [[ "$file" =~ /(node_modules|\.git|backup|site-lib)/ ]]; then
        continue
    fi
    
    file_dir=$(dirname "$file")
    rel_path=$(realpath --relative-to="$file_dir" "$JS_PATH")
    
    if ! grep -q "isolate-nav.js" "$file"; then
        temp_file=$(mktemp)
        sed "s|</body>|<script defer src=\"$rel_path\"></script></body>|i" "$file" > "$temp_file"
        mv "$temp_file" "$file"
    fi
done
