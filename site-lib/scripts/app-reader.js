/**
 * ============================================================================
 * Obsidian Vault Reader Engine (app-reader.js)
 * Modular orchestrator for note rendering, workspace preferences,
 * sidebars, interactive outline TOC, graph view, search, and diagnostics.
 * ============================================================================
 */

(function() {
  'use strict';

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
      this.activeNoteOriginalName = '';

      // Sidebar states
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

          if (textIsSlug && window.ObsidianWikiLinks) {
            const smartLabel = window.ObsidianWikiLinks.resolveSmartLabel(stem, null, null, this.manifest, this.nameMap, this.vaultLookup);
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
          document.getElementById('vault-lock-blur-styles')?.remove();

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

      if (window.ObsidianMermaidRenderer) {
        window.ObsidianMermaidRenderer.rethemeAll(document.getElementById('note-article') || document, this.themeMode === 'dark');
      }

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

      document.getElementById('btn-toggle-left')?.addEventListener('click', (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        this.isLeftOpen = !this.isLeftOpen;
        if (window.innerWidth <= 768 && this.isLeftOpen) this.isRightOpen = false;
        localStorage.setItem('obsidian_left_open', this.isLeftOpen);
        this.applyPreferences();
      });

      document.getElementById('btn-toggle-right')?.addEventListener('click', (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        this.isRightOpen = !this.isRightOpen;
        if (window.innerWidth <= 768 && this.isRightOpen) this.isLeftOpen = false;
        localStorage.setItem('obsidian_right_open', this.isRightOpen);
        this.applyPreferences();
        if (this.isRightOpen && this.sidebarGraph) {
          setTimeout(() => this.sidebarGraph.resize(), 250);
        }
      });

      const btnOptions = document.getElementById('btn-workspace-options');
      const optionsMenu = document.getElementById('workspace-options-menu');

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

      document.addEventListener('click', (e) => {
        if (optionsMenu && optionsMenu.classList.contains('is-open')) {
          const wrapper = document.querySelector('.options-menu-wrapper');
          if (wrapper && !wrapper.contains(e.target)) toggleOptions(false);
        }
      });

      document.getElementById('opt-btn-mode-dark')?.addEventListener('click', () => {
        this.themeMode = 'dark'; this.theme = 'dark';
        localStorage.setItem('obsidian_theme_mode', 'dark');
        this.applyPreferences();
        this.showToast('Cosmic dark mode activated');
      });

      document.getElementById('opt-btn-mode-light')?.addEventListener('click', () => {
        this.themeMode = 'light'; this.theme = 'light';
        localStorage.setItem('obsidian_theme_mode', 'light');
        this.applyPreferences();
        this.showToast('Crisp light mode activated');
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
      document.getElementById('header-search-bar-trigger')?.addEventListener('click', triggerSearch);
      document.getElementById('header-search-bar-trigger')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); triggerSearch(); }
      });

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
      
      let contentTitle = '';
      const noteObj = this.allNotes.find(n => n.path === relPath);
      if (noteObj) {
        contentTitle = noteObj.title; 
      } else if (window.ObsidianWikiLinks) {
        contentTitle = window.ObsidianWikiLinks.resolveSmartLabel(relPath.split('/').pop().replace(/\.md$/i, ''), null, null, this.manifest, this.nameMap, this.vaultLookup);
      } else {
        contentTitle = relPath.split('/').pop().replace(/\.md$/i, '').replace(/-/g, ' ');
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
          <div class="note-real-filename" style="font-family: var(--font-mono); color: var(--text-muted); font-size: 0.85rem; margin-bottom: 8px;">${this.escapeHtml(realFileName)}</div>
          <h1 class="inline-title">${this.escapeHtml(contentTitle)}</h1>
          ${propertiesBlockHtml}
          ${renderedHtml}
        </article>
      `;

      this.setupReadingTimeTracking(readingTime);
      this.initInteractiveWidgets();
      this.buildTableOfContents();
      this.buildBacklinks(relPath);
      
      this.updateBreadcrumbs(this.formatFolderTitle(this.currentFolder), realFileName);
      if (this.sidebarGraph) this.sidebarGraph.updateFocus(relPath, this.graphMode);
    }

    preprocessObsidianMarkdown(text) {
      if (window.ObsidianCallouts) text = window.ObsidianCallouts.autoHealCallouts(text);
      text = text.replace(/^(#{1,6})([^\s#\n\r].*)$/gm, '$1 $2');

      if (window.ObsidianMathRenderer) window.ObsidianMathRenderer.reset();
      if (window.ObsidianCallouts) window.ObsidianCallouts.reset();
      if (window.ObsidianWikiLinks) window.ObsidianWikiLinks.reset();

      const codeBlocksMap = new Map();
      let codeBlockIdx = 0;
      text = text.replace(/```[\s\S]*?```/g, (match) => {
        const token = `@@OBS_FENCED_BLOCK_${codeBlockIdx++}@@`;
        codeBlocksMap.set(token, match);
        return token;
      });

      text = text.replace(/`[^`\n\r]+`/g, (match) => {
        const token = `@@OBS_INLINE_CODE_${codeBlockIdx++}@@`;
        codeBlocksMap.set(token, match);
        return token;
      });

      text = text.replace(/%%[\s\S]*?%%/g, '');
      text = text.replace(/(?<!\$)\$\\\$[ \t]*(\d[\d,]*(?:\.\d+)?(?:\s*(?:million|billion|trillion|USD|EUR|GBP|k|m|b))?)\$(?!\$)/gi, '&#36;$1');

      if (window.ObsidianCallouts) {
        text = window.ObsidianCallouts.processCallouts(text, codeBlocksMap);
      }

      if (window.ObsidianMathRenderer) {
        text = window.ObsidianMathRenderer.extractAndTokenize(text);
      }

      text = text.replace(/(?<![\$\w\\])(?:\\\$|\$)[ \t]*(\d[\d,]*(?:\.\d+)?(?:\s*(?:million|billion|trillion|USD|EUR|GBP|k|m|b))?)(?!\$|\w)/gi, '&#36;$1');
      text = text.replace(/\\(\$)/g, '&#36;');

      if (window.ObsidianWikiLinks) {
        text = window.ObsidianWikiLinks.extractFootnotes(text);
        text = window.ObsidianWikiLinks.processMarkdownFeatures(text, {
          currentFolder: this.currentFolder,
          currentPath: this.currentPath,
          manifest: this.manifest,
          vaultLookup: this.vaultLookup,
          nameMap: this.nameMap,
          allNotes: this.allNotes
        });
      }

      for (const [token, codeContent] of codeBlocksMap.entries()) {
        text = text.replaceAll(token, codeContent);
      }

      return text;
    }

    postprocessObsidianHtml(html) {
      if (window.ObsidianCallouts) {
        html = window.ObsidianCallouts.postprocessHtml(html);
      }

      if (window.ObsidianMathRenderer) {
        html = window.ObsidianMathRenderer.restoreTokens(html);
      }

      if (window.ObsidianWikiLinks) {
        html += window.ObsidianWikiLinks.renderFootnotesHtml();
      }

      html = html.replace(/<h([1-6])([^>]*)id="([^"]*)"([^>]*)>/gi, (match, level, before, id, after) => {
        let cleanId = id.replace(/-?katex_(inline|block)_\d+/gi, '').replace(/-+$/, '').replace(/^-+/, '');
        if (!cleanId) cleanId = `heading-${level}`;
        return `<h${level}${before}id="${cleanId}"${after}>`;
      });

      html = html.replaceAll('&#36;', '$');
      return html;
    }

    async initInteractiveWidgets() {
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

      if (window.ObsidianCallouts) {
        window.ObsidianCallouts.initInteractions(document.getElementById('note-article') || document);
      }

      if (window.ObsidianMermaidRenderer) {
        window.ObsidianMermaidRenderer.renderAll(document.getElementById('note-article') || document, this.themeMode === 'dark');
      }

      if (window.ObsidianMediaPreview) {
        window.ObsidianMediaPreview.attachCornerButtons(document.getElementById('note-article') || document);
      }
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

    setupTocGlobalControls() {
      const btnToggleAll = document.getElementById('btn-toc-collapse-expand-all');
      if (btnToggleAll && !btnToggleAll._bound) {
        btnToggleAll._bound = true;
        btnToggleAll.addEventListener('click', () => {
          const allChildren = document.querySelectorAll('#toc-container .toc-children');
          const allTwists = document.querySelectorAll('#toc-container .toc-twisty-btn');
          if (!allChildren.length) return;

          const allOpen = Array.from(allChildren).every(el => !el.classList.contains('is-collapsed'));
          allChildren.forEach(el => el.classList.toggle('is-collapsed', allOpen));
          allTwists.forEach(btn => {
            btn.classList.toggle('is-collapsed', allOpen);
            btn.setAttribute('aria-expanded', !allOpen);
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

      const showPreview = async (targetPath, linkText, rawHref, e) => {
        clearTimeout(hideTimeout);
        if (!targetPath && !rawHref) return;

        const isExternal = Boolean(rawHref && (rawHref.startsWith('http://') || rawHref.startsWith('https://')));
        let title = linkText || 'Embedded Link';
        let bodyHtml = '';

        if (isExternal) {
          let domain = 'external';
          try { domain = new URL(rawHref).hostname.replace(/^www\./, ''); } catch (err) {}
          title = linkText || domain;
          bodyHtml = `
            <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-normal); margin-bottom: 4px;">${this.escapeHtml(title)}</div>
            <div style="font-size: 0.76rem; color: var(--text-muted); word-break: break-all; margin-bottom: 10px;">${this.escapeHtml(rawHref)}</div>
            <a href="${rawHref}" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; font-size: 0.76rem; background: var(--interactive-accent-subtle); color: var(--interactive-accent); border-radius: 4px; text-decoration: none; font-weight: 600;">
              <span>Open Link in New Tab</span>
            </a>
          `;
        } else {
          const cleanPath = (targetPath || '').replace(/^#/, '').replace(/^\.\//, '');
          const note = this.allNotes.find(n => {
            const nTitle = n.originalName || n.title || n.fileNameWithoutExt || '';
            return n.path === cleanPath || n.path.endsWith(cleanPath) || nTitle.toLowerCase() === cleanPath.toLowerCase();
          });
          if (note) {
            title = note.title || note.originalName || note.fileNameWithoutExt || cleanPath;
            let content = await this.prefetchNote(note.path);
            let snippetHtml = '<p style="color: var(--text-muted); font-size: 0.8rem; margin: 0;">No preview text available.</p>';
            if (content) {
              let body = content.replace(/^---[\s\S]*?---\s*/, '').trim();
              const headParagraphs = body.split(/\n\s*\n/).filter(p => p.trim().length > 0);
              let headSection = headParagraphs.slice(0, 2).join('\n\n');
              if (headSection.length > 300) headSection = headSection.substring(0, 300) + '...';
              headSection = headSection.replace(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => alias || target);
              
              if (typeof marked !== 'undefined') {
                try { snippetHtml = marked.parse(headSection); } catch (err) { snippetHtml = `<p>${headSection}</p>`; }
              } else snippetHtml = `<p>${headSection}</p>`;
            }

            bodyHtml = `
              <div class="preview-markdown-head" style="margin-bottom: 10px; font-size: 0.82rem; line-height: 1.55; max-height: 140px; overflow: hidden; position: relative;">
                ${snippetHtml}
              </div>
              <a href="#${note.path}" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; font-size: 0.76rem; background: var(--interactive-accent-subtle); color: var(--interactive-accent); border-radius: 4px; text-decoration: none; font-weight: 600;">
                <span>Jump to Note</span>
              </a>
            `;
          } else {
            title = linkText || 'Internal Reference';
            bodyHtml = `<div style="font-size: 0.8rem; color: var(--text-muted);">Reference: ${this.escapeHtml(targetPath || rawHref)}</div>`;
          }
        }

        previewEl.innerHTML = `
          <div class="preview-popover-header">
            <div class="preview-popover-title">
              <span class="preview-title-text">${this.escapeHtml(title)}</span>
            </div>
            <div class="preview-popover-actions">
              <button class="preview-action-btn preview-close-btn" type="button" aria-label="Close preview">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          </div>
          <div class="preview-popover-body">${bodyHtml}</div>
        `;

        previewEl.querySelector('.preview-close-btn')?.addEventListener('click', () => {
          previewEl.style.display = 'none';
        });

        const x = Math.min(window.innerWidth - 360, Math.max(16, e.clientX + 14));
        const y = Math.min(window.innerHeight - 260, Math.max(16, e.clientY + 18));
        previewEl.style.left = `${x}px`;
        previewEl.style.top = `${y}px`;
        previewEl.style.display = 'flex';
        previewEl.classList.add('is-visible');

        clearTimeout(dismissTimeout);
        dismissTimeout = setTimeout(() => {
          if (!this.isPreviewPinned) {
            previewEl.classList.remove('is-visible');
            previewEl.style.display = 'none';
          }
        }, 5000);
      };

      const hidePreview = () => {
        if (this.isPreviewPinned) return;
        hideTimeout = setTimeout(() => {
          if (!this.isPreviewPinned) {
            previewEl.classList.remove('is-visible');
            previewEl.style.display = 'none';
          }
        }, 200);
      };

      document.addEventListener('mouseover', (e) => {
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
        clearTimeout(dismissTimeout);
        dismissTimeout = setTimeout(() => {
          previewEl.classList.remove('is-visible');
          previewEl.style.display = 'none';
        }, 1500);
      });
    }

    setupMediaPreview() {
      if (window.ObsidianMediaPreview) {
        window.ObsidianMediaPreview.setup();
      }
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

        let renderedValHtml = '';
        if (Array.isArray(rawVal)) {
          if (key.toLowerCase() === 'tags' || key.toLowerCase() === 'tag') {
            renderedValHtml = rawVal.map(t => `<span class="metadata-tag">#${this.escapeHtml(String(t).replace(/^#/, ''))}</span>`).join(' ');
          } else {
            renderedValHtml = rawVal.map(v => `<span class="metadata-pill">${this.escapeHtml(String(v))}</span>`).join(' ');
          }
        } else if (typeof rawVal === 'string') {
          renderedValHtml = `<span class="metadata-property-value-text">${this.escapeHtml(rawVal)}</span>`;
        } else {
          renderedValHtml = `<span class="metadata-property-value-text">${this.escapeHtml(String(rawVal))}</span>`;
        }

        html += `
          <div class="metadata-property" data-property-key="${this.escapeHtml(key)}">
            <div class="metadata-property-key">
              <span class="metadata-property-key-text">${this.escapeHtml(key)}</span>
            </div>
            <div class="metadata-property-value">${renderedValHtml}</div>
          </div>
        `;
      }

      html += `</div></div>`;
      return html;
    }

    async loadVaultNotes() {
      const manifestPaths = ['../../site-lib/vault-manifest.json', '../site-lib/vault-manifest.json', './site-lib/vault-manifest.json', 'site-lib/vault-manifest.json', '/site-lib/vault-manifest.json'];
      let manifest = [];
      for (const p of manifestPaths) {
        try {
          const res = await fetch(p);
          if (res.ok) { manifest = await res.json(); break; }
        } catch (e) {}
      }
      this.manifest = manifest;

      const nameMap = {};
      manifest.forEach(item => {
        nameMap[item.slugPath] = item.originalName;
        if (item.type === 'file') {
          const stem = item.slugPath.split('/').pop().replace(/\.md$/i, '');
          nameMap[stem] = item.originalName;
          nameMap[item.originalPath] = item.slugPath;
        }
      });
      this.nameMap = nameMap;

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

    formatFolderTitle(folderKey) {
      if (window.ObsidianWikiLinks) {
        return window.ObsidianWikiLinks.resolveSmartLabel(null, null, folderKey, this.manifest, this.nameMap, this.vaultLookup);
      }
      return folderKey.replace(/[-_]/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
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
          const folderLabel = window.ObsidianWikiLinks ? window.ObsidianWikiLinks.resolveSmartLabel(null, null, key, this.manifest, this.nameMap, this.vaultLookup) : key;
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
        folder.querySelector(':scope > .tree-item-children')?.classList.add('is-hidden');
        folder.querySelector(':scope > .folder-item .tree-item-icon')?.classList.add('is-collapsed');
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
          parent.querySelector(':scope > .tree-item-children')?.classList.remove('is-hidden');
          parent.querySelector(':scope > .folder-item .tree-item-icon')?.classList.remove('is-collapsed');
          parent = parent.parentElement?.closest('.nav-folder');
        }
        setTimeout(() => {
          matchedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }, 50);
      }
    }

    setupGraph() {
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

      if (btnGlobal) btnGlobal.classList.toggle('is-active', this.graphMode === 'global');
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
        const pathParts = item.originalPath.split('/');
        const breadcrumbs = pathParts.slice(0, -1).join(' > ');
        const highlightedPath = this.highlightSearchMatch(breadcrumbs, q);

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
        const key = String(issue.file || '').replaceAll('\\', '/').replace(/^\.\//, '');
        const issues = this.healthIssuesByFile.get(key) || [];
        issues.push(issue);
        this.healthIssuesByFile.set(key, issues);
      }
      this.updateNoteHealthBadges();

      const badge = document.getElementById('vault-health-badge');
      if (badge && data.summary) {
        badge.innerText = `${data.summary.healthScore}%`;
        badge.classList.toggle('has-warnings', data.summary.totalIssues > 0 && data.summary.cleanFiles < data.summary.totalFiles);
      }
    }

    updateNoteHealthBadges() {
      document.querySelectorAll('.tree-item-self.note-item').forEach(noteElement => {
        const note = this.allNotes.find(item => item.path === noteElement.dataset.notePath);
        const icon = noteElement.querySelector('.note-health-icon');
        if (!note || !icon) return;

        const key = String(note.fullPath || note.originalPath || note.path).replaceAll('\\', '/').replace(/^\.\//, '');
        const issues = this.healthIssuesByFile.get(key) || [];
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
      this.readingStats = { totalMinutes };
    }

    downloadMarkdownFile(title, path, rawMarkdown) {
      const content = rawMarkdown || this.activeNoteRawMarkdown || '';
      if (!content) {
        this.showToast('No markdown content available to download');
        return;
      }
      
      let displayName = this.activeNoteOriginalName || title || 'Obsidian-Note';
      if (!displayName.toLowerCase().endsWith('.md')) displayName += '.md';
      
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
        document.getElementById('count-all').innerText = issues.length;
        document.getElementById('count-math').innerText = issues.filter(i => i.category === 'LaTeX / Math').length;
        document.getElementById('count-links').innerText = issues.filter(i => i.category === 'WikiLink').length;
        document.getElementById('count-media').innerText = issues.filter(i => i.category === 'Media Embed').length;
        document.getElementById('count-callout').innerText = issues.filter(i => i.category === 'Callout' || i.category === 'Markdown Syntax').length;

        this.renderHealthIssues('all');

        modal.querySelectorAll('.health-filter-btn').forEach(btn => {
          btn.onclick = () => {
            modal.querySelectorAll('.health-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            this.renderHealthIssues(btn.getAttribute('data-filter'));
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
      `;

      const modal = document.createElement('div');
      modal.style.cssText = `
        background: var(--background-primary, #1e1e1e);
        padding: 40px; border-radius: 20px; border: 1px solid var(--background-modifier-border, rgba(255,255,255,0.1));
        box-shadow: 0 32px 64px rgba(0,0,0,0.6);
        display: flex; flex-direction: column; align-items: center;
        position: relative; width: 90%; max-width: 400px;
      `;

      const closeBtn = document.createElement('button');
      closeBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
      closeBtn.style.cssText = `
        position: absolute; top: 16px; right: 16px;
        width: 32px; height: 32px; border-radius: 50%;
        background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.05);
        color: #b3b3b3; cursor: pointer; display: flex; justify-content: center; align-items: center;
      `;
      closeBtn.onclick = () => overlay.remove();

      const title = document.createElement('h2');
      title.innerText = "Protected Note";
      title.style.cssText = "margin: 0 0 12px 0; font-size: 1.5rem; font-weight: 600; color: var(--text-normal, #e8e8e8);";

      const input = document.createElement('input');
      input.type = "password";
      input.placeholder = "Access Token";
      input.style.cssText = `
        width: 100%; box-sizing: border-box;
        background: var(--background-secondary, rgba(255, 255, 255, 0.05));
        border: 1px solid var(--background-modifier-border, rgba(255, 255, 255, 0.2));
        padding: 14px 18px; border-radius: 10px; color: white; font-size: 1rem;
        text-align: center; outline: none; margin-top: 16px;
      `;

      modal.appendChild(closeBtn);
      modal.appendChild(title);
      modal.appendChild(input);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      input.addEventListener('input', (e) => {
        if (e.target.value === expectedToken) {
          overlay.remove();
          if (onUnlock) onUnlock();
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

        activeNodes = this.data.nodes.filter(n => visited.has(n.id));
        activeLinks = this.data.links.filter(l => {
          const s = typeof l.source === 'object' ? l.source.id : l.source;
          const t = typeof l.target === 'object' ? l.target.id : l.target;
          return visited.has(s) && visited.has(t);
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

    start() {
      if (!this.isRunning) {
        this.isRunning = true;
        const step = () => {
          if (!this.isRunning) return;
          const settled = this.tickPhysics();
          this.render();
          if (settled) {
            this.stop();
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
        b.vx += fx; b.vy += fy;
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
        link: 'rgba(76, 86, 106, 0.45)',
        linkActive: 'rgba(136, 192, 208, 0.9)',
        nodeDefault: '#88c0d0',
        focused: '#bf616a',
        hovered: '#d08770',
        badgeBg: 'rgba(46, 52, 64, 0.85)',
        badgeFg: '#eceff4'
      } : {
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
        ctx.fillStyle = isFocused ? p.focused : (isHovered ? p.hovered : (node.color || p.nodeDefault));
        ctx.fill();

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

  window.ObsidianVaultApp = ObsidianVaultApp;

  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('note-container') || document.querySelector('.obsidian-workspace')) {
      window.ObsidianApp = new ObsidianVaultApp();
    }
  });
})();
