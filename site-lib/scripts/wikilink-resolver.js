/**
 * ============================================================================
 * Obsidian Dedicated WikiLink & Media Resolver Engine (wikilink-resolver.js)
 * Resolves [[Note]], [[Note|Label]], [[#Heading]], [[Note#Heading]],
 * ![[Media.svg]] & ![[Image.png|width]], tags (#tag), footnotes ([^1]),
 * block anchors (^id), task checkboxes (- [ ] / - [x]), and text highlights (==text==).
 * ============================================================================
 */

(function() {
  'use strict';

  class ObsidianWikiLinkResolver {
    constructor() {
      this.currentFootnotesMap = new Map();
    }

    reset() {
      this.currentFootnotesMap = new Map();
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

    /**
     * Resolve media / SVG embed paths with 100% precision across nested vault folders
     */
    resolveMediaPath(rawEmbed, currentFolder, currentNotePath, manifest = [], vaultLookup = {}) {
      if (!rawEmbed) return '';
      if (rawEmbed.startsWith('http://') || rawEmbed.startsWith('https://') || rawEmbed.startsWith('/')) {
        return rawEmbed;
      }

      let cleanFile = rawEmbed.trim().replace(/^\.\//, '');
      if (/^BBA Study\//i.test(cleanFile)) {
        cleanFile = cleanFile.replace(/^BBA Study\//i, '');
      }

      const stem = cleanFile.split('/').pop();
      const slugStem = this.slugifyPart(stem, false);

      // 1. Precise match in manifest
      if (Array.isArray(manifest) && manifest.length > 0) {
        const found = manifest.find(m => 
          (m.originalPath && m.originalPath.toLowerCase() === cleanFile.toLowerCase()) ||
          (m.slugPath && m.slugPath.toLowerCase() === cleanFile.toLowerCase()) ||
          (m.originalName && m.originalName.toLowerCase() === stem.toLowerCase()) ||
          (m.slugPath && m.slugPath.toLowerCase().endsWith('/' + slugStem.toLowerCase())) ||
          (m.slugPath && m.slugPath.toLowerCase().endsWith('/' + stem.toLowerCase()))
        );

        if (found) {
          const targetSlug = found.slugPath;
          const targetPlanet = found.planetSlug;
          if (targetPlanet === currentFolder) {
            const rel = targetSlug.startsWith(currentFolder + '/') ? targetSlug.substring(currentFolder.length + 1) : targetSlug;
            return `./${rel}`;
          } else {
            return `../${targetSlug}`;
          }
        }
      }

      // 2. Lookup check
      if (vaultLookup && vaultLookup[stem]) {
        const entry = vaultLookup[stem];
        if (entry.folder === currentFolder && entry.relInFolder) {
          return `./${entry.relInFolder}`;
        }
      }

      // 3. Normalized path fallback
      let isVaultRoot = false;
      const folderPrefix = `${currentFolder}/`;
      if (cleanFile.toLowerCase().startsWith(folderPrefix.toLowerCase())) {
        cleanFile = cleanFile.substring(folderPrefix.length);
        isVaultRoot = true;
      }

      const noteDirectory = isVaultRoot ? [] : (currentNotePath || '').split('/').slice(0, -1);
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

      if (normalizedParts[0] === currentFolder) {
        normalizedParts.shift();
      }

      return `./${normalizedParts.join('/')}`;
    }

    /**
     * Resolve Obsidian WikiLinks [[Note]] with local-first precedence and global fallback
     */
    resolveWikiLink(noteName, currentFolder, allNotes = [], vaultLookup = {}, nameMap = {}) {
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

      // 1. LOCAL-FIRST SEARCH
      let localFound = allNotes.find(n => {
        if (n.folder !== currentFolder) return false;
        const nClean = n.path.replace(/\.md$/i, '').toLowerCase();
        const nStem = nClean.split('/').pop();
        const nTitle = n.title || n.originalName || n.fileNameWithoutExt || '';
        return nClean === clean || slugifyText(nClean) === slugified || nStem === stem || slugifyText(nStem) === stemSlugified || nTitle.toLowerCase() === clean || slugifyText(nTitle) === slugified;
      });

      if (localFound) {
        const resolvedTitle = localFound.originalName || localFound.title || localFound.fileNameWithoutExt || this.resolveSmartLabel(stem, localFound.fileName, null, null, nameMap, vaultLookup);
        return { path: localFound.path, resolved: true, title: resolvedTitle };
      }

      // 2. GLOBAL VAULT LOOKUP
      if (vaultLookup) {
        const match = vaultLookup[raw] || vaultLookup[clean] || vaultLookup[slugified] || vaultLookup[stem] || vaultLookup[stemSlugified] || vaultLookup[alphaOnly];
        if (match) {
          const targetFolder = match.folder;
          const targetRel = match.relInFolder;
          const resolvedTitle = nameMap[stem] || match.title || this.resolveSmartLabel(stem, null, null, null, nameMap, vaultLookup);
          if (targetFolder !== currentFolder) {
            return { path: `../${targetFolder}/#${encodeURIComponent(targetRel)}`, resolved: true, title: resolvedTitle, isCrossFolder: true };
          }
          return { path: targetRel, resolved: true, title: resolvedTitle };
        }
      }

      // 3. UNRESOLVED DEAD LINK
      return { path: 'javascript:void(0)', resolved: false, title: this.resolveSmartLabel(stem, null, null, null, nameMap, vaultLookup) || raw };
    }

    resolveSmartLabel(stem, fileName, folderName, manifest = [], nameMap = {}, vaultLookup = {}) {
      if (folderName) {
        if (nameMap && nameMap[folderName]) return nameMap[folderName];
        if (Array.isArray(manifest)) {
          const match = manifest.find(i => i.type === 'folder' && (i.slugPath === folderName || i.slugPath.endsWith('/' + folderName)));
          if (match) return match.originalName;
        }
        return folderName.replace(/[-_]/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }

      const s = stem || '';
      if (Array.isArray(manifest)) {
        const match = manifest.find(i => i.type === 'file' && (i.slugPath.endsWith(s + '.md') || i.slugPath === s || i.originalName === s));
        if (match) return match.originalName;
      }

      if (s && nameMap && nameMap[s]) {
        return nameMap[s].replace(/\.md$/i, '');
      }

      if (vaultLookup && vaultLookup[s] && vaultLookup[s].originalName) {
        return vaultLookup[s].originalName;
      }

      if (s.toLowerCase() === 'index') return 'Overview';
      return s.replace(/-/g, ' ');
    }

    /**
     * Process internal markdown features: highlights, block anchors, media embeds, wikilinks, tags, checkboxes
     */
    processMarkdownFeatures(text, context = {}) {
      if (!text) return '';
      const currentFolder = context.currentFolder || (window.ObsidianApp ? window.ObsidianApp.currentFolder : '5th-semester');
      const currentPath = context.currentPath || (window.ObsidianApp ? window.ObsidianApp.currentPath : '');
      const manifest = context.manifest || (window.ObsidianApp ? window.ObsidianApp.manifest : []);
      const vaultLookup = context.vaultLookup || (window.ObsidianApp ? window.ObsidianApp.vaultLookup : {});
      const nameMap = context.nameMap || (window.ObsidianApp ? window.ObsidianApp.nameMap : {});
      const allNotes = context.allNotes || (window.ObsidianApp ? window.ObsidianApp.allNotes : []);

      // Highlights: ==text==
      text = text.replace(/==([^=\n]+)==/g, '<mark>$1</mark>');

      // Block anchors: ^anchor-id
      text = text.replace(/\s+\^([a-zA-Z0-9\-]+)$/gm, ' <span id="$1" class="obsidian-block-anchor"></span>');

      // Embedded Media & Notes: ![[file|opts]]
      text = text.replace(/!\[\[([^\]\n]+)\]\]/g, (match, inner) => {
        let [file, opt] = inner.split('|').map(s => s ? s.trim() : '');
        const cleanFile = file.trim();

        if (/\.(png|jpe?g|gif|svg|webp|bmp|mp4|webm|mov)$/i.test(cleanFile)) {
          const resolvedSrc = this.resolveMediaPath(cleanFile, currentFolder, currentPath, manifest, vaultLookup);
          const isSvg = /\.svg$/i.test(cleanFile) || /\.svg$/i.test(resolvedSrc);
          let style = 'max-width: 100%; border-radius: 6px;';
          if (opt && /^\d+$/.test(opt)) style += ` width: ${opt}px;`;
          const alt = opt && !/^\d+$/.test(opt) ? opt : cleanFile;

          return `
            <figure class="obsidian-media-embed" data-media-type="${isSvg ? 'svg' : 'image'}">
              <img src="${resolvedSrc}" alt="${this.escapeHtml(alt)}" style="${style}" loading="lazy" onerror="if(!this._retried){this._retried=true;this.src='../site-lib/media/placeholder.svg';}" />
            </figure>
          `;
        }

        const res = this.resolveWikiLink(cleanFile, currentFolder, allNotes, vaultLookup, nameMap);
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
              <a class="internal-link ${isResolved ? 'is-resolved' : 'is-unresolved'}" href="${targetHref}">${this.escapeHtml(res.title || cleanFile)}</a>
            </div>
          </div>
        `;
      });

      // WikiLinks: [[file|label]]
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
          return `<a class="internal-link anchor-link" href="#heading-${slug}" data-heading="${slug}">${this.escapeHtml(display)}</a>`;
        }

        let noteName = notePart;
        let heading = '';
        if (notePart.includes('#')) {
          const parts = notePart.split('#');
          noteName = parts[0].trim();
          heading = parts.slice(1).join('#').trim();
        }

        const res = this.resolveWikiLink(noteName, currentFolder, allNotes, vaultLookup, nameMap);
        const display = label || (heading ? `${res.title || noteName} > ${heading}` : (res.title || noteName));
        const isResolved = Boolean(res.resolved);
        let targetHref = res.path;
        if (!res.isCrossFolder) {
          const targetHash = heading ? `${res.path}#heading-${heading.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : res.path;
          targetHref = `#${encodeURIComponent(targetHash)}`;
        }

        return `<a class="internal-link ${isResolved ? 'is-resolved' : 'is-unresolved'}" href="${targetHref}" data-note-path="${res.path}" title="${isResolved ? `Open: ${this.escapeHtml(display)}` : `Unresolved note: ${this.escapeHtml(noteName)}`}">${this.escapeHtml(display)}</a>`;
      });

      // Tags: #tag
      text = text.replace(/(^|[\s(])#([a-zA-Z0-9_\-\/]+)(?=[\s).,;:!?]|$)/g, '$1<span class="obsidian-tag">#$2</span>');

      // Task checkboxes
      text = text.replace(/^(\s*)-\s+\[ \]\s+(.*)$/gm, '$1- <input type="checkbox" disabled class="task-checkbox"> $2');
      text = text.replace(/^(\s*)-\s+\[x\]\s+(.*)$/gim, '$1- <input type="checkbox" checked disabled class="task-checkbox"> $2');

      return text;
    }

    /**
     * Process footnotes: [^1]: Footnote body & [^1] in text
     */
    extractFootnotes(text) {
      this.currentFootnotesMap = new Map();
      text = text.replace(/^\[\^([a-zA-Z0-9_\-]+)\]:\s*([^\n]+(?:\n(?!\n|\[\^|\#|\-|\*).*)*)/gm, (match, fnId, fnContent) => {
        this.currentFootnotesMap.set(fnId, fnContent.trim());
        return '';
      });

      text = text.replace(/\[\^([a-zA-Z0-9_\-]+)\]/g, (match, fnId) => {
        return `<sup class="footnote-ref" id="fnref-${fnId}"><a href="#fn-${fnId}" class="footnote-link" title="Jump to footnote">[^${fnId}]</a></sup>`;
      });

      return text;
    }

    renderFootnotesHtml() {
      if (!this.currentFootnotesMap || this.currentFootnotesMap.size === 0) return '';
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
      return fnHtml;
    }
  }

  window.ObsidianWikiLinks = new ObsidianWikiLinkResolver();
})();
