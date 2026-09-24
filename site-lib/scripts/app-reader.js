/**
 * Obsidian Vault Reader Engine
 * Supports raw Markdown notes, Obsidian Callouts, Mermaid diagrams, KaTeX,
 * in-sidebar interactive graph view, and seamless multi-vault folder navigation.
 */

class ObsidianVaultApp {
  constructor() {
    this.currentFolder = document.body.dataset.vaultFolder || this.detectCurrentFolder();
    this.allNotes = [];
    this.graphData = { nodes: [], links: [] };
    this.currentPath = null;
    this.noteContents = new Map();
    this.healthIssuesByFile = new Map();

    // Reading preferences
    this.isFullWidth = localStorage.getItem('obsidian_full_width') === 'true';
    this.fontSize = parseInt(localStorage.getItem('obsidian_font_size') || '16', 10);
    this.theme = localStorage.getItem('obsidian_theme') || 'dark';

    // Sidebar states
    this.isLeftOpen = localStorage.getItem('obsidian_left_open') !== 'false';
    this.isRightOpen = localStorage.getItem('obsidian_right_open') !== 'false';

    // Graph state
    this.graphMode = localStorage.getItem('obsidian_graph_mode') || 'local';
    this.sidebarGraph = null;
    this.modalGraph = null;

    this.init();
  }

  detectCurrentFolder(discoveredFiles = []) {
    // 1. Explicit body attribute injected by generate_index.py or template
    if (document.body && document.body.dataset && document.body.dataset.vaultFolder) {
      return document.body.dataset.vaultFolder;
    }

    // 2. Discover known top-level folder names from discoveredFiles
    const knownFolders = new Set();
    if (Array.isArray(discoveredFiles)) {
      for (const f of discoveredFiles) {
        const seg = f.split('/')[0];
        if (seg && !seg.endsWith('.md')) {
          knownFolders.add(seg);
        }
      }
    }

    const currentHref = decodeURIComponent(window.location.href);
    const currentPath = decodeURIComponent(window.location.pathname);

    // 3. Match against known folders in URL (supports subpaths, GitHub Pages, file:///)
    for (const folder of knownFolders) {
      if (currentHref.includes(`/${folder}/`) || currentHref.endsWith(`/${folder}`) || currentPath.includes(`/${folder}/`) || currentPath.endsWith(`/${folder}`)) {
        return folder;
      }
    }

    // 4. Extract from pathname (last folder before index.html)
    const cleanPath = currentPath.replace(/\/index\.html?$/i, '').replace(/\/+$/, '');
    const segments = cleanPath.split('/').filter(Boolean);
    if (segments.length > 0) {
      const lastSeg = segments[segments.length - 1];
      if (knownFolders.size === 0 || knownFolders.has(lastSeg)) {
        return lastSeg;
      }
    }

    // 5. If we have known folders from index, default to the first one
    if (knownFolders.size > 0) {
      return Array.from(knownFolders)[0];
    }

    return '5th-semester';
  }

  async init() {
    // Configure marked for Obsidian heading IDs and GitHub-flavored markdown
    if (typeof marked !== 'undefined') {
      const renderer = new marked.Renderer();
      renderer.heading = function(...args) {
        let headingText = '';
        let headingLevel = 1;
        let headingRaw = '';

        if (args[0] && typeof args[0] === 'object') {
          // Marked v12+ signature: { tokens, depth, text, raw }
          headingText = args[0].text || '';
          headingLevel = args[0].depth || 1;
          headingRaw = args[0].raw || headingText;
        } else {
          // Marked classic signature: (text, level, raw)
          headingText = typeof args[0] === 'string' ? args[0] : String(args[0] || '');
          headingLevel = args[1] || 1;
          headingRaw = typeof args[2] === 'string' ? args[2] : headingText;
        }

        // Clean any internal tokens, math placeholders, or HTML from slug and data-heading
        const plainHeading = String(headingRaw || headingText || '')
          .replace(/@@[A-Z0-9_]+@@/g, '')
          .replace(/<[^>]+>/g, '')
          .trim();

        const slug = plainHeading
          .toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/^-+|-+$/g, '') || `heading-${headingLevel}`;

        const safeDataHeading = plainHeading.replace(/"/g, '&quot;');

        return `<h${headingLevel} id="${slug}" data-heading="${safeDataHeading}">${headingText}</h${headingLevel}>`;
      };
      marked.setOptions({
        gfm: true,
        breaks: false,
        renderer: renderer
      });
    }

    this.applyPreferences();
    this.setupUIEventListeners();
    await this.loadVaultNotes();
    this.buildFileTree();
    this.setupHoverLinkPreviews();
    this.setupMediaPreview();
    this.setupGraph();
    this.handleRoute();
    this.loadVaultHealth();

    window.addEventListener('hashchange', () => this.handleRoute());
  }

  applyPreferences() {
    document.documentElement.className = this.theme === 'light' ? 'theme-light' : 'theme-dark';
    document.body.className = this.theme === 'light' ? 'theme-light' : 'theme-dark';

    const leftSidebar = document.getElementById('sidebar-left');
    const rightSidebar = document.getElementById('sidebar-right');
    const btnLeft = document.getElementById('btn-toggle-left');
    const btnRight = document.getElementById('btn-toggle-right');

    if (leftSidebar && btnLeft) {
      if (!this.isLeftOpen) {
        leftSidebar.classList.add('collapsed');
        btnLeft.classList.remove('active');
      } else {
        leftSidebar.classList.remove('collapsed');
        btnLeft.classList.add('active');
      }
    }

    if (rightSidebar && btnRight) {
      if (!this.isRightOpen) {
        rightSidebar.classList.add('collapsed');
        btnRight.classList.remove('active');
      } else {
        rightSidebar.classList.remove('collapsed');
        btnRight.classList.add('active');
      }
    }

    const noteContainer = document.getElementById('note-container');
    const btnWidth = document.getElementById('btn-toggle-width');
    if (noteContainer) {
      if (this.isFullWidth) {
        noteContainer.classList.add('full-width-mode');
        noteContainer.classList.remove('readable-line-length');
        if (btnWidth) btnWidth.classList.add('active');
      } else {
        noteContainer.classList.remove('full-width-mode');
        noteContainer.classList.add('readable-line-length');
        if (btnWidth) btnWidth.classList.remove('active');
      }
      noteContainer.style.fontSize = `${this.fontSize}px`;
    }
  }

