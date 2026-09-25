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
    this.activePrefetches = new Map();
    this.idlePrefetchQueue = [];
    this.isIdleScheduled = false;
    this.healthIssuesByFile = new Map();
    this.vaultLookup = {};
    this.nameMap = {};
    this.manifest = [];

    // Reading preferences
    this.isFullWidth = localStorage.getItem('obsidian_full_width') === 'true';
    this.fontScale = parseInt(localStorage.getItem('obsidian_font_scale') || '100', 10);
    this.fontSize = parseInt(localStorage.getItem('obsidian_font_size') || '16', 10);
    this.themeFamily = localStorage.getItem('obsidian_theme_family') || 'nord';
    this.themeMode = localStorage.getItem('obsidian_theme_mode') || localStorage.getItem('obsidian_theme') || 'dark';
    this.theme = this.themeMode;

    // Active note state
    this.activeNoteTitle = '';
    this.activeNotePath = '';
    this.activeNoteRawMarkdown = '';

    // Sidebar states (on mobile screens <= 768px, start collapsed for spacious viewing)
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
    this.isLeftOpen = isMobile ? false : (localStorage.getItem('obsidian_left_open') !== 'false');
    this.isRightOpen = isMobile ? false : (localStorage.getItem('obsidian_right_open') !== 'false');

    // Graph state
    this.graphMode = localStorage.getItem('obsidian_graph_mode') || 'local';
    this.sidebarGraph = null;
    this.modalGraph = null;

    this.init();
  }

  detectCurrentFolder(discoveredFiles = []) {
    if (document.body && document.body.dataset && document.body.dataset.vaultFolder) {
      return document.body.dataset.vaultFolder;
    }

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

    for (const folder of knownFolders) {
      if (currentHref.includes(`/${folder}/`) || currentHref.endsWith(`/${folder}`) || currentPath.includes(`/${folder}/`) || currentPath.endsWith(`/${folder}`)) {
        return folder;
      }
    }

    const cleanPath = currentPath.replace(/\/index\.html?$/i, '').replace(/\/+$/, '');
    const segments = cleanPath.split('/').filter(Boolean);
    if (segments.length > 0) {
      const lastSeg = segments[segments.length - 1];
      if (knownFolders.size === 0 || knownFolders.has(lastSeg)) {
        return lastSeg;
      }
    }

    if (knownFolders.size > 0) {
      return Array.from(knownFolders)[0];
    }

    return '5th-semester';
  }

  // ==========================================
  // Client-Side Cache & Speculative Prefetcher
  // ==========================================
  getNoteFromCache(path) {
    if (!path) return null;
    if (this.noteContents.has(path)) {
      return this.noteContents.get(path);
    }
    try {
      const cached = sessionStorage.getItem(`obsidian_cache_${path}`);
      if (cached) {
        this.noteContents.set(path, cached);
        return cached;
      }
    } catch (e) {}
    return null;
  }

  setNoteToCache(path, content) {
    if (!path || !content) return;
    this.noteContents.set(path, content);
    try {
      sessionStorage.setItem(`obsidian_cache_${path}`, content);
    } catch (e) {}
  }

  prefetchNote(path) {
    if (!path) return Promise.resolve(null);
    const cached = this.getNoteFromCache(path);
    if (cached) return Promise.resolve(cached);

    if (this.activePrefetches.has(path)) {
      return this.activePrefetches.get(path);
    }

    const fetchUrl = `./${path}`;
    const p = fetch(fetchUrl)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then(text => {
        this.setNoteToCache(path, text);
        this.activePrefetches.delete(path);
        return text;
      })
      .catch(err => {
        this.activePrefetches.delete(path);
        return null;
      });

    this.activePrefetches.set(path, p);
    return p;
  }

  enqueueIdlePrefetch(notePaths) {
    if (!Array.isArray(notePaths) || notePaths.length === 0) return;
    const pending = notePaths.filter(p => !this.noteContents.has(p) && !this.activePrefetches.has(p));
    if (pending.length === 0) return;

    this.idlePrefetchQueue = [...new Set([...this.idlePrefetchQueue, ...pending])];
    this.scheduleIdlePrefetch();
  }

  scheduleIdlePrefetch() {
    if (this.isIdleScheduled || this.idlePrefetchQueue.length === 0) return;
    this.isIdleScheduled = true;

    const runQueue = (deadline) => {
      this.isIdleScheduled = false;
      const hasTime = () => deadline ? deadline.timeRemaining() > 8 : true;

      let processedInBatch = 0;
      while (this.idlePrefetchQueue.length > 0 && hasTime() && processedInBatch < 3) {
        const nextPath = this.idlePrefetchQueue.shift();
        if (nextPath && !this.noteContents.has(nextPath)) {
          this.prefetchNote(nextPath);
          processedInBatch++;
        }
      }

      if (this.idlePrefetchQueue.length > 0) {
        this.scheduleIdlePrefetch();
      }
    };

    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(runQueue, { timeout: 3000 });
    } else {
      setTimeout(() => runQueue(null), 200);
    }
  }

  async init() {
    // CRITICAL GUARD: Only run the Reader engine on reader/viewer pages with note workspace
    if (!document.getElementById('note-container') && !document.querySelector('.obsidian-workspace')) {
      return;
    }

    if (typeof marked !== 'undefined') {
      const renderer = new marked.Renderer();
      renderer.heading = function(...args) {
        let headingText = '';
        let headingLevel = 1;
        let headingRaw = '';

        if (args[0] && typeof args[0] === 'object') {
          headingText = args[0].text || '';
          headingLevel = args[0].depth || 1;
          headingRaw = args[0].raw || headingText;
        } else {
          headingText = typeof args[0] === 'string' ? args[0] : String(args[0] || '');
          headingLevel = args[1] || 1;
          headingRaw = typeof args[2] === 'string' ? args[2] : headingText;
        }

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
      
      renderer.link = (href, title, text) => {
        let linkHref = '';
        let linkTitle = '';
        let linkText = '';
        if (href && typeof href === 'object') {
          linkHref = href.href || '';
          linkTitle = href.title || '';
          linkText = href.text || '';
        } else {
          linkHref = href || '';
          linkTitle = title || '';
          linkText = text || '';
        }
        const cleanHref = decodeURIComponent(linkHref).replace(/\.md$/i, '').trim();
        const stem = cleanHref.split('/').pop();
        const textIsSlug = !linkText || linkText === linkHref || linkText.toLowerCase() === cleanHref.toLowerCase() || linkText.replace(/[-_]/g, ' ').toLowerCase() === stem.replace(/[-_]/g, ' ').toLowerCase();
        
        if (textIsSlug) {
          const smartLabel = this.resolveSmartLabel(stem, null, null);
          if (smartLabel && smartLabel !== stem) {
            linkText = smartLabel;
          }
        }
        return `<a href="${linkHref}" ${linkTitle ? `title="${linkTitle}"` : ''}>${linkText}</a>`;
      };
      
      marked.setOptions({
        gfm: true,
        breaks: false,
        renderer: renderer
      });
    }

    this.applyPreferences();
    this.setupUIEventListeners();

    if (document.body.dataset.vaultLocked === 'true' && sessionStorage.getItem('vault_unlocked_' + this.currentFolder) !== 'true') {
      const style = document.createElement('style');
      style.id = 'vault-lock-blur-styles';
      style.innerHTML = `
        .obsidian-workspace, .obsidian-app-header {
          filter: blur(20px) grayscale(0.5);
          opacity: 0.25;
          pointer-events: none !important;
          user-select: none !important;
          transition: filter 0.5s ease, opacity 0.5s ease;
        }
      `;
      document.head.appendChild(style);

      const expectedToken = document.body.dataset.vaultToken || 'NOTES_CURATED';
      
      this.triggerGatekeeper(expectedToken, async () => {
        sessionStorage.setItem('vault_unlocked_' + this.currentFolder, 'true');
        const styleEl = document.getElementById('vault-lock-blur-styles');
        if (styleEl) styleEl.remove();

        await this.loadVaultNotes();
        this.buildFileTree();
        this.setupHoverLinkPreviews();
        this.setupMediaPreview();
        this.setupGraph();
        this.handleRoute();
        this.loadVaultHealth();
      });
    } else {
      await this.loadVaultNotes();
      this.buildFileTree();
      this.setupHoverLinkPreviews();
      this.setupMediaPreview();
      this.setupGraph();
      this.handleRoute();
      this.loadVaultHealth();
    }

    window.addEventListener('hashchange', () => this.handleRoute());
  }

  applyPreferences() {
    const root = document.documentElement;
    const body = document.body;
    root.setAttribute('data-theme', 'nord');
    root.setAttribute('data-theme-mode', this.themeMode);
    body.setAttribute('data-theme', 'nord');
    body.setAttribute('data-theme-mode', this.themeMode);

    const modeClass = this.themeMode === 'light' ? 'theme-light' : 'theme-dark';
    root.className = modeClass;
    body.className = modeClass;

    const btnDark = document.getElementById('opt-btn-mode-dark');
    const btnLight = document.getElementById('opt-btn-mode-light');
    if (btnDark && btnLight) {
      if (this.themeMode === 'dark') {
        btnDark.classList.add('active');
        btnLight.classList.remove('active');
      } else {
        btnDark.classList.remove('active');
        btnLight.classList.add('active');
      }
    }

    const iconMoon = document.getElementById('theme-icon-moon');
    const iconSun = document.getElementById('theme-icon-sun');
    if (iconMoon && iconSun) {
      if (this.themeMode === 'dark') {
        iconMoon.style.display = 'inline-block';
        iconSun.style.display = 'none';
      } else {
        iconMoon.style.display = 'none';
        iconSun.style.display = 'inline-block';
      }
    }

    const btnToggleTheme = document.getElementById('btn-toggle-theme');
    if (btnToggleTheme) {
      btnToggleTheme.title = this.themeMode === 'dark' ? 'Switch to Light Gray Mode' : 'Switch to Cosmic Dark Mode';
    }

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
    const sliderFontScale = document.getElementById('slider-font-scale');
    const optFontScaleVal = document.getElementById('opt-font-scale-val');

    if (sliderFontScale) {
      sliderFontScale.value = String(this.fontScale);
    }
    if (optFontScaleVal) {
      optFontScaleVal.textContent = `${this.fontScale}%`;
    }
    document.documentElement.style.setProperty('--obsidian-font-scale', `${this.fontScale}%`);
    document.documentElement.style.setProperty('--obsidian-font-size', `${Math.round(16 * (this.fontScale / 100))}px`);

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
      noteContainer.style.fontSize = `${this.fontScale}%`;
    }

    if (this.sidebarGraph) this.sidebarGraph.updateTheme(this.themeMode);
    if (this.modalGraph) this.modalGraph.updateTheme(this.themeMode);

    const mobileBackdrop = document.getElementById('mobile-sidebar-backdrop');
    if (mobileBackdrop) {
      if (window.innerWidth <= 768 && (this.isLeftOpen || this.isRightOpen)) {
        mobileBackdrop.classList.add('is-active');
      } else {
        mobileBackdrop.classList.remove('is-active');
      }
    }
  }

  setupUIEventListeners() {
    const mobileBackdrop = document.getElementById('mobile-sidebar-backdrop');
    if (mobileBackdrop) {
      mobileBackdrop.addEventListener('click', () => {
        this.isLeftOpen = false;
        this.isRightOpen = false;
        localStorage.setItem('obsidian_left_open', 'false');
        localStorage.setItem('obsidian_right_open', 'false');
        this.applyPreferences();
      });
    }

    const btnToggleLeft = document.getElementById('btn-toggle-left');
    if (btnToggleLeft) {
      btnToggleLeft.addEventListener('click', (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        this.isLeftOpen = !this.isLeftOpen;
        if (window.innerWidth <= 768 && this.isLeftOpen) this.isRightOpen = false;
        localStorage.setItem('obsidian_left_open', this.isLeftOpen);
        this.applyPreferences();
      });
    }

    const btnToggleRight = document.getElementById('btn-toggle-right');
    if (btnToggleRight) {
      btnToggleRight.addEventListener('click', (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        this.isRightOpen = !this.isRightOpen;
        if (window.innerWidth <= 768 && this.isRightOpen) this.isLeftOpen = false;
        localStorage.setItem('obsidian_right_open', this.isRightOpen);
        this.applyPreferences();
        if (this.isRightOpen && this.sidebarGraph) {
          setTimeout(() => this.sidebarGraph.resize(), 250);
        }
      });
    }

    const btnOptions = document.getElementById('btn-workspace-options');
    const optionsMenu = document.getElementById('workspace-options-menu');
    const btnCloseOptions = document.getElementById('btn-close-options');

    const toggleOptions = (forceState) => {
      if (!optionsMenu) return;
      const isOpen = forceState !== undefined ? forceState : !optionsMenu.classList.contains('is-open');
      if (isOpen) {
        optionsMenu.classList.add('is-open');
        btnOptions?.classList.add('active');
        btnOptions?.setAttribute('aria-expanded', 'true');
      } else {
        optionsMenu.classList.remove('is-open');
        btnOptions?.classList.remove('active');
        btnOptions?.setAttribute('aria-expanded', 'false');
      }
    };

    if (btnOptions) {
      btnOptions.addEventListener('click', (e) => { e.stopPropagation(); toggleOptions(); });
    }
    if (btnCloseOptions) {
      btnCloseOptions.addEventListener('click', (e) => { e.stopPropagation(); toggleOptions(false); });
    }

    document.addEventListener('click', (e) => {
      if (optionsMenu && optionsMenu.classList.contains('is-open')) {
        const wrapper = document.querySelector('.options-menu-wrapper');
        if (wrapper && !wrapper.contains(e.target)) toggleOptions(false);
      }
    });

    document.getElementById('btn-toggle-theme')?.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      this.themeMode = this.themeMode === 'dark' ? 'light' : 'dark';
      this.theme = this.themeMode;
      localStorage.setItem('obsidian_theme_mode', this.themeMode);
      localStorage.setItem('obsidian_theme', this.themeMode);
      this.applyPreferences();
      this.showToast(this.themeMode === 'dark' ? 'Dark mode activated' : 'Light mode activated');
    });

    document.getElementById('opt-btn-mode-dark')?.addEventListener('click', () => {
      this.themeMode = 'dark'; this.theme = 'dark';
      localStorage.setItem('obsidian_theme_mode', 'dark');
      localStorage.setItem('obsidian_theme', 'dark');
      this.applyPreferences();
      this.showToast('Dark mode activated');
    });

    document.getElementById('opt-btn-mode-light')?.addEventListener('click', () => {
      this.themeMode = 'light'; this.theme = 'light';
      localStorage.setItem('obsidian_theme_mode', 'light');
      localStorage.setItem('obsidian_theme', 'light');
      this.applyPreferences();
      this.showToast('Light mode activated');
    });

    document.getElementById('opt-btn-download-md')?.addEventListener('click', () => {
      toggleOptions(false);
      if (this.activeNoteRawMarkdown) {
        this.downloadMarkdownFile(this.activeNoteTitle, this.activeNotePath, this.activeNoteRawMarkdown);
      } else {
        this.showToast('No active note to download');
      }
    });

    document.getElementById('btn-toggle-width')?.addEventListener('click', () => {
      this.isFullWidth = !this.isFullWidth;
      localStorage.setItem('obsidian_full_width', this.isFullWidth);
      this.applyPreferences();
      this.showToast(this.isFullWidth ? 'Full width layout activated' : 'Readable column width activated');
    });

    const sliderFontScale = document.getElementById('slider-font-scale');
    if (sliderFontScale) {
      const updateScale = (val) => {
        this.fontScale = Math.min(180, Math.max(70, parseInt(val, 10) || 100));
        localStorage.setItem('obsidian_font_scale', this.fontScale);
        this.applyPreferences();
      };
      sliderFontScale.addEventListener('input', (e) => updateScale(e.target.value));
      sliderFontScale.addEventListener('change', (e) => updateScale(e.target.value));
    }

    document.getElementById('btn-font-scale-minus')?.addEventListener('click', () => {
      this.fontScale = Math.max(70, this.fontScale - 5);
      localStorage.setItem('obsidian_font_scale', this.fontScale);
      this.applyPreferences();
      this.showToast(`Font scaling: ${this.fontScale}%`);
    });

    document.getElementById('btn-font-scale-plus')?.addEventListener('click', () => {
      this.fontScale = Math.min(180, this.fontScale + 5);
      localStorage.setItem('obsidian_font_scale', this.fontScale);
      this.applyPreferences();
      this.showToast(`Font scaling: ${this.fontScale}%`);
    });

    document.getElementById('btn-font-scale-reset')?.addEventListener('click', () => {
      this.fontScale = 100;
      localStorage.setItem('obsidian_font_scale', this.fontScale);
      this.applyPreferences();
      this.showToast('Font scale reset to 100%');
    });

    document.getElementById('btn-collapse-expand-all')?.addEventListener('click', () => {
      const folders = document.querySelectorAll('.nav-folder');
      if (!folders.length) return;
      const allOpen = Array.from(folders).every(f => {
        const ch = f.querySelector('.tree-item-children');
        return ch && !ch.classList.contains('is-hidden');
      });

      const icon = document.getElementById('icon-folders-toggle');
      if (icon) {
        if (!allOpen) {
          // Change to Collapse icon
          icon.innerHTML = '<path d="M4 14h6v6"></path><path d="M20 10h-6V4"></path><path d="m14 10 7-7"></path><path d="m10 14-7 7"></path>';
        } else {
          // Change to Expand icon
          icon.innerHTML = '<path d="m15 15 6 6"></path><path d="m9 9-6-6"></path><path d="M21 15v6h-6"></path><path d="M9 3H3v6"></path>';
        }
      }

      folders.forEach(f => {
        const ch = f.querySelector('.tree-item-children');
        const iconEl = f.querySelector('.folder-item .tree-item-icon');
        if (ch) {
          if (allOpen) {
            ch.classList.add('is-hidden');
            iconEl?.classList.add('is-collapsed');
          } else {
            ch.classList.remove('is-hidden');
            iconEl?.classList.remove('is-collapsed');
          }
        }
      });
      this.showToast(allOpen ? 'Collapsed all folders' : 'Expanded all folders');
    });

    const triggerSearch = () => this.openSearchModal();
    document.getElementById('btn-quick-search')?.addEventListener('click', triggerSearch);
    const headerSearchBar = document.getElementById('header-search-bar-trigger');
    if (headerSearchBar) {
      headerSearchBar.addEventListener('click', triggerSearch);
      headerSearchBar.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); triggerSearch(); }
      });
    }

    document.getElementById('btn-vault-health')?.addEventListener('click', () => this.openHealthModal());

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

    document.getElementById('search-modal-input')?.addEventListener('input', (e) => this.handleSearch(e.target.value));
    document.getElementById('search-scope')?.addEventListener('change', () => this.handleSearch(document.getElementById('search-modal-input')?.value || ''));
    document.getElementById('btn-open-graph')?.addEventListener('click', () => this.openGraphModal());
    document.getElementById('graph-sidebar-expand')?.addEventListener('click', () => this.openGraphModal());
    document.getElementById('graph-sidebar-global')?.addEventListener('click', () => this.toggleGraphMode());
    document.getElementById('modal-toggle-local-global')?.addEventListener('click', () => this.toggleGraphMode());

    this.setupTocGlobalControls();

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

      const heading = e.target.closest('.metadata-properties-heading');
      if (heading) {
        const container = heading.closest('.metadata-container');
        if (container) container.classList.toggle('is-collapsed');
      }
    });

    document.addEventListener('keydown', (e) => {
      const heading = e.target.closest('.metadata-properties-heading');
      if (heading && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        const container = heading.closest('.metadata-container');
        if (container) container.classList.toggle('is-collapsed');
      }
    });
  }

  // ==========================================
  // SMART NAME & TITLE RESOLVERS
  // ==========================================

  getOriginalFolderName(folderKey) {
    if (this.nameMap && this.nameMap[folderKey]) return this.nameMap[folderKey];
    if (this.manifest) {
      const match = this.manifest.find(i => i.type === 'folder' && (i.slugPath === folderKey || i.slugPath.endsWith('/' + folderKey)));
      if (match) return match.originalName;
    }
    return folderKey.replace(/[-_]/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  resolveSmartLabel(fileStem, fileName, folderName) {
    if (folderName) {
      return this.getOriginalFolderName(folderName);
    }

    const stem = fileStem || '';
    const name = fileName || '';

    if (this.manifest) {
      const match = this.manifest.find(i => i.type === 'file' && (i.slugPath.endsWith(stem + '.md') || i.slugPath === stem || i.originalName === stem));
      if (match) return match.originalName;
    }

    if (stem && this.nameMap && this.nameMap[stem]) {
      return this.nameMap[stem].replace(/\.md$/i, '');
    }
    
    if (this.vaultLookup && this.vaultLookup[stem] && this.vaultLookup[stem].originalName) {
      return this.vaultLookup[stem].originalName;
    }

    if (stem.toLowerCase() === 'index') return 'Overview';
    return stem.replace(/-/g, ' ');
  }

  parseYamlFrontmatter(frontmatterStr) {
    if (!frontmatterStr || !frontmatterStr.trim()) return {};
    const data = {};
    const lines = frontmatterStr.split('\n');
    let currentKey = null;

    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith('#')) continue;

      if (line.startsWith('- ') && currentKey) {
        const itemVal = line.substring(2).trim().replace(/^['"]|['"]$/g, '');
        if (!Array.isArray(data[currentKey])) data[currentKey] = [];
        data[currentKey].push(itemVal);
        continue;
      }

      const colonIdx = line.indexOf(':');
      if (colonIdx !== -1) {
        const key = line.substring(0, colonIdx).trim();
        let valStr = line.substring(colonIdx + 1).trim();

        currentKey = key;

        if (!valStr) {
          data[key] = [];
        } else if (valStr.startsWith('[') && valStr.endsWith(']')) {
          const inner = valStr.substring(1, valStr.length - 1).trim();
          if (inner) {
            data[key] = inner.split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
          } else {
            data[key] = [];
          }
        } else {
          valStr = valStr.replace(/^['"]|['"]$/g, '');
          data[key] = valStr;
        }
      }
    }
    return data;
  }

  renderPropertiesBlock(frontmatterData) {
    if (!frontmatterData || typeof frontmatterData !== 'object') return '';

    const EXCLUDED_KEYS = new Set(['pass', 'password', 'secret']);
    const keys = Object.keys(frontmatterData).filter(k => !EXCLUDED_KEYS.has(k.toLowerCase()));

    if (keys.length === 0) return '';

    let html = `<div class="metadata-container is-collapsed">`;
    html += `
      <div class="metadata-properties-heading" tabindex="0">
        <span class="metadata-property-icon" style="margin-right: 4px; display: inline-flex; align-items: center;">
          <svg class="collapse-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transition: transform 0.2s ease;">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </span>
        <span>Properties</span>
      </div>
    `;
    html += `<div class="metadata-properties font-ui-small">`;

    for (const key of keys) {
      const rawVal = frontmatterData[key];
      if (rawVal === undefined || rawVal === null || rawVal === '' || (Array.isArray(rawVal) && rawVal.length === 0)) continue;

      const iconSvg = this.getPropertyIconSvg(key);
      let renderedValHtml = '';

      if (Array.isArray(rawVal)) {
        if (key.toLowerCase() === 'tags' || key.toLowerCase() === 'tag') {
          renderedValHtml = rawVal.map(t => `<span class="metadata-tag">#${this.escapeHtml(String(t).replace(/^#/, ''))}</span>`).join(' ');
        } else {
          renderedValHtml = rawVal.map(v => `<span class="metadata-pill">${this.escapeHtml(String(v))}</span>`).join(' ');
        }
      } else if (typeof rawVal === 'string') {
        if (key.toLowerCase() === 'tags' || key.toLowerCase() === 'tag') {
          const tagList = rawVal.split(/[\s,]+/).filter(Boolean);
          renderedValHtml = tagList.map(t => `<span class="metadata-tag">#${this.escapeHtml(t.replace(/^#/, ''))}</span>`).join(' ');
        } else {
          let processedStr = rawVal.replace(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g, (match, target, alias) => {
            const res = this.resolveWikiLink(target);
            const display = alias || target;
            return `<a class="internal-link ${res.resolved ? 'is-resolved' : 'is-unresolved'}" href="${res.path}">${this.escapeHtml(display)}</a>`;
          });
          renderedValHtml = `<span class="metadata-property-value-text">${processedStr}</span>`;
        }
      } else {
        renderedValHtml = `<span class="metadata-property-value-text">${this.escapeHtml(String(rawVal))}</span>`;
      }

      html += `
        <div class="metadata-property" data-property-key="${this.escapeHtml(key)}">
          <div class="metadata-property-key">
            <span class="metadata-property-icon">${iconSvg}</span>
            <span class="metadata-property-key-text">${this.escapeHtml(key)}</span>
          </div>
          <div class="metadata-property-value">
            ${renderedValHtml}
          </div>
        </div>
      `;
    }

    html += `</div></div>`;
    return html;
  }

  getPropertyIconSvg(key) {
    const k = (key || '').toLowerCase();
    if (['tags', 'tag'].includes(k)) return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>`;
    if (['aliases', 'alias'].includes(k)) return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line></svg>`;
    if (['date', 'created', 'modified', 'updated', 'due'].includes(k)) return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;
    if (['title', 'author', 'source'].includes(k)) return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="12" x2="12" y2="12.01"></line></svg>`;
  }

  isNoteHome(note, stem, relInFolder) {
    if (this.vaultLookup && (this.vaultLookup[stem]?.isHome || this.vaultLookup[relInFolder]?.isHome)) {
      return true;
    }
    const fn = (note.fileName || stem || '').toLowerCase();
    return fn === 'index.md' || fn.startsWith('overview') || fn.includes('overview');
  }

  async loadVaultNotes() {
    let manifest = [];
    const manifestPaths = ['../../site-lib/vault-manifest.json', '../site-lib/vault-manifest.json', './site-lib/vault-manifest.json', 'site-lib/vault-manifest.json', '/site-lib/vault-manifest.json'];
    for (const p of manifestPaths) {
      try {
        const res = await fetch(p);
        if (res.ok) { manifest = await res.json(); break; }
      } catch (e) {}
    }
    this.manifest = manifest;

    // Build nameMap from manifest
    const nameMap = {};
    manifest.forEach(item => {
      nameMap[item.slugPath] = item.originalName;
      if (item.type === 'file') {
        const stem = item.slugPath.split('/').pop().replace(/\.md$/i, '');
        nameMap[stem] = item.originalName;
        // Also map original path for wikilink resolution
        nameMap[item.originalPath] = item.slugPath;
      }
    });
    this.nameMap = nameMap;

    // Load vault-index.json for lookup and metadata
    const pathsToTry = ['../../site-lib/vault-index.json', '../site-lib/vault-index.json', './site-lib/vault-index.json', 'site-lib/vault-index.json', '/site-lib/vault-index.json'];
    for (const p of pathsToTry) {
      try {
        const res = await fetch(p);
        if (res.ok) {
          const data = await res.json();
          if (data.lookup) this.vaultLookup = { ...this.vaultLookup, ...data.lookup };
          break;
        }
      } catch (e) {}
    }

    this.allVaultFiles = manifest.filter(i => i.type === 'file').map(i => i.slugPath);
    this.currentFolder = document.body.dataset.vaultFolder || this.detectCurrentFolder(this.allVaultFiles);

    const notes = manifest.filter(item => item.type === 'file' && item.isMarkdown && item.planetSlug === this.currentFolder).map(item => {
      const slugParts = item.slugPath.split('/');
      const relInFolder = slugParts.slice(1).join('/');
      return {
        path: relInFolder,
        folder: item.planetSlug,
        fileName: slugParts.pop(),
        fileNameWithoutExt: item.originalName,
        title: item.title || item.originalName,
        originalName: item.originalName,
        isHome: item.isHome || false,
        originalPath: item.originalPath,
        slugPath: item.slugPath
      };
    });

    this.allNotes = notes;
    this.buildGraphData();
    this.updateWorkspaceBranding();
    this.enqueueIdlePrefetch(notes.map(n => n.path).slice(0, 15));
  }

  updateWorkspaceBranding() {
    const formatted = this.formatFolderTitle(this.currentFolder);
    const sidebarTitle = document.querySelector('.sidebar-title');
    if (sidebarTitle) sidebarTitle.innerText = `${formatted} Notes`;
    
    const currentCrumb = document.querySelector('.current-crumb');
    if (currentCrumb && !window.location.hash) currentCrumb.innerText = `${formatted} Overview`;
    
    const titleBadge = document.getElementById('header-active-note-title');
    if (titleBadge && !window.location.hash) titleBadge.textContent = `${formatted} Overview`;
    
    if (!document.title.includes(formatted)) document.title = `BBA ${formatted} — Shared Obsidian Notes`;
  }

  updateBreadcrumbs(folder, fileName) {
    const titleBadge = document.getElementById('header-active-note-title');
    if (titleBadge) {
      let displayName = fileName || 'Overview';
      if (displayName.toLowerCase() === 'index') {
        displayName = `${folder || ''} Overview`.trim() || 'Coursework Overview';
      }
      titleBadge.textContent = displayName;
      titleBadge.title = folder ? `${folder} / ${displayName}` : displayName;
    }
  }

  formatTitle(str) {
    if (str.toLowerCase() === 'index') return 'Coursework Overview';
    return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  buildGraphData() {
    const nodes = [];
    const links = [];
    const nodeMap = new Map();
    const planetHome = this.allNotes.find(n => n.isHome && !n.path.includes('/'))
                    || this.allNotes.find(n => !n.path.includes('/'))
                    || this.allNotes[0];
    const hubPath = planetHome ? planetHome.path : 'index.md';

    for (const note of this.allNotes) {
      const isIndex = Boolean(note.isHome && !note.path.includes('/'));
      const nodeObj = {
        id: note.path,
        title: note.originalName || note.fileNameWithoutExt, 
        color: isIndex ? '#bf616a' : (note.path.includes('pyq') ? '#ebcb8b' : '#88c0d0'),
        radius: isIndex ? 10 : 6
      };
      nodes.push(nodeObj);
      nodeMap.set(note.path, nodeObj);
    }

    const indexNode = nodeMap.get(hubPath);
    if (indexNode) {
      for (const note of this.allNotes) {
        if (note.path !== hubPath) {
          links.push({ source: hubPath, target: note.path });
        }
      }
    } else if (nodes.length > 1) {
      const firstId = nodes[0].id;
      for (let i = 1; i < nodes.length; i++) {
        links.push({ source: firstId, target: nodes[i].id });
      }
    }

    this.graphData = { nodes, links };
  }

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
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });

    for (const key of entries) {
      const item = folderObj[key];
      const itemPath = parentPath ? `${parentPath}/${key}` : key;

      if (item._isFolder) {
        const folderLabel = this.resolveSmartLabel(null, null, key);
        
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
              <span class="tree-item-title">${this.escapeHtml(folderLabel)}</span>
            </div>
            <div class="tree-item-children is-hidden">
              ${this.renderTreeFolder(item._children, itemPath)}
            </div>
          </div>
        `;
      } else {
        const note = item.note;
        let fileLabel = note.originalName;
        if (fileLabel.toLowerCase() === 'index') fileLabel = 'Overview';
        
        const homeIcon = note.isHome ? `<svg style="margin-left: 6px; color: var(--interactive-accent); vertical-align: text-bottom;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>` : '';

        html += `
          <div class="nav-file" data-note-path="${note.path}">
            <a href="#${note.path}" class="tree-item-self note-item" data-note-path="${note.path}">
              <span class="tree-item-icon note-health-icon health-pending" role="img" style="opacity: 0.8;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
              </span>
              <span class="tree-item-title">${this.escapeHtml(fileLabel)}${homeIcon}</span>
            </a>
          </div>
        `;
      }
    }
    return html;
  }

  formatFolderTitle(name) {
    return this.getOriginalFolderName(name, name);
  }

  setupTreeClickHandlers() {
    document.querySelectorAll('.tree-item-self.folder-item').forEach(el => {
      el.addEventListener('click', () => {
        const folder = el.closest('.nav-folder');
        const children = folder?.querySelector(':scope > .tree-item-children');
        const icon = el.querySelector('.tree-item-icon');
        if (children) {
          const isHidden = children.classList.toggle('is-hidden');
          if (icon) icon.classList.toggle('is-collapsed', isHidden);
        }
      });
    });

    document.querySelectorAll('.tree-item-self.note-item').forEach(el => {
      const notePath = el.dataset.notePath;
      if (notePath) {
        el.addEventListener('mouseenter', () => this.prefetchNote(notePath), { passive: true });
        el.addEventListener('touchstart', () => this.prefetchNote(notePath), { passive: true });
      }

      el.addEventListener('click', () => {
        if (typeof window !== 'undefined' && window.innerWidth <= 768) {
          this.isLeftOpen = false;
          this.applyPreferences();
        }
      });
    });
  }

  highlightActiveTreeItem() {
    document.querySelectorAll('.nav-folder').forEach(folder => {
      const children = folder.querySelector(':scope > .tree-item-children');
      const icon = folder.querySelector(':scope > .folder-item .tree-item-icon');
      if (children) children.classList.add('is-hidden');
      if (icon) icon.classList.add('is-collapsed');
    });

    document.querySelectorAll('.tree-item-self.note-item').forEach(el => el.classList.remove('is-active'));

    const cleanCurrent = (this.currentPath || '').replace(/^\.?\//, '').toLowerCase();
    let matchedEl = null;

    document.querySelectorAll('.tree-item-self.note-item').forEach(el => {
      const notePath = (el.dataset.notePath || '').replace(/^\.?\//, '').toLowerCase();
      if (notePath === cleanCurrent || notePath.endsWith(`/${cleanCurrent}`) || cleanCurrent.endsWith(`/${notePath}`)) {
        matchedEl = el;
      }
    });

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

  async handleRoute() {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      if (this.isLeftOpen || this.isRightOpen) {
        this.isLeftOpen = false;
        this.isRightOpen = false;
        this.applyPreferences();
      }
    }

    const rawHash = window.location.hash.slice(1);
    let decodedHash = decodeURIComponent(rawHash).trim();
    let headingAnchor = '';
    if (decodedHash.includes('#')) {
      const parts = decodedHash.split('#');
      decodedHash = parts[0];
      headingAnchor = parts[1];
    }

    let targetNote = decodedHash;
    if (!targetNote) {
      const planetHome = this.allNotes.find(n => n.isHome && !n.path.includes('/'))
                      || this.allNotes.find(n => !n.path.includes('/'))
                      || this.allNotes[0];
      targetNote = planetHome ? planetHome.path : '';
    } else {
      if (!targetNote.endsWith('.md')) {
        const found = this.allNotes.find(n => n.path.toLowerCase() === `${targetNote.toLowerCase()}.md` || n.path.toLowerCase().endsWith(`/${targetNote.toLowerCase()}.md`));
        if (found) targetNote = found.path;
      }
    }

    this.currentPath = targetNote;
    this.highlightActiveTreeItem();
    await this.loadNote(targetNote, headingAnchor);
  }

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
      let rawMarkdown = this.getNoteFromCache(relPath);
      if (!rawMarkdown) {
        rawMarkdown = await this.prefetchNote(relPath);
        if (!rawMarkdown) throw new Error(`Could not fetch ${relPath}`);
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

    let frontmatterStr = '';
    let bodyMarkdown = rawMarkdown;

    if (rawMarkdown.startsWith('---')) {
      const fmEnd = rawMarkdown.indexOf('\n---', 3);
      if (fmEnd !== -1) {
        frontmatterStr = rawMarkdown.substring(3, fmEnd);
        bodyMarkdown = rawMarkdown.substring(fmEnd + 4).trim();
      }
    }

    const passMatch = frontmatterStr.match(/pass:\s*(.+)/);
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

    const frontmatterData = this.parseYamlFrontmatter(frontmatterStr);
    
    // Retrieve the H1 title for the top of the reading pane
    let contentTitle = '';
    const noteObj = this.allNotes.find(n => n.path === relPath);
    if (noteObj) {
      contentTitle = noteObj.title; 
    } else {
      contentTitle = this.resolveSmartLabel(relPath.split('/').pop().replace(/\.md$/i, ''), null, null);
    }

    const propertiesBlockHtml = this.renderPropertiesBlock(frontmatterData);
    const words = bodyMarkdown.trim().split(/\s+/).length;
    const readingTime = Math.ceil(words / 200);

    let processed = this.preprocessObsidianMarkdown(bodyMarkdown);
    let renderedHtml = marked.parse(processed);
    renderedHtml = this.postprocessObsidianHtml(renderedHtml);

    this.activeNoteTitle = contentTitle;
    this.activeNotePath = relPath;
    this.activeNoteRawMarkdown = rawMarkdown;

    const rtVal = document.getElementById('reading-time-val');
    if (rtVal) rtVal.textContent = `${readingTime} min read`;
    const wcVal = document.getElementById('word-count-val');
    if (wcVal) wcVal.textContent = `${words.toLocaleString()} words`;
    const floatingMeta = document.getElementById('floating-note-meta');
    if (floatingMeta) floatingMeta.style.display = 'inline-flex';

    const realFileName = noteObj ? noteObj.originalName : contentTitle;
    this.activeNoteOriginalName = realFileName;
    container.innerHTML = `
      <article class="markdown-rendered" id="note-article">
        <div class="note-real-filename" style="font-family: var(--font-mono); color: var(--text-muted); font-size: 0.85rem; margin-bottom: 8px;">${this.escapeHtml(noteObj ? noteObj.originalName : relPath)}</div>
        <h1 class="inline-title">${this.escapeHtml(contentTitle)}</h1>
        ${propertiesBlockHtml}
        ${renderedHtml}
      </article>
    `;

    this.setupReadingTimeTracking(readingTime);
    this.initInteractiveWidgets();
    this.buildTableOfContents();
    this.buildBacklinks(relPath);
    
    // Update breadcrumbs with the Original File Name instead of the H1
    const cleanFileName = noteObj ? noteObj.originalName : contentTitle;
    this.updateBreadcrumbs(this.formatFolderTitle(this.currentFolder), cleanFileName);

    if (this.sidebarGraph) this.sidebarGraph.updateFocus(relPath, this.graphMode);
  }

  parseLatexArrayToHtmlTable(latex) {
    if (!latex || (!latex.includes('\\multicolumn') && !latex.includes('\\cline')) || !latex.includes('\\begin{array}')) return null;

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

        let borderTop = false, borderBottom = false, clineCols = null;

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
          if (borderBottom && processedRows.length > 0) processedRows[processedRows.length - 1].borderBottom = true;
          if (borderTop && processedRows.length > 0) processedRows[processedRows.length - 1].borderTop = true;
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
          let isBold = /\\textbf\{([^}]+)\}/.test(cell) || /\\mathbf\{([^}]+)\}/.test(cell);
          
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
          if (/^[\$]?[\d,.-]+[\%]?$/.test(cell)) cellClasses.push('cell-numeric');
          else cellClasses.push('cell-text');
          if (clineCols && (c + 1) >= clineCols.start && (c + 1) <= clineCols.end) cellClasses.push('border-cline-top');

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

  renderMathExpression(formula, displayMode = false) {
    if (!formula) return '';
    let clean = formula.trim();
    if (!clean) return '';

    clean = clean.replace(/&#36;/g, '\\$');
    clean = clean.replace(/\\hat\{[ \t]*(?:eta|beta)\}/g, '\\hat{\\beta}');
    clean = clean.replace(/\\hat\{[ \t]*(?:lpha|alpha)\}/g, '\\hat{\\alpha}');
    clean = clean.replace(/\\hat\{[ \t]*(?:sigma)\}/g, '\\hat{\\sigma}');
    clean = clean.replace(/(^|[^\\a-zA-Z])(?:lpha)\b/g, '$1\\alpha');
    clean = clean.replace(/(^|[^\\a-zA-Z])(?:eta)\b/g, '$1\\beta');
    clean = clean.replace(/(^|[^\\a-zA-Z])(?:heta)\b/g, '$1\\theta');

    const mathId = `math-${displayMode ? 'block' : 'inline'}-${this.mathIdCounter++}`;

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
          errorColor: '#cc0000',
          output: 'htmlAndMathml',
          trust: true,
          strict: false,
          macros: {
            "\\var": "\\operatorname{var}",
            "\\cov": "\\operatorname{cov}",
            "\\se": "\\operatorname{se}",
            "\\df": "\\operatorname{df}",
            "\\MLE": "\\operatorname{MLE}",
            "\\RR": "\\mathbb{R}",
            "\\NN": "\\mathbb{N}",
            "\\ZZ": "\\mathbb{Z}",
            "\\QQ": "\\mathbb{Q}",
            "\\CC": "\\mathbb{C}",
            "\\bm": "\\mathbf",
            "\\boldsymbol": "\\mathbf",
            "\\bold": "\\mathbf"
          }
        });
      } else {
        renderedKatex = displayMode ? `$$${clean}$$` : `$${clean}$`;
      }
    } catch (err) {
      console.warn('KaTeX render warning:', err);
      renderedKatex = `<span class="math-fallback">${this.escapeHtml(clean)}</span>`;
    }

    if (displayMode) return `<div class="math math-block" id="${mathId}">${renderedKatex}</div>`;
    else return `<span class="math math-inline" id="${mathId}">${renderedKatex}</span>`;
  }

  extractMathAndReplaceTokens(text) {
    if (!text) return text;

    text = text.replace(/(?<!\\)\$\$([\s\S]*?)(?<!\\)\$\$/g, (match, formula) => {
      if (/^\s*$/.test(formula) || /\n\s*#{1,6}\s+[^\n]+/.test(formula)) return match;
      const cleanFormula = formula.replace(/^[ \t]*>+[ \t]*/gm, '').trim();
      const token = `@@KATEX_BLOCK_${this.mathTokenIdx++}@@`;
      const html = this.renderMathExpression(cleanFormula, true);
      this.currentMathBlocksMap.set(token, html);
      return `\n\n${token}\n\n`;
    });

    text = text.replace(/(?<!\\)\\begin\{([a-zA-Z0-9*]+)\}([\s\S]*?)\\end\{\1\}/g, (match, env, body) => {
      const full = `\\begin{${env}}${body}\\end{${env}}`;
      const cleanFormula = full.replace(/^[ \t]*>+[ \t]*/gm, '').trim();
      const token = `@@KATEX_BLOCK_${this.mathTokenIdx++}@@`;
      const html = this.renderMathExpression(cleanFormula, true);
      this.currentMathBlocksMap.set(token, html);
      return `\n\n${token}\n\n`;
    });

    text = text.replace(/(?<![\\\$])\$(?!\s)((?:\\\$|[^\$\n\r])+?)(?<![\s\\\$])\$(?!\$)/g, (match, formula) => {
      const trimmed = formula.trim();
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

  restoreMathTokensInHtml(html) {
    if (!html) return html;
    if (this.currentMathBlocksMap && this.currentMathBlocksMap.size > 0) {
      for (const [token, renderedMath] of this.currentMathBlocksMap.entries()) {
        const pRegex = new RegExp(`<p>\\s*${token}\\s*<\\/p>`, 'g');
        if (pRegex.test(html)) html = html.replace(pRegex, () => renderedMath);
        else html = html.replaceAll(token, () => renderedMath);
      }
    }
    if (this.currentMathInlinesMap && this.currentMathInlinesMap.size > 0) {
      for (const [token, renderedMath] of this.currentMathInlinesMap.entries()) {
        html = html.replaceAll(token, () => renderedMath);
      }
    }
    return html;
  }

  processInternalMarkdownFeatures(text) {
    text = text.replace(/==([^=\n]+)==/g, '<mark>$1</mark>');
    text = text.replace(/\s+\^([a-zA-Z0-9\-]+)$/gm, ' <span id="$1" class="obsidian-block-anchor"></span>');

    text = text.replace(/!\[\[([^\]\n]+)\]\]/g, (match, inner) => {
      let [file, opt] = inner.split('|').map(s => s ? s.trim() : '');
      const cleanFile = file.trim();

      if (/\.(png|jpe?g|gif|svg|webp|bmp|mp4|webm|mov)$/i.test(cleanFile)) {
        const resolvedSrc = this.resolveMediaPath(cleanFile);
        let style = 'max-width: 100%; border-radius: 6px;';
        if (opt && /^\d+$/.test(opt)) style += ` width: ${opt}px;`;
        const alt = opt && !/^\d+$/.test(opt) ? opt : cleanFile;
        return `<figure class="obsidian-media-embed"><img src="${resolvedSrc}" alt="${alt}" style="${style}" loading="lazy" /></figure>`;
      }

      const res = this.resolveWikiLink(cleanFile);
      const isResolved = Boolean(res.resolved);
      let targetHref = res.path;
      if (!res.isCrossFolder) targetHref = `#${encodeURIComponent(res.path)}`;
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

    text = text.replace(/\[\[([^\]\n]+)\]\]/g, (match, inner) => {
      let notePart = inner;
      let label = '';
      if (inner.includes('|')) {
        const parts = inner.split('|');
        notePart = parts[0].trim();
        label = parts.slice(1).join('|').trim();
      }

      if (notePart.startsWith('#')) {
        const headingText = notePart.slice(1).trim();
        const display = label || headingText;
        const slug = headingText.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        return `<a class="internal-link anchor-link" href="#heading-${slug}" data-heading="${slug}">${display}</a>`;
      }

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

    text = text.replace(/(^|[\s(])#([a-zA-Z0-9_\-\/]+)(?=[\s).,;:!?]|$)/g, '$1<span class="obsidian-tag">#$2</span>');
    text = text.replace(/^(\s*)-\s+\[ \]\s+(.*)$/gm, '$1- <input type="checkbox" disabled class="task-checkbox"> $2');
    text = text.replace(/^(\s*)-\s+\[x\]\s+(.*)$/gim, '$1- <input type="checkbox" checked disabled class="task-checkbox"> $2');

    return text;
  }

  preprocessObsidianMarkdown(text) {
    text = this.autoHealMarkdownTypos(text);

    this.currentFootnotesMap = new Map();
    this.currentMathBlocksMap = new Map();
    this.currentMathInlinesMap = new Map();
    this.currentCodeBlocksMap = new Map();
    this.currentCalloutsMap = new Map();
    this.mathIdCounter = 0;
    this.mathTokenIdx = 0;
    this.calloutTokenIdx = 0;

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

    text = text.replace(/%%[\s\S]*?%%/g, '');
    text = text.replace(/(?<!\$)\$\\\$[ \t]*(\d[\d,]*(?:\.\d+)?(?:\s*(?:million|billion|trillion|USD|EUR|GBP|k|m|b))?)\$(?!\$)/gi, '&#36;$1');
    text = this.processObsidianCallouts(text);
    text = this.extractMathAndReplaceTokens(text);
    
    text = text.replace(/(?<![\$\w\\])(?:\\\$|\$)[ \t]*(\d[\d,]*(?:\.\d+)?(?:\s*(?:million|billion|trillion|USD|EUR|GBP|k|m|b))?)(?!\$|\w)/gi, '&#36;$1');
    text = text.replace(/\\(\$)/g, '&#36;');

    text = text.replace(/^\[\^([a-zA-Z0-9_\-]+)\]:\s*([^\n]+(?:\n(?!\n|\[\^|\#|\-|\*).*)*)/gm, (match, fnId, fnContent) => {
      this.currentFootnotesMap.set(fnId, fnContent.trim());
      return '';
    });

    text = text.replace(/\[\^([a-zA-Z0-9_\-]+)\]/g, (match, fnId) => {
      return `<sup class="footnote-ref" id="fnref-${fnId}"><a href="#fn-${fnId}" class="footnote-link" title="Jump to footnote">[^${fnId}]</a></sup>`;
    });

    text = this.processInternalMarkdownFeatures(text);

    for (const [token, codeContent] of this.currentCodeBlocksMap.entries()) {
      text = text.replaceAll(token, codeContent);
    }

    return text;
  }

  slugifyPart(part, isDirectory = false) {
    if (!part || part === '.' || part === '..') return part;
    let base = part;
    let ext = '';
    if (!isDirectory && part.includes('.')) {
      const lastDot = part.lastIndexOf('.');
      base = part.substring(0, lastDot);
      ext = part.substring(lastDot).toLowerCase();
      if (base.toLowerCase() === 'index') return `index${ext}`;
    }
    let str = base.replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
    str = str.replace(/&/g, ' and ').toLowerCase();
    str = str.replace(/[^a-z0-9\s_-]/g, '');
    str = str.replace(/[\s_]+/g, '-').replace(/-+/g, '-');
    const slug = str.replace(/^-+|-+$/g, '') || (isDirectory ? 'folder' : 'asset');
    return isDirectory ? slug : `${slug}${ext}`;
  }

  resolveMediaPath(fileName) {
    if (!fileName) return '';
    if (fileName.startsWith('http://') || fileName.startsWith('https://') || fileName.startsWith('/')) return fileName;
    
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
    const rawParts = [...noteDirectory, ...cleanFile.split('/')];
    const normalizedParts = [];
    for (let i = 0; i < rawParts.length; i++) {
      const part = rawParts[i];
      if (!part || part === '.') continue;
      if (part === '..') normalizedParts.pop();
      else {
        const isDir = (i < rawParts.length - 1);
        normalizedParts.push(this.slugifyPart(part, isDir));
      }
    }
    return `./${normalizedParts.join('/')}`;
  }

  resolveWikiLink(noteName) {
    if (!noteName) return { path: 'javascript:void(0)', resolved: false, title: '' };
    const raw = noteName.trim();
    const clean = raw.replace(/\.md$/i, '').toLowerCase();
    const stem = clean.split('/').pop();
    
    const slugifyText = (text) => {
      if (!text) return '';
      let str = text.replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
      str = str.replace(/&/g, ' and ').toLowerCase();
      str = str.replace(/[^a-z0-9\s_-]/g, '');
      return str.replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
    };

    const slugified = slugifyText(clean);
    const stemSlugified = slugifyText(stem);
    const alphaOnly = clean.replace(/[^a-z0-9]/g, '');

    // 1. LOCAL-FIRST SEARCH: Look in the current planet first
    let localFound = this.allNotes.find(n => {
      if (n.folder !== this.currentFolder) return false;
      const nClean = n.path.replace(/\.md$/i, '').toLowerCase();
      const nStem = nClean.split('/').pop();
      const nTitle = n.title || n.originalName || n.fileNameWithoutExt || '';
      return nClean === clean || slugifyText(nClean) === slugified || nStem === stem || slugifyText(nStem) === stemSlugified || nTitle.toLowerCase() === clean || slugifyText(nTitle) === slugified;
    });

    if (localFound) {
      const resolvedTitle = localFound.originalName || localFound.title || localFound.fileNameWithoutExt || this.resolveSmartLabel(stem, localFound.fileName, null);
      return { path: localFound.path, resolved: true, title: resolvedTitle };
    }

    // 2. GLOBAL VAULT FALLBACK
    if (this.vaultLookup) {
      const match = this.vaultLookup[raw] || this.vaultLookup[clean] || this.vaultLookup[slugified] || this.vaultLookup[stem] || this.vaultLookup[stemSlugified] || this.vaultLookup[alphaOnly];
      if (match) {
        const targetFolder = match.folder;
        const targetRel = match.relInFolder;
        const resolvedTitle = this.nameMap[stem] || match.title || this.resolveSmartLabel(stem, null, null);
        if (targetFolder !== this.currentFolder) {
          return { path: `../${targetFolder}/#${encodeURIComponent(targetRel)}`, resolved: true, title: resolvedTitle, isCrossFolder: true };
        }
        return { path: targetRel, resolved: true, title: resolvedTitle };
      }
    }

    // 3. DEAD LINK HANDLING
    return { path: 'javascript:void(0)', resolved: false, title: this.resolveSmartLabel(stem, null, null) || raw };
  }

  processObsidianCallouts(text) {
    if (!this.currentCalloutsMap) this.currentCalloutsMap = new Map();
    const lines = text.split('\n');
    const resultLines = [];
    let inCallout = false, calloutType = '', foldChar = '', calloutTitle = '', calloutLines = [];

    const flushCallout = () => {
      if (!inCallout) return;
      const type = calloutType.toLowerCase();
      const isCollapsible = foldChar === '+' || foldChar === '-';
      const isFolded = foldChar === '-';
      let rawTitle = (calloutTitle && calloutTitle.trim()) ? calloutTitle.trim() : (type.charAt(0).toUpperCase() + type.slice(1));

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

      let innerMarkdown = calloutLines.map(l => l.replace(/^[ \t]*>[ \t]?/, '')).join('\n');
      for (const [codeToken, codeContent] of this.currentCodeBlocksMap.entries()) {
        if (innerMarkdown.includes(codeToken)) innerMarkdown = innerMarkdown.replaceAll(codeToken, codeContent);
      }

      innerMarkdown = this.extractMathAndReplaceTokens(innerMarkdown);
      innerMarkdown = this.processInternalMarkdownFeatures(innerMarkdown);

      let innerHtml = '';
      try {
        if (typeof marked !== 'undefined') innerHtml = marked.parse(innerMarkdown);
        else innerHtml = innerMarkdown;
      } catch (e) {
        innerHtml = innerMarkdown;
      }

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

      inCallout = false; calloutType = ''; foldChar = ''; calloutTitle = ''; calloutLines = [];
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
          let hasMoreQuote = false;
          for (let j = i + 1; j < lines.length; j++) {
            if (lines[j].trim() === '') continue;
            if (/^[ \t]*>/.test(lines[j])) hasMoreQuote = true;
            break;
          }
          if (hasMoreQuote) calloutLines.push('>');
          else { flushCallout(); resultLines.push(line); }
        } else {
          flushCallout(); resultLines.push(line);
        }
      } else {
        resultLines.push(line);
      }
    }

    if (inCallout) flushCallout();
    return resultLines.join('\n');
  }

  postprocessObsidianHtml(html) {
    if (this.currentCalloutsMap && this.currentCalloutsMap.size > 0) {
      for (const [token, calloutHtml] of this.currentCalloutsMap.entries()) {
        const pRegex = new RegExp(`<p>\\s*${token}\\s*<\\/p>`, 'g');
        if (pRegex.test(html)) html = html.replace(pRegex, () => calloutHtml);
        else html = html.replaceAll(token, () => calloutHtml);
      }
    }

    html = this.restoreMathTokensInHtml(html);

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
      if (bodyHtml.startsWith('</p>')) bodyHtml = bodyHtml.slice(4).trim();
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

    html = html.replace(/<h([1-6])([^>]*)id="([^"]*)"([^>]*)>/gi, (match, level, before, id, after) => {
      let cleanId = id.replace(/-?katex_(inline|block)_\d+/gi, '').replace(/-+$/, '').replace(/^-+/, '');
      if (!cleanId) cleanId = `heading-${level}`;
      return `<h${level}${before}id="${cleanId}"${after}>`;
    });

    html = html.replaceAll('&#36;', '$');
    return html;
  }

  async buildBacklinks(currentRelPath) {
    const backlinksContainer = document.getElementById('backlinks-container');
    const backlinksSection = document.getElementById('backlinks-section');
    if (!backlinksContainer) return;
    if (backlinksSection) backlinksSection.style.display = 'block';

    const stem = currentRelPath.replace(/\.md$/i, '').split('/').pop().toLowerCase();
    const currentNoteObj = this.allNotes.find(n => n.path === currentRelPath);
    const currentTitle = (currentNoteObj?.title || stem).toLowerCase();
    const backlinks = [];

    for (const note of this.allNotes) {
      if (note.path === currentRelPath) continue;
      const content = this.getNoteFromCache(note.path);

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
        <a href="#${encodeURIComponent(b.note.path)}" class="backlink-item" data-note-path="${b.note.path}">
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

      backlinksContainer.querySelectorAll('.backlink-item').forEach(el => {
        const p = el.dataset.notePath;
        if (p) {
          el.addEventListener('mouseenter', () => this.prefetchNote(p), { passive: true });
          el.addEventListener('touchstart', () => this.prefetchNote(p), { passive: true });
        }
      });
    }
  }

  getCalloutIconSvg(type) {
    if (['quote', 'cite'].includes(type)) return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"></path><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"></path></svg>`;
    if (['tip', 'hint', 'important'].includes(type)) return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>`;
    if (['abstract', 'summary', 'tldr'].includes(type)) return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="21" y1="10" x2="3" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="21" y1="18" x2="3" y2="18"></line></svg>`;
    if (['warning', 'caution', 'attention'].includes(type)) return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
    if (['danger', 'error', 'bug', 'failure', 'fail', 'flame'].includes(type)) return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    if (['success', 'check', 'done'].includes(type)) return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    if (['question', 'help', 'faq'].includes(type)) return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
  }

  initInteractiveWidgets() {
    document.querySelectorAll('#note-container a.internal-link, #note-container a[href^="#"]').forEach(link => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('#') && !href.startsWith('#fn-') && !href.startsWith('#fnref-')) {
        const rawTarget = decodeURIComponent(href.slice(1)).split('#')[0];
        if (rawTarget) {
          link.addEventListener('mouseenter', () => this.prefetchNote(rawTarget), { passive: true });
          link.addEventListener('touchstart', () => this.prefetchNote(rawTarget), { passive: true });
        }
      }
    });

    document.querySelectorAll('.callout[data-callout-fold="true"]').forEach(callout => {
      callout.querySelector('.callout-title')?.addEventListener('click', () => {
        callout.classList.toggle('is-collapsed');
      });
    });

    const diagramCodes = document.querySelectorAll('pre code[class*="language-mermaid"], pre code[class*="mermaid"], pre code[class*="language-mindmap"], pre code[class*="mindmap"], pre code[class*="language-markmap"]');
    if (diagramCodes.length > 0 && window.mermaid) {
      const isDark = this.theme !== 'light';
      try {
        window.mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'loose',
          theme: 'base',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          flowchart: { useMaxWidth: false, htmlLabels: true, curve: 'basis', padding: 16 },
          mindmap: { useMaxWidth: false, padding: 16 },
          themeVariables: isDark ? {
            darkMode: true, background: 'transparent',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", fontSize: '13px',
            mainBkg: '#242933', nodeBkg: '#242933', nodeTextColor: '#f8fafc', textColor: '#f8fafc',
            primaryColor: '#242933', primaryTextColor: '#f8fafc', primaryBorderColor: '#88c0d0', lineColor: '#81a1c1',
            secondaryColor: '#2e3440', secondaryTextColor: '#f8fafc', secondaryBorderColor: '#b48ead',
            tertiaryColor: '#222630', tertiaryTextColor: '#d8dee9', tertiaryBorderColor: '#a3be8c',
            edgeLabelBackground: '#1e222a', clusterBkg: 'rgba(36, 41, 51, 0.6)', clusterBorder: 'rgba(136, 192, 208, 0.4)',
            nodeBorder: '#88c0d0', git0: '#2e3440', gitBranchLabel0: '#ffffff',
            cScale0: '#242933', cScaleLabel0: '#f8fafc', cScaleInv0: '#88c0d0',
            cScale1: '#242933', cScaleLabel1: '#f8fafc', cScaleInv1: '#b48ead',
            cScale2: '#242933', cScaleLabel2: '#f8fafc', cScaleInv2: '#ebcb8b',
            cScale3: '#242933', cScaleLabel3: '#f8fafc', cScaleInv3: '#a3be8c',
            cScale4: '#242933', cScaleLabel4: '#f8fafc', cScaleInv4: '#81a1c1',
            cScale5: '#242933', cScaleLabel5: '#f8fafc', cScaleInv5: '#d08770',
            cScale6: '#242933', cScaleLabel6: '#f8fafc', cScaleInv6: '#bf616a',
            cScale7: '#242933', cScaleLabel7: '#f8fafc', cScaleInv7: '#8fbcbb'
          } : {
            darkMode: false, background: 'transparent',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", fontSize: '13px',
            mainBkg: '#ffffff', nodeBkg: '#ffffff', nodeTextColor: '#0f172a', textColor: '#0f172a',
            primaryColor: '#ffffff', primaryTextColor: '#0f172a', primaryBorderColor: '#5e81ac', lineColor: '#64748b',
            secondaryColor: '#f1f5f9', secondaryTextColor: '#0f172a', secondaryBorderColor: '#b48ead',
            tertiaryColor: '#f8fafc', tertiaryTextColor: '#475569', tertiaryBorderColor: '#a3be8c',
            edgeLabelBackground: '#ffffff', clusterBkg: 'rgba(241, 245, 249, 0.8)', clusterBorder: 'rgba(100, 116, 139, 0.3)',
            nodeBorder: '#5e81ac', git0: '#ffffff', gitBranchLabel0: '#0f172a',
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
        if (isMindmap && !codeText.startsWith('mindmap')) codeText = `mindmap\n${codeText}`;

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

              svgEl.style.setProperty('overflow', 'visible', 'important');
              svgEl.querySelectorAll('foreignObject').forEach(fo => fo.style.setProperty('overflow', 'visible', 'important'));

              if (isMindmapDiagram) {
                const branchColorsDark = [
                  { fill: '#242933', stroke: '#88c0d0', text: '#f8fafc' }, { fill: '#242933', stroke: '#b48ead', text: '#f8fafc' },
                  { fill: '#242933', stroke: '#ebcb8b', text: '#f8fafc' }, { fill: '#242933', stroke: '#a3be8c', text: '#f8fafc' },
                  { fill: '#242933', stroke: '#81a1c1', text: '#f8fafc' }, { fill: '#242933', stroke: '#d08770', text: '#f8fafc' },
                  { fill: '#242933', stroke: '#bf616a', text: '#f8fafc' }, { fill: '#242933', stroke: '#8fbcbb', text: '#f8fafc' },
                ];
                const branchColorsLight = [
                  { fill: '#ffffff', stroke: '#0284c7', text: '#0f172a' }, { fill: '#ffffff', stroke: '#9333ea', text: '#0f172a' },
                  { fill: '#ffffff', stroke: '#d97706', text: '#0f172a' }, { fill: '#ffffff', stroke: '#16a34a', text: '#0f172a' },
                  { fill: '#ffffff', stroke: '#2563eb', text: '#0f172a' }, { fill: '#ffffff', stroke: '#ea580c', text: '#0f172a' },
                  { fill: '#ffffff', stroke: '#dc2626', text: '#0f172a' }, { fill: '#ffffff', stroke: '#0d9488', text: '#0f172a' },
                ];
                const palette = isDark ? branchColorsDark : branchColorsLight;

                svgEl.querySelectorAll('.section-root rect, .section-root circle, .section-root path').forEach(el => {
                  el.style.setProperty('fill', isDark ? '#2e3440' : '#ffffff', 'important');
                  el.style.setProperty('stroke', isDark ? '#b48ead' : '#7c3aed', 'important');
                  el.style.setProperty('stroke-width', '2.5px', 'important');
                });
                svgEl.querySelectorAll('.section-root text').forEach(el => {
                  el.style.setProperty('fill', isDark ? '#ffffff' : '#1e1b4b', 'important');
                  el.style.setProperty('font-weight', '700', 'important');
                });

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
                svgEl.querySelectorAll('.node rect, rect.basic, rect.label-container').forEach(r => {
                  if (!r.getAttribute('rx')) { r.setAttribute('rx', '8'); r.setAttribute('ry', '8'); }
                });

                if (isDark) {
                  svgEl.querySelectorAll('.node rect, .node circle, .node ellipse, .node polygon, .node path, rect.basic, rect.label-container').forEach(el => {
                    el.style.setProperty('fill', '#242933', 'important');
                    el.style.setProperty('fill-opacity', '0.92', 'important');
                    el.style.setProperty('stroke', '#88c0d0', 'important');
                    el.style.setProperty('stroke-width', '1.5px', 'important');
                  });
                  svgEl.querySelectorAll('.node text, .nodeLabel, .node foreignObject div, .node foreignObject span').forEach(el => {
                    el.style.setProperty('fill', '#f8fafc', 'important');
                    el.style.setProperty('color', '#f8fafc', 'important');
                    el.style.setProperty('line-height', '1.45', 'important');
                    el.style.setProperty('overflow', 'visible', 'important');
                  });
                  svgEl.querySelectorAll('.edgeLabel, .edgeLabel div, .edgeLabel span, .edgeLabel rect').forEach(el => {
                    el.style.setProperty('background-color', '#1e222a', 'important');
                    el.style.setProperty('fill', '#1e222a', 'important');
                    el.style.setProperty('color', '#eceff4', 'important');
                  });
                  svgEl.querySelectorAll('.edgePath path, .edgePath .path, .flowchart-link').forEach(el => {
                    el.style.setProperty('stroke', '#81a1c1', 'important');
                    el.style.setProperty('stroke-width', '1.5px', 'important');
                  });
                  svgEl.querySelectorAll('marker path, .arrowheadPath').forEach(el => {
                    el.style.setProperty('fill', '#88c0d0', 'important');
                    el.style.setProperty('stroke', '#88c0d0', 'important');
                  });
                } else {
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

            if (parent && parent.parentNode) parent.replaceWith(container);

            const stray = document.getElementById(`d${id}`);
            if (stray && stray !== container && stray.parentNode) stray.remove();

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
                  const neededH = contentH + 20; 

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
            this.attachMediaCornerButtons();
          }).catch(err => console.warn('Mermaid render issue:', err)).finally(() => this.attachMediaCornerButtons());
        } catch (e) { console.warn('Mermaid render error:', e); }
      });
    }
    this.attachMediaCornerButtons();
  }

  setupTocGlobalControls() {
    const btnToggleAll = document.getElementById('btn-toc-collapse-expand-all');
    if (btnToggleAll && !btnToggleAll._bound) {
      btnToggleAll._bound = true;
      btnToggleAll.addEventListener('click', () => {
        const allChildren = document.querySelectorAll('#toc-container .toc-children');
        const allTwists = document.querySelectorAll('#toc-container .toc-twisty-btn');
        if (!allChildren.length) return;

        const allOpen = Array.from(allChildren).every(el => !el.classList.contains('is-collapsed'));
        
        const icon = document.getElementById('icon-toc-toggle');
        if (icon) {
          if (!allOpen) {
            // Change to Collapse icon
            icon.innerHTML = '<path d="M4 14h6v6"></path><path d="M20 10h-6V4"></path><path d="m14 10 7-7"></path><path d="m10 14-7 7"></path>';
          } else {
            // Change to Expand icon
            icon.innerHTML = '<path d="m15 15 6 6"></path><path d="m9 9-6-6"></path><path d="M21 15v6h-6"></path><path d="M9 3H3v6"></path>';
          }
        }

        allChildren.forEach(el => {
          if (allOpen) el.classList.add('is-collapsed');
          else el.classList.remove('is-collapsed');
        });
        allTwists.forEach(btn => {
          if (allOpen) {
            btn.classList.add('is-collapsed');
            btn.setAttribute('aria-expanded', 'false');
          } else {
            btn.classList.remove('is-collapsed');
            btn.setAttribute('aria-expanded', 'true');
          }
        });
        this.showToast(allOpen ? 'Collapsed all subsections' : 'Expanded all subsections');
      });
    }

    const btnSearchToggle = document.getElementById('btn-toc-search-toggle');
    const searchBar = document.getElementById('toc-search-bar');
    const filterInput = document.getElementById('toc-filter-input');
    const filterClear = document.getElementById('btn-toc-filter-clear');

    if (btnSearchToggle && searchBar && !btnSearchToggle._bound) {
      btnSearchToggle._bound = true;
      btnSearchToggle.addEventListener('click', () => {
        searchBar.classList.toggle('is-hidden');
        btnSearchToggle.classList.toggle('active', !searchBar.classList.contains('is-hidden'));
        if (!searchBar.classList.contains('is-hidden')) filterInput?.focus();
        else if (filterInput) {
          filterInput.value = '';
          this.filterTocHeadings('');
        }
      });
    }

    if (filterInput && !filterInput._bound) {
      filterInput._bound = true;
      filterInput.addEventListener('input', (e) => this.filterTocHeadings(e.target.value));
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
        if (link && link._rawText) link.textContent = link._rawText;
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
          if (parent.classList.contains('toc-node')) parent.classList.remove('is-filtered-out');
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

    const root = { depth: 0, children: [] };
    const stack = [root];

    headings.forEach((h, index) => {
      if (!h.id) h.id = `heading-${index}-${h.innerText.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      const depth = parseInt(h.tagName.substring(1), 10);
      const node = { id: h.id, text: h.innerText.trim(), depth: depth, element: h, children: [] };

      while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop();
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    });

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
        if (hasChildren) html += `<div class="toc-children">${renderTocNodes(node.children)}</div>`;
        html += `</div>`;
      });
      return html;
    };

    tocContainer.innerHTML = `<nav class="toc-nav">${renderTocNodes(root.children)}</nav>`;

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

    tocContainer.querySelectorAll('.toc-link').forEach(link => {
      link._rawText = link.textContent;
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const headingId = link.getAttribute('data-heading-id');
        const targetEl = document.getElementById(headingId);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth' });
          history.replaceState(null, '', `#${headingId}`);
          if (typeof window !== 'undefined' && window.innerWidth <= 768) {
            this.isRightOpen = false;
            this.applyPreferences();
          }
        }
      });
    });

    const filterInput = document.getElementById('toc-filter-input');
    if (filterInput && filterInput.value) this.filterTocHeadings(filterInput.value);

    if (this._tocObserver) this._tocObserver.disconnect();

    const tocLinks = tocContainer.querySelectorAll('.toc-link');
    const headingVisibility = new Map();

    this._tocObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => headingVisibility.set(entry.target.id, entry.isIntersecting));

      let activeHeadingId = null;
      for (const h of headings) {
        if (headingVisibility.get(h.id)) { activeHeadingId = h.id; break; }
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
    }, { rootMargin: '-5% 0px -75% 0px', threshold: [0, 1.0] });

    headings.forEach(h => this._tocObserver.observe(h));
  }

  setupHoverLinkPreviews() {
    let previewEl = document.getElementById('obsidian-hover-preview');
    if (!previewEl) {
      previewEl = document.createElement('div');
      previewEl.id = 'obsidian-hover-preview';
      previewEl.style.display = 'none';
      document.body.appendChild(previewEl);
    }

    this.isPreviewPinned = false;
    let hideTimeout = null;
    let dismissTimeout = null;
    let isDragging = false;
    let startX = 0, startY = 0, initialLeft = 0, initialTop = 0;

    const onDragStart = (e) => {
      if (e.target.closest('.preview-pin-btn, .preview-close-btn, a, button:not(.preview-drag-handle)')) return;
      isDragging = true;
      const point = e.touches ? e.touches[0] : e;
      startX = point.clientX;
      startY = point.clientY;
      const rect = previewEl.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      previewEl.classList.add('is-dragging');
      document.addEventListener('mousemove', onDragMove);
      document.addEventListener('mouseup', onDragEnd);
      document.addEventListener('touchmove', onDragMove, { passive: false });
      document.addEventListener('touchend', onDragEnd);
    };

    const onDragMove = (e) => {
      if (!isDragging) return;
      if (e.cancelable) e.preventDefault();
      const point = e.touches ? e.touches[0] : e;
      const dx = point.clientX - startX;
      const dy = point.clientY - startY;
      const newX = Math.max(8, Math.min(window.innerWidth - previewEl.offsetWidth - 8, initialLeft + dx));
      const newY = Math.max(8, Math.min(window.innerHeight - previewEl.offsetHeight - 8, initialTop + dy));
      previewEl.style.left = `${newX}px`;
      previewEl.style.top = `${newY}px`;
    };

    const onDragEnd = () => {
      isDragging = false;
      previewEl.classList.remove('is-dragging');
      document.removeEventListener('mousemove', onDragMove);
      document.removeEventListener('mouseup', onDragEnd);
      document.removeEventListener('touchmove', onDragMove);
      document.removeEventListener('touchend', onDragEnd);
    };

    const showPreview = async (targetPath, linkText, rawHref, e) => {
      clearTimeout(hideTimeout);
      if (!targetPath && !rawHref) return;

      const isExternal = Boolean(rawHref && (rawHref.startsWith('http://') || rawHref.startsWith('https://')));
      let title = linkText || 'Embedded Link';
      let bodyHtml = '';
      let isInternalNote = false;

      if (isExternal) {
        let domain = 'external';
        try { domain = new URL(rawHref).hostname.replace(/^www\./, ''); } catch (err) {}
        title = linkText || domain;
        bodyHtml = `
          <div class="preview-external-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
            <span>External Link • ${domain}</span>
          </div>
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-normal); margin-bottom: 4px;">${title}</div>
          <div style="font-size: 0.76rem; color: var(--text-muted); word-break: break-all; margin-bottom: 10px;">${rawHref}</div>
          <a href="${rawHref}" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; font-size: 0.76rem; background: var(--interactive-accent-subtle); color: var(--interactive-accent); border-radius: 4px; text-decoration: none; font-weight: 600;">
            <span>Open Link in New Tab</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="7" y1="17" x2="17" y2="7"></line>
              <polyline points="7 7 17 7 17 17"></polyline>
            </svg>
          </a>
        `;
      } else {
        const cleanPath = (targetPath || '').replace(/^#/, '').replace(/^\.\//, '');
        const note = this.allNotes.find(n => {
          const nTitle = n.originalName || n.title || n.fileNameWithoutExt || '';
          return n.path === cleanPath || n.path.endsWith(cleanPath) || nTitle.toLowerCase() === cleanPath.toLowerCase();
        });
        if (note) {
          isInternalNote = true;
          title = note.title || note.originalName || note.fileNameWithoutExt || cleanPath;
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

          let snippetHtml = '<p style="color: var(--text-muted); font-size: 0.8rem; margin: 0;">No preview text available.</p>';
          if (content) {
            let body = content.replace(/^---[\s\S]*?---\s*/, '').trim();
            const headParagraphs = body.split(/\n\s*\n/).filter(p => p.trim().length > 0);
            let headSection = headParagraphs.slice(0, 2).join('\n\n');
            if (headSection.length > 300) headSection = headSection.substring(0, 300) + '...';
            headSection = headSection.replace(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => alias || target);
            
            if (typeof marked !== 'undefined') {
              try { snippetHtml = marked.parse(headSection); } catch (e) { snippetHtml = `<p>${headSection}</p>`; }
            } else snippetHtml = `<p>${headSection}</p>`;
          }

          bodyHtml = `
            <div class="preview-markdown-head" style="margin-bottom: 10px; font-size: 0.82rem; line-height: 1.55; max-height: 140px; overflow: hidden; position: relative;">
              ${snippetHtml}
            </div>
            <a href="#${note.path}" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; font-size: 0.76rem; background: var(--interactive-accent-subtle); color: var(--interactive-accent); border-radius: 4px; text-decoration: none; font-weight: 600;">
              <span>Jump to Note</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </a>
          `;
        } else {
          title = linkText || 'Internal Reference';
          bodyHtml = `<div style="font-size: 0.8rem; color: var(--text-muted);">Reference: ${targetPath || rawHref}</div>`;
        }
      }

      previewEl.innerHTML = `
        <div class="preview-popover-header">
          <div class="preview-popover-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
            <span class="preview-title-text">${title}</span>
          </div>
          <div class="preview-popover-actions">
            <button class="preview-action-btn preview-drag-handle" type="button" aria-label="Drag preview window" title="Drag preview window">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="9" cy="6" r="1.5" fill="currentColor"></circle>
                <circle cx="15" cy="6" r="1.5" fill="currentColor"></circle>
                <circle cx="9" cy="12" r="1.5" fill="currentColor"></circle>
                <circle cx="15" cy="12" r="1.5" fill="currentColor"></circle>
                <circle cx="9" cy="18" r="1.5" fill="currentColor"></circle>
                <circle cx="15" cy="18" r="1.5" fill="currentColor"></circle>
              </svg>
            </button>
            <button class="preview-action-btn preview-pin-btn ${this.isPreviewPinned ? 'is-pinned' : ''}" type="button" aria-label="${this.isPreviewPinned ? 'Unpin preview window' : 'Pin preview window'}" title="${this.isPreviewPinned ? 'Unpin preview (allow auto-close)' : 'Pin preview (keep window open while reading)'}">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="17" x2="12" y2="22"></line>
                <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.77V6a3 3 0 0 0-6 0v4.77a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24Z"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="preview-popover-body">${bodyHtml}</div>
      `;

      const headerEl = previewEl.querySelector('.preview-popover-header');
      if (headerEl) {
        headerEl.addEventListener('mousedown', onDragStart);
        headerEl.addEventListener('touchstart', onDragStart, { passive: true });
      }

      const pinBtn = previewEl.querySelector('.preview-pin-btn');
      if (pinBtn) {
        pinBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.isPreviewPinned = !this.isPreviewPinned;
          previewEl.classList.toggle('is-pinned', this.isPreviewPinned);
          pinBtn.classList.toggle('is-pinned', this.isPreviewPinned);
          pinBtn.setAttribute('title', this.isPreviewPinned ? 'Unpin preview (allow auto-close)' : 'Pin preview (keep open while reading)');
          if (this.isPreviewPinned) {
            clearTimeout(hideTimeout); clearTimeout(dismissTimeout);
            this.showToast('Preview pinned to workspace');
          } else this.showToast('Preview unpinned');
        });
      }

      const closeBtn = previewEl.querySelector('.preview-close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.isPreviewPinned = false;
          previewEl.classList.remove('is-pinned', 'is-visible');
          previewEl.style.display = 'none';
        });
      }

      previewEl.querySelectorAll('a[href^="#"]').forEach(a => {
        a.addEventListener('click', () => {
          this.isPreviewPinned = false;
          previewEl.classList.remove('is-pinned', 'is-visible');
          previewEl.style.display = 'none';
        });
      });

      if (!this.isPreviewPinned) {
        const x = Math.min(window.innerWidth - 360, Math.max(16, e.clientX + 14));
        const y = Math.min(window.innerHeight - 260, Math.max(16, e.clientY + 18));
        previewEl.style.left = `${x}px`;
        previewEl.style.top = `${y}px`;
      }

      previewEl.style.display = 'flex';
      previewEl.classList.add('is-visible');

      if (!this.isPreviewPinned) {
        clearTimeout(dismissTimeout);
        dismissTimeout = setTimeout(() => {
          if (!this.isPreviewPinned && !isDragging) {
            previewEl.classList.remove('is-visible');
            previewEl.style.display = 'none';
          }
        }, 5500);
      }
    };

    const hidePreview = () => {
      if (this.isPreviewPinned || isDragging) return;
      hideTimeout = setTimeout(() => {
        if (!this.isPreviewPinned && !isDragging) {
          previewEl.classList.remove('is-visible');
          previewEl.style.display = 'none';
        }
      }, 200);
    };

    document.addEventListener('mouseover', (e) => {
      if (this.isPreviewPinned || isDragging) return;
      const noteArticle = document.getElementById('note-article');
      if (!noteArticle || !noteArticle.contains(e.target)) return;
      const link = e.target.closest('a.internal-link, a[href]');
      if (link) {
        const rawHref = link.getAttribute('href') || '';
        const targetPath = link.dataset.notePath || link.dataset.target || rawHref;
        const linkText = link.textContent.trim();
        showPreview(targetPath, linkText, rawHref, e);
      }
    });

    document.addEventListener('mouseout', (e) => {
      if (this.isPreviewPinned || isDragging) return;
      const noteArticle = document.getElementById('note-article');
      if (!noteArticle || !noteArticle.contains(e.target)) return;
      const link = e.target.closest('a.internal-link, a[href]');
      if (link) hidePreview();
    });

    previewEl.addEventListener('mouseenter', () => {
      clearTimeout(hideTimeout);
      clearTimeout(dismissTimeout);
    });

    previewEl.addEventListener('mouseleave', () => {
      if (this.isPreviewPinned || isDragging) return;
      clearTimeout(dismissTimeout);
      dismissTimeout = setTimeout(() => {
        if (!this.isPreviewPinned && !isDragging) {
          previewEl.classList.remove('is-visible');
          previewEl.style.display = 'none';
        }
      }, 1500);
    });
  }

  attachMediaCornerButtons() {
    const article = document.getElementById('note-article');
    if (!article) return;

    let diagramCounter = 0;
    const noteTitle = this.currentNoteTitle || document.querySelector('.note-header-title')?.textContent || 'Note';

    const diagrams = article.querySelectorAll('.mermaid-diagram-container, svg[id^="mermaid-diag"]');
    diagrams.forEach(diag => {
      let container = diag.classList.contains('mermaid-diagram-container') ? diag : diag.closest('.mermaid-diagram-container');
      if (!container) container = diag;
      if (container.querySelector('.diagram-corner-action-btn')) return;

      diagramCounter++;
      const svgEl = container.querySelector('svg') || (container.tagName.toLowerCase() === 'svg' ? container : null);
      const svgRaw = svgEl ? svgEl.outerHTML : '';
      const diagramTitle = this.generateDiagramTitle(noteTitle, diagramCounter, svgRaw);

      const cornerBtn = document.createElement('button');
      cornerBtn.type = 'button';
      cornerBtn.className = 'diagram-corner-action-btn';
      cornerBtn.setAttribute('aria-label', `Expand diagram preview: ${diagramTitle}`);
      cornerBtn.setAttribute('title', `Preview & download: ${diagramTitle}`);
      cornerBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 3 21 3 21 9"></polyline>
          <polyline points="9 21 3 21 3 15"></polyline>
          <line x1="21" y1="3" x2="14" y2="10"></line>
          <line x1="3" y1="21" x2="10" y2="14"></line>
        </svg>
      `;

      cornerBtn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const activeSvg = container.querySelector('svg');
        if (activeSvg) this.openMediaPreview(activeSvg.outerHTML, 'svg', diagramTitle, true);
      });

      container.style.position = 'relative';
      container.appendChild(cornerBtn);
    });

    const images = article.querySelectorAll('.obsidian-media-embed img, img:not(.emoji)');
    images.forEach(img => {
      const existingParent = img.closest('.media-preview-wrapper') || img.parentElement;
      if (existingParent && existingParent.querySelector('.diagram-corner-action-btn')) return;

      let wrapper = img.closest('.media-preview-wrapper');
      if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.className = 'media-preview-wrapper';
        img.parentNode.insertBefore(wrapper, img);
        wrapper.appendChild(img);
      }

      const imgSrc = img.getAttribute('src') || '';
      const imgAlt = img.getAttribute('alt') || '';
      const imgName = this.getImageFileName(imgSrc, imgAlt);

      const cornerBtn = document.createElement('button');
      cornerBtn.type = 'button';
      cornerBtn.className = 'diagram-corner-action-btn';
      cornerBtn.setAttribute('aria-label', `Expand preview for ${imgName}`);
      cornerBtn.setAttribute('title', `Preview & download: ${imgName}`);
      cornerBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 3 21 3 21 9"></polyline>
          <polyline points="9 21 3 21 3 15"></polyline>
          <line x1="21" y1="3" x2="14" y2="10"></line>
          <line x1="3" y1="21" x2="10" y2="14"></line>
        </svg>
      `;

      cornerBtn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        this.openMediaPreview(imgSrc, 'image', imgName, false);
      });

      wrapper.appendChild(cornerBtn);
    });
  }

  generateDiagramTitle(noteTitle, orderIndex, rawContent) {
    const clean = (noteTitle || 'Note').split('/').pop().replace(/\.md$/i, '').trim();
    const words = clean.split(/[\s_\-]+/).filter(Boolean);
    let abbrev = '';
    if (words.length <= 1) abbrev = clean.substring(0, 8).toUpperCase();
    else {
      abbrev = words.map(w => {
        if (/^\d+$/.test(w) || (/^[A-Z0-9]+$/i.test(w) && w.length <= 4)) return w.toUpperCase();
        return w[0].toUpperCase();
      }).join('');
    }

    let hashVal = 0;
    const seed = (rawContent || clean) + orderIndex;
    for (let i = 0; i < seed.length; i++) {
      hashVal = ((hashVal << 5) - hashVal) + seed.charCodeAt(i);
      hashVal |= 0;
    }
    const hex = Math.abs(hashVal).toString(16).substring(0, 4).toUpperCase().padStart(4, '8F');
    return `${abbrev}-D${orderIndex}-${hex}`;
  }

  getImageFileName(src, alt) {
    if (src && !src.startsWith('data:')) {
      const cleanUrl = src.split('?')[0].split('#')[0];
      const fileName = cleanUrl.split('/').pop();
      if (fileName && fileName.includes('.')) return decodeURIComponent(fileName);
    }
    if (alt && alt.trim() && !alt.startsWith('Diagram')) {
      const sanitized = alt.trim().replace(/[^a-zA-Z0-9_\-\.]/g, '_');
      return sanitized.includes('.') ? sanitized : `${sanitized}.png`;
    }
    return 'embedded-image.png';
  }

  setupMediaPreview() {
    if (document.getElementById('media-preview-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'media-preview-overlay';
    overlay.className = 'media-preview-overlay';
    overlay.innerHTML = `
      <div class="media-preview-dialog" id="media-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="media-preview-title">
        <div class="media-preview-toolbar">
          <div class="media-preview-title-group">
            <span id="media-preview-title" class="media-preview-title">Preview</span>
            <span id="media-preview-badge" class="media-preview-badge">DIAGRAM</span>
          </div>
          <div class="media-preview-actions">
            <button class="media-icon-btn" id="media-btn-zoom-in" type="button" aria-label="Zoom in" title="Zoom in (+)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                <line x1="11" y1="8" x2="11" y2="14"></line>
                <line x1="8" y1="11" x2="14" y2="11"></line>
              </svg>
            </button>
            <button class="media-icon-btn" id="media-btn-zoom-out" type="button" aria-label="Zoom out" title="Zoom out (-)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                <line x1="8" y1="11" x2="14" y2="11"></line>
              </svg>
            </button>
            <button class="media-icon-btn" id="media-btn-zoom-reset" type="button" aria-label="Reset zoom" title="Reset zoom (100%)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
                <path d="M21 3v5h-5"></path>
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
                <path d="M3 21v-5h5"></path>
              </svg>
            </button>
            <a class="media-icon-btn" id="media-btn-download" download aria-label="Download image or diagram" title="Download file">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
            </a>
            <button class="media-icon-btn btn-close-danger" id="media-btn-close" type="button" aria-label="Close preview" title="Close preview (Esc)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
        <div class="media-preview-content">
          <div class="media-preview-viewport" id="media-preview-viewport"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    this.mediaZoom = 1;

    const close = () => {
      overlay.classList.remove('is-open');
      const dialog = document.getElementById('media-preview-dialog');
      if (dialog) dialog.classList.remove('preview-theme-light');
      const viewport = document.getElementById('media-preview-viewport');
      if (viewport) {
        viewport.replaceChildren();
        viewport.style.transform = 'none';
      }
      this.mediaZoom = 1;
      if (this.mediaPreviewObjectUrl) {
        URL.revokeObjectURL(this.mediaPreviewObjectUrl);
        this.mediaPreviewObjectUrl = null;
      }
    };

    document.getElementById('media-btn-close')?.addEventListener('click', close);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && overlay.classList.contains('is-open')) close(); });

    const updateZoom = () => {
      const viewport = document.getElementById('media-preview-viewport');
      if (viewport) {
          viewport.style.transformOrigin = 'top left';
          viewport.style.transform = `scale(${this.mediaZoom})`;
          viewport.parentElement.style.overflow = 'auto';
          viewport.parentElement.style.width = '100%';
          viewport.parentElement.style.height = '100%';
      }
    };

    document.getElementById('media-btn-zoom-in')?.addEventListener('click', () => { this.mediaZoom = Math.min(3.5, this.mediaZoom + 0.25); updateZoom(); });
    document.getElementById('media-btn-zoom-out')?.addEventListener('click', () => { this.mediaZoom = Math.max(0.4, this.mediaZoom - 0.25); updateZoom(); });
    document.getElementById('media-btn-zoom-reset')?.addEventListener('click', () => { this.mediaZoom = 1; updateZoom(); });
  }

  openMediaPreview(source, type, title, isThemeAffectable = false) {
    this.setupMediaPreview();
    const overlay = document.getElementById('media-preview-overlay');
    const viewport = document.getElementById('media-preview-viewport');
    const titleElement = document.getElementById('media-preview-title');
    const badgeElement = document.getElementById('media-preview-badge');
    const download = document.getElementById('media-btn-download');

    if (!overlay || !viewport || !titleElement || !download) return;

    if (this.mediaPreviewObjectUrl) URL.revokeObjectURL(this.mediaPreviewObjectUrl);
    this.mediaPreviewObjectUrl = null;

    titleElement.textContent = title;
    titleElement.setAttribute('title', title);
    if (badgeElement) badgeElement.textContent = type === 'svg' ? 'DIAGRAM' : 'IMAGE';

    this.mediaZoom = 1;
    viewport.style.transform = 'none';
    viewport.replaceChildren();

    let downloadUrl = source;

    if (type === 'svg') {
      this.mediaPreviewObjectUrl = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
      downloadUrl = this.mediaPreviewObjectUrl;
      const wrapper = document.createElement('div');
      wrapper.className = 'media-preview-svg';
      wrapper.innerHTML = source;
      viewport.appendChild(wrapper);
      download.download = `${title}.svg`;
    } else {
      const image = document.createElement('img');
      image.src = source;
      image.alt = title;
      viewport.appendChild(image);
      download.download = title.includes('.') ? title : `${title}.png`;
    }

    download.href = downloadUrl;
    overlay.classList.add('is-open');
  }

  openPdfExportModal(noteTitle, relPath, rawMarkdown) {
    let overlay = document.getElementById('pdf-export-modal-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'pdf-export-modal-overlay';
      overlay.className = 'pdf-export-modal-overlay';
      overlay.innerHTML = `
        <div class="pdf-export-dialog" role="dialog" aria-modal="true" aria-labelledby="pdf-modal-title">
          <div class="pdf-export-header">
            <h3 class="pdf-export-title" id="pdf-modal-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              <span>Export Note as PDF</span>
            </h3>
            <button class="media-icon-btn btn-close-danger" id="pdf-modal-close" type="button" aria-label="Close export dialog" title="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div class="pdf-export-body">
            <div class="pdf-setting-group">
              <label class="pdf-setting-label">Document Layout</label>
              <div class="pdf-radio-cards">
                <div class="pdf-radio-card is-selected" id="pdf-card-pageless" data-mode="pageless">
                  <div class="pdf-card-title">📱 Digital (Pageless)</div>
                  <div class="pdf-card-sub">Continuous reading flow for devices; no awkward page cuts across formulas or charts.</div>
                </div>
                <div class="pdf-radio-card" id="pdf-card-print" data-mode="print">
                  <div class="pdf-card-title">🖨️ Physical Print</div>
                  <div class="pdf-card-sub">Paginated A4 layout with margins and smart breaks between sections.</div>
                </div>
              </div>
            </div>
            <div class="pdf-setting-group">
              <label class="pdf-setting-label" for="pdf-select-font">Reading Typography (Web & Browser Fonts)</label>
              <div class="pdf-setting-desc">Crisp vector typography preserved in the exported PDF with complete text selection.</div>
              <select id="pdf-select-font" class="pdf-input-select">
                <option value="Atkinson Hyperlegible" selected>Atkinson Hyperlegible (Accessibility & Reading Friendly)</option>
                <option value="Inter">Inter (Obsidian Default Clean Sans)</option>
                <option value="Lora">Lora (Contemporary Book Serif)</option>
                <option value="Merriweather">Merriweather (Screen Reading Serif)</option>
                <option value="JetBrains Mono">JetBrains Mono (Technical Monospace)</option>
                <option value="System">System Sans-Serif (Browser Native)</option>
              </select>
            </div>
            <div class="pdf-setting-group" id="pdf-group-theme">
              <label class="pdf-setting-label" for="pdf-select-theme">Color Theme</label>
              <div class="pdf-setting-desc">Select visual styling for digital device copies (print mode optimizes for white paper).</div>
              <select id="pdf-select-theme" class="pdf-input-select">
                <option value="dark" selected>Obsidian Dark (Nord Night — #2e3440)</option>
                <option value="light">Minimal Light (Clean White Paper)</option>
                <option value="sepia">Warm Sepia (Eye Comfort Book)</option>
              </select>
            </div>
            <div class="pdf-setting-group">
              <label class="pdf-checkbox-row">
                <input type="checkbox" id="pdf-check-toc" checked />
                <span class="pdf-card-title">Include Interactive Table of Contents (TOC)</span>
              </label>
              <div class="pdf-setting-desc" style="padding-left: 26px;">Generates hyperlinked section navigation at the start of the document.</div>
            </div>
          </div>
          <div class="pdf-export-footer">
            <button class="btn-secondary-pdf" id="pdf-btn-copy-raw" type="button" title="Copy raw Markdown to clipboard">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span>Copy Raw MD</span>
            </button>
            <button class="btn-primary-pdf" id="pdf-btn-download-html" type="button" style="background: var(--interactive-accent, #a882ff); color: #ffffff;" title="Direct download as pageless self-contained HTML document (zero page-cut issues)">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>Download Pageless (.html)</span>
            </button>
            <button class="btn-primary-pdf" id="pdf-btn-generate" type="button">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 6 2 18 2 18 9"></polyline>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                <rect x="6" y="14" width="12" height="8"></rect>
              </svg>
              <span>Print / PDF</span>
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const close = () => overlay.classList.remove('is-open');
      document.getElementById('pdf-modal-close')?.addEventListener('click', close);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

      const cardPageless = document.getElementById('pdf-card-pageless');
      const cardPrint = document.getElementById('pdf-card-print');
      const selectTheme = document.getElementById('pdf-select-theme');

      cardPageless?.addEventListener('click', () => {
        cardPageless.classList.add('is-selected');
        cardPrint?.classList.remove('is-selected');
        if (selectTheme) selectTheme.value = 'dark';
      });

      cardPrint?.addEventListener('click', () => {
        cardPrint.classList.add('is-selected');
        cardPageless?.classList.remove('is-selected');
        if (selectTheme) selectTheme.value = 'light';
      });

      document.getElementById('pdf-btn-copy-raw')?.addEventListener('click', () => {
        if (rawMarkdown) {
          navigator.clipboard.writeText(rawMarkdown);
          this.showToast('Raw markdown copied to clipboard');
        }
      });

      document.getElementById('pdf-btn-download-html')?.addEventListener('click', () => {
        overlay.classList.remove('is-open');
        this.downloadNotePageless(noteTitle, relPath, rawMarkdown);
      });
    }

    const btnGenerate = document.getElementById('pdf-btn-generate');
    if (btnGenerate) {
      btnGenerate.onclick = () => {
        const isPageless = document.getElementById('pdf-card-pageless')?.classList.contains('is-selected');
        const mode = isPageless ? 'pageless' : 'print';
        const font = document.getElementById('pdf-select-font')?.value || 'Atkinson Hyperlegible';
        const theme = document.getElementById('pdf-select-theme')?.value || (mode === 'print' ? 'light' : 'dark');
        const includeToc = document.getElementById('pdf-check-toc')?.checked ?? true;
        overlay.classList.remove('is-open');
        this.generateLookalikeThemedPdf({ noteTitle, mode, font, theme, includeToc, fontSize: this.fontSize || 16 });
      };
    }
    overlay.classList.add('is-open');
  }

  downloadNotePageless(noteTitle, relPath, rawMarkdown) {
    const article = document.getElementById('note-article');
    if (!article) {
      this.showToast('Unable to export: note content not found');
      return;
    }

    const safeTitle = (noteTitle || 'Obsidian-Note').replace(/[/\\?%*:|"<>]/g, '-').trim();
    const clone = article.cloneNode(true);
    clone.querySelectorAll('.diagram-corner-action-btn, .copy-code-button, .toc-twisty-btn').forEach(el => el.remove());

    let tocHtml = '';
    const headings = clone.querySelectorAll('h1, h2, h3, h4');
    if (headings.length > 0) {
      const tocItems = [];
      headings.forEach((h, idx) => {
        const level = parseInt(h.tagName.substring(1), 10) || 2;
        const text = h.textContent.replace(/^#+\s*/, '').trim();
        const anchorId = h.id || `pageless-heading-${idx}`;
        h.id = anchorId;
        const indent = Math.max(0, (level - 1) * 16);
        tocItems.push(`
          <li style="margin: 4px 0; padding-left: ${indent}px; list-style: none;">
            <a href="#${anchorId}" style="text-decoration: none; color: inherit; font-size: 0.88rem; display: inline-flex; align-items: baseline; gap: 6px;">
              <span style="opacity: 0.5; font-size: 0.75rem;">${'▪'.repeat(Math.max(1, level - 1))}</span>
              <span>${text}</span>
            </a>
          </li>
        `);
      });

      tocHtml = `
        <details class="pageless-toc-drawer" open style="border: 1px solid var(--border); background: var(--surface); border-radius: 8px; padding: 14px 20px; margin-bottom: 30px;">
          <summary style="font-weight: 700; font-size: 1rem; color: var(--accent); cursor: pointer; user-select: none;">
            Table of Contents (${headings.length} sections)
          </summary>
          <ul style="margin: 12px 0 0 0; padding: 0;">
            ${tocItems.join('')}
          </ul>
        </details>
      `;
    }

    const isDark = this.themeMode === 'dark';
    const bg = isDark ? '#12151d' : '#ffffff';
    const text = isDark ? '#f8fafc' : '#0f172a';
    const surface = isDark ? '#181d28' : '#f8fafc';
    const border = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.12)';
    const accent = isDark ? '#a882ff' : '#7c3aed';
    const h1 = isDark ? '#ffffff' : '#0f172a';
    const h2 = isDark ? '#a882ff' : '#6d28d9';
    const h3 = isDark ? '#5ce1e6' : '#0284c7';
    const codeBg = isDark ? '#181d28' : '#f1f5f9';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${noteTitle}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" />
  <style>
    :root {
      --bg: ${bg}; --text: ${text}; --surface: ${surface}; --border: ${border}; --accent: ${accent};
      --h1: ${h1}; --h2: ${h2}; --h3: ${h3}; --code-bg: ${codeBg};
      --font-default: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --font-mono: 'JetBrains Mono', Consolas, monospace;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0; background-color: var(--bg); color: var(--text);
      font-family: var(--font-default); font-size: ${this.fontSize || 16}px; line-height: 1.68;
      -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; scroll-behavior: smooth;
    }
    .pageless-container { max-width: 860px; margin: 48px auto; padding: 0 24px; }
    .pageless-header { border-bottom: 2px solid var(--border); padding-bottom: 20px; margin-bottom: 32px; }
    .pageless-header h1 { font-size: 2.2em; font-weight: 800; color: var(--h1); margin: 0 0 8px 0; letter-spacing: -0.02em; }
    .pageless-meta { font-size: 0.85em; opacity: 0.75; color: var(--text); }
    h1, h2, h3, h4, h5, h6 { margin-top: 1.4em; margin-bottom: 0.5em; font-weight: 700; line-height: 1.3; }
    h1 { font-size: 1.85em; color: var(--h1); border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
    h2 { font-size: 1.45em; color: var(--h2); }
    h3 { font-size: 1.22em; color: var(--h3); }
    h4 { font-size: 1.08em; color: var(--accent); }
    p, ul, ol, blockquote { margin: 0.85em 0; }
    strong, b { color: ${isDark ? '#ffffff' : '#000000'}; font-weight: 700; }
    a { color: var(--accent); text-decoration: underline; }
    pre, code { font-family: var(--font-mono); }
    pre { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 14px 18px; overflow-x: auto; font-size: 0.9em; }
    code:not(pre code) { background: var(--surface); border: 1px solid var(--border); border-radius: 4px; padding: 2px 5px; font-size: 0.9em; color: var(--h3); }
    table { width: 100%; border-collapse: collapse; margin: 1.2em 0; border: 1px solid var(--border); }
    th, td { border: 1px solid var(--border); padding: 9px 14px; text-align: left; }
    th { background: var(--surface); font-weight: 700; }
    blockquote { border-left: 4px solid var(--accent); margin: 1.2em 0; padding: 8px 18px; background: var(--surface); border-radius: 0 6px 6px 0; }
    .callout { border: 1px solid var(--border); border-left: 4px solid var(--accent); background: var(--surface); border-radius: 6px; padding: 14px 18px; margin: 1.2em 0; }
    .mermaid-diagram-container { display: flex; justify-content: center; margin: 1.4em 0; padding: 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; }
    .mermaid-diagram-container svg { max-width: 100%; height: auto; }
    .katex-display { margin: 1em 0; overflow-x: auto; text-align: center; }
    img { max-width: 100%; height: auto; border-radius: 6px; }
  </style>
</head>
<body>
  <div class="pageless-container">
    <div class="pageless-header">
      <h1>${noteTitle}</h1>
      <div class="pageless-meta">Obsidian Vault • Pageless Continuous Document • ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
    </div>
    ${tocHtml}
    <div class="pageless-content">${clone.innerHTML}</div>
  </div>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl; a.download = `${safeTitle}.html`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(downloadUrl); }, 150);
    this.showToast(`Pageless document downloaded: ${safeTitle}.html`);
  }

  generateLookalikeThemedPdf({ noteTitle, mode, font, theme, includeToc, fontSize }) {
    const article = document.getElementById('note-article');
    if (!article) {
      this.showToast('Unable to export: note content not found');
      return;
    }
    this.showToast('Preparing PDF formatting & vector assets...');

    let tocHtml = '';
    if (includeToc) {
      const headings = article.querySelectorAll('h1, h2, h3, h4');
      if (headings.length > 0) {
        const tocItems = [];
        headings.forEach((h, idx) => {
          const level = parseInt(h.tagName.substring(1), 10) || 2;
          const text = h.textContent.replace(/^#+\s*/, '').trim();
          const anchorId = h.id || `pdf-heading-${idx}`;
          h.id = anchorId;
          const indent = Math.max(0, (level - 1) * 16);
          tocItems.push(`
            <li style="margin: 4px 0; padding-left: ${indent}px; list-style: none;">
              <a href="#${anchorId}" style="text-decoration: none; color: inherit; font-size: 0.88rem; display: inline-flex; align-items: baseline; gap: 6px;">
                <span style="opacity: 0.5; font-size: 0.75rem;">${'▪'.repeat(Math.max(1, level - 1))}</span>
                <span>${text}</span>
              </a>
            </li>
          `);
        });

        tocHtml = `
          <div class="pdf-toc-wrapper" style="border: 1px solid var(--pdf-border); background: var(--pdf-surface); border-radius: 8px; padding: 18px 24px; margin-bottom: 32px; break-inside: avoid; page-break-inside: avoid;">
            <div style="font-weight: 700; font-size: 1.05rem; margin-bottom: 12px; color: var(--pdf-accent); display: flex; align-items: center; gap: 8px;">
              <span>Table of Contents</span>
            </div>
            <ul style="margin: 0; padding: 0;">${tocItems.join('')}</ul>
          </div>
        `;
      }
    }

    const clone = article.cloneNode(true);
    clone.querySelectorAll('.diagram-corner-action-btn, .copy-code-button, .toc-twisty-btn').forEach(el => el.remove());

    let fontImport = '';
    let fontFamily = 'var(--font-default)';
    if (font === 'Atkinson Hyperlegible') {
      fontImport = `@import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400;1,700&display=swap');`;
      fontFamily = `'Atkinson Hyperlegible', sans-serif`;
    } else if (font === 'Inter') {
      fontImport = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');`;
      fontFamily = `'Inter', -apple-system, BlinkMacSystemFont, sans-serif`;
    } else if (font === 'Lora') {
      fontImport = `@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&display=swap');`;
      fontFamily = `'Lora', Georgia, serif`;
    } else if (font === 'Merriweather') {
      fontImport = `@import url('https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,300;0,400;0,700;1,300&display=swap');`;
      fontFamily = `'Merriweather', Georgia, serif`;
    } else if (font === 'JetBrains Mono') {
      fontImport = `@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');`;
      fontFamily = `'JetBrains Mono', monospace`;
    } else {
      fontFamily = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
    }

    let colors = {
      bg: '#12151d', text: '#f8fafc', surface: '#181d28', border: 'rgba(255, 255, 255, 0.12)',
      accent: '#a882ff', h1: '#ffffff', h2: '#a882ff', h3: '#5ce1e6', codeBg: '#181d28', calloutBg: '#181d28'
    };

    if (theme === 'light') {
      colors = { bg: '#ffffff', text: '#0f172a', surface: '#f8fafc', border: '#e2e8f0', accent: '#7c3aed', h1: '#0f172a', h2: '#6d28d9', h3: '#0284c7', codeBg: '#f1f5f9', calloutBg: '#f8fafc' };
    } else if (theme === 'sepia') {
      colors = { bg: '#fbf0d9', text: '#3c2f1f', surface: '#f3e5c8', border: 'rgba(60, 47, 31, 0.15)', accent: '#92400e', h1: '#92400e', h2: '#b45309', h3: '#4d7c0f', codeBg: '#eedfbc', calloutBg: '#f3e5c8' };
    }

    const oldFrame = document.getElementById('pdf-print-sandbox');
    if (oldFrame) oldFrame.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'pdf-print-sandbox';
    iframe.style.position = 'fixed'; iframe.style.right = '0'; iframe.style.bottom = '0';
    iframe.style.width = '0'; iframe.style.height = '0'; iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();

    const pageCss = mode === 'pageless' ? `
      @page { size: auto; margin: 0; }
      body { padding: 48px 56px; max-width: 900px; margin: 0 auto; background-color: ${colors.bg} !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    ` : `
      @page { size: A4; margin: 16mm 14mm 16mm 14mm; }
      body { padding: 0; max-width: 100%; margin: 0 auto; background-color: ${colors.bg} !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      p, .callout, pre, blockquote, table, tr, li, figure, img, svg, .math-block, .katex-display, .mermaid-diagram-container, .accounting-table-wrapper, .accounting-schedule-table, .pdf-toc-wrapper { break-inside: avoid !important; page-break-inside: avoid !important; }
      h1, h2, h3, h4, h5, h6 { break-after: avoid !important; page-break-after: avoid !important; break-inside: avoid !important; page-break-inside: avoid !important; }
    `;

    doc.write(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>${noteTitle}</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" />
        <style>
          ${fontImport}
          :root {
            --pdf-bg: ${colors.bg}; --pdf-text: ${colors.text}; --pdf-surface: ${colors.surface};
            --pdf-border: ${colors.border}; --pdf-accent: ${colors.accent}; --pdf-h1: ${colors.h1};
            --pdf-h2: ${colors.h2}; --pdf-h3: ${colors.h3}; --pdf-code-bg: ${colors.codeBg};
          }
          * { box-sizing: border-box; }
          html, body {
            background-color: var(--pdf-bg); color: var(--pdf-text); font-family: ${fontFamily};
            font-size: ${fontSize}px; line-height: 1.68; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
          }
          h1, h2, h3, h4, h5, h6 { color: var(--pdf-text); margin-top: 1.4em; margin-bottom: 0.5em; font-weight: 700; line-height: 1.3; }
          h1 { font-size: 1.85em; color: var(--pdf-h1); border-bottom: 1px solid var(--pdf-border); padding-bottom: 0.3em; }
          h2 { font-size: 1.45em; color: var(--pdf-h2); }
          h3 { font-size: 1.22em; color: var(--pdf-h3); }
          h4 { font-size: 1.08em; color: var(--pdf-accent); }
          p, ul, ol, blockquote { margin: 0.85em 0; }
          a { color: var(--pdf-accent); text-decoration: underline; }
          pre, code { font-family: 'JetBrains Mono', monospace; background: var(--pdf-code-bg); border-radius: 4px; }
          pre { padding: 14px 18px; overflow-x: auto; border: 1px solid var(--pdf-border); font-size: 0.88em; }
          code { padding: 2px 5px; font-size: 0.9em; }
          table { width: 100%; border-collapse: collapse; margin: 1.2em 0; font-size: 0.9em; }
          th, td { border: 1px solid var(--pdf-border); padding: 8px 12px; text-align: left; }
          th { background: var(--pdf-surface); font-weight: 600; }
          blockquote { border-left: 4px solid var(--pdf-accent); margin: 1em 0; padding: 6px 16px; background: var(--pdf-surface); border-radius: 0 4px 4px 0; }
          .callout { border: 1px solid var(--pdf-border); border-left: 4px solid var(--pdf-accent); background: var(--pdf-surface); border-radius: 6px; padding: 12px 16px; margin: 1.2em 0; }
          .mermaid-diagram-container { display: flex; justify-content: center; align-items: center; margin: 1.4em 0; padding: 16px; background: var(--pdf-surface); border: 1px solid var(--pdf-border); border-radius: 8px; }
          .mermaid-diagram-container svg { max-width: 100%; height: auto; }
          .katex-display { margin: 1em 0; overflow-x: auto; text-align: center; }
          img { max-width: 100%; height: auto; border-radius: 6px; }
          .pdf-document-header { margin-bottom: 28px; padding-bottom: 16px; border-bottom: 2px solid var(--pdf-border); }
          .pdf-document-header-title { font-size: 2.2em; font-weight: 800; color: var(--pdf-h1); margin: 0 0 6px 0; letter-spacing: -0.02em; }
          .pdf-document-header-meta { font-size: 0.85em; color: var(--pdf-text); opacity: 0.75; }
          ${pageCss}
        </style>
      </head>
      <body>
        <div class="pdf-document-header">
          <h1 class="pdf-document-header-title">${noteTitle}</h1>
          <div class="pdf-document-header-meta">Obsidian Digital Vault Workspace • ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </div>
        ${tocHtml}
        <div class="pdf-document-body">${clone.innerHTML}</div>
      </body>
      </html>
    `);

    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (err) {
        console.error('Print trigger error:', err);
      }
    }, 650);
  }

  setupGraph() {
    if (!document.getElementById('note-container') && !document.querySelector('.obsidian-workspace')) {
      return;
    }
    const sidebarCanvas = document.getElementById('graph-canvas');
    if (sidebarCanvas) {
      this.sidebarGraph = new ObsidianGraphRenderer(sidebarCanvas, this.graphData, {
        isMini: true, theme: this.theme,
        onNodeClick: (node) => { window.location.hash = `#${node.id}`; }
      });
      this.sidebarGraph.start();
    }

    const modalCanvas = document.getElementById('graph-canvas-modal');
    if (modalCanvas) {
      this.modalGraph = new ObsidianGraphRenderer(modalCanvas, this.graphData, {
        isMini: false, theme: this.theme,
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
      if (this.graphMode === 'global') btnGlobal.classList.add('is-active');
      else btnGlobal.classList.remove('is-active');
    }
    if (label) label.innerText = this.graphMode === 'local' ? 'Local Graph' : 'Global Graph';
    if (modalBtn) modalBtn.innerText = this.graphMode === 'local' ? 'Switch to Global Graph' : 'Switch to Local Graph';
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
      input.value = ''; input.focus();
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
    const scopeEl = document.getElementById('search-scope');
    if (!container) return;

    const q = query.toLowerCase().trim();
    const scope = scopeEl ? scopeEl.value : 'global';

    let pool = this.manifest || [];
    if (scope === 'local') {
      pool = pool.filter(item => item.planetSlug === this.currentFolder);
    }

    const matches = pool.filter(item => {
      if (item.type !== 'file' || !item.isMarkdown) return false;
      if (!q) return true;
      const title = item.title || item.originalName || '';
      return title.toLowerCase().includes(q) || item.originalPath.toLowerCase().includes(q) || item.slugPath.toLowerCase().includes(q);
    }).slice(0, 25);

    if (matches.length === 0) {
      container.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-faint);">No matching notes found.</div>';
      return;
    }

    let html = '';
    matches.forEach(item => {
      const displayTitle = item.title || item.originalName;
      const highlightedTitle = this.highlightSearchMatch(displayTitle, q);
      
      // Build breadcrumbs
      const pathParts = item.originalPath.split('/');
      const breadcrumbs = pathParts.slice(0, -1).join(' > ');
      const highlightedPath = this.highlightSearchMatch(breadcrumbs, q);

      // Resolve URL: if local section, just hash. If cross-folder, full path.
      let targetUrl = `#${item.slugPath.split('/').slice(1).join('/')}`;
      let onClick = `window.location.hash='${targetUrl}'; window.ObsidianApp.closeSearchModal();`;
      
      if (item.planetSlug !== this.currentFolder) {
        targetUrl = `../${item.planetSlug}/${targetUrl}`;
        onClick = `window.location.href='${targetUrl}'; window.ObsidianApp.closeSearchModal();`;
      }

      html += `
        <div class="search-item" onclick="${onClick}">
          <span class="search-item-title">${highlightedTitle}</span>
          <div class="search-item-path" style="font-size:0.75rem; color:var(--text-muted);">${highlightedPath}</div>
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
    this._toastTimeout = setTimeout(() => { toast.classList.remove('is-visible'); }, 2400);
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  autoHealMarkdownTypos(text) {
    if (!text) return text;
    text = text.replace(/^[ \t]*>\[!([a-zA-Z0-9_\-]+)\]([^\s\n<].*)$/gm, '> [!$1] $2');
    text = text.replace(/^(#{1,6})([^\s#\n\r].*)$/gm, '$1 $2');
    return text;
  }

  async loadVaultHealth() {
    const pathsToTry = ['../../site-lib/vault-health.json', '../site-lib/vault-health.json', './site-lib/vault-health.json', 'site-lib/vault-health.json', '/site-lib/vault-health.json'];

    let data = null;
    for (const p of pathsToTry) {
      try {
        const res = await fetch(p);
        if (res.ok) { data = await res.json(); break; }
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
    let statsEl = document.getElementById('reading-stats-overlay');
    if (!statsEl) {
        statsEl = document.createElement('div');
        statsEl.id = 'reading-stats-overlay';
        statsEl.style.cssText = `
            position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
            background: rgba(25, 25, 25, 0.45); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 20px;
            padding: 8px 18px; display: flex; gap: 16px; align-items: center;
            color: #e2e8f0; font-size: 0.85rem; font-weight: 500;
            box-shadow: 0 4px 16px rgba(0,0,0,0.3); z-index: 100;
            opacity: 0; transition: opacity 0.4s ease; pointer-events: none;
        `;
        statsEl.innerHTML = `
            <div style="display:flex; align-items:center; gap:6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg><span id="stats-time"></span></div>
            <div style="display:flex; align-items:center; gap:6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg><span id="stats-words"></span></div>
        `;
        document.body.appendChild(statsEl);
    }
    
    const words = document.getElementById('word-count-val')?.textContent || '0 words';
    document.getElementById('stats-words').textContent = words;

    this.readingStats = { totalMinutes };
    let hideTimeout;

    const viewport = document.getElementById('note-viewport');
    if (!viewport) return;
    
    if (this.readingScrollHandler) viewport.removeEventListener('scroll', this.readingScrollHandler);
    
    this.readingScrollHandler = () => {
        const scrollRange = viewport.scrollHeight - viewport.clientHeight;
        const progress = scrollRange > 0 ? Math.min(1, Math.max(0, viewport.scrollTop / scrollRange)) : 0;
        const remaining = Math.max(0, Math.ceil(this.readingStats.totalMinutes * (1 - progress)));
        document.getElementById('stats-time').textContent = remaining > 0 ? `${remaining} min left` : 'Finished';
        
        statsEl.style.opacity = '1';
        clearTimeout(hideTimeout);
        hideTimeout = setTimeout(() => { statsEl.style.opacity = '0'; }, 1500);
    };
    viewport.addEventListener('scroll', this.readingScrollHandler, { passive: true });
  }

  downloadMarkdownFile(title, path, rawMarkdown) {
    const content = rawMarkdown || this.activeNoteRawMarkdown || '';
    if (!content) {
      this.showToast('No markdown content available to download');
      return;
    }
    
    // Use the original name from the sidebar if available
    let displayName = this.activeNoteOriginalName || title || 'Obsidian-Note';
    
    // Ensure .md extension
    if (!displayName.toLowerCase().endsWith('.md')) {
      displayName += '.md';
    }
    
    const filename = displayName.replace(/[\\/:*?"<>|]/g, '_').trim();
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    this.showToast(`Downloaded ${filename}`);
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
      if (filter === 'Callout') issues = issues.filter(i => i.category === 'Callout' || i.category === 'Markdown Syntax');
      else issues = issues.filter(i => i.category === filter);
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

    if (issues.length > 50) html += `<div style="text-align: center; padding: 12px; color: var(--text-muted, #d8dee9); font-size: 0.8rem;">Showing first 50 of ${issues.length} issues.</div>`;
    list.innerHTML = html;
  }

  triggerGatekeeper(expectedToken, onUnlock) {
    document.getElementById('gatekeeper-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'gatekeeper-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
      z-index: 999999; display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      font-family: var(--font-interface, sans-serif);
      transition: opacity 0.4s ease;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      background: var(--background-primary, #1e1e1e);
      padding: 40px; border-radius: 20px; border: 1px solid var(--background-modifier-border, rgba(255,255,255,0.1));
      box-shadow: 0 32px 64px rgba(0,0,0,0.6);
      display: flex; flex-direction: column; align-items: center;
      position: relative; width: 90%; max-width: 400px;
      animation: gatekeeper-appear 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    `;

    const style = document.createElement('style');
    style.innerHTML = `
      @keyframes gatekeeper-appear {
        from { transform: scale(0.9) translateY(20px); opacity: 0; }
        to { transform: scale(1) translateY(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    closeBtn.style.cssText = `
      position: absolute; top: 16px; right: 16px;
      width: 32px; height: 32px; border-radius: 50%;
      background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.05);
      color: #b3b3b3; cursor: pointer; display: flex; justify-content: center; align-items: center;
      transition: all 0.2s ease;
    `;
    closeBtn.onclick = () => {
      overlay.style.opacity = '0';
      setTimeout(() => {
        overlay.remove();
        document.body.style.overflow = '';
      }, 400);
    };

    const title = document.createElement('h2');
    title.innerText = "Locked Note";
    title.style.cssText = `
      margin: 0 0 12px 0; font-size: 1.5rem; font-weight: 600;
      color: var(--text-normal, #e8e8e8); text-align: center;
    `;

    const subtitle = document.createElement('p');
    subtitle.innerText = "This note is protected. Please enter the access token to view its contents.";
    subtitle.style.cssText = `
      margin: 0 0 24px 0; font-size: 0.95rem; color: var(--text-muted, #b3b3b3);
      text-align: center; line-height: 1.5;
    `;

    const inputWrapper = document.createElement('div');
    inputWrapper.style.cssText = "position: relative; width: 100%;";

    const input = document.createElement('input');
    input.type = "password";
    input.placeholder = "Access Token";
    input.style.cssText = `
      width: 100%; box-sizing: border-box;
      background: var(--background-secondary, rgba(255, 255, 255, 0.05));
      border: 1px solid var(--background-modifier-border, rgba(255, 255, 255, 0.2));
      padding: 14px 18px; border-radius: 10px; color: white; font-size: 1rem;
      text-align: center; outline: none; letter-spacing: 1px;
      transition: all 0.3s ease;
    `;

    input.addEventListener('focus', () => {
      input.style.borderColor = "var(--interactive-accent, #8b6ce3)";
      input.style.boxShadow = "0 0 0 3px hsla(var(--interactive-accent-hsl, 258, 88%, 66%), 0.2)";
    });

    input.addEventListener('blur', () => {
      input.style.borderColor = "var(--background-modifier-border, rgba(255, 255, 255, 0.2))";
      input.style.boxShadow = "none";
    });

    document.body.style.overflow = 'hidden';

    inputWrapper.appendChild(input);
    modal.appendChild(closeBtn);
    modal.appendChild(title);
    modal.appendChild(subtitle);
    modal.appendChild(inputWrapper);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    input.addEventListener('input', (e) => {
      if (e.target.value === expectedToken) {
        input.style.borderColor = "#4ade80"; 
        input.style.color = "#4ade80";
        input.disabled = true; 
        
        setTimeout(() => {
          overlay.style.opacity = '0';
          document.body.style.overflow = '';
          setTimeout(() => {
            overlay.remove();
            if (onUnlock) onUnlock();
          }, 400);
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

  updateTheme(theme, themeFamily) {
    this.theme = theme;
    if (themeFamily) this.themeFamily = themeFamily;
    this.render();
  }

  initGraphSimulation() {
    const width = this.canvas.width || 400;
    const height = this.canvas.height || 400;

    let activeNodes = this.data.nodes || [];
    let activeLinks = this.data.links || [];

    if (this.mode === 'local' && this.focusNodeId) {
      const visited = new Set([this.focusNodeId]);
      const queue = [this.focusNodeId];
      const maxNodes = 35;

      while (queue.length > 0 && visited.size < maxNodes) {
        const currId = queue.shift();
        for (const link of activeLinks) {
          const s = typeof link.source === 'object' ? link.source.id : link.source;
          const t = typeof link.target === 'object' ? link.target.id : link.target;
          if (s === currId && !visited.has(t) && visited.size < maxNodes) {
            visited.add(t); queue.push(t);
          } else if (t === currId && !visited.has(s) && visited.size < maxNodes) {
            visited.add(s); queue.push(s);
          }
        }
      }

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
        return { source: nodeMap.get(sId), target: nodeMap.get(tId) };
      })
      .filter(l => l.source && l.target);

    this.transform = { x: width / 2, y: height / 2, k: this.isMini ? 0.9 : 1 };
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
      if (dist <= node.radius + 6) return node;
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
    if (!this.isRunning) this.start();
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
          a.vx -= fx; a.vy -= fy;
          b.vx += fx; b.vy += fy;
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
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
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

    if (this.stepCount > 35 && (totalVelocity / (nodes.length || 1)) < 0.05) return true;
    if (this.stepCount > 150) return true;
    return false;
  }

  render() {
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, this.width || 500, this.height || 500);

    ctx.translate(this.transform.x, this.transform.y);
    ctx.scale(this.transform.k, this.transform.k);

    const isDark = this.theme === 'dark';
    const p = isDark ? {
      accent: '#88c0d0',
      link: 'rgba(76, 86, 106, 0.45)',
      linkActive: 'rgba(136, 192, 208, 0.9)',
      nodeDefault: '#88c0d0',
      focused: '#bf616a',
      hovered: '#d08770',
      badgeBg: 'rgba(46, 52, 64, 0.85)',
      badgeFg: '#eceff4'
    } : {
      accent: '#5e81ac',
      link: 'rgba(216, 222, 233, 0.6)',
      linkActive: 'rgba(94, 129, 172, 0.9)',
      nodeDefault: '#5e81ac',
      focused: '#dc322f',
      hovered: '#cb4b16',
      badgeBg: 'rgba(255, 255, 255, 0.85)',
      badgeFg: '#2e3440'
    };

    for (const link of this.simLinks) {
      const isConnected = this.hoveredNode && (link.source === this.hoveredNode || link.target === this.hoveredNode);
      ctx.beginPath();
      ctx.moveTo(link.source.x, link.source.y);
      ctx.lineTo(link.target.x, link.target.y);
      ctx.strokeStyle = isConnected ? p.linkActive : p.link;
      ctx.lineWidth = isConnected ? 2 : 1;
      ctx.stroke();
    }

    for (const node of this.simNodes) {
      const isFocused = node.id === this.focusNodeId;
      const isHovered = node === this.hoveredNode;

      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius * (isHovered ? 1.3 : 1), 0, 2 * Math.PI);

      if (isFocused) {
        ctx.fillStyle = p.focused;
        ctx.shadowColor = 'rgba(239, 68, 68, 0.5)';
        ctx.shadowBlur = 10;
      } else if (isHovered) {
        ctx.fillStyle = p.hovered;
        ctx.shadowColor = 'rgba(245, 158, 11, 0.4)';
        ctx.shadowBlur = 8;
      } else {
        ctx.fillStyle = node.color || p.nodeDefault;
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
        ctx.fillStyle = p.badgeBg;
        ctx.fillRect(node.x - metrics.width / 2 - pad, node.y + node.radius + 3, metrics.width + pad * 2, 14);

        ctx.fillStyle = p.badgeFg;
        ctx.fillText(text, node.x, node.y + node.radius + 4);
      }
    }

    ctx.restore();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('note-container') || document.querySelector('.obsidian-workspace')) {
    window.ObsidianApp = new ObsidianVaultApp();
  }
});