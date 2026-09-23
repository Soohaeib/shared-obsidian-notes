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

    // Reading preferences
    this.isFullWidth = localStorage.getItem('obsidian_full_width') === 'true';
    this.textAlign = localStorage.getItem('obsidian_text_align') || 'left';
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
    this.applyPreferences();
    this.setupUIEventListeners();
    await this.loadVaultNotes();
    this.buildFileTree();
    this.setupGraph();
    this.handleRoute();

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
      noteContainer.classList.remove('text-align-left', 'text-align-justify');
      noteContainer.classList.add(`text-align-${this.textAlign}`);
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

    document.getElementById('btn-toggle-align')?.addEventListener('click', () => {
      this.textAlign = this.textAlign === 'left' ? 'justify' : 'left';
      localStorage.setItem('obsidian_text_align', this.textAlign);
      this.applyPreferences();
      this.showToast(`Text alignment: ${this.textAlign}`);
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

    // Quick Search Palette
    document.getElementById('btn-quick-search')?.addEventListener('click', () => {
      this.openSearchModal();
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

    // Filter or normalize notes for current folder
    let notes = [];
    for (const f of files) {
      const parts = f.split('/');
      const folder = parts[0];
      // Store all notes belonging to the current workspace folder
      if (folder === this.currentFolder) {
        const relInFolder = parts.slice(1).join('/');
        const fileName = parts[parts.length - 1];
        const title = fileName.replace(/\.md$/, '').replace(/-/g, ' ');
        notes.push({
          fullPath: f,
          path: relInFolder,
          title: this.formatTitle(title),
          folder: parts[1] || 'root'
        });
      }
    }

    // Fallback: If no notes matched this.currentFolder, auto-detect folder with most notes
    if (notes.length === 0 && files.length > 0) {
      const folderCounts = {};
      for (const f of files) {
        const fld = f.split('/')[0];
        folderCounts[fld] = (folderCounts[fld] || 0) + 1;
      }
      const bestFolder = Object.keys(folderCounts).sort((a, b) => folderCounts[b] - folderCounts[a])[0];
      if (bestFolder) {
        this.currentFolder = bestFolder;
        notes = files.filter(f => f.startsWith(`${bestFolder}/`)).map(f => {
          const parts = f.split('/');
          const relInFolder = parts.slice(1).join('/');
          const fileName = parts[parts.length - 1];
          return {
            fullPath: f,
            path: relInFolder,
            title: this.formatTitle(fileName.replace(/\.md$/, '').replace(/-/g, ' ')),
            folder: parts[1] || 'root'
          };
        });
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
              <span class="tree-item-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity: 0.8; margin-right: 2px;">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
              <span class="tree-item-title">${folderLabel}</span>
            </div>
            <div class="tree-item-children">
              ${this.renderTreeFolder(item._children, itemPath)}
            </div>
          </div>
        `;
      } else {
        const note = item.note;
        html += `
          <div class="nav-file" data-note-path="${note.path}">
            <a href="#${note.path}" class="tree-item-self note-item" data-note-path="${note.path}">
              <span class="tree-item-icon" style="opacity: 0.6;">
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
        const children = folder?.querySelector('.tree-item-children');
        const icon = el.querySelector('.tree-item-icon');
        if (children) {
          children.classList.toggle('is-hidden');
          icon?.classList.toggle('is-collapsed');
        }
      });
    });
  }

  highlightActiveTreeItem() {
    document.querySelectorAll('.tree-item-self.note-item').forEach(el => {
      if (el.dataset.notePath === this.currentPath) {
        el.classList.add('is-active');
        let parent = el.closest('.nav-folder');
        while (parent) {
          const children = parent.querySelector('.tree-item-children');
          const icon = parent.querySelector('.folder-item .tree-item-icon');
          if (children) children.classList.remove('is-hidden');
          if (icon) icon.classList.remove('is-collapsed');
          parent = parent.parentElement?.closest('.nav-folder');
        }
      } else {
        el.classList.remove('is-active');
      }
    });
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
        <h1 class="note-title-heading">${title}</h1>
        <div class="note-meta-badges">
          <span class="meta-badge">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            ${readingTime} min read
          </span>
          <span class="meta-badge">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
            ${words} words
          </span>
          <span class="meta-badge">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            ${relPath}
          </span>
        </div>
        <div class="note-actions-row">
          <button class="tool-btn" id="btn-copy-md" title="Copy raw markdown to clipboard">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>Copy Markdown</span>
          </button>
          <button class="tool-btn" id="btn-download-md" title="Download .md file">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>Download .md</span>
          </button>
        </div>
      </div>
      <article class="markdown-rendered" id="note-article">
        ${renderedHtml}
      </article>
    `;

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

  // Pre-process Obsidian Markdown: Footnotes, Highlights, Media Embeds, WikiLinks, and Tasks
  preprocessObsidianMarkdown(text) {
    this.currentFootnotesMap = new Map();

    // 1. Footnote definitions: ^[^1]: Text or multi-line
    text = text.replace(/^\[\^([a-zA-Z0-9_\-]+)\]:\s*([^\n]+(?:\n(?!\n|\[\^|\#|\-|\*).*)*)/gm, (match, fnId, fnContent) => {
      this.currentFootnotesMap.set(fnId, fnContent.trim());
      return ''; // remove definition block from body text
    });

    // 2. Footnote in-text references: [^1]
    text = text.replace(/\[\^([a-zA-Z0-9_\-]+)\]/g, (match, fnId) => {
      return `<sup class="footnote-ref" id="fnref-${fnId}"><a href="#fn-${fnId}" class="footnote-link" title="Jump to footnote">[^${fnId}]</a></sup>`;
    });

    // 3. Highlights: ==text== -> <mark>text</mark>
    text = text.replace(/==([^=\n]+)==/g, '<mark>$1</mark>');

    // 4. Obsidian Media & Image Embeds: ![[image.png]] or ![[image.png|300]] or ![[diagram.png|Alt text]]
    text = text.replace(/!\[\[([^\]\n]+)\]\]/g, (match, inner) => {
      let [file, opt] = inner.split('|').map(s => s ? s.trim() : '');
      const cleanFile = file.trim();
      const resolvedSrc = this.resolveMediaPath(cleanFile);
      let style = 'max-width: 100%; border-radius: 6px;';
      if (opt && /^\d+$/.test(opt)) {
        style += ` width: ${opt}px;`;
      }
      const alt = opt && !/^\d+$/.test(opt) ? opt : cleanFile;
      return `<figure class="obsidian-media-embed"><img src="${resolvedSrc}" alt="${alt}" style="${style}" loading="lazy" /></figure>`;
    });

    // 5. Obsidian WikiLinks: [[Note|Label]], [[Note#Heading|Label]], [[#Heading|Label]], [[Note#Heading]], [[#Heading]], [[Note]]
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

    // 6. Task lists
    text = text.replace(/^(\s*)-\s+\[ \]\s+(.*)$/gm, '$1- <input type="checkbox" disabled class="task-checkbox"> $2');
    text = text.replace(/^(\s*)-\s+\[x\]\s+(.*)$/gim, '$1- <input type="checkbox" checked disabled class="task-checkbox"> $2');

    return text;
  }

  resolveMediaPath(fileName) {
    if (!fileName) return '';
    if (fileName.startsWith('http://') || fileName.startsWith('https://') || fileName.startsWith('/')) {
      return fileName;
    }
    if (fileName.startsWith('./') || fileName.startsWith('../')) {
      return fileName;
    }
    return `./${fileName}`;
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

  // Post-process HTML for Callouts, Math, and Footnotes
  postprocessObsidianHtml(html) {
    // Append Footnotes Section if any were defined in the document
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

    const calloutRegex = /<blockquote>\s*<p>\[!([a-zA-Z0-9_\-]+)\]([+\-])?\s*([^\n<]*)?([\s\S]*?)<\/blockquote>/gi;

    html = html.replace(calloutRegex, (match, rawType, foldChar, title, rest) => {
      const type = rawType.toLowerCase();
      const isCollapsible = foldChar === '+' || foldChar === '-';
      const isFolded = foldChar === '-';
      const displayTitle = (title && title.trim()) ? title.trim() : (type.charAt(0).toUpperCase() + type.slice(1));
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

      return `
        <div class="callout ${isFolded ? 'is-collapsed' : ''}" data-callout="${type}" ${isCollapsible ? 'data-callout-fold="true"' : ''}>
          <div class="callout-title">
            <span class="callout-icon">${iconSvg}</span>
            <span class="callout-title-inner">${displayTitle}</span>
            ${foldIndicator}
          </div>
          <div class="callout-content">
            <p>${rest.trim()}</p>
          </div>
        </div>
      `;
    });

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
    if (['tip', 'hint', 'important'].includes(type)) {
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>`;
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
    document.querySelectorAll('.callout[data-callout-fold="true"]').forEach(callout => {
      callout.querySelector('.callout-title')?.addEventListener('click', () => {
        callout.classList.toggle('is-collapsed');
      });
    });

    const mermaidCodes = document.querySelectorAll('pre code.language-mermaid, pre code.mermaid');
    if (mermaidCodes.length > 0 && window.mermaid) {
      window.mermaid.initialize({
        startOnLoad: false,
        theme: this.theme === 'dark' ? 'dark' : 'default',
        themeVariables: {
          darkMode: this.theme === 'dark',
          primaryColor: '#88c0d0',
          primaryTextColor: '#eceff4',
          primaryBorderColor: '#81a1c1',
          lineColor: '#4c566a',
          secondaryColor: '#ebcb8b',
          tertiaryColor: '#434c5e'
        }
      });

      mermaidCodes.forEach((codeEl, index) => {
        const parent = codeEl.closest('pre');
        const codeText = codeEl.innerText;
        const container = document.createElement('div');
        container.className = 'mermaid-diagram-container';
        const id = `mermaid-diag-${Date.now()}-${index}`;

        try {
          window.mermaid.render(id, codeText).then(({ svg }) => {
            container.innerHTML = svg;
            parent.replaceWith(container);
          }).catch(() => {});
        } catch (e) {}
      });
    }

    if (window.katex) {
      const article = document.getElementById('note-article');
      if (article) {
        article.innerHTML = article.innerHTML.replace(/\$\$([\s\S]+?)\$\$/g, (match, formula) => {
          try {
            return window.katex.renderToString(formula, { displayMode: true, throwOnError: false });
          } catch(e) { return match; }
        });

        article.innerHTML = article.innerHTML.replace(/\$([^\$\n]+?)\$/g, (match, formula) => {
          try {
            return window.katex.renderToString(formula, { displayMode: false, throwOnError: false });
          } catch(e) { return match; }
        });
      }
    }
  }

  buildTableOfContents() {
    const tocContainer = document.getElementById('toc-container');
    const article = document.getElementById('note-article');
    if (!tocContainer || !article) return;

    const headings = article.querySelectorAll('h1, h2, h3, h4');
    if (headings.length === 0) {
      tocContainer.innerHTML = '<div style="padding: 8px 4px; font-size: 0.8rem; color: var(--text-faint);">No headings in this document.</div>';
      return;
    }

    let tocHtml = '<nav class="toc-nav">';
    headings.forEach((h, index) => {
      if (!h.id) {
        h.id = `heading-${index}-${h.innerText.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      }
      const depth = parseInt(h.tagName.substring(1), 10);
      tocHtml += `
        <a href="#${h.id}" class="toc-link depth-${depth}" onclick="event.preventDefault(); document.getElementById('${h.id}').scrollIntoView({ behavior: 'smooth' });">
          ${h.innerText}
        </a>
      `;
    });
    tocHtml += '</nav>';
    tocContainer.innerHTML = tocHtml;
  }

  updateBreadcrumbs(parent, current) {
    const container = document.getElementById('breadcrumb-container');
    if (!container) return;
    container.innerHTML = `
      <a href="../" class="breadcrumb-crumb" title="Main Vault Landing Page">Vault</a>
      <span class="sep">/</span>
      <a href="#index.md" class="breadcrumb-crumb">${parent}</a>
      <span class="sep">/</span>
      <span class="current-crumb">${current}</span>
    `;
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
      html += `
        <div class="search-item" onclick="window.location.hash='#${note.path}'; window.ObsidianApp.closeSearchModal();">
          <span class="search-item-title">${note.title}</span>
          <span class="search-item-path">${note.path}</span>
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

    let activeNodes = this.data.nodes;
    let activeLinks = this.data.links;

    if (this.mode === 'local' && this.focusNodeId) {
      const neighborIds = new Set([this.focusNodeId]);
      for (const link of this.data.links) {
        const s = typeof link.source === 'object' ? link.source.id : link.source;
        const t = typeof link.target === 'object' ? link.target.id : link.target;
        if (s === this.focusNodeId) neighborIds.add(t);
        if (t === this.focusNodeId) neighborIds.add(s);
      }
      activeNodes = this.data.nodes.filter(n => neighborIds.has(n.id));
      activeLinks = this.data.links.filter(l => {
        const s = typeof l.source === 'object' ? l.source.id : l.source;
        const t = typeof l.target === 'object' ? l.target.id : l.target;
        return neighborIds.has(s) && neighborIds.has(t);
      });
    }

    this.simNodes = activeNodes.map((n, i) => {
      const angle = (i / (activeNodes.length || 1)) * 2 * Math.PI;
      const radius = 40 + Math.random() * (this.isMini ? 70 : 180);
      return {
        ...n,
        x: n.x || (width / 2 + Math.cos(angle) * radius),
        y: n.y || (height / 2 + Math.sin(angle) * radius),
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
      k: this.isMini ? 0.8 : 1
    };
  }

  updateFocus(nodeId, mode = 'local') {
    this.focusNodeId = nodeId;
    this.mode = mode;
    this.initGraphSimulation();
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx.scale(dpr, dpr);
    this.width = rect.width;
    this.height = rect.height;
    this.transform.x = this.width / 2;
    this.transform.y = this.height / 2;
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
      const { x, y } = this.toWorld(e.clientX, e.clientY);
      this.draggedNode.x = x;
      this.draggedNode.y = y;
      this.draggedNode.vx = 0;
      this.draggedNode.vy = 0;
      if (Math.hypot(e.clientX - this.downPos.x, e.clientY - this.downPos.y) > 4) {
        this.hasMoved = true;
      }
      return;
    }

    if (this.isPanning) {
      this.transform.x = e.clientX - this.startPan.x;
      this.transform.y = e.clientY - this.startPan.y;
      return;
    }

    const hovered = this.findNodeUnderPointer(e.clientX, e.clientY);
    if (hovered !== this.hoveredNode) {
      this.hoveredNode = hovered;
      this.canvas.style.cursor = hovered ? 'pointer' : 'grab';
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
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newK = Math.max(0.2, Math.min(4, this.transform.k * zoomFactor));

    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    this.transform.x = mouseX - (mouseX - this.transform.x) * (newK / this.transform.k);
    this.transform.y = mouseY - (mouseY - this.transform.y) * (newK / this.transform.k);
    this.transform.k = newK;
  }

  start() {
    if (!this.isRunning) {
      this.isRunning = true;
      const step = () => {
        if (!this.isRunning) return;
        this.tickPhysics();
        this.render();
        this.animFrame = requestAnimationFrame(step);
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
    const repulsion = this.isMini ? 800 : 2500;
    const springLength = this.isMini ? 50 : 80;
    const springK = 0.04;
    const damping = 0.82;
    const centerPull = 0.008;

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distSq = dx * dx + dy * dy || 1;
        const dist = Math.sqrt(distSq);
        if (dist < 350) {
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
      node.vx *= damping;
      node.vy *= damping;
      node.x += node.vx;
      node.y += node.vy;
    }
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
