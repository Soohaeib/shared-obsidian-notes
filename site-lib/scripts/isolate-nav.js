document.addEventListener("DOMContentLoaded", () => {
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
                
                // The target folder has a depth (e.g., 1). Its children are depth 2.
                // We need to reduce their depth offset so they aren't padded too far to the right.
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
                
                // Move all files/subfolders out of the target folder
                while (childrenContainer.firstChild) {
                    const child = childrenContainer.firstChild;
                    if (child.nodeType === 1) adjustDepth(child, baseDepth);
                    fragment.appendChild(child);
                }
                
                // Erase the old Vault root node(s)
                const rootItems = Array.from(treeContainer.children).filter(el => el.classList.contains('tree-item'));
                rootItems.forEach(el => el.remove());
                
                // Inject the newly promoted files directly into the root of the sidebar
                treeContainer.appendChild(fragment);
                
                processed = true;
                return true;
            }
        }
        
        // If the tree loaded but our folder isn't in it, avoid an infinite loop
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
