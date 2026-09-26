# 🌌 Shared Obsidian Notes & Digital Garden Workspace

A high-performance, platform-independent interactive digital garden and publishing workspace tailored for personal knowledge management (PKM), course notes, mathematical study guides, and visual diagrams. Built to work seamlessly with Obsidian vaults across Windows, macOS, and Linux.

---

## 📑 Table of Contents

- [Overview & Architecture](#-overview--architecture)
- [Workspace Directory Structure](#-workspace-directory-structure)
- [Media, SVGs & Asset Management](#-media-svgs--asset-management)
  - [Folder Naming: Does it have to be `assets`?](#folder-naming-does-it-have-to-be-assets)
  - [Supported Embedding Syntaxes](#supported-embedding-syntaxes)
  - [Interactive Vector SVG Lightbox](#interactive-vector-svg-lightbox)
- [Core Engines & Capabilities](#-core-engines--capabilities)
  - [1. Authentic Obsidian Callouts](#1-authentic-obsidian-callouts)
  - [2. Dedicated WikiLink & Reference Resolver](#2-dedicated-wikilink--reference-resolver)
  - [3. KaTeX LaTeX Mathematics](#3-katex-latex-mathematics)
  - [4. Mermaid Diagramming](#4-mermaid-diagramming)
  - [5. Vault Health Linter & Auto-Fixer](#5-vault-health-linter--auto-fixer)
- [Quick Start Guide](#-quick-start-guide)
- [Obsidian Vault Sync Workflows](#-obsidian-vault-sync-workflows)
  - [1. Automated One-Time Sync](#1-automated-one-time-sync)
  - [2. Live Real-Time Watcher](#2-live-real-time-watcher)
  - [3. Manual Vault Management](#3-manual-vault-management)
- [Configuration Reference (`locations.json`)](#-configuration-reference-locationsjson)
  - [Configuration Schema & Properties](#configuration-schema--properties)
  - [Exclusion Strategy & Rules](#exclusion-strategy--rules)
- [Cross-Platform Sanitization & Slug Engine](#-cross-platform-sanitization--slug-engine)
- [Scripts & Command Reference](#-scripts--command-reference)
- [GitHub Authentication & Obsidian Sync](#-github-authentication--obsidian-sync)
- [Deployment Guide](#-deployment-guide)

---

## 🌟 Overview & Architecture

This repository acts as a published digital garden mirroring selected folders from your local Obsidian vault without any proprietary vendor lock-in.

- **`note-res/` Single Source of Truth:** Stores all synchronized markdown notes, syllabi, previous year questions (PYQs), study roadmaps, and visual SVG diagrams.
- **Dynamic & Static Dual Mode:** Functions as both a static export (ready for GitHub Pages or static web hosts with `.nojekyll`) and an interactive Node.js / Express workspace server with live API discovery.
- **Modular Client Architecture:** Clean separation of concerns with standalone runtime scripts for Callouts, WikiLinks, Math, Mermaid diagrams, and Media previewing in `site-lib/scripts/`.

---

## 📂 Workspace Directory Structure

```text
├── locations.json              # Core path mapping, sync configuration & exclusion rules
├── note-res/                   # Primary container for all active notes and study folders
│   ├── 4th Semester/           # BCC course notes, PYQs, and solution guides
│   ├── 5th Semester/           # ACC course notes, syllabi, and raw PYQ collections
│   └── AI Curated Notes/       # Structured notes, phase roadmaps, and SVG assets
├── site-lib/                   # Client runtime assets & engines
│   ├── vault-manifest.json     # Complete manifest mapping original paths to slugs
│   ├── vault-index.json        # Index of all active notes, folders, and lookup tables
│   ├── name-map.json           # Human-readable title mapping
│   ├── html/viewer.html        # Single-page folder viewer template
│   ├── styles/                 # Workspace styling (workspace.css, theme.css, app-custom.css)
│   └── scripts/                # Dedicated modular runtime engines
│       ├── app-reader.js       # Main note reader application controller
│       ├── callout-renderer.js # Obsidian callout engine with folding and icons
│       ├── wikilink-resolver.js# WikiLinks, embeds, tags, footnotes & highlights
│       ├── math-renderer.js    # KaTeX inline and display math processor
│       ├── media-preview.js    # SVG vector & image interactive pan/zoom lightbox
│       └── mermaid-renderer.js # Live Mermaid diagram generator
├── generate_index.py           # Rebuilds search indexes, name maps & viewer pages
├── sync_site.py                # Automated multi-pass sync & manifest builder
├── vault_linter.py             # Vault diagnostic, syntax validator & auto-fixer
├── server.js                   # Node.js / Express workspace server
├── metadata.json               # AI Studio applet metadata & configuration
└── package.json                # Node.js project manifest and scripts
```

---

## 🖼️ Media, SVGs & Asset Management

### Folder Naming: Does it have to be `assets`?

**No, the folder does NOT strictly have to be named `assets`.**

The sync engine (`sync_site.py`) and the resolver engine (`wikilink-resolver.js`) are designed with maximum flexibility:

1. **Any Folder Name Supported:** You can store your SVGs and media in `assets/`, `attachments/`, `images/`, `media/`, `diagrams/`, `figures/`, or directly in the same directory as your markdown notes.
2. **Automatic Global Discovery:** When `sync_site.py` runs, it indexes all media assets (`.svg`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, etc.) into `site-lib/vault-manifest.json` and copies them to `note-res/`.
3. **Three-Tier Resolution:** When a note references an asset, `wikilink-resolver.js` resolves it using:
   - Exact filename match in the manifest.
   - Global vault lookup index.
   - Relative normalized path fallback.

> **Tip for Obsidian Configuration:** In Obsidian **Settings → Files and links → Default location for new attachments**, you can use whatever structure you prefer (e.g. *In subfolder under current folder* with subfolder name `assets` or `attachments`).

### Supported Embedding Syntaxes

You can embed SVGs and images using any standard Obsidian or Markdown notation:

- **Obsidian WikiLink Embeds:**
  ```markdown
  ![[financial-curves.svg]]
  ![[assets/financial-curves.svg]]
  ![[npv-profile.svg|650]]          <!-- With custom width in pixels -->
  ![[sml-plot.svg|Capital Asset Pricing Model]] <!-- With custom caption -->
  ```
- **Standard Markdown Embeds:**
  ```markdown
  ![Financial Curves](assets/financial-curves.svg)
  ![NPV Profile](./diagrams/npv-profile.svg)
  ```

### Interactive Vector SVG Lightbox

All rendered SVGs and images include an interactive corner expand button. Clicking the button opens the dedicated vector lightbox (`site-lib/scripts/media-preview.js`) featuring:
- **Vector-Fidelity Rendering:** SVGs are rendered as pure vectors (not rasterized), ensuring crisp lines at any zoom level.
- **Smooth Navigation:** Mouse drag-to-pan, cursor-anchored wheel zoom (0.2x to 6.0x), and touch gestures (single-finger pan, 2-finger pinch zoom, double-tap reset).
- **Floating Controls:** Zoom In (`+`), Zoom Out (`-`), Reset to 100% (`0`), and instant SVG / Image Download.

---

## ⚡ Core Engines & Capabilities

### 1. Authentic Obsidian Callouts
Supported by `site-lib/scripts/callout-renderer.js`:
- **Standard Types:** `[!note]`, `[!abstract]`, `[!info]`, `[!todo]`, `[!tip]`, `[!success]`, `[!question]`, `[!warning]`, `[!failure]`, `[!danger]`, `[!bug]`, `[!example]`, `[!quote]`.
- **Foldable Callouts:** `[!type]+` (expanded by default) and `[!type]-` (collapsed by default) with smooth fold/expand animations and chevron toggles.
- **Rich Content Support:** Nested KaTeX math (`$...$`), WikiLinks (`[[...]]`), code blocks, and lists inside callout bodies and titles.

### 2. Dedicated WikiLink & Reference Resolver
Supported by `site-lib/scripts/wikilink-resolver.js`:
- **Internal Note Links:** `[[Note Title]]` and `[[Note Title|Custom Label]]` with local-first precedence and cross-folder navigation.
- **Section/Heading Links:** `[[#Heading]]` or `[[Note#Heading]]`.
- **Text Highlights:** `==highlighted text==` rendered as `<mark>`.
- **Footnotes:** `[^1]` inline references linked to `[^1]: Footnote content` sections.
- **Task Checkboxes:** Interactive disabled checkboxes for `- [ ]` and `- [x]`.
- **Block Anchors & Tags:** Anchor tags `^custom-id` and tag badges `#tag-name`.

### 3. KaTeX LaTeX Mathematics
Supported by `site-lib/scripts/math-renderer.js`:
- **Inline Math:** `$E(R_i) = R_f + \beta_i [E(R_m) - R_f]$`
- **Display Math Blocks:**
  ```latex
  $$
  NPV = \sum_{t=1}^{n} \frac{CF_t}{(1 + r)^t} - CF_0
  $$
  ```
- Fast, client-side KaTeX rendering with automatic token protection to prevent Markdown parsers from mangling mathematical operators (`_`, `*`, `^`, `\`).

### 4. Mermaid Diagramming
Supported by `site-lib/scripts/mermaid-renderer.js`:
- Renders flowchart, sequence, class, state, entity-relationship, and Gantt diagrams from standard ````mermaid```` code fences.
- Automatically adjusts colors to match light and dark themes.

### 5. Vault Health Linter & Auto-Fixer
Supported by `vault_linter.py`:
- Scans notes for unbalanced math delimiters, broken callout formatting, missing heading spaces, and unresolved asset paths.
- Generates `site-lib/vault-health.json` with detailed diagnostics and health scores.
- Run `python3 vault_linter.py --fix` to automatically repair common syntax issues.

---

## 🚀 Quick Start Guide

### Prerequisites
- **Node.js** (v18 or higher)
- **Python** (3.8 or higher, uses standard library only)

### Installation & Run

1. **Install Node.js dependencies:**
   ```bash
   npm install
   ```

2. **Sync vault & build indexes:**
   ```bash
   npm run sync
   ```

3. **Start the local workspace server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔄 Obsidian Vault Sync Workflows

### 1. Automated One-Time Sync
Pulls modifications from your local Obsidian vault paths configured in `locations.json`, processes frontmatter, updates the manifest, and rebuilds all viewer indexes:
```bash
npm run sync
# or directly:
python3 sync_site.py && python3 generate_index.py
```

### 2. Live Real-Time Watcher
Monitors your local Obsidian vault in the background and continuously updates `note-res/` when notes or assets change:
```bash
npm run watch
# or directly:
python3 sync_site.py --watch
```

### 3. Manual Vault Management
If managing files manually without local vault sync:
- Place or edit markdown notes and asset folders directly in `note-res/`.
- Rebuild indexes and viewers:
  ```bash
  npm run build
  ```

---

## ⚙️ Configuration Reference (`locations.json`)

All synchronization rules and exclusions are configured in `locations.json`:

```json
{
  "targetVaultDirectory": "note-res",
  "sourceVaultPaths": [
    "~/Documents/Obsidian Vault/BBA Study"
  ],
  "vaultExclusionPaths": [
    "/Expansion of Class Notes"
  ],
  "excludedFolders": [
    ".git",
    ".github",
    ".obsidian",
    ".trash",
    "node_modules",
    "guide",
    "site-lib",
    "backup",
    "backups",
    "backup-directory",
    "__pycache__"
  ],
  "excludedFiles": [
    ".DS_Store",
    "desktop.ini",
    "Thumbs.db",
    "ehthumbs.db",
    "package-lock.json",
    "bun.lock"
  ],
  "excludedPatterns": [
    "^\\..*",
    ".*\\.bak$",
    ".*\\.tmp$",
    ".*~$"
  ],
  "lockedSections": {
    "ai-comprehension": "NOTES_CURATED"
  }
}
```

### Configuration Schema & Properties

| Key | Description | Example |
| :--- | :--- | :--- |
| **`targetVaultDirectory`** | The root container inside the repo where synchronized notes live. | `"note-res"` |
| **`sourceVaultPaths`** | Array of local paths to your Obsidian Vaults. Tilde (`~`) is expanded automatically. | `["~/Documents/Obsidian Vault/BBA Study"]` |
| **`vaultExclusionPaths`** | Subfolders or paths inside the vault to strictly omit from syncing. | `["/Expansion of Class Notes"]` |
| **`excludedFolders`** | System, VCS, build, and temporary folders to ignore globally. | `[".git", "node_modules", ".obsidian", ".trash"]` |
| **`excludedFiles`** | System and lockfiles to ignore globally. | `[".DS_Store", "desktop.ini", "Thumbs.db"]` |
| **`excludedPatterns`** | Regular expressions matching transient/backup file names. | `["^\\..*", ".*\\.bak$", ".*\\.tmp$"]` |
| **`lockedSections`** | Optional section keys requiring passcode access. | `{"ai-comprehension": "NOTES_CURATED"}` |

---

## 🛡️ Cross-Platform Sanitization & Slug Engine

Obsidian allows characters in file titles that are illegal on Windows or problematic in web URLs (such as `:`, `?`, `*`, `"`, `|`, `<`, `>`, `\`).

The built-in multi-pass slug engine:
- Converts titles into URL-safe kebab-case slugs without broken `%20` encodings.
- Handles ampersands cleanly (`&` becomes `and`).
- Maintains a bidirectional lookup map (`name-map.json` and `vault-manifest.json`) so original note titles and display names remain intact in navigation, headers, and WikiLinks.

---

## 📜 Scripts & Command Reference

| Command | Purpose |
| :--- | :--- |
| `npm run dev` | Starts the local Express server on port 3000. |
| `npm run start` | Production start command for container environments. |
| `npm run sync` | Pulls updates from local Obsidian Vault and rebuilds all indexes. |
| `npm run watch` | Starts the continuous live file watcher. |
| `npm run build` | Rebuilds `site-lib/vault-index.json`, manifests, and HTML viewer pages. |
| `npm run setup` | Initial workspace bootstrap and full index regeneration. |
| `python3 vault_linter.py` | Runs vault health check and generates diagnostic reports. |
| `python3 vault_linter.py --fix` | Automatically fixes unbalanced math and malformed callouts. |

---

## 🔐 GitHub Authentication & Obsidian Sync

If pushing notes via Obsidian Git or command line:

### Recommended: Personal Access Token (PAT)
1. Go to **GitHub.com** → **Settings** → **Developer Settings** → **Personal access tokens** → **Tokens (classic)**.
2. Click **Generate new token (classic)** with the **`repo`** scope enabled.
3. In Obsidian Git settings, paste the token under **Authentication → Token**.
4. For terminal Git, set the remote URL:
   ```bash
   git remote set-url origin https://<YOUR_TOKEN>@github.com/<USERNAME>/<REPO_NAME>.git
   ```

### Alternative: SSH Key Authentication
```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
git remote set-url origin git@github.com:<USERNAME>/<REPO_NAME>.git
```

---

## 🌐 Deployment Guide

### GitHub Pages / Static Hosting
1. Run `npm run build` to generate all static HTML viewers and JSON indexes.
2. Ensure `.nojekyll` is in the repository root (prevents GitHub Pages from ignoring directories).
3. Deploy the repository to GitHub Pages, Cloudflare Pages, or Vercel.

### Node.js / Container Deployment
1. Set `"start": "node server.js"` in `package.json` (already configured).
2. Server listens on port `3000` (or `process.env.PORT`).
3. Provides both static file hosting and dynamic `/api/vault-discovery` endpoints.