  setupUIEventListeners() {
    document.getElementById('btn-toggle-left')?.addEventListener('click', () => {
      this.isLeftOpen = !this.isLeftOpen;
      localStorage.setItem('obsidian_left_open', this.isLeftOpen);
      this.applyPreferences();
    });

    document.getElementById('btn-toggle-right')?.addEventListener('click', () => {
      this.isRightOpen = !this.isRightOpen;
      localStorage.setItem('obsidian_right_open', this.isRightOpen);
      this.applyPreferences();
      if (this.isRightOpen && this.sidebarGraph) {
        setTimeout(() => this.sidebarGraph.resize(), 250);
      }
    });

    document.getElementById('btn-toggle-width')?.addEventListener('click', () => {
      this.isFullWidth = !this.isFullWidth;
      localStorage.setItem('obsidian_full_width', this.isFullWidth);
      this.applyPreferences();
      this.showToast(this.isFullWidth ? 'Full width layout activated' : 'Readable column width activated');
    });

    document.getElementById('btn-font-minus')?.addEventListener('click', () => {
      this.fontSize = Math.max(12, this.fontSize - 1);
      localStorage.setItem('obsidian_font_size', this.fontSize);
      this.applyPreferences();
    });

    document.getElementById('btn-font-plus')?.addEventListener('click', () => {
      this.fontSize = Math.min(26, this.fontSize + 1);
      localStorage.setItem('obsidian_font_size', this.fontSize);
      this.applyPreferences();
    });

    document.getElementById('btn-toggle-theme')?.addEventListener('click', () => {
      this.theme = this.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('obsidian_theme', this.theme);
      this.applyPreferences();
      if (this.sidebarGraph) this.sidebarGraph.updateTheme(this.theme);
      if (this.modalGraph) this.modalGraph.updateTheme(this.theme);
      this.showToast(`${this.theme === 'dark' ? 'Nord Dark' : 'Nord Light'} theme active`);
    });

    // Expand / Collapse all directories
    document.getElementById('btn-collapse-expand-all')?.addEventListener('click', () => {
      const folders = document.querySelectorAll('.nav-folder');
      if (!folders.length) return;
      const anyOpen = Array.from(folders).some(f => {
        const ch = f.querySelector('.tree-item-children');
        return ch && !ch.classList.contains('is-hidden');
      });

      folders.forEach(f => {
        const ch = f.querySelector('.tree-item-children');
        const icon = f.querySelector('.folder-item .tree-item-icon');
        if (ch) {
          if (anyOpen) {
            ch.classList.add('is-hidden');
            icon?.classList.add('is-collapsed');
          } else {
            ch.classList.remove('is-hidden');
            icon?.classList.remove('is-collapsed');
          }
        }
      });
      this.showToast(anyOpen ? 'Collapsed all folders' : 'Expanded all folders');
    });

    // Quick Search Palette
    document.getElementById('btn-quick-search')?.addEventListener('click', () => {
      this.openSearchModal();
    });

    // Vault Health Diagnostics Modal
    document.getElementById('btn-vault-health')?.addEventListener('click', () => {
      this.openHealthModal();
    });

    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.openSearchModal();
      }
      if (e.key === 'Escape') {
        this.closeSearchModal();
        this.closeGraphModal();
      }
    });

    document.getElementById('search-modal-input')?.addEventListener('input', (e) => {
      this.handleSearch(e.target.value);
    });

    // Graph triggers
    document.getElementById('btn-open-graph')?.addEventListener('click', () => this.openGraphModal());
    document.getElementById('graph-sidebar-expand')?.addEventListener('click', () => this.openGraphModal());
    document.getElementById('graph-sidebar-global')?.addEventListener('click', () => this.toggleGraphMode());
    document.getElementById('modal-toggle-local-global')?.addEventListener('click', () => this.toggleGraphMode());

    // Initialize Table of Contents global controls
    this.setupTocGlobalControls();

    // Internal link click delegation (WikiLinks and Footnotes)
    document.addEventListener('click', (e) => {
      const link = e.target.closest('.internal-link');
      if (link) {
        const href = link.getAttribute('href');
        if (href && href.startsWith('#')) {
          e.preventDefault();
          window.location.hash = href;
        }
      }

      const fnLink = e.target.closest('.footnote-link, .footnote-backref');
      if (fnLink) {
        const hash = fnLink.getAttribute('href');
        if (hash && hash.startsWith('#')) {
          const targetEl = document.getElementById(hash.slice(1));
          if (targetEl) {
            e.preventDefault();
            targetEl.scrollIntoView({ behavior: 'smooth' });
          }
        }
      }
    });
  }

  // Load vault notes list
  async loadVaultNotes() {
    let files = [];

    // 1. Try server endpoint
    try {
      const res = await fetch('/api/vault-discovery');
      if (res.ok) {
        const data = await res.json();
        if (data.files && data.files.length > 0) {
          files = data.files;
        }
      }
    } catch (e) {}

    // 2. Fallback to static vault-index.json
    if (files.length === 0) {
      const pathsToTry = [
        '../../site-lib/vault-index.json',
        '../site-lib/vault-index.json',
        './site-lib/vault-index.json',
        'site-lib/vault-index.json',
        '/site-lib/vault-index.json'
      ];
      for (const p of pathsToTry) {
        try {
          const res = await fetch(p);
          if (res.ok) {
            const data = await res.json();
            if (data.files && data.files.length > 0) {
              files = data.files;
              break;
            }
          }
        } catch (e) {}
      }
    }

    this.allVaultFiles = files;
    this.currentFolder = this.detectCurrentFolder(files);

    // Filter or normalize notes for current folder (supports [inside] containers and flat paths)
    let notes = [];
    const targetFolder = this.currentFolder;

    for (const f of files) {
      let relInFolder = null;
      // Case 1: path is "[inside] ... / targetFolder / note.md"
      const matchPattern = `/${targetFolder}/`;
      const matchIdx = f.indexOf(matchPattern);
      if (matchIdx !== -1) {
        relInFolder = f.substring(matchIdx + matchPattern.length);
      } else if (f.startsWith(`${targetFolder}/`)) {
        // Case 2: path is "targetFolder / note.md"
        relInFolder = f.substring(targetFolder.length + 1);
      }

      if (relInFolder) {
        const parts = relInFolder.split('/');
        const fileName = parts[parts.length - 1];
        const title = fileName.replace(/\.md$/, '').replace(/-/g, ' ');
        notes.push({
          fullPath: f,
          path: relInFolder,
          title: this.formatTitle(title),
          folder: parts.length > 1 ? parts[0] : 'root'
        });
      }
    }

    // Fallback: If no notes matched this.currentFolder, auto-detect folder with most notes
    if (notes.length === 0 && files.length > 0) {
      const folderCounts = {};
      for (const f of files) {
        const cleanF = f.replace(/^(?:\[inside\][^/]+|note-res)\//, '');
        const fld = cleanF.split('/')[0];
        folderCounts[fld] = (folderCounts[fld] || 0) + 1;
      }
      const bestFolder = Object.keys(folderCounts).sort((a, b) => folderCounts[b] - folderCounts[a])[0];
      if (bestFolder) {
        this.currentFolder = bestFolder;
        for (const f of files) {
          let relInFolder = null;
          const matchPattern = `/${bestFolder}/`;
          const matchIdx = f.indexOf(matchPattern);
          if (matchIdx !== -1) {
            relInFolder = f.substring(matchIdx + matchPattern.length);
          } else if (f.startsWith(`${bestFolder}/`)) {
            relInFolder = f.substring(bestFolder.length + 1);
          }
          if (relInFolder) {
            const parts = relInFolder.split('/');
            const fileName = parts[parts.length - 1];
            notes.push({
              fullPath: f,
              path: relInFolder,
              title: this.formatTitle(fileName.replace(/\.md$/, '').replace(/-/g, ' ')),
              folder: parts.length > 1 ? parts[0] : 'root'
            });
          }
        }
      }
    }

    this.allNotes = notes;
    this.buildGraphData();
    this.updateWorkspaceBranding();
  }

  updateWorkspaceBranding() {
    const formatted = this.formatFolderTitle(this.currentFolder);
    const sidebarTitle = document.querySelector('.sidebar-title');
    if (sidebarTitle) {
      sidebarTitle.innerText = `${formatted} Notes`;
    }
    const currentCrumb = document.querySelector('.current-crumb');
    if (currentCrumb && !window.location.hash) {
      currentCrumb.innerText = `${formatted} Overview`;
    }
    if (!document.title.includes(formatted)) {
      document.title = `BBA ${formatted} — Shared Obsidian Notes`;
    }
  }

  formatTitle(str) {
    if (str.toLowerCase() === 'index') return 'Coursework Overview';
    return str.split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  // Build Graph Nodes & Links
  buildGraphData() {
    const nodes = [];
    const links = [];
    const nodeMap = new Map();

    for (const note of this.allNotes) {
      const isIndex = note.path === 'index.md';
      const nodeObj = {
        id: note.path,
        title: note.title,
        color: isIndex ? '#bf616a' : (note.path.includes('pyq') ? '#ebcb8b' : '#88c0d0'),
        radius: isIndex ? 10 : 6
      };
      nodes.push(nodeObj);
      nodeMap.set(note.path, nodeObj);
    }

    // Connect index to chapter notes, or connect hub note
    const indexNode = nodeMap.get('index.md');
    if (indexNode) {
      for (const note of this.allNotes) {
        if (note.path !== 'index.md') {
          links.push({
            source: 'index.md',
            target: note.path
          });
        }
      }
    } else if (nodes.length > 1) {
      // Connect notes to the first note as the root hub
      const firstId = nodes[0].id;
      for (let i = 1; i < nodes.length; i++) {
        links.push({
          source: firstId,
          target: nodes[i].id
        });
      }
    }

    this.graphData = { nodes, links };
  }

  // Build the hierarchical file explorer
  buildFileTree() {
    const container = document.getElementById('file-tree-container');
    if (!container) return;

    const tree = {};
    for (const note of this.allNotes) {
      const parts = note.path.split('/');
      let current = tree;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!current[part]) {
          current[part] = { _isFolder: true, _children: {} };
        }
        current = current[part]._children;
      }
      const fileName = parts[parts.length - 1];
      current[fileName] = { _isFolder: false, note: note };
    }

    container.innerHTML = this.renderTreeFolder(tree, '');
    this.setupTreeClickHandlers();
    this.highlightActiveTreeItem();
  }

  renderTreeFolder(folderObj, parentPath) {
    let html = '';
    const entries = Object.keys(folderObj).sort((a, b) => {
      const aIsFolder = folderObj[a]._isFolder;
      const bIsFolder = folderObj[b]._isFolder;
      if (aIsFolder && !bIsFolder) return -1;
      if (!aIsFolder && bIsFolder) return 1;
      if (a === 'index.md') return -1;
      if (b === 'index.md') return 1;
      return a.localeCompare(b);
    });

    for (const key of entries) {
      const item = folderObj[key];
      const itemPath = parentPath ? `${parentPath}/${key}` : key;

      if (item._isFolder) {
        const folderLabel = this.formatFolderTitle(key);
        html += `
          <div class="nav-folder" data-path="${itemPath}">
            <div class="tree-item-self folder-item" data-folder-path="${itemPath}">
              <span class="tree-item-icon is-collapsed">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity: 0.8; margin-right: 2px;">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
              <span class="tree-item-title">${folderLabel}</span>
            </div>
            <div class="tree-item-children is-hidden">
              ${this.renderTreeFolder(item._children, itemPath)}
            </div>
          </div>
        `;
      } else {
        const note = item.note;
        html += `
          <div class="nav-file" data-note-path="${note.path}">
            <a href="#${note.path}" class="tree-item-self note-item" data-note-path="${note.path}">
              <span class="tree-item-icon note-health-icon health-pending" role="img" aria-label="Health status loading" title="Health status loading" style="opacity: 0.8;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
              </span>
              <span class="tree-item-title">${note.title}</span>
            </a>
          </div>
        `;
      }
    }
    return html;
  }

  formatFolderTitle(name) {
    if (name === 'acc-301') return 'ACC 301 (Auditing)';
    if (name === 'acc-302') return 'ACC 302 (Cost Accounting)';
    if (name === 'acc-303') return 'ACC 303 (Management Accounting)';
    if (name === 'acc-304') return 'ACC 304 (Corporate Finance)';
    if (name === 'acc-305') return 'ACC 305 (Financial Markets)';
    if (name === 'others') return 'Course Syllabi & References';
    return name.replace(/-/g, ' ').toUpperCase();
  }

  setupTreeClickHandlers() {
    document.querySelectorAll('.tree-item-self.folder-item').forEach(el => {
      el.addEventListener('click', () => {
        const folder = el.closest('.nav-folder');
        const children = folder?.querySelector(':scope > .tree-item-children');
        const icon = el.querySelector('.tree-item-icon');
        if (children) {
          const isHidden = children.classList.toggle('is-hidden');
          if (icon) {
            icon.classList.toggle('is-collapsed', isHidden);
          }
        }
      });
    });
  }

  highlightActiveTreeItem() {
    // 1. Collapse all folders and clear active highlights by default
    document.querySelectorAll('.nav-folder').forEach(folder => {
      const children = folder.querySelector(':scope > .tree-item-children');
      const icon = folder.querySelector(':scope > .folder-item .tree-item-icon');
      if (children) children.classList.add('is-hidden');
      if (icon) icon.classList.add('is-collapsed');
    });

    document.querySelectorAll('.tree-item-self.note-item').forEach(el => {
      el.classList.remove('is-active');
    });

    // 2. Locate active note in left nav
    const cleanCurrent = (this.currentPath || '').replace(/^\.?\//, '').toLowerCase();
    let matchedEl = null;

    document.querySelectorAll('.tree-item-self.note-item').forEach(el => {
      const notePath = (el.dataset.notePath || '').replace(/^\.?\//, '').toLowerCase();
      if (notePath === cleanCurrent || notePath.endsWith(`/${cleanCurrent}`) || cleanCurrent.endsWith(`/${notePath}`)) {
        matchedEl = el;
      }
    });

    // 3. Highlight only the active file and expand only its direct ancestor folders
    if (matchedEl) {
      matchedEl.classList.add('is-active');
      let parent = matchedEl.closest('.nav-folder');
      while (parent) {
        const children = parent.querySelector(':scope > .tree-item-children');
        const icon = parent.querySelector(':scope > .folder-item .tree-item-icon');
        if (children) children.classList.remove('is-hidden');
        if (icon) icon.classList.remove('is-collapsed');
        parent = parent.parentElement?.closest('.nav-folder');
      }
      setTimeout(() => {
        matchedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }, 50);
    }
  }

  // Routing Handler
  async handleRoute() {
    const rawHash = window.location.hash.slice(1);
    let decodedHash = decodeURIComponent(rawHash).trim();

    // Check if hash has an anchor part (e.g. note.md#heading-abc or #heading-abc)
    let headingAnchor = '';
    if (decodedHash.includes('#')) {
      const parts = decodedHash.split('#');
      decodedHash = parts[0];
      headingAnchor = parts[1];
    }

    let targetNote = decodedHash;
    if (!targetNote) {
      // 1. Look for index.md
      const hasIndex = this.allNotes.find(n => n.path.toLowerCase() === 'index.md');
      if (hasIndex) {
        targetNote = hasIndex.path;
      } else {
        // 2. Look for README.md
        const hasReadme = this.allNotes.find(n => n.path.toLowerCase() === 'readme.md');
        if (hasReadme) {
          targetNote = hasReadme.path;
        } else if (this.allNotes.length > 0) {
          // 3. Fallback to first note in folder
          targetNote = this.allNotes[0].path;
        } else {
          targetNote = 'index.md';
        }
      }
    } else {
      // If note without .md was requested, resolve it
      if (!targetNote.endsWith('.md')) {
        const found = this.allNotes.find(n => n.path.toLowerCase() === `${targetNote.toLowerCase()}.md` || n.path.toLowerCase().endsWith(`/${targetNote.toLowerCase()}.md`));
        if (found) targetNote = found.path;
      }
    }

    this.currentPath = targetNote;
    this.highlightActiveTreeItem();
    await this.loadNote(targetNote, headingAnchor);
  }

  // Fetch and render raw Markdown note
  async loadNote(relPath, headingAnchor = '') {
    const container = document.getElementById('note-container');
    if (!container) return;

    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 300px; color: var(--text-muted); gap: 10px;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-animation">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
          <path d="M12 2a10 10 0 0 1 10 10"></path>
        </svg>
        <span>Loading note...</span>
      </div>
    `;

    try {
      // Fetch markdown content
      let rawMarkdown = this.noteContents.get(relPath);
      if (!rawMarkdown) {
        const fetchUrl = `./${relPath}`;
        const res = await fetch(fetchUrl);
        if (!res.ok) throw new Error(`Could not fetch ${fetchUrl}`);
        rawMarkdown = await res.text();
        this.noteContents.set(relPath, rawMarkdown);
      }

      this.renderMarkdownNote(rawMarkdown, relPath);

      if (headingAnchor) {
        setTimeout(() => {
          const el = document.getElementById(headingAnchor);
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    } catch (err) {
      container.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--red);">
          <h2>Note Not Found</h2>
          <p style="color: var(--text-muted); margin: 12px 0 24px 0;">Could not locate document: <code>${relPath}</code></p>
          <a href="#index.md" class="tool-btn active">Return to Overview</a>
        </div>
      `;
    }
  }

  renderMarkdownNote(rawMarkdown, relPath) {
    const container = document.getElementById('note-container');
    if (!container) return;

    // Gatekeeper verification: Check for YAML Frontmatter pass: <token>
    let frontmatter = '';
    let bodyMarkdown = rawMarkdown;

    if (rawMarkdown.startsWith('---')) {
      const fmEnd = rawMarkdown.indexOf('\n---', 3);
      if (fmEnd !== -1) {
        frontmatter = rawMarkdown.substring(3, fmEnd);
        bodyMarkdown = rawMarkdown.substring(fmEnd + 4).trim();
      }
    }

    const passMatch = frontmatter.match(/pass:\s*(.+)/);
    if (passMatch) {
      const expectedToken = passMatch[1].trim();
      const sessionKey = `gatekeeper_unlocked_${relPath}`;
      if (sessionStorage.getItem(sessionKey) !== 'true') {
        this.triggerGatekeeper(expectedToken, () => {
          sessionStorage.setItem(sessionKey, 'true');
          this.renderMarkdownNote(rawMarkdown, relPath);
        });
        return;
      }
    }

    const words = bodyMarkdown.trim().split(/\s+/).length;
    const readingTime = Math.ceil(words / 200);

    let title = relPath.split('/').pop().replace(/\.md$/, '').replace(/-/g, ' ');
    const titleMatch = bodyMarkdown.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      title = titleMatch[1].trim();
    } else {
      title = this.formatTitle(title);
    }

    let processed = this.preprocessObsidianMarkdown(bodyMarkdown);
    let renderedHtml = marked.parse(processed);
    renderedHtml = this.postprocessObsidianHtml(renderedHtml);

    container.innerHTML = `
      <div class="note-header-card">
        <div class="note-meta-badges">
          <span class="meta-badge" id="note-reading-time" title="Estimated reading time remaining">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            ${readingTime} min read
          </span>
          <span class="meta-badge" title="Total word count">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
            ${words} words
          </span>
        </div>
        <div class="note-actions-row">
          <button class="tool-btn" id="btn-copy-md" title="Copy raw Markdown to clipboard">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>Copy MD</span>
          </button>
          <button class="tool-btn" id="btn-download-md" title="Download note as Markdown file">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>Download</span>
          </button>
        </div>
      </div>
      <article class="markdown-rendered" id="note-article">
        ${renderedHtml}
      </article>
    `;

    this.setupReadingTimeTracking(readingTime);

    document.getElementById('btn-copy-md')?.addEventListener('click', () => {
      navigator.clipboard.writeText(rawMarkdown);
      this.showToast('Raw markdown copied to clipboard');
    });

    document.getElementById('btn-download-md')?.addEventListener('click', () => {
      const blob = new Blob([rawMarkdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title}.md`;
      a.click();
      URL.revokeObjectURL(url);
    });

    this.initInteractiveWidgets();
    this.buildTableOfContents();
    this.buildBacklinks(relPath);
    this.updateBreadcrumbs(this.formatFolderTitle(this.currentFolder), title);

    if (this.sidebarGraph) this.sidebarGraph.updateFocus(relPath, this.graphMode);
  }

  // Parse LaTeX arrays containing \multicolumn or \cline into responsive, multi-column HTML accounting tables
  // This solves the fundamental limitation in Obsidian/KaTeX which throws errors on \multicolumn and \cline
  parseLatexArrayToHtmlTable(latex) {
    if (!latex || (!latex.includes('\\multicolumn') && !latex.includes('\\cline')) || !latex.includes('\\begin{array}')) {
      return null;
    }

    try {
      const cleanLatex = latex.replace(/^[ \t]*>+[ \t]*/gm, '').trim();
      const bodyMatch = cleanLatex.match(/\\begin\{array\}\{([lrc|]+)\}([\s\S]*?)\\end\{array\}/);
      if (!bodyMatch) return null;

      const colAlignments = bodyMatch[1].replace(/\|/g, '').split('').map(c => c === 'r' ? 'right' : (c === 'c' ? 'center' : 'left'));
      const rawBody = bodyMatch[2].trim();
      const rawRows = rawBody.split(/\\\\/);
      const processedRows = [];

      for (let r = 0; r < rawRows.length; r++) {
        let rowStr = rawRows[r].trim();
        if (!rowStr) continue;

        let borderTop = false;
        let borderBottom = false;
        let clineCols = null;

        if (rowStr.includes('\\hline \\hline') || rowStr.includes('\\hline\\hline')) {
          borderBottom = true;
          rowStr = rowStr.replace(/\\hline\s*\\hline/g, '').trim();
        }
        if (rowStr.includes('\\hline')) {
          borderTop = true;
          rowStr = rowStr.replace(/\\hline/g, '').trim();
        }

        const clineMatch = rowStr.match(/\\cline\{(\d+)-(\d+)\}/);
        if (clineMatch) {
          clineCols = { start: parseInt(clineMatch[1], 10), end: parseInt(clineMatch[2], 10) };
          rowStr = rowStr.replace(/\\cline\{\d+-\d+\}/g, '').trim();
        }

        if (!rowStr) {
          if (borderBottom && processedRows.length > 0) {
            processedRows[processedRows.length - 1].borderBottom = true;
          }
          if (borderTop && processedRows.length > 0) {
            processedRows[processedRows.length - 1].borderTop = true;
          }
          continue;
        }

        processedRows.push({ text: rowStr, borderTop, borderBottom, clineCols });
      }

      let html = '<div class="accounting-table-wrapper"><table class="accounting-schedule-table"><tbody>';

      for (const row of processedRows) {
        const { text: rowStr, borderTop, borderBottom, clineCols } = row;

        const borderClasses = [];
        if (borderTop) borderClasses.push('border-single-top');
        if (borderBottom) borderClasses.push('border-double-bottom');
        const trClass = borderClasses.join(' ');

        const multiMatch = rowStr.match(/^\\multicolumn\{(\d+)\}\{([lrc])\}\{([\s\S]+?)\}$/);
        if (multiMatch) {
          const colspan = multiMatch[1];
          const align = multiMatch[2] === 'r' ? 'right' : (multiMatch[2] === 'c' ? 'center' : 'left');
          let content = multiMatch[3];
          content = content.replace(/\\textbf\{([^}]+)\}/g, '<strong>$1</strong>');
          content = content.replace(/\\mathbf\{([^}]+)\}/g, '<strong>$1</strong>');
          content = content.replace(/\\text\{([^}]+)\}/g, '$1');
          content = content.replace(/\\(\$)/g, '$');
          content = content.replace(/[{}]/g, '');
          html += `<tr class="table-header-row ${trClass}"><td colspan="${colspan}" style="text-align: ${align};" class="multicolumn-cell">${content}</td></tr>`;
          continue;
        }

        const cells = rowStr.split('&');
        html += `<tr class="${trClass}">`;

        for (let c = 0; c < cells.length; c++) {
          let cell = cells[c].trim();
          const align = colAlignments[c] || (c > 0 ? 'right' : 'left');

          let isBold = false;
          if (/\\textbf\{([^}]+)\}/.test(cell) || /\\mathbf\{([^}]+)\}/.test(cell)) {
            isBold = true;
          }
          cell = cell.replace(/\\textbf\{([^}]+)\}/g, '$1');
          cell = cell.replace(/\\mathbf\{([^}]+)\}/g, '$1');
          cell = cell.replace(/\\text\{([^}]+)\}/g, '$1');
          cell = cell.replace(/\\quad/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
          cell = cell.replace(/\\qquad/g, '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;');
          cell = cell.replace(/\\(\$)/g, '$');
          cell = cell.replace(/[{}]/g, '');

          let style = `text-align: ${align};`;
          if (isBold) style += ' font-weight: 600;';

          const cellClasses = [];
          const isNumeric = /^[\$]?[\d,.-]+[\%]?$/.test(cell);
          if (isNumeric) cellClasses.push('cell-numeric');
          else cellClasses.push('cell-text');

          // If row has a partial horizontal line (\cline{i-j}), add border-cline-top to columns in range
          if (clineCols && (c + 1) >= clineCols.start && (c + 1) <= clineCols.end) {
            cellClasses.push('border-cline-top');
          }

          html += `<td class="${cellClasses.join(' ')}" style="${style}">${cell}</td>`;
        }
        html += '</tr>';
      }

      html += '</tbody></table></div>';
      return html;
    } catch (e) {
      console.warn('Multicolumn/cline array conversion error:', e);
      return null;
    }
  }

  // Render KaTeX Math formula with Obsidian-standard HTML ID and wrapper classes
  renderMathExpression(formula, displayMode = false) {
    if (!formula) return '';
    let clean = formula.trim();
    if (!clean) return '';

    // If formula is wrapped in redundant escapes or currency artifacts, clean it
    clean = clean.replace(/&#36;/g, '\\$');

    const mathId = `math-${displayMode ? 'block' : 'inline'}-${this.mathIdCounter++}`;

    // Multicolumn & Cline LaTeX array support: Obsidian/KaTeX cannot render \multicolumn or \cline inside \begin{array},
    // which causes financial statements, schedules, and trial balances to fail with red \multicolumn or \cline errors.
    // In this web app, we parse \begin{array} containing \multicolumn or \cline into responsive, semantic HTML accounting tables.
    if (displayMode && (clean.includes('\\multicolumn') || clean.includes('\\cline')) && clean.includes('\\begin{array}')) {
      const htmlTable = this.parseLatexArrayToHtmlTable(clean);
      if (htmlTable) {
        return `<div class="math math-block accounting-table-container" id="${mathId}"><span class="katex-display">${htmlTable}</span></div>`;
      }
    }

    let renderedKatex = '';
    try {
      if (window.katex && typeof window.katex.renderToString === 'function') {
        renderedKatex = window.katex.renderToString(clean, {
          displayMode: displayMode,
          throwOnError: false,
          output: 'htmlAndMathml',
          trust: true
        });
      } else {
        renderedKatex = displayMode ? `$$${clean}$$` : `$${clean}$`;
      }
    } catch (err) {
      console.warn('KaTeX render warning:', err);
      renderedKatex = `<span class="math-fallback">${this.escapeHtml(clean)}</span>`;
    }

    // Safety fallback: if KaTeX output contains parse error, render clean text without red error box
    if (renderedKatex.includes('katex-error')) {
      renderedKatex = `<span class="math-fallback">${this.escapeHtml(clean)}</span>`;
    }

    if (displayMode) {
      return `<div class="math math-block" id="${mathId}">${renderedKatex}</div>`;
    } else {
      return `<span class="math math-inline" id="${mathId}">${renderedKatex}</span>`;
    }
  }

  // Extract LaTeX display & inline math into tokens without breaking layout
  extractMathAndReplaceTokens(text) {
    if (!text) return text;

    // 1. Display math blocks: $$ ... $$
    text = text.replace(/(?<!\\)\$\$([\s\S]*?)(?<!\\)\$\$/g, (match, formula) => {
      // Obsidian-standard safety: Display math blocks cannot swallow markdown headings,
      // horizontal rules, blank paragraphs, or bullet lists
      if (/\n\s*(?:#{1,6}\s|---|===|\*\*\*|[-*+]\s|\d+\.\s|\n\s*\n)/.test(formula)) {
        return match;
      }
      const cleanFormula = formula.replace(/^[ \t]*>+[ \t]*/gm, '').trim();
      const token = `@@KATEX_BLOCK_${this.mathTokenIdx++}@@`;
      const html = this.renderMathExpression(cleanFormula, true);
      this.currentMathBlocksMap.set(token, html);
      return `\n\n${token}\n\n`;
    });

    // 2. LaTeX environments: \begin{equation}...\end{equation}, \begin{align}...\end{align}, etc.
    text = text.replace(/(?<!\\)\\begin\{([a-zA-Z0-9*]+)\}([\s\S]*?)\\end\{\1\}/g, (match, env, body) => {
      const full = `\\begin{${env}}${body}\\end{${env}}`;
      const cleanFormula = full.replace(/^[ \t]*>+[ \t]*/gm, '').trim();
      const token = `@@KATEX_BLOCK_${this.mathTokenIdx++}@@`;
      const html = this.renderMathExpression(cleanFormula, true);
      this.currentMathBlocksMap.set(token, html);
      return `\n\n${token}\n\n`;
    });

    // 3. Inline math: $formula$
    text = text.replace(/(?<![\\\$])\$(?!\s)((?:\\\$|[^\$\n\r])+?)(?<![\s\\\$])\$(?!\$)/g, (match, formula) => {
      const trimmed = formula.trim();
      // Exclude standalone currency numbers or percentages like $100, $25.50, $1,000, $5 million, etc.
      if (/^(?:&#36;|\$|\\\$)?\s*[\d,.]+(?:\s*(?:million|billion|trillion|USD|EUR|GBP|k|m|b|%))?$/i.test(trimmed)) {
        return match;
      }
      const token = `@@KATEX_INLINE_${this.mathTokenIdx++}@@`;
      const html = this.renderMathExpression(trimmed, false);
      this.currentMathInlinesMap.set(token, html);
      return token;
    });

    return text;
  }

  // Restore Math HTML into document or callout HTML
  restoreMathTokensInHtml(html) {
    if (!html) return html;

    // Restore Math Blocks
    if (this.currentMathBlocksMap && this.currentMathBlocksMap.size > 0) {
      for (const [token, renderedMath] of this.currentMathBlocksMap.entries()) {
        const pRegex = new RegExp(`<p>\\s*${token}\\s*<\\/p>`, 'g');
        if (pRegex.test(html)) {
          html = html.replace(pRegex, () => renderedMath);
        } else {
          html = html.replaceAll(token, () => renderedMath);
        }
      }
    }

    // Restore Inline Math
    if (this.currentMathInlinesMap && this.currentMathInlinesMap.size > 0) {
      for (const [token, renderedMath] of this.currentMathInlinesMap.entries()) {
        html = html.replaceAll(token, () => renderedMath);
      }
    }

    return html;
  }

  // Process internal markdown features (WikiLinks, embeds, highlights, tags, tasks)
  processInternalMarkdownFeatures(text) {
    // 1. Highlights: ==text== -> <mark>text</mark>
    text = text.replace(/==([^=\n]+)==/g, '<mark>$1</mark>');

    // 2. Obsidian Block References: ^block-id at end of line
    text = text.replace(/\s+\^([a-zA-Z0-9\-]+)$/gm, ' <span id="$1" class="obsidian-block-anchor"></span>');

    // 3. Obsidian Media & Note Transclusion Embeds: ![[...]]
    text = text.replace(/!\[\[([^\]\n]+)\]\]/g, (match, inner) => {
      let [file, opt] = inner.split('|').map(s => s ? s.trim() : '');
      const cleanFile = file.trim();

      if (/\.(png|jpe?g|gif|svg|webp|bmp|mp4|webm|mov)$/i.test(cleanFile)) {
        const resolvedSrc = this.resolveMediaPath(cleanFile);
        let style = 'max-width: 100%; border-radius: 6px;';
        if (opt && /^\d+$/.test(opt)) {
          style += ` width: ${opt}px;`;
        }
        const alt = opt && !/^\d+$/.test(opt) ? opt : cleanFile;
        return `<figure class="obsidian-media-embed"><img src="${resolvedSrc}" alt="${alt}" style="${style}" loading="lazy" /></figure>`;
      }

      const res = this.resolveWikiLink(cleanFile);
      const isResolved = Boolean(res.resolved);
      let targetHref = res.path;
      if (!res.isCrossFolder) {
        targetHref = `#${encodeURIComponent(res.path)}`;
      }
      return `
        <div class="obsidian-embed-card">
          <div class="embed-card-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
            <a class="internal-link ${isResolved ? 'is-resolved' : 'is-unresolved'}" href="${targetHref}">${res.title || cleanFile}</a>
          </div>
        </div>
      `;
    });

    // 4. Obsidian WikiLinks: [[...]]
    text = text.replace(/\[\[([^\]\n]+)\]\]/g, (match, inner) => {
      let notePart = inner;
      let label = '';
      if (inner.includes('|')) {
        const parts = inner.split('|');
        notePart = parts[0].trim();
        label = parts.slice(1).join('|').trim();
      }

      // Check if anchor-only link [[#Heading]]
      if (notePart.startsWith('#')) {
        const headingText = notePart.slice(1).trim();
        const display = label || headingText;
        const slug = headingText.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        return `<a class="internal-link anchor-link" href="#heading-${slug}" data-heading="${slug}">${display}</a>`;
      }

      // Split note name and heading [[Note#Heading]]
      let noteName = notePart;
      let heading = '';
      if (notePart.includes('#')) {
        const parts = notePart.split('#');
        noteName = parts[0].trim();
        heading = parts.slice(1).join('#').trim();
      }

      const res = this.resolveWikiLink(noteName);
      const display = label || (heading ? `${res.title || noteName} > ${heading}` : (res.title || noteName));
      const isResolved = Boolean(res.resolved);
      let targetHref = res.path;
      if (!res.isCrossFolder) {
        const targetHash = heading ? `${res.path}#heading-${heading.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : res.path;
        targetHref = `#${encodeURIComponent(targetHash)}`;
      }

      return `<a class="internal-link ${isResolved ? 'is-resolved' : 'is-unresolved'}" href="${targetHref}" data-note-path="${res.path}" title="${isResolved ? `Open: ${display}` : `Unresolved note: ${noteName}`}">${display}</a>`;
    });

    // 5. Obsidian Tags: #tag or #folder/subtag
    text = text.replace(/(^|[\s(])#([a-zA-Z0-9_\-\/]+)(?=[\s).,;:!?]|$)/g, '$1<span class="obsidian-tag">#$2</span>');

    // 6. Task lists
    text = text.replace(/^(\s*)-\s+\[ \]\s+(.*)$/gm, '$1- <input type="checkbox" disabled class="task-checkbox"> $2');
    text = text.replace(/^(\s*)-\s+\[x\]\s+(.*)$/gim, '$1- <input type="checkbox" checked disabled class="task-checkbox"> $2');

    return text;
  }

  // Pre-process Obsidian Markdown: Comments, Footnotes, Math placeholders, Highlights, Media Embeds, WikiLinks, and Tasks
  preprocessObsidianMarkdown(text) {
    // Dynamic runtime sanitizer that automatically corrects common formatting typos
    text = this.autoHealMarkdownTypos(text);

    this.currentFootnotesMap = new Map();
    this.currentMathBlocksMap = new Map();
    this.currentMathInlinesMap = new Map();
    this.currentCodeBlocksMap = new Map();
    this.currentCalloutsMap = new Map();
    this.mathIdCounter = 0;
    this.mathTokenIdx = 0;
    this.calloutTokenIdx = 0;

    // 0a. Temporarily extract fenced code blocks and inline code so math/wiki/comments inside code blocks are preserved intact
    let codeBlockIdx = 0;
    text = text.replace(/```[\s\S]*?```/g, (match) => {
      const token = `@@OBS_FENCED_BLOCK_${codeBlockIdx++}@@`;
      this.currentCodeBlocksMap.set(token, match);
      return token;
    });

    text = text.replace(/`[^`\n\r]+`/g, (match) => {
      const token = `@@OBS_INLINE_CODE_${codeBlockIdx++}@@`;
      this.currentCodeBlocksMap.set(token, match);
      return token;
    });

    // 0b. Strip Obsidian top-level comments: %% comment %%
    text = text.replace(/%%[\s\S]*?%%/g, '');

    // 0c. Normalize Obsidian & LaTeX-wrapped currency amounts (e.g. $\\$1.00$, $$1.00$, $\\$20,000$)
    // In monetary notes, figures are frequently written as $\\$1.00$ or $$1.00$ to prevent markdown parsers from confusing currency with LaTeX math delimiters.
    text = text.replace(/\$\\\$[ \t]*(\d[\d,]*(?:\.\d+)?(?:\s*(?:million|billion|trillion|USD|EUR|GBP|k|m|b))?)\$/gi, '&#36;$1');
    text = text.replace(/\$\$[ \t]*(\d[\d,]*(?:\.\d+)?(?:\s*(?:million|billion|trillion|USD|EUR|GBP|k|m|b))?)\$/gi, '&#36;$1');

    // 0d. Unify & Process Obsidian Callouts FIRST so inner math and content stay bundled inside the callout container
    text = this.processObsidianCallouts(text);

    // 0e. Extract Display & Inline Math in document body (preserves numerical ranges like $101–199$, equations, and tokens)
    text = this.extractMathAndReplaceTokens(text);

    // 0f. Normalize standalone currency amounts and remaining escaped dollar signs safely without capturing math delimiters or tokens
    text = text.replace(/(?<![\$\w\\])(?:\\\$|\$)[ \t]*(\d[\d,]*(?:\.\d+)?(?:\s*(?:million|billion|trillion|USD|EUR|GBP|k|m|b))?)(?!\$|\w)/gi, '&#36;$1');
    text = text.replace(/\\(\$)/g, '&#36;');

    // 1. Footnote definitions: ^[^1]: Text or multi-line
    text = text.replace(/^\[\^([a-zA-Z0-9_\-]+)\]:\s*([^\n]+(?:\n(?!\n|\[\^|\#|\-|\*).*)*)/gm, (match, fnId, fnContent) => {
      this.currentFootnotesMap.set(fnId, fnContent.trim());
      return ''; // remove definition block from body text
    });

    // 2. Footnote in-text references: [^1]
    text = text.replace(/\[\^([a-zA-Z0-9_\-]+)\]/g, (match, fnId) => {
      return `<sup class="footnote-ref" id="fnref-${fnId}"><a href="#fn-${fnId}" class="footnote-link" title="Jump to footnote">[^${fnId}]</a></sup>`;
    });

    // 3. Process remaining Markdown features (Highlights, Embeds, WikiLinks, Tags, Tasks)
    text = this.processInternalMarkdownFeatures(text);

    // 4. Cleanly restore code blocks so marked can parse them into semantic HTML
    for (const [token, codeContent] of this.currentCodeBlocksMap.entries()) {
      text = text.replaceAll(token, codeContent);
    }

    return text;
  }

  resolveMediaPath(fileName) {
    if (!fileName) return '';
    if (fileName.startsWith('http://') || fileName.startsWith('https://') || fileName.startsWith('/')) {
      return fileName;
    }
    let cleanFile = fileName.replace(/^\.\//, '');
    let isVaultRootPath = false;
    if (/^BBA Study\//i.test(cleanFile)) {
      cleanFile = cleanFile.replace(/^BBA Study\//i, '');
      isVaultRootPath = true;
    }

    const folderPrefix = `${this.currentFolder}/`;
    if (cleanFile.startsWith(folderPrefix)) {
      cleanFile = cleanFile.substring(folderPrefix.length);
      isVaultRootPath = true;
    }

    const noteDirectory = isVaultRootPath ? [] : (this.currentPath || '').split('/').slice(0, -1);
    const targetParts = [...noteDirectory, ...cleanFile.split('/')];
    const normalizedParts = [];
    for (const part of targetParts) {
      if (!part || part === '.') continue;
      if (part === '..') {
        normalizedParts.pop();
      } else {
        normalizedParts.push(part);
      }
    }
    return `./${normalizedParts.join('/')}`;
  }

  resolveWikiLink(noteName) {
    if (!noteName) return { path: '', resolved: false };
    const raw = noteName.trim();
    const clean = raw.replace(/\.md$/i, '').toLowerCase();
    const stem = clean.split('/').pop();

    // 1. Check in this.allNotes (in-folder)
    let found = this.allNotes.find(n => {
      const nClean = n.path.replace(/\.md$/i, '').toLowerCase();
      const nStem = nClean.split('/').pop();
      return nClean === clean || nStem === stem || n.title.toLowerCase() === clean;
    });

    if (found) {
      return { path: found.path, resolved: true, title: found.title };
    }

    // 2. Check in this.allVaultFiles across other folders
    if (this.allVaultFiles && this.allVaultFiles.length > 0) {
      const globalFound = this.allVaultFiles.find(f => {
        const fClean = f.replace(/\.md$/i, '').toLowerCase();
        const fStem = fClean.split('/').pop();
        return fClean === clean || fStem === stem || fClean.endsWith(`/${stem}`);
      });
      if (globalFound) {
        const parts = globalFound.split('/');
        const targetFolder = parts[0];
        const targetRel = parts.slice(1).join('/');
        if (targetFolder !== this.currentFolder) {
          return { path: `../${targetFolder}/#${encodeURIComponent(targetRel)}`, resolved: true, title: stem, isCrossFolder: true };
        }
        return { path: targetRel, resolved: true, title: stem };
      }
    }

    // 3. Fallback: unresolved internal link
    return { path: `${raw}.md`, resolved: false, title: raw };
  }

  // Pre-process Obsidian Callouts into clean atomic blocks with intact LaTeX and nested content
  processObsidianCallouts(text) {
    if (!this.currentCalloutsMap) {
      this.currentCalloutsMap = new Map();
    }

    const lines = text.split('\n');
    const resultLines = [];
    let inCallout = false;
    let calloutType = '';
    let foldChar = '';
    let calloutTitle = '';
    let calloutLines = [];

    const flushCallout = () => {
      if (!inCallout) return;
      const type = calloutType.toLowerCase();
      const isCollapsible = foldChar === '+' || foldChar === '-';
      const isFolded = foldChar === '-';
      let rawTitle = (calloutTitle && calloutTitle.trim()) ? calloutTitle.trim() : (type.charAt(0).toUpperCase() + type.slice(1));

      // Pre-render any math inside callout title (e.g. `[!quote] Formula $EPS$`)
      rawTitle = this.extractMathAndReplaceTokens(rawTitle);
      rawTitle = this.restoreMathTokensInHtml(rawTitle);

      const iconSvg = this.getCalloutIconSvg(type);

      let foldIndicator = '';
      if (isCollapsible) {
        foldIndicator = `
          <span class="callout-fold-indicator">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </span>
        `;
      }

      // Strip the leading '>' or '> ' from each line inside the callout
      let innerMarkdown = calloutLines.map(l => l.replace(/^[ \t]*>[ \t]?/, '')).join('\n');

      // Restore code blocks inside the callout before parsing
      for (const [codeToken, codeContent] of this.currentCodeBlocksMap.entries()) {
        if (innerMarkdown.includes(codeToken)) {
          innerMarkdown = innerMarkdown.replaceAll(codeToken, codeContent);
        }
      }

      // Extract and pre-render math expressions inside the callout body
      innerMarkdown = this.extractMathAndReplaceTokens(innerMarkdown);

      // Process internal Markdown features (WikiLinks, embeds, highlights, tags, tasks) inside callout
      innerMarkdown = this.processInternalMarkdownFeatures(innerMarkdown);

      // Parse inner markdown through marked (clean nested formatting)
      let innerHtml = '';
      try {
        if (typeof marked !== 'undefined') {
          innerHtml = marked.parse(innerMarkdown);
        } else {
          innerHtml = innerMarkdown;
        }
      } catch (e) {
        innerHtml = innerMarkdown;
      }

      // Restore math tokens inside innerHtml
      innerHtml = this.restoreMathTokensInHtml(innerHtml);

      const token = `@@OBS_CALLOUT_BLOCK_${this.calloutTokenIdx++}@@`;
      const fullCalloutHtml = `
        <div class="callout ${isFolded ? 'is-collapsed' : ''}" data-callout="${type}" ${isCollapsible ? 'data-callout-fold="true"' : ''}>
          <div class="callout-title">
            <span class="callout-icon">${iconSvg}</span>
            <span class="callout-title-inner">${rawTitle}</span>
            ${foldIndicator}
          </div>
          <div class="callout-content">${innerHtml}</div>
        </div>
      `;
      this.currentCalloutsMap.set(token, fullCalloutHtml);
      resultLines.push(token);

      inCallout = false;
      calloutType = '';
      foldChar = '';
      calloutTitle = '';
      calloutLines = [];
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const calloutHeaderMatch = line.match(/^[ \t]*>[ \t]*\[!([a-zA-Z0-9_\-]+)\]([+\-])?\s*(.*)$/i);

      if (calloutHeaderMatch) {
        if (inCallout) flushCallout();
        inCallout = true;
        calloutType = calloutHeaderMatch[1];
        foldChar = calloutHeaderMatch[2] || '';
        calloutTitle = calloutHeaderMatch[3] || '';
        calloutLines = [];
        continue;
      }

      if (inCallout) {
        if (/^[ \t]*>/.test(line)) {
          calloutLines.push(line);
        } else if (line.trim() === '') {
          // Check if upcoming non-empty line still continues the callout with '>'
          let hasMoreQuote = false;
          for (let j = i + 1; j < lines.length; j++) {
            if (lines[j].trim() === '') continue;
            if (/^[ \t]*>/.test(lines[j])) hasMoreQuote = true;
            break;
          }
          if (hasMoreQuote) {
            calloutLines.push('>');
          } else {
            flushCallout();
            resultLines.push(line);
          }
        } else {
          flushCallout();
          resultLines.push(line);
        }
      } else {
        resultLines.push(line);
      }
    }

    if (inCallout) flushCallout();

    return resultLines.join('\n');
  }

  // Post-process HTML for Math, Callouts, and Footnotes
  postprocessObsidianHtml(html) {
    // 0. Render Preprocessed Callouts
    if (this.currentCalloutsMap && this.currentCalloutsMap.size > 0) {
      for (const [token, calloutHtml] of this.currentCalloutsMap.entries()) {
        const pRegex = new RegExp(`<p>\\s*${token}\\s*<\\/p>`, 'g');
        if (pRegex.test(html)) {
          html = html.replace(pRegex, () => calloutHtml);
        } else {
          html = html.replaceAll(token, () => calloutHtml);
        }
      }
    }

    // 1. Restore any remaining Math Blocks & Inline Math in document body
    html = this.restoreMathTokensInHtml(html);

    // 2. Append Footnotes Section if any were defined in the document
    if (this.currentFootnotesMap && this.currentFootnotesMap.size > 0) {
      let fnHtml = '<section class="footnotes"><hr class="footnotes-sep"><ol class="footnotes-list">';
      for (const [key, content] of this.currentFootnotesMap.entries()) {
        const inlineParsed = (typeof marked !== 'undefined' && marked.parseInline) ? marked.parseInline(content) : content;
        fnHtml += `
          <li id="fn-${key}" class="footnote-item">
            <span class="footnote-content">${inlineParsed}</span>
            <a href="#fnref-${key}" class="footnote-backref" title="Jump back to reference">↩︎</a>
          </li>
        `;
      }
      fnHtml += '</ol></section>';
      html += fnHtml;
    }

    // 3. Fallback Obsidian Callouts from standard blockquotes
    const calloutRegex = /<blockquote>\s*<p>\[!([a-zA-Z0-9_\-]+)\]([+\-])?\s*([^\n<]*)?([\s\S]*?)<\/blockquote>/gi;
    html = html.replace(calloutRegex, (match, rawType, foldChar, title, rest) => {
      const type = rawType.toLowerCase();
      const isCollapsible = foldChar === '+' || foldChar === '-';
      const isFolded = foldChar === '-';
      let displayTitle = (title && title.trim()) ? title.trim() : (type.charAt(0).toUpperCase() + type.slice(1));
      
      displayTitle = this.extractMathAndReplaceTokens(displayTitle);
      displayTitle = this.restoreMathTokensInHtml(displayTitle);

      const iconSvg = this.getCalloutIconSvg(type);

      let foldIndicator = '';
      if (isCollapsible) {
        foldIndicator = `
          <span class="callout-fold-indicator">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </span>
        `;
      }

      let bodyHtml = (rest || '').trim();
      if (bodyHtml.startsWith('</p>')) {
        bodyHtml = bodyHtml.slice(4).trim();
      }
      if (bodyHtml && !bodyHtml.startsWith('<p') && !bodyHtml.startsWith('<div') && !bodyHtml.startsWith('<ul') && !bodyHtml.startsWith('<ol') && !bodyHtml.startsWith('<table') && !bodyHtml.startsWith('<blockquote')) {
        bodyHtml = `<p>${bodyHtml}</p>`;
      }

      bodyHtml = this.extractMathAndReplaceTokens(bodyHtml);
      bodyHtml = this.restoreMathTokensInHtml(bodyHtml);

      return `
        <div class="callout ${isFolded ? 'is-collapsed' : ''}" data-callout="${type}" ${isCollapsible ? 'data-callout-fold="true"' : ''}>
          <div class="callout-title">
            <span class="callout-icon">${iconSvg}</span>
            <span class="callout-title-inner">${displayTitle}</span>
            ${foldIndicator}
          </div>
          <div class="callout-content">${bodyHtml}</div>
        </div>
      `;
    });

    // 4. Safe postprocessing: avoid re-running raw math extractors on rendered HTML to prevent tag corruption

    // 5. Clean up heading IDs generated with temporary math tokens
    html = html.replace(/<h([1-6])([^>]*)id="([^"]*)"([^>]*)>/gi, (match, level, before, id, after) => {
      let cleanId = id.replace(/-?katex_(inline|block)_\d+/gi, '').replace(/-+$/, '').replace(/^-+/, '');
      if (!cleanId) cleanId = `heading-${level}`;
      return `<h${level}${before}id="${cleanId}"${after}>`;
    });

    // 6. Restore currency symbol entities
    html = html.replaceAll('&#36;', '$');

    return html;
  }

  // Build Linked References / Backlinks in Right Sidebar
  async buildBacklinks(currentRelPath) {
    const backlinksContainer = document.getElementById('backlinks-container');
    const backlinksSection = document.getElementById('backlinks-section');
    if (!backlinksContainer) return;

    if (backlinksSection) {
      backlinksSection.style.display = 'block';
    }

    const stem = currentRelPath.replace(/\.md$/i, '').split('/').pop().toLowerCase();
    const currentNoteObj = this.allNotes.find(n => n.path === currentRelPath);
    const currentTitle = (currentNoteObj?.title || stem).toLowerCase();

    const backlinks = [];

    for (const note of this.allNotes) {
      if (note.path === currentRelPath) continue;

      let content = this.noteContents.get(note.path);
      if (!content) {
        try {
          const res = await fetch(`./${note.path}`);
          if (res.ok) {
            content = await res.text();
            this.noteContents.set(note.path, content);
          }
        } catch (e) {}
      }

      if (content) {
        const lower = content.toLowerCase();
        const matchesStem = lower.includes(`[[${stem}`) || lower.includes(`[[${stem.replace(/-/g, ' ')}`);
        const matchesTitle = lower.includes(`[[${currentTitle}`);
        const matchesRel = lower.includes(currentRelPath.toLowerCase());

        if (matchesStem || matchesTitle || matchesRel) {
          let snippet = '';
          const matchKeyword = matchesStem ? stem : (matchesTitle ? currentTitle : currentRelPath.toLowerCase());
          const idx = lower.indexOf(matchKeyword);
          if (idx !== -1) {
            const start = Math.max(0, idx - 40);
            const end = Math.min(content.length, idx + 80);
            snippet = (start > 0 ? '...' : '') + content.substring(start, end).replace(/[#*`_\[\]]/g, '').trim() + '...';
          }
          backlinks.push({
            note: note,
            snippet: snippet || 'Linked in note'
          });
        }
      }
    }

    if (backlinks.length === 0) {
      backlinksContainer.innerHTML = '<div class="backlinks-empty">No linked references to this note yet.</div>';
    } else {
      backlinksContainer.innerHTML = backlinks.map(b => `
        <a href="#${encodeURIComponent(b.note.path)}" class="backlink-item">
          <div class="backlink-title">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
            <span>${b.note.title}</span>
          </div>
          <div class="backlink-snippet">${b.snippet}</div>
        </a>
      `).join('');
    }
  }

  getCalloutIconSvg(type) {
    if (['quote', 'cite'].includes(type)) {
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"></path><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"></path></svg>`;
    }
    if (['tip', 'hint', 'important'].includes(type)) {
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>`;
    }
    if (['abstract', 'summary', 'tldr'].includes(type)) {
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="21" y1="10" x2="3" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="21" y1="18" x2="3" y2="18"></line></svg>`;
    }
    if (['warning', 'caution', 'attention'].includes(type)) {
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
    }
    if (['danger', 'error', 'bug', 'failure', 'fail', 'flame'].includes(type)) {
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    }
    if (['success', 'check', 'done'].includes(type)) {
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    }
    if (['question', 'help', 'faq'].includes(type)) {
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
    }
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
  }

  initInteractiveWidgets() {
    // Callouts collapsible toggle
    document.querySelectorAll('.callout[data-callout-fold="true"]').forEach(callout => {
      callout.querySelector('.callout-title')?.addEventListener('click', () => {
        callout.classList.toggle('is-collapsed');
      });
    });

    // Mermaid & Mindmap Diagrams
    const diagramCodes = document.querySelectorAll('pre code[class*="language-mermaid"], pre code[class*="mermaid"], pre code[class*="language-mindmap"], pre code[class*="mindmap"], pre code[class*="language-markmap"]');
    if (diagramCodes.length > 0 && window.mermaid) {
      const isDark = this.theme !== 'light';
      try {
        window.mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'loose',
          theme: 'base',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          flowchart: {
            useMaxWidth: false,
            htmlLabels: true,
            curve: 'basis',
            padding: 16
          },
          mindmap: {
            useMaxWidth: false,
            padding: 16
          },
          themeVariables: isDark ? {
            darkMode: true,
            background: 'transparent',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            fontSize: '13px',
            mainBkg: '#242933',
            nodeBkg: '#242933',
            nodeTextColor: '#f8fafc',
            textColor: '#f8fafc',
            primaryColor: '#242933',
            primaryTextColor: '#f8fafc',
            primaryBorderColor: '#88c0d0',
            lineColor: '#81a1c1',
            secondaryColor: '#2e3440',
            secondaryTextColor: '#f8fafc',
            secondaryBorderColor: '#b48ead',
            tertiaryColor: '#222630',
            tertiaryTextColor: '#d8dee9',
            tertiaryBorderColor: '#a3be8c',
            edgeLabelBackground: '#1e222a',
            clusterBkg: 'rgba(36, 41, 51, 0.6)',
            clusterBorder: 'rgba(136, 192, 208, 0.4)',
            nodeBorder: '#88c0d0',
            git0: '#2e3440',
            gitBranchLabel0: '#ffffff',
            cScale0: '#242933', cScaleLabel0: '#f8fafc', cScaleInv0: '#88c0d0',
            cScale1: '#242933', cScaleLabel1: '#f8fafc', cScaleInv1: '#b48ead',
            cScale2: '#242933', cScaleLabel2: '#f8fafc', cScaleInv2: '#ebcb8b',
            cScale3: '#242933', cScaleLabel3: '#f8fafc', cScaleInv3: '#a3be8c',
            cScale4: '#242933', cScaleLabel4: '#f8fafc', cScaleInv4: '#81a1c1',
            cScale5: '#242933', cScaleLabel5: '#f8fafc', cScaleInv5: '#d08770',
            cScale6: '#242933', cScaleLabel6: '#f8fafc', cScaleInv6: '#bf616a',
            cScale7: '#242933', cScaleLabel7: '#f8fafc', cScaleInv7: '#8fbcbb'
          } : {
            darkMode: false,
            background: 'transparent',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            fontSize: '13px',
            mainBkg: '#ffffff',
            nodeBkg: '#ffffff',
            nodeTextColor: '#0f172a',
            textColor: '#0f172a',
            primaryColor: '#ffffff',
            primaryTextColor: '#0f172a',
            primaryBorderColor: '#5e81ac',
            lineColor: '#64748b',
            secondaryColor: '#f1f5f9',
            secondaryTextColor: '#0f172a',
            secondaryBorderColor: '#b48ead',
            tertiaryColor: '#f8fafc',
            tertiaryTextColor: '#475569',
            tertiaryBorderColor: '#a3be8c',
            edgeLabelBackground: '#ffffff',
            clusterBkg: 'rgba(241, 245, 249, 0.8)',
            clusterBorder: 'rgba(100, 116, 139, 0.3)',
            nodeBorder: '#5e81ac',
            git0: '#ffffff',
            gitBranchLabel0: '#0f172a',
            cScale0: '#ffffff', cScaleLabel0: '#0f172a', cScaleInv0: '#0284c7',
            cScale1: '#ffffff', cScaleLabel1: '#0f172a', cScaleInv1: '#9333ea',
            cScale2: '#ffffff', cScaleLabel2: '#0f172a', cScaleInv2: '#d97706',
            cScale3: '#ffffff', cScaleLabel3: '#0f172a', cScaleInv3: '#16a34a',
            cScale4: '#ffffff', cScaleLabel4: '#0f172a', cScaleInv4: '#2563eb',
            cScale5: '#ffffff', cScaleLabel5: '#0f172a', cScaleInv5: '#ea580c',
            cScale6: '#ffffff', cScaleLabel6: '#0f172a', cScaleInv6: '#dc2626',
            cScale7: '#ffffff', cScaleLabel7: '#0f172a', cScaleInv7: '#0d9488'
          }
        });
      } catch (e) {}

      diagramCodes.forEach((codeEl, index) => {
        const parent = codeEl.closest('pre');
        let codeText = codeEl.innerText.trim();
        const isMindmap = codeEl.className.includes('mindmap') || codeEl.className.includes('markmap');
        if (isMindmap && !codeText.startsWith('mindmap')) {
          codeText = `mindmap\n${codeText}`;
        }

        const container = document.createElement('div');
        container.className = 'mermaid-diagram-container mermaid';
        const id = `mermaid-diag-${Date.now()}-${index}`;

        try {
          window.mermaid.render(id, codeText).then(({ svg }) => {
            container.innerHTML = svg;

            const svgEl = container.querySelector('svg');
            if (svgEl) {
              const isDark = this.theme !== 'light';
              const isMindmapDiagram = isMindmap || !!svgEl.querySelector('.mindmap-node') || codeText.startsWith('mindmap');

              // Ensure SVG and foreignObject do not clip labels or text
              svgEl.style.setProperty('overflow', 'visible', 'important');
              svgEl.querySelectorAll('foreignObject').forEach(fo => {
                fo.style.setProperty('overflow', 'visible', 'important');
              });

              if (isMindmapDiagram) {
                // ==========================================
                // SPECIFIC ISOLATED MINDMAP STYLING
                // ==========================================
                const branchColorsDark = [
                  { fill: '#242933', stroke: '#88c0d0', text: '#f8fafc' }, // 0: Frost cyan
                  { fill: '#242933', stroke: '#b48ead', text: '#f8fafc' }, // 1: Purple
                  { fill: '#242933', stroke: '#ebcb8b', text: '#f8fafc' }, // 2: Amber
                  { fill: '#242933', stroke: '#a3be8c', text: '#f8fafc' }, // 3: Green
                  { fill: '#242933', stroke: '#81a1c1', text: '#f8fafc' }, // 4: Blue
                  { fill: '#242933', stroke: '#d08770', text: '#f8fafc' }, // 5: Orange
                  { fill: '#242933', stroke: '#bf616a', text: '#f8fafc' }, // 6: Coral red
                  { fill: '#242933', stroke: '#8fbcbb', text: '#f8fafc' }, // 7: Teal
                ];

                const branchColorsLight = [
                  { fill: '#ffffff', stroke: '#0284c7', text: '#0f172a' }, // 0: Cyan / Sky
                  { fill: '#ffffff', stroke: '#9333ea', text: '#0f172a' }, // 1: Purple
                  { fill: '#ffffff', stroke: '#d97706', text: '#0f172a' }, // 2: Amber
                  { fill: '#ffffff', stroke: '#16a34a', text: '#0f172a' }, // 3: Green
                  { fill: '#ffffff', stroke: '#2563eb', text: '#0f172a' }, // 4: Blue
                  { fill: '#ffffff', stroke: '#ea580c', text: '#0f172a' }, // 5: Orange
                  { fill: '#ffffff', stroke: '#dc2626', text: '#0f172a' }, // 6: Red
                  { fill: '#ffffff', stroke: '#0d9488', text: '#0f172a' }, // 7: Teal
                ];

                const palette = isDark ? branchColorsDark : branchColorsLight;

                // Root Node
                svgEl.querySelectorAll('.section-root rect, .section-root circle, .section-root path').forEach(el => {
                  el.style.setProperty('fill', isDark ? '#2e3440' : '#ffffff', 'important');
                  el.style.setProperty('stroke', isDark ? '#b48ead' : '#7c3aed', 'important');
                  el.style.setProperty('stroke-width', '2.5px', 'important');
                });
                svgEl.querySelectorAll('.section-root text').forEach(el => {
                  el.style.setProperty('fill', isDark ? '#ffffff' : '#1e1b4b', 'important');
                  el.style.setProperty('font-weight', '700', 'important');
                });

                // Branches 0..7
                palette.forEach((b, idx) => {
                  svgEl.querySelectorAll(`.section-${idx} rect, .section-${idx} path, .section-${idx} circle`).forEach(el => {
                    el.style.setProperty('fill', b.fill, 'important');
                    el.style.setProperty('fill-opacity', isDark ? '0.95' : '0.98', 'important');
                    el.style.setProperty('stroke', b.stroke, 'important');
                    el.style.setProperty('stroke-width', '1.5px', 'important');
                  });
                  svgEl.querySelectorAll(`.section-${idx} text, .section-${idx} .nodeLabel`).forEach(el => {
                    el.style.setProperty('fill', b.text, 'important');
                    el.style.setProperty('color', b.text, 'important');
                  });
                  svgEl.querySelectorAll(`.section-edge-${idx}, path.section-${idx}`).forEach(el => {
                    el.style.setProperty('stroke', b.stroke, 'important');
                    el.style.setProperty('stroke-width', '2px', 'important');
                  });
                });

                // Catch-all for any unclassed mindmap nodes or leaf nodes
                svgEl.querySelectorAll('.mindmap-node rect, .mindmap-node path, .mindmap-node circle').forEach(el => {
                  if (!el.style.getPropertyValue('fill')) {
                    el.style.setProperty('fill', isDark ? '#242933' : '#ffffff', 'important');
                    el.style.setProperty('stroke', isDark ? '#88c0d0' : '#5e81ac', 'important');
                    el.style.setProperty('stroke-width', '1.5px', 'important');
                  }
                });
                svgEl.querySelectorAll('.mindmap-node text, .mindmap-node .nodeLabel').forEach(el => {
                  el.style.setProperty('fill', isDark ? '#f8fafc' : '#0f172a', 'important');
                  el.style.setProperty('color', isDark ? '#f8fafc' : '#0f172a', 'important');
                });
              } else {
                // ==========================================
                // FLOWCHART-SPECIFIC ISOLATED STYLING
                // ==========================================
                // Round rect corners
                svgEl.querySelectorAll('.node rect, rect.basic, rect.label-container').forEach(r => {
                  if (!r.getAttribute('rx')) {
                    r.setAttribute('rx', '8');
                    r.setAttribute('ry', '8');
                  }
                });

                if (isDark) {
                  // Flowchart dark shapes (#242933) with Nord stroke (#88c0d0)
                  svgEl.querySelectorAll('.node rect, .node circle, .node ellipse, .node polygon, .node path, rect.basic, rect.label-container').forEach(el => {
                    el.style.setProperty('fill', '#242933', 'important');
                    el.style.setProperty('fill-opacity', '0.92', 'important');
                    el.style.setProperty('stroke', '#88c0d0', 'important');
                    el.style.setProperty('stroke-width', '1.5px', 'important');
                  });

                  // Flowchart text & typography
                  svgEl.querySelectorAll('.node text, .nodeLabel, .node foreignObject div, .node foreignObject span').forEach(el => {
                    el.style.setProperty('fill', '#f8fafc', 'important');
                    el.style.setProperty('color', '#f8fafc', 'important');
                    el.style.setProperty('line-height', '1.45', 'important');
                    el.style.setProperty('overflow', 'visible', 'important');
                  });

                  // Edge labels
                  svgEl.querySelectorAll('.edgeLabel, .edgeLabel div, .edgeLabel span, .edgeLabel rect').forEach(el => {
                    el.style.setProperty('background-color', '#1e222a', 'important');
                    el.style.setProperty('fill', '#1e222a', 'important');
                    el.style.setProperty('color', '#eceff4', 'important');
                  });

                  // Edge paths and arrowheads
                  svgEl.querySelectorAll('.edgePath path, .edgePath .path, .flowchart-link').forEach(el => {
                    el.style.setProperty('stroke', '#81a1c1', 'important');
                    el.style.setProperty('stroke-width', '1.5px', 'important');
                  });
                  svgEl.querySelectorAll('marker path, .arrowheadPath').forEach(el => {
                    el.style.setProperty('fill', '#88c0d0', 'important');
                    el.style.setProperty('stroke', '#88c0d0', 'important');
                  });
                } else {
                  // Flowchart light shapes (#ffffff) with slate stroke (#5e81ac)
                  svgEl.querySelectorAll('.node rect, .node circle, .node ellipse, .node polygon, .node path, rect.basic, rect.label-container').forEach(el => {
                    el.style.setProperty('fill', '#ffffff', 'important');
                    el.style.setProperty('fill-opacity', '0.95', 'important');
                    el.style.setProperty('stroke', '#5e81ac', 'important');
                    el.style.setProperty('stroke-width', '1.5px', 'important');
                  });

                  svgEl.querySelectorAll('.node text, .nodeLabel, .node foreignObject div, .node foreignObject span').forEach(el => {
                    el.style.setProperty('fill', '#0f172a', 'important');
                    el.style.setProperty('color', '#0f172a', 'important');
                    el.style.setProperty('line-height', '1.45', 'important');
                    el.style.setProperty('overflow', 'visible', 'important');
                  });

                  svgEl.querySelectorAll('.edgeLabel, .edgeLabel div, .edgeLabel span, .edgeLabel rect').forEach(el => {
                    el.style.setProperty('background-color', '#f1f5f9', 'important');
                    el.style.setProperty('fill', '#f1f5f9', 'important');
                    el.style.setProperty('color', '#0f172a', 'important');
                  });

                  svgEl.querySelectorAll('.edgePath path, .edgePath .path, .flowchart-link').forEach(el => {
                    el.style.setProperty('stroke', '#64748b', 'important');
                    el.style.setProperty('stroke-width', '1.5px', 'important');
                  });
                  svgEl.querySelectorAll('marker path, .arrowheadPath').forEach(el => {
                    el.style.setProperty('fill', '#5e81ac', 'important');
                    el.style.setProperty('stroke', '#5e81ac', 'important');
                  });
                }
              }
            }

            if (parent && parent.parentNode) {
              parent.replaceWith(container);
            }

            // Clean up any stray offscreen mermaid div left by mermaid.render
            const stray = document.getElementById(`d${id}`);
            if (stray && stray !== container && stray.parentNode) {
              stray.remove();
            }

            // Post-insertion: Dynamically measure and resize node rects and foreignObjects
            // to eliminate vertical text bleeding/cropping and guarantee generous padding
            if (svgEl) {
              requestAnimationFrame(() => {
                svgEl.querySelectorAll('.node').forEach(node => {
                  const rect = node.querySelector('rect.basic, rect.label-container, rect');
                  const fo = node.querySelector('foreignObject');
                  if (!rect || !fo) return;

                  const labelDiv = fo.querySelector('div, span, .nodeLabel');
                  if (!labelDiv) return;

                  const contentH = Math.ceil(labelDiv.scrollHeight || labelDiv.getBoundingClientRect().height);
                  const currentRectH = parseFloat(rect.getAttribute('height') || '0');
                  const neededH = contentH + 20; // 10px padding top/bottom

                  if (neededH > currentRectH) {
                    const diffH = neededH - currentRectH;
                    const currentY = parseFloat(rect.getAttribute('y') || '0');
                    rect.setAttribute('height', neededH);
                    rect.setAttribute('y', currentY - diffH / 2);

                    fo.setAttribute('height', neededH);
                    const currentFoY = parseFloat(fo.getAttribute('y') || '0');
                    if (!isNaN(currentFoY)) {
                      fo.setAttribute('y', currentFoY - diffH / 2);
                    }
                  }
                });
              });
            }
          }).catch(err => {
            console.warn('Mermaid render issue:', err);
          });
        } catch (e) {
          console.warn('Mermaid render error:', e);
        }
      });
    }
  }

  setupTocGlobalControls() {
    // Collapse / Expand All button in TOC header
    const btnToggleAll = document.getElementById('btn-toc-collapse-expand-all');
    if (btnToggleAll && !btnToggleAll._bound) {
      btnToggleAll._bound = true;
      btnToggleAll.addEventListener('click', () => {
        const allChildren = document.querySelectorAll('#toc-container .toc-children');
        const allTwists = document.querySelectorAll('#toc-container .toc-twisty-btn');
        if (!allChildren.length) return;

        const anyOpen = Array.from(allChildren).some(el => !el.classList.contains('is-collapsed'));
        allChildren.forEach(el => {
          if (anyOpen) {
            el.classList.add('is-collapsed');
          } else {
            el.classList.remove('is-collapsed');
          }
        });
        allTwists.forEach(btn => {
          if (anyOpen) {
            btn.classList.add('is-collapsed');
            btn.setAttribute('aria-expanded', 'false');
          } else {
            btn.classList.remove('is-collapsed');
            btn.setAttribute('aria-expanded', 'true');
          }
        });
        this.showToast(anyOpen ? 'Collapsed all subsections' : 'Expanded all subsections');
      });
    }

    // Search Toggle Button
    const btnSearchToggle = document.getElementById('btn-toc-search-toggle');
    const searchBar = document.getElementById('toc-search-bar');
    const filterInput = document.getElementById('toc-filter-input');
    const filterClear = document.getElementById('btn-toc-filter-clear');

    if (btnSearchToggle && searchBar && !btnSearchToggle._bound) {
      btnSearchToggle._bound = true;
      btnSearchToggle.addEventListener('click', () => {
        searchBar.classList.toggle('is-hidden');
        btnSearchToggle.classList.toggle('active', !searchBar.classList.contains('is-hidden'));
        if (!searchBar.classList.contains('is-hidden')) {
          filterInput?.focus();
        } else if (filterInput) {
          filterInput.value = '';
          this.filterTocHeadings('');
        }
      });
    }

    if (filterInput && !filterInput._bound) {
      filterInput._bound = true;
      filterInput.addEventListener('input', (e) => {
        this.filterTocHeadings(e.target.value);
      });
    }

    if (filterClear && filterInput && !filterClear._bound) {
      filterClear._bound = true;
      filterClear.addEventListener('click', () => {
        filterInput.value = '';
        this.filterTocHeadings('');
        filterInput.focus();
      });
    }
  }

  filterTocHeadings(query) {
    const q = (query || '').trim().toLowerCase();
    const tocNodes = document.querySelectorAll('#toc-container .toc-node');
    if (!tocNodes.length) return;

    if (!q) {
      tocNodes.forEach(node => {
        node.classList.remove('is-filtered-out');
        const link = node.querySelector(':scope > .toc-node-self > .toc-link');
        if (link && link._rawText) {
          link.textContent = link._rawText;
        }
      });
      return;
    }

    tocNodes.forEach(node => {
      const link = node.querySelector(':scope > .toc-node-self > .toc-link');
      if (!link) return;
      if (!link._rawText) link._rawText = link.textContent;
      const text = link._rawText;
      const matches = text.toLowerCase().includes(q);

      if (matches) {
        node.classList.remove('is-filtered-out');
        const reg = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        link.innerHTML = text.replace(reg, '<mark class="toc-match">$1</mark>');
        let parent = node.parentElement;
        while (parent && parent.id !== 'toc-container') {
          if (parent.classList.contains('toc-children')) {
            parent.classList.remove('is-collapsed');
            const parentTwist = parent.parentElement?.querySelector(':scope > .toc-node-self > .toc-twisty-btn');
            if (parentTwist) {
              parentTwist.classList.remove('is-collapsed');
              parentTwist.setAttribute('aria-expanded', 'true');
            }
          }
          if (parent.classList.contains('toc-node')) {
            parent.classList.remove('is-filtered-out');
          }
          parent = parent.parentElement;
        }
      } else {
        const childMatches = Array.from(node.querySelectorAll('.toc-link')).some(cl => {
          const cText = cl._rawText || cl.textContent;
          return cText.toLowerCase().includes(q);
        });
        if (childMatches) {
          node.classList.remove('is-filtered-out');
          link.textContent = text;
        } else {
          node.classList.add('is-filtered-out');
          link.textContent = text;
        }
      }
    });
  }

  buildTableOfContents() {
    const tocContainer = document.getElementById('toc-container');
    const article = document.getElementById('note-article');
    if (!tocContainer || !article) return;

    const headings = Array.from(article.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    if (headings.length === 0) {
      tocContainer.innerHTML = '<div style="padding: 8px 4px; font-size: 0.8rem; color: var(--text-faint);">No headings in this document.</div>';
      return;
    }

    // Build hierarchical tree
    const root = { depth: 0, children: [] };
    const stack = [root];

    headings.forEach((h, index) => {
      if (!h.id) {
        h.id = `heading-${index}-${h.innerText.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      }
      const depth = parseInt(h.tagName.substring(1), 10);
      const node = {
        id: h.id,
        text: h.innerText.trim(),
        depth: depth,
        element: h,
        children: []
      };

      while (stack.length > 1 && stack[stack.length - 1].depth >= depth) {
        stack.pop();
      }
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    });

    // Render tree recursively
    const renderTocNodes = (nodes) => {
      let html = '';
      nodes.forEach(node => {
        const hasChildren = node.children && node.children.length > 0;
        html += `<div class="toc-node" data-heading-id="${node.id}">`;
        html += `<div class="toc-node-self">`;
        if (hasChildren) {
          html += `
            <button class="toc-twisty-btn" title="Toggle subsection" aria-expanded="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
          `;
        } else {
          html += `<span class="toc-twist-spacer"></span>`;
        }
        html += `<a href="#${node.id}" data-heading-id="${node.id}" class="toc-link depth-${node.depth}" title="${node.text}">${node.text}</a>`;
        html += `</div>`;
        if (hasChildren) {
          html += `<div class="toc-children">${renderTocNodes(node.children)}</div>`;
        }
        html += `</div>`;
      });
      return html;
    };

    tocContainer.innerHTML = `<nav class="toc-nav">${renderTocNodes(root.children)}</nav>`;

    // Wire up twisty toggle buttons
    tocContainer.querySelectorAll('.toc-twisty-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const parentNode = btn.closest('.toc-node');
        const childrenContainer = parentNode?.querySelector(':scope > .toc-children');
        if (childrenContainer) {
          const isCollapsed = childrenContainer.classList.toggle('is-collapsed');
          btn.classList.toggle('is-collapsed', isCollapsed);
          btn.setAttribute('aria-expanded', !isCollapsed);
        }
      });
    });

    // Wire up TOC link clicks for smooth scrolling
    tocContainer.querySelectorAll('.toc-link').forEach(link => {
      link._rawText = link.textContent;
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const headingId = link.getAttribute('data-heading-id');
        const targetEl = document.getElementById(headingId);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth' });
          history.replaceState(null, '', `#${headingId}`);
        }
      });
    });

    // Re-apply filter if filter input had a value
    const filterInput = document.getElementById('toc-filter-input');
    if (filterInput && filterInput.value) {
      this.filterTocHeadings(filterInput.value);
    }

    // Active Scrollspy using IntersectionObserver
    if (this._tocObserver) {
      this._tocObserver.disconnect();
    }

    const tocLinks = tocContainer.querySelectorAll('.toc-link');
    const headingVisibility = new Map();

    this._tocObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        headingVisibility.set(entry.target.id, entry.isIntersecting);
      });

      // Find highest visible heading
      let activeHeadingId = null;
      for (const h of headings) {
        if (headingVisibility.get(h.id)) {
          activeHeadingId = h.id;
          break;
        }
      }

      if (activeHeadingId) {
        tocLinks.forEach(link => {
          if (link.getAttribute('data-heading-id') === activeHeadingId) {
            link.classList.add('is-active');
            let parent = link.closest('.toc-node')?.parentElement;
            while (parent && parent.id !== 'toc-container') {
              if (parent.classList.contains('toc-children') && parent.classList.contains('is-collapsed')) {
                parent.classList.remove('is-collapsed');
                const twist = parent.parentElement?.querySelector(':scope > .toc-node-self > .toc-twisty-btn');
                if (twist) {
                  twist.classList.remove('is-collapsed');
                  twist.setAttribute('aria-expanded', 'true');
                }
              }
              parent = parent.parentElement;
            }
          } else {
            link.classList.remove('is-active');
          }
        });
      }
    }, {
      rootMargin: '-5% 0px -75% 0px',
      threshold: [0, 1.0]
    });

    headings.forEach(h => this._tocObserver.observe(h));
  }

  setupHoverLinkPreviews() {
    let previewEl = document.getElementById('obsidian-hover-preview');
    if (!previewEl) {
      previewEl = document.createElement('div');
      previewEl.id = 'obsidian-hover-preview';
      document.body.appendChild(previewEl);
    }

    let hideTimeout = null;
    let dismissTimeout = null;

    const showPreview = async (targetPath, e) => {
      clearTimeout(hideTimeout);
      if (!targetPath) return;

      const cleanPath = targetPath.replace(/^#/, '').replace(/^\.\//, '');
      const note = this.allNotes.find(n => n.path === cleanPath || n.path.endsWith(cleanPath));
      if (!note) return;

      let content = this.noteContents.get(note.path);
      if (!content) {
        try {
          const res = await fetch(`./${note.path}`);
          if (res.ok) {
            content = await res.text();
            this.noteContents.set(note.path, content);
          }
        } catch (err) {}
      }

      let snippet = 'No preview text available.';
      if (content) {
        const cleanText = content
          .replace(/---[\s\S]*?---/, '')
          .replace(/#+\s+.*?\n/g, '')
          .replace(/\[\[(.*?)\]\]/g, '$1')
          .replace(/[#*`_~]/g, '')
          .trim();
        snippet = cleanText.substring(0, 220) + (cleanText.length > 220 ? '...' : '');
      }

      previewEl.innerHTML = `
        <div class="preview-popover-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
          <span>${note.title}</span>
          <button class="preview-close" type="button" aria-label="Close note preview" title="Close preview">&times;</button>
        </div>
        <div class="preview-popover-body">${snippet}</div>
      `;

      const x = Math.min(window.innerWidth - 340, Math.max(16, e.clientX + 12));
      const y = Math.min(window.innerHeight - 220, Math.max(16, e.clientY + 16));
      previewEl.style.left = `${x}px`;
      previewEl.style.top = `${y}px`;
      previewEl.classList.add('is-visible');
      previewEl.querySelector('.preview-close')?.addEventListener('click', () => {
        previewEl.classList.remove('is-visible');
      });
      clearTimeout(dismissTimeout);
      dismissTimeout = setTimeout(() => previewEl.classList.remove('is-visible'), 5000);
    };

    const hidePreview = () => {
      hideTimeout = setTimeout(() => {
        previewEl.classList.remove('is-visible');
      }, 150);
    };

    document.addEventListener('mouseover', (e) => {
      const link = e.target.closest('a.internal-link, .backlink-item, a[data-note-path], .tree-item-self.note-item');
      if (link) {
        const targetPath = link.dataset.notePath || link.dataset.target || link.getAttribute('href');
        if (targetPath && !targetPath.startsWith('http')) {
          showPreview(targetPath, e);
        }
      }
    });

    document.addEventListener('mouseout', (e) => {
      const link = e.target.closest('a.internal-link, .backlink-item, a[data-note-path], .tree-item-self.note-item');
      if (link) {
        hidePreview();
      }
    });

    previewEl.addEventListener('mouseenter', () => clearTimeout(hideTimeout));
    previewEl.addEventListener('mouseleave', () => {
      clearTimeout(dismissTimeout);
      dismissTimeout = setTimeout(() => previewEl.classList.remove('is-visible'), 1200);
    });
  }

  setupMediaPreview() {
    if (document.getElementById('media-preview-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'media-preview-overlay';
    overlay.className = 'media-preview-overlay';
    overlay.innerHTML = `
      <div class="media-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="media-preview-title">
        <div class="media-preview-toolbar">
          <span id="media-preview-title" class="media-preview-title">Preview</span>
          <div class="media-preview-actions">
            <a class="media-preview-download tool-btn" download title="Download preview">Download</a>
            <button class="media-preview-close tool-btn" type="button" title="Close preview">Close</button>
          </div>
        </div>
        <div class="media-preview-content"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => {
      overlay.classList.remove('is-open');
      overlay.querySelector('.media-preview-content')?.replaceChildren();
      if (this.mediaPreviewObjectUrl) {
        URL.revokeObjectURL(this.mediaPreviewObjectUrl);
        this.mediaPreviewObjectUrl = null;
      }
    };

    overlay.querySelector('.media-preview-close')?.addEventListener('click', close);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) close();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && overlay.classList.contains('is-open')) close();
    });

    document.addEventListener('click', event => {
      const image = event.target.closest('.obsidian-media-embed img');
      const diagram = event.target.closest('.mermaid-diagram-container svg, svg[id^="mermaid-diag"]');
      if (image) {
        event.preventDefault();
        this.openMediaPreview(image.getAttribute('src'), 'image', image.alt || 'Diagram');
      } else if (diagram) {
        event.preventDefault();
        this.openMediaPreview(diagram.outerHTML, 'svg', 'Diagram');
      }
    });
  }

  openMediaPreview(source, type, title) {
    const overlay = document.getElementById('media-preview-overlay');
    const content = overlay?.querySelector('.media-preview-content');
    const titleElement = overlay?.querySelector('.media-preview-title');
    const download = overlay?.querySelector('.media-preview-download');
    if (!overlay || !content || !titleElement || !download) return;

    if (this.mediaPreviewObjectUrl) URL.revokeObjectURL(this.mediaPreviewObjectUrl);
    this.mediaPreviewObjectUrl = null;
    titleElement.textContent = title;
    content.replaceChildren();
    let downloadUrl = source;

    if (type === 'svg') {
      this.mediaPreviewObjectUrl = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
      downloadUrl = this.mediaPreviewObjectUrl;
      const wrapper = document.createElement('div');
      wrapper.className = 'media-preview-svg';
      wrapper.innerHTML = source;
      content.appendChild(wrapper);
    } else {
      const image = document.createElement('img');
      image.src = source;
      image.alt = title;
      content.appendChild(image);
    }

    download.href = downloadUrl;
    const sourceExtension = type === 'svg' ? 'svg' : (source.split('?')[0].split('.').pop() || 'image');
    download.download = `${title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'diagram'}.${sourceExtension}`;
    overlay.classList.add('is-open');
  }

  updateBreadcrumbs(parent, current) {
    // Breadcrumb bar hidden per user layout request
  }

  setupGraph() {
    const sidebarCanvas = document.getElementById('graph-canvas');
    if (sidebarCanvas) {
      this.sidebarGraph = new ObsidianGraphRenderer(sidebarCanvas, this.graphData, {
        isMini: true,
        theme: this.theme,
        onNodeClick: (node) => {
          window.location.hash = `#${node.id}`;
        }
      });
      this.sidebarGraph.start();
    }

    const modalCanvas = document.getElementById('graph-canvas-modal');
    if (modalCanvas) {
      this.modalGraph = new ObsidianGraphRenderer(modalCanvas, this.graphData, {
        isMini: false,
        theme: this.theme,
        onNodeClick: (node) => {
          this.closeGraphModal();
          window.location.hash = `#${node.id}`;
        }
      });
    }

    this.updateGraphModeUI();
  }

  toggleGraphMode() {
    this.graphMode = this.graphMode === 'local' ? 'global' : 'local';
    localStorage.setItem('obsidian_graph_mode', this.graphMode);
    this.updateGraphModeUI();

    if (this.sidebarGraph) this.sidebarGraph.updateFocus(this.currentPath, this.graphMode);
    if (this.modalGraph) this.modalGraph.updateFocus(this.currentPath, this.graphMode);
    this.showToast(`Graph mode: ${this.graphMode === 'local' ? 'Local Neighborhood' : 'Global Vault'}`);
  }

  updateGraphModeUI() {
    const btnGlobal = document.getElementById('graph-sidebar-global');
    const label = document.getElementById('graph-mode-label');
    const modalBtn = document.getElementById('modal-toggle-local-global');

    if (btnGlobal) {
      if (this.graphMode === 'global') {
        btnGlobal.classList.add('is-active');
      } else {
        btnGlobal.classList.remove('is-active');
      }
    }
    if (label) {
      label.innerText = this.graphMode === 'local' ? 'Local Graph' : 'Global Graph';
    }
    if (modalBtn) {
      modalBtn.innerText = this.graphMode === 'local' ? 'Switch to Global Graph' : 'Switch to Local Graph';
    }
  }

  openGraphModal() {
    const modal = document.getElementById('graph-modal');
    if (modal) {
      modal.classList.add('is-open');
      if (this.modalGraph) {
        this.modalGraph.setData(this.graphData);
        this.modalGraph.resize();
        this.modalGraph.updateFocus(this.currentPath, this.graphMode);
        this.modalGraph.start();
      }
    }
  }

  closeGraphModal() {
    const modal = document.getElementById('graph-modal');
    if (modal) {
      modal.classList.remove('is-open');
      if (this.modalGraph) this.modalGraph.stop();
    }
  }

  openSearchModal() {
    const modal = document.getElementById('search-modal');
    const input = document.getElementById('search-modal-input');
    if (modal && input) {
      modal.classList.add('is-open');
      input.value = '';
      input.focus();
      this.handleSearch('');
    }
  }

  closeSearchModal() {
    document.getElementById('search-modal')?.classList.remove('is-open');
  }

  highlightSearchMatch(text, query) {
    if (!query || !text) return text || '';
    const cleanQ = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${cleanQ})`, 'gi');
    return text.replace(regex, '<span class="search-highlight">$1</span>');
  }

  handleSearch(query) {
    const container = document.getElementById('search-modal-results');
    if (!container) return;

    const q = query.toLowerCase().trim();
    const matches = this.allNotes.filter(n => {
      if (!q) return true;
      return n.title.toLowerCase().includes(q) || n.path.toLowerCase().includes(q);
    }).slice(0, 25);

    if (matches.length === 0) {
      container.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-faint);">No matching notes found.</div>';
      return;
    }

    let html = '';
    matches.forEach(note => {
      const highlightedTitle = this.highlightSearchMatch(note.title, q);
      const highlightedPath = this.highlightSearchMatch(note.path, q);
      html += `
        <div class="search-item" onclick="window.location.hash='#${note.path}'; window.ObsidianApp.closeSearchModal();">
          <span class="search-item-title">${highlightedTitle}</span>
          <span class="search-item-path">${highlightedPath}</span>
        </div>
      `;
    });
    container.innerHTML = html;
  }

  showToast(message) {
    const toast = document.getElementById('toast-notification');
    if (!toast) return;
    toast.innerText = message;
    toast.classList.add('is-visible');
    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => {
      toast.classList.remove('is-visible');
    }, 2400);
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Real-time markdown typo sanitizer
  autoHealMarkdownTypos(text) {
    if (!text) return text;
    // 1. Fix unspaced callouts: >[!tip]Title -> > [!tip] Title
    text = text.replace(/^[ \t]*>\[!([a-zA-Z0-9_\-]+)\]([^\s\n<].*)$/gm, '> [!$1] $2');
    // 2. Fix unspaced headings: ###Heading -> ### Heading
    text = text.replace(/^(#{1,6})([^\s#\n\r].*)$/gm, '$1 $2');
    return text;
  }

  // Load Vault Health report
  async loadVaultHealth() {
    const pathsToTry = [
      '../../site-lib/vault-health.json',
      '../site-lib/vault-health.json',
      './site-lib/vault-health.json',
      'site-lib/vault-health.json',
      '/site-lib/vault-health.json'
    ];

    let data = null;
    for (const p of pathsToTry) {
      try {
        const res = await fetch(p);
        if (res.ok) {
          data = await res.json();
          break;
        }
      } catch (e) {}
    }

    if (!data) return;
    this.vaultHealthData = data;
    this.healthIssuesByFile = new Map();
    for (const issue of data.issues || []) {
      const key = this.normalizeHealthPath(issue.file);
      const issues = this.healthIssuesByFile.get(key) || [];
      issues.push(issue);
      this.healthIssuesByFile.set(key, issues);
    }
    this.updateNoteHealthBadges();

    // Update Header Badge
    const badge = document.getElementById('vault-health-badge');
    if (badge && data.summary) {
      badge.innerText = `${data.summary.healthScore}%`;
      if (data.summary.totalIssues > 0 && data.summary.cleanFiles < data.summary.totalFiles) {
        badge.classList.add('has-warnings');
      } else {
        badge.classList.remove('has-warnings');
      }
    }
  }

  normalizeHealthPath(filePath) {
    return String(filePath || '').replaceAll('\\', '/').replace(/^\.\//, '');
  }

  updateNoteHealthBadges() {
    document.querySelectorAll('.tree-item-self.note-item').forEach(noteElement => {
      const note = this.allNotes.find(item => item.path === noteElement.dataset.notePath);
      const icon = noteElement.querySelector('.note-health-icon');
      if (!note || !icon) return;

      const issues = this.healthIssuesByFile.get(this.normalizeHealthPath(note.fullPath)) || [];
      const hasError = issues.some(issue => issue.severity === 'error');
      const status = hasError ? 'error' : issues.length > 0 ? 'warning' : 'clean';
      const label = status === 'clean' ? 'Clean note' : `${issues.length} health issue${issues.length === 1 ? '' : 's'}`;

      icon.classList.remove('health-pending', 'health-clean', 'health-warning', 'health-error');
      icon.classList.add(`health-${status}`);
      icon.setAttribute('aria-label', label);
      icon.setAttribute('title', label);
      noteElement.setAttribute('title', label);
    });
  }

  setupReadingTimeTracking(totalMinutes) {
    const viewport = document.getElementById('note-viewport');
    if (!viewport) return;

    if (this.readingScrollHandler) {
      viewport.removeEventListener('scroll', this.readingScrollHandler);
    }

    this.readingStats = { totalMinutes };
    this.readingScrollHandler = () => this.updateReadingTimeRemaining();
    viewport.addEventListener('scroll', this.readingScrollHandler, { passive: true });
    this.updateReadingTimeRemaining();
  }

  updateReadingTimeRemaining() {
    const viewport = document.getElementById('note-viewport');
    const timeBadge = document.getElementById('note-reading-time');
    if (!viewport || !timeBadge || !this.readingStats) return;

    const scrollRange = viewport.scrollHeight - viewport.clientHeight;
    const progress = scrollRange > 0 ? Math.min(1, Math.max(0, viewport.scrollTop / scrollRange)) : 0;
    const remaining = Math.max(0, Math.ceil(this.readingStats.totalMinutes * (1 - progress)));
    timeBadge.lastChild.textContent = remaining > 0 ? `${remaining} min left` : 'Finished';
    timeBadge.title = remaining > 0 ? 'Estimated reading time remaining' : 'End of note';
  }

  openHealthModal() {
    const modal = document.getElementById('vault-health-modal');
    if (!modal) return;
    modal.classList.add('is-open');

    if (this.vaultHealthData) {
      const s = this.vaultHealthData.summary || {};
      document.getElementById('metric-health-score').innerText = `${s.healthScore || 100}%`;
      document.getElementById('metric-total-notes').innerText = s.totalFiles || 0;
      document.getElementById('metric-clean-notes').innerText = s.cleanFiles || 0;
      document.getElementById('metric-warning-notes').innerText = s.filesWithWarnings || 0;
      document.getElementById('metric-auto-fixed').innerText = s.autoFixedIssues || 0;

      // Calculate counts per category
      const issues = this.vaultHealthData.issues || [];
      const mathCount = issues.filter(i => i.category === 'LaTeX / Math').length;
      const linksCount = issues.filter(i => i.category === 'WikiLink').length;
      const mediaCount = issues.filter(i => i.category === 'Media Embed').length;
      const calloutCount = issues.filter(i => i.category === 'Callout' || i.category === 'Markdown Syntax').length;

      document.getElementById('count-all').innerText = issues.length;
      document.getElementById('count-math').innerText = mathCount;
      document.getElementById('count-links').innerText = linksCount;
      document.getElementById('count-media').innerText = mediaCount;
      document.getElementById('count-callout').innerText = calloutCount;

      this.renderHealthIssues('all');

      // Wire filter buttons
      modal.querySelectorAll('.health-filter-btn').forEach(btn => {
        btn.onclick = () => {
          modal.querySelectorAll('.health-filter-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const filter = btn.getAttribute('data-filter');
          this.renderHealthIssues(filter);
        };
      });
    }
  }

  closeHealthModal() {
    document.getElementById('vault-health-modal')?.classList.remove('is-open');
  }

  renderHealthIssues(filter = 'all') {
    const list = document.getElementById('health-issues-list');
    if (!list) return;

    if (!this.vaultHealthData || !this.vaultHealthData.issues || this.vaultHealthData.issues.length === 0) {
      list.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--green, #a3be8c);">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-bottom: 12px;">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          <div style="font-size: 1.1rem; font-weight: 600;">Vault is 100% Healthy!</div>
          <div style="font-size: 0.85rem; color: var(--text-muted, #d8dee9); margin-top: 6px;">No syntax errors, broken links, or math delimiter issues found.</div>
        </div>
      `;
      return;
    }

    let issues = this.vaultHealthData.issues;
    if (filter !== 'all') {
      if (filter === 'Callout') {
        issues = issues.filter(i => i.category === 'Callout' || i.category === 'Markdown Syntax');
      } else {
        issues = issues.filter(i => i.category === filter);
      }
    }

    if (issues.length === 0) {
      list.innerHTML = `<div style="text-align: center; padding: 30px; color: var(--text-muted, #d8dee9);">No issues in this category.</div>`;
      return;
    }

    let html = '';
    issues.slice(0, 50).forEach(iss => {
      const fileName = iss.file.split('/').pop();
      const badgeClass = iss.category === 'LaTeX / Math' ? 'category-math' :
                         iss.category === 'WikiLink' ? 'category-links' :
                         iss.category === 'Media Embed' ? 'category-media' : 'category-callout';

      html += `
        <div class="issue-card">
          <div class="issue-header">
            <div class="issue-title-group">
              <a class="issue-file-link" onclick="window.ObsidianApp.closeHealthModal(); window.location.hash='#${encodeURIComponent(iss.file)}'; return false;">
                ${this.escapeHtml(fileName)}
              </a>
              <span class="issue-line-badge">Line ${iss.line || 1}</span>
            </div>
            <span class="issue-category-badge ${badgeClass}">${this.escapeHtml(iss.category)}</span>
          </div>
          <div class="issue-message">${this.escapeHtml(iss.message)}</div>
          ${iss.snippet ? `<div class="issue-snippet-box">${this.escapeHtml(iss.snippet)}</div>` : ''}
          ${iss.suggestion ? `<div class="issue-suggestion-box">💡 <strong>Suggestion:</strong> ${this.escapeHtml(iss.suggestion)}</div>` : ''}
        </div>
      `;
    });

    if (issues.length > 50) {
      html += `<div style="text-align: center; padding: 12px; color: var(--text-muted, #d8dee9); font-size: 0.8rem;">Showing first 50 of ${issues.length} issues.</div>`;
    }

    list.innerHTML = html;
  }

  // Gatekeeper Fullscreen Overlay for password-protected notes
  triggerGatekeeper(expectedToken, onUnlock) {
    // Remove any existing overlay
    document.getElementById('gatekeeper-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'gatekeeper-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(32, 33, 36, 0.95);
      backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
      z-index: 999999; display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      font-family: var(--font-interface, sans-serif);
      transition: opacity 0.5s ease, visibility 0.5s ease;
    `;

    const title = document.createElement('h2');
    title.innerText = "Oops! Seems like there is an issue. What could it be?";
    title.style.cssText = `
      margin: 0 0 24px 0; font-size: 1.25rem; font-weight: 500;
      color: #e8e8e8; text-align: center; padding: 0 20px;
      text-shadow: 0 2px 10px rgba(0,0,0,0.5);
    `;

    const inputWrapper = document.createElement('div');
    inputWrapper.style.cssText = "position: relative; width: 80%; max-width: 340px;";

    const input = document.createElement('input');
    input.type = "password";
    input.placeholder = "Enter Access Token...";
    input.style.cssText = `
      width: 100%; box-sizing: border-box;
      background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.2);
      padding: 16px 20px; border-radius: 12px; color: white; font-size: 1.05rem;
      text-align: center; outline: none; letter-spacing: 2px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3); transition: all 0.3s ease;
    `;

    input.addEventListener('focus', () => {
      input.style.borderColor = "var(--interactive-accent, #8b6ce3)";
      input.style.boxShadow = "0 0 0 3px hsla(var(--interactive-accent-hsl, 258, 88%, 66%), 0.3)";
    });

    input.addEventListener('blur', () => {
      input.style.borderColor = "rgba(255, 255, 255, 0.2)";
      input.style.boxShadow = "0 8px 32px rgba(0,0,0,0.3)";
    });

    document.body.style.overflow = 'hidden';

    inputWrapper.appendChild(input);
    overlay.appendChild(title);
    overlay.appendChild(inputWrapper);
    document.body.appendChild(overlay);

    input.addEventListener('input', (e) => {
      if (e.target.value === expectedToken) {
        input.style.borderColor = "#4ade80"; 
        input.style.color = "#4ade80";
        input.style.textShadow = "0 0 12px rgba(74, 222, 128, 0.5)";
        input.style.boxShadow = "0 0 0 3px rgba(74, 222, 128, 0.3)";
        input.disabled = true; 
        
        setTimeout(() => {
          overlay.style.opacity = '0';
          document.body.style.overflow = '';
          setTimeout(() => {
            overlay.remove();
            if (onUnlock) onUnlock();
          }, 500);
        }, 500); 
      }
    });

    setTimeout(() => input.focus(), 150);
  }
}

/**
 * Obsidian Force-Directed Interactive Canvas Graph Renderer
 */
class ObsidianGraphRenderer {
  constructor(canvas, data, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.data = data;
    this.isMini = options.isMini || false;
    this.theme = options.theme || 'dark';
    this.onNodeClick = options.onNodeClick || (() => {});

    this.focusNodeId = null;
    this.mode = 'local';
    this.hoveredNode = null;
    this.draggedNode = null;

    this.transform = { x: 0, y: 0, k: 1 };
    this.isPanning = false;
    this.startPan = { x: 0, y: 0 };

    this.simNodes = [];
    this.simLinks = [];
    this.isRunning = false;
    this.animFrame = null;

    this.initGraphSimulation();
    this.setupEvents();
    this.resize();
  }

  setData(data) {
    this.data = data;
    this.initGraphSimulation();
  }

  updateTheme(theme) {
    this.theme = theme;
  }

  initGraphSimulation() {
    const width = this.canvas.width || 400;
    const height = this.canvas.height || 400;

    let activeNodes = this.data.nodes || [];
    let activeLinks = this.data.links || [];

    if (this.mode === 'local' && this.focusNodeId) {
      // High-performance BFS 1-2 hop neighborhood with max 35 nodes cap
      const visited = new Set([this.focusNodeId]);
      const queue = [this.focusNodeId];
      const maxNodes = 35;

      while (queue.length > 0 && visited.size < maxNodes) {
        const currId = queue.shift();
        for (const link of activeLinks) {
          const s = typeof link.source === 'object' ? link.source.id : link.source;
          const t = typeof link.target === 'object' ? link.target.id : link.target;
          if (s === currId && !visited.has(t) && visited.size < maxNodes) {
            visited.add(t);
            queue.push(t);
          } else if (t === currId && !visited.has(s) && visited.size < maxNodes) {
            visited.add(s);
            queue.push(s);
          }
        }
      }

      // If note has few links, add sibling notes in the same folder up to 15
      if (visited.size < 12) {
        const currentFolder = this.focusNodeId.includes('/') ? this.focusNodeId.split('/')[0] : '';
        for (const n of activeNodes) {
          if (visited.size >= 15) break;
          if (!visited.has(n.id) && currentFolder && n.id.startsWith(currentFolder + '/')) {
            visited.add(n.id);
          }
        }
      }

      activeNodes = this.data.nodes.filter(n => visited.has(n.id));
      activeLinks = this.data.links.filter(l => {
        const s = typeof l.source === 'object' ? l.source.id : l.source;
        const t = typeof l.target === 'object' ? l.target.id : l.target;
        return visited.has(s) && visited.has(t);
      });
    } else if (this.mode === 'global' && activeNodes.length > 150) {
      // Cap global graph to top 150 interconnected nodes for smooth rendering
      const degreeMap = new Map();
      activeLinks.forEach(l => {
        const s = typeof l.source === 'object' ? l.source.id : l.source;
        const t = typeof l.target === 'object' ? l.target.id : l.target;
        degreeMap.set(s, (degreeMap.get(s) || 0) + 1);
        degreeMap.set(t, (degreeMap.get(t) || 0) + 1);
      });
      const topNodes = [...activeNodes]
        .sort((a, b) => (degreeMap.get(b.id) || 0) - (degreeMap.get(a.id) || 0))
        .slice(0, 150);
      const topSet = new Set(topNodes.map(n => n.id));
      if (this.focusNodeId) topSet.add(this.focusNodeId);

      activeNodes = this.data.nodes.filter(n => topSet.has(n.id));
      activeLinks = this.data.links.filter(l => {
        const s = typeof l.source === 'object' ? l.source.id : l.source;
        const t = typeof l.target === 'object' ? l.target.id : l.target;
        return topSet.has(s) && topSet.has(t);
      });
    }

    this.simNodes = activeNodes.map((n, i) => {
      const angle = (i / (activeNodes.length || 1)) * 2 * Math.PI;
      const radius = 30 + Math.random() * (this.isMini ? 60 : 160);
      return {
        ...n,
        x: n.x || (Math.cos(angle) * radius),
        y: n.y || (Math.sin(angle) * radius),
        vx: 0,
        vy: 0
      };
    });

    const nodeMap = new Map(this.simNodes.map(n => [n.id, n]));

    this.simLinks = activeLinks
      .map(l => {
        const sId = typeof l.source === 'object' ? l.source.id : l.source;
        const tId = typeof l.target === 'object' ? l.target.id : l.target;
        return {
          source: nodeMap.get(sId),
          target: nodeMap.get(tId)
        };
      })
      .filter(l => l.source && l.target);

    this.transform = {
      x: width / 2,
      y: height / 2,
      k: this.isMini ? 0.9 : 1
    };

    this.stepCount = 0;
    this.isSleeping = false;
    this.start();
  }

  updateFocus(nodeId, mode = 'local') {
    this.focusNodeId = nodeId;
    this.mode = mode;
    this.initGraphSimulation();
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
    this.width = rect.width;
    this.height = rect.height;
    this.transform.x = this.width / 2;
    this.transform.y = this.height / 2;
    this.render();
  }

  setupEvents() {
    this.canvas.addEventListener('mousedown', (e) => this.onPointerDown(e));
    window.addEventListener('mousemove', (e) => this.onPointerMove(e));
    window.addEventListener('mouseup', (e) => this.onPointerUp(e));
    this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });

    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) this.onPointerDown(e.touches[0]);
    });
    this.canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) this.onPointerMove(e.touches[0]);
    });
    this.canvas.addEventListener('touchend', () => this.onPointerUp());
  }

  toWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    return {
      x: (screenX - this.transform.x) / this.transform.k,
      y: (screenY - this.transform.y) / this.transform.k
    };
  }

  findNodeUnderPointer(clientX, clientY) {
    const { x, y } = this.toWorld(clientX, clientY);
    for (let i = this.simNodes.length - 1; i >= 0; i--) {
      const node = this.simNodes[i];
      const dist = Math.hypot(node.x - x, node.y - y);
      if (dist <= node.radius + 6) {
        return node;
      }
    }
    return null;
  }

  onPointerDown(e) {
    this.wake();
    const node = this.findNodeUnderPointer(e.clientX, e.clientY);
    if (node) {
      this.draggedNode = node;
      this.hasMoved = false;
      this.downPos = { x: e.clientX, y: e.clientY };
    } else {
      this.isPanning = true;
      this.startPan = { x: e.clientX - this.transform.x, y: e.clientY - this.transform.y };
    }
  }

  onPointerMove(e) {
    if (this.draggedNode) {
      this.wake();
      const { x, y } = this.toWorld(e.clientX, e.clientY);
      this.draggedNode.x = x;
      this.draggedNode.y = y;
      this.draggedNode.vx = 0;
      this.draggedNode.vy = 0;
      if (Math.hypot(e.clientX - this.downPos.x, e.clientY - this.downPos.y) > 4) {
        this.hasMoved = true;
      }
      this.render();
      return;
    }

    if (this.isPanning) {
      this.transform.x = e.clientX - this.startPan.x;
      this.transform.y = e.clientY - this.startPan.y;
      this.render();
      return;
    }

    const hovered = this.findNodeUnderPointer(e.clientX, e.clientY);
    if (hovered !== this.hoveredNode) {
      this.hoveredNode = hovered;
      this.canvas.style.cursor = hovered ? 'pointer' : 'grab';
      this.render();
    }
  }

  onPointerUp(e) {
    if (this.draggedNode && !this.hasMoved) {
      this.onNodeClick(this.draggedNode);
    }
    this.draggedNode = null;
    this.isPanning = false;
  }

  onWheel(e) {
    e.preventDefault();
    this.wake();
    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
    const newK = Math.max(0.2, Math.min(4, this.transform.k * zoomFactor));

    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    this.transform.x = mouseX - (mouseX - this.transform.x) * (newK / this.transform.k);
    this.transform.y = mouseY - (mouseY - this.transform.y) * (newK / this.transform.k);
    this.transform.k = newK;
    this.render();
  }

  wake() {
    this.stepCount = 0;
    this.isSleeping = false;
    if (!this.isRunning) {
      this.start();
    }
  }

  start() {
    if (!this.isRunning) {
      this.isRunning = true;
      const step = () => {
        if (!this.isRunning) return;
        const settled = this.tickPhysics();
        this.render();
        if (settled) {
          this.stop();
          this.isSleeping = true;
        } else {
          this.animFrame = requestAnimationFrame(step);
        }
      };
      step();
    }
  }

  stop() {
    this.isRunning = false;
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }

  tickPhysics() {
    const nodes = this.simNodes;
    const links = this.simLinks;
    const repulsion = this.isMini ? 600 : 1800;
    const springLength = this.isMini ? 45 : 75;
    const springK = 0.04;
    const damping = 0.84;
    const centerPull = 0.005;

    let totalVelocity = 0;
    this.stepCount = (this.stepCount || 0) + 1;

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distSq = dx * dx + dy * dy || 1;
        const dist = Math.sqrt(distSq);
        if (dist < 320) {
          const force = repulsion / distSq;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.vx -= fx;
          a.vy -= fy;
          b.vx += fx;
          b.vy += fy;
        }
      }
    }

    for (const link of links) {
      const a = link.source;
      const b = link.target;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - springLength) * springK;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    for (const node of nodes) {
      if (node === this.draggedNode) continue;
      node.vx -= node.x * centerPull;
      node.vy -= node.y * centerPull;
      node.vx = Math.max(-12, Math.min(12, node.vx * damping));
      node.vy = Math.max(-12, Math.min(12, node.vy * damping));
      node.x += node.vx;
      node.y += node.vy;
      totalVelocity += Math.abs(node.vx) + Math.abs(node.vy);
    }

    // Stabilized / Sleep condition
    if (this.stepCount > 35 && (totalVelocity / (nodes.length || 1)) < 0.05) {
      return true;
    }
    if (this.stepCount > 150) {
      return true;
    }
    return false;
  }

  render() {
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, this.width || 500, this.height || 500);

    ctx.translate(this.transform.x, this.transform.y);
    ctx.scale(this.transform.k, this.transform.k);

    const isDark = this.theme === 'dark';
    const linkColor = isDark ? 'rgba(76, 86, 106, 0.45)' : 'rgba(216, 222, 233, 0.6)';
    const activeLinkColor = isDark ? 'rgba(136, 192, 208, 0.9)' : 'rgba(94, 129, 172, 0.9)';

    for (const link of this.simLinks) {
      const isConnected = this.hoveredNode && (link.source === this.hoveredNode || link.target === this.hoveredNode);
      ctx.beginPath();
      ctx.moveTo(link.source.x, link.source.y);
      ctx.lineTo(link.target.x, link.target.y);
      ctx.strokeStyle = isConnected ? activeLinkColor : linkColor;
      ctx.lineWidth = isConnected ? 2 : 1;
      ctx.stroke();
    }

    for (const node of this.simNodes) {
      const isFocused = node.id === this.focusNodeId;
      const isHovered = node === this.hoveredNode;

      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius * (isHovered ? 1.3 : 1), 0, 2 * Math.PI);

      if (isFocused) {
        ctx.fillStyle = '#bf616a';
        ctx.shadowColor = 'rgba(191, 97, 106, 0.6)';
        ctx.shadowBlur = 10;
      } else if (isHovered) {
        ctx.fillStyle = '#d08770';
        ctx.shadowColor = 'rgba(208, 135, 112, 0.5)';
        ctx.shadowBlur = 8;
      } else {
        ctx.fillStyle = node.color || '#88c0d0';
        ctx.shadowBlur = 0;
      }

      ctx.fill();
      ctx.shadowBlur = 0;

      if (isHovered || isFocused || (!this.isMini && this.transform.k > 1.2)) {
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const text = node.title || node.id;
        const metrics = ctx.measureText(text);
        const pad = 4;
        ctx.fillStyle = isDark ? 'rgba(46, 52, 64, 0.85)' : 'rgba(255, 255, 255, 0.85)';
        ctx.fillRect(node.x - metrics.width / 2 - pad, node.y + node.radius + 3, metrics.width + pad * 2, 14);

        ctx.fillStyle = isDark ? '#eceff4' : '#2e3440';
        ctx.fillText(text, node.x, node.y + node.radius + 4);
      }
    }

    ctx.restore();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.ObsidianApp = new ObsidianVaultApp();
});
