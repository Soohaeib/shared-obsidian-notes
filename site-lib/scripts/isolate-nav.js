document.addEventListener("DOMContentLoaded", () => {
    // Check which folder we are currently in
    const metaPath = document.querySelector('meta[name="pathname"]');
    if (!metaPath) return;
    
    const currentPath = metaPath.getAttribute('content');
    if (!currentPath.includes('/')) return; // Skip if we are at the vault root
    
    const currentTopFolder = currentPath.split('/')[0];
    const sidebar = document.getElementById('left-sidebar-content');
    if (!sidebar) return;
    
    const processSidebar = () => {
        const topItems = sidebar.querySelectorAll('.tree-item');
        if (topItems.length === 0) return false; // Sidebar not loaded yet
        
        let foundAny = false;
        topItems.forEach(item => {
            // Target only the outermost folder nodes
            if (!item.parentElement.closest('.tree-item')) {
                foundAny = true;
                const link = item.querySelector('.tree-item-self');
                if (link) {
                    const path = link.getAttribute('data-path') || link.getAttribute('href') || '';
                    if (path && !path.startsWith('http')) {
                        const itemFolder = path.split('/')[0];
                        
                        // If this sidebar item is a different top-level folder, hide it
                        if (itemFolder !== currentTopFolder && itemFolder !== '') {
                            item.style.display = 'none';
                        } 
                        // If it IS our current folder, ensure it is expanded
                        else if (itemFolder === currentTopFolder) {
                            item.classList.remove('is-collapsed');
                            const children = item.querySelector('.tree-item-children');
                            if (children) children.style.display = 'block';
                        }
                    }
                }
            }
        });
        return foundAny;
    };

    // The extension loads the sidebar asynchronously. 
    // We try processing it immediately, and if it's not there yet, we watch for it.
    if (!processSidebar()) {
        const observer = new MutationObserver((mutations, obs) => {
            if (processSidebar()) {
                obs.disconnect(); // Stop watching once we've successfully cleaned the sidebar
            }
        });
        observer.observe(sidebar, { childList: true, subtree: true });
    }
});
