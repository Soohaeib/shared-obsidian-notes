# 🌌 Shared Obsidian Notes & Digital Garden Workspace

A platform-independent, interactive digital garden and publishing workspace tailored for personal knowledge management (PKM), course notes, and study roadmaps. Built to work seamlessly with Obsidian vaults across Windows, macOS, and Linux.

---

## 📑 Table of Contents

- [Overview & Architecture](#-overview--architecture)
- [Workspace Directory Structure](#-workspace-directory-structure)
- [Quick Start Guide](#-quick-start-guide)
- [Obsidian Vault Sync Workflows](#-obsidian-vault-sync-workflows)
  - [1. Automated Synchronization](#1-automated-synchronization)
  - [2. Live Real-Time Watcher](#2-live-real-time-watcher)
  - [3. Manual Management](#3-manual-management)
- [Configuration Reference (`locations.json`)](#-configuration-reference-locationsjson)
  - [Exclusion Strategy & Rules](#exclusion-strategy--rules)
  - [Configuration Schema](#configuration-schema)
- [Cross-Platform Sanitization Engine](#-cross-platform-sanitization-engine)
- [Core Features & Capabilities](#-core-features--capabilities)
- [Scripts & Command Reference](#-scripts--command-reference)
- [Deployment Guide](#-deployment-guide)

---

## 🌟 Overview & Architecture

This repository acts as a published digital garden mirroring selected folders from your local Obsidian vault.

- **`note-res/` Container:** Serves as the single source of truth for all synchronized markdown notes, syllabi, previous year questions (PYQs), and visual SVG diagrams.
- **Dynamic & Static Dual Mode:** Works as both a static HTML export (ready for GitHub Pages with `.nojekyll`) and an interactive Node.js / Express web workspace with live discovery and single-page navigation.
- **Mathematical & Diagrammatic Rendering:** Native support for KaTeX math notation (`$...$` and `$$...$$`) and inline SVG diagrams.

---

## 📂 Workspace Directory Structure

```text
├── locations.json          # Core path mapping and exclusion configuration
├── note-res/               # Primary container for all active notes and study folders
│   ├── 4th Semester/       # BCC course notes, PYQs, and solution guides
│   ├── 5th Semester/       # ACC course notes, syllabi, and raw PYQ collections
│   └── AI Curated Notes/   # Structured phase-by-phase notes, roadmaps, and SVG assets
│       ├── ACC 301 Intermediate Accounting/
│       ├── ACC 302 Financial Management/
│       ├── ACC 303 Advanced Statistical Techniques/
│       ├── ACC 304 Cost Accounting I/
│       ├── ACC 305 Auditing & Assurance/
│       └── Logical Learning/
├── site-lib/               # Client runtime assets (search index, styles, scripts, fonts)
│   ├── vault-index.json    # Complete index of all active notes and folders
│   └── styles/ & scripts/  # Workspace styling and viewer scripts
├── generate_index.py       # Rebuilds vault-index.json and folder viewer index pages
├── sync_site.py            # Automated synchronization, sanitizer, and watcher tool
├── server.js               # Node.js / Express workspace server
├── metadata.json           # AI Studio applet metadata & configuration
└── package.json            # Node.js project manifest and scripts
```

---

## 🚀 Quick Start Guide

### Prerequisites
- **Node.js** (v18 or higher recommended)
- **Python** (3.8 or higher, standard library with zero external pip dependencies)

### Installation & Run

1. **Install Node.js dependencies:**
   ```bash
   npm install
   ```

2. **Build and index the workspace:**
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

### 1. Automated Synchronization
Run a one-time sync to pull changes from your local Obsidian vault based on the paths configured in `locations.json`:
```bash
npm run sync
# or directly:
python3 sync_site.py --once
```

### 2. Live Real-Time Watcher
Run continuous file watching that monitors your local Obsidian vault and automatically updates `note-res/` whenever notes are modified or added:
```bash
npm run watch
# or directly:
python3 sync_site.py --watch
```

### 3. Manual Management
If you prefer to organize notes manually:
- Move markdown files or folders directly into `note-res/`.
- Run `npm run build` or `python3 generate_index.py` to regenerate `site-lib/vault-index.json` and viewer pages.

---

## ⚙️ Configuration Reference (`locations.json`)

All vault synchronization and exclusion rules are configured declaratively in `locations.json`:

```json
{
  "targetVaultDirectory": "note-res",
  "sourceVaultPaths": [
    "~/Documents/Obsidian Vault/BBA Study"
  ],
  "sourceExclusionPaths": [
    "~/Documents/Obsidian Vault/BBA Study/Expansion of class notes"
  ],
  "sourceExclusionFiles": [],
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
  ]
}
```

### Exclusion Strategy & Rules

| Key | Description | Example |
| :--- | :--- | :--- |
| **`targetVaultDirectory`** | The root container inside the repo where notes live. | `"note-res"` |
| **`sourceVaultPaths`** | Local paths to your Obsidian Vaults. Tilde (`~`) is expanded automatically. | `["~/Documents/Obsidian Vault/BBA Study"]` |
| **`sourceExclusionPaths`** | Specific study directories or subfolders to strictly omit from syncing. | `["~/Documents/Obsidian Vault/BBA Study/Expansion of class notes"]` |
| **`sourceExclusionFiles`** | Specific individual markdown/source files to omit from syncing. | `["Private Notes.md"]` |
| **`excludedFolders`** | System, VCS, build, and temporary folders to ignore globally. | `[".git", "node_modules", ".obsidian", ".trash"]` |
| **`excludedFiles`** | System and lockfiles to ignore globally. | `[".DS_Store", "desktop.ini", "Thumbs.db"]` |
| **`excludedPatterns`** | Regular expressions for transient and backup file extensions. | `["^\\..*", ".*\\.bak$", ".*\\.tmp$"]` |

---

## 🛡️ Cross-Platform Sanitization Engine

Obsidian allows characters in file titles that are illegal on Windows or problematic in Git URLs (such as `:`, `?`, `*`, `"`, `|`, `<`, `>`, `\`).

The built-in sanitizer (`sync_site.py --sanitize`):
- Converts colons (`:`) to clean hyphenated separators (` - `).
- Strips trailing dots, illegal characters, and Windows reserved filenames (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`).
- Guarantees clean file paths across all Git environments without breaking markdown links.

---

## ✨ Core Features & Capabilities

- **Interactive Workspace Navigation:** Fast search across 290+ notes with hierarchical folder exploration and breadcrumb trails.
- **LaTeX & KaTeX Mathematics:** Formulas and mathematical expressions render cleanly inline and in display mode.
- **SVG Diagram Support:** Integrated high-fidelity visual diagrams (financial curves, NPV profiles, SML plots, MCC schedules).
- **Responsive Layout:** Optimized reading experience on both desktop and mobile screens.
- **Zero Lock-In:** Markdown files remain 100% standard and compatible with Obsidian and standard PKM tools.

---

## 📜 Scripts & Command Reference

| Command | Purpose |
| :--- | :--- |
| `npm run dev` | Starts the local Express server on port 3000. |
| `npm run sync` | Pulls updates from local Obsidian Vault and rebuilds indexes. |
| `npm run watch` | Starts live continuous auto-sync watcher. |
| `npm run build` | Rebuilds the search index and HTML viewer pages. |
| `python3 sync_site.py --sanitize` | Runs filename audit and sanitizes illegal characters. |

---

## 🔐 GitHub Authentication & Obsidian Sync Troubleshooting

If you encounter authentication errors when signing in to GitHub or pushing notes via Obsidian Git / command-line:

### Why GitHub Sign-in Fails with Password
GitHub retired password authentication for Git operations. Standard account passwords will return `Authentication failed` or `Invalid username or password`.

### Method 1: Personal Access Token (PAT) — Recommended
1. Log in to [GitHub.com](https://github.com) and go to **Settings** → **Developer Settings** → **Personal access tokens** → **Tokens (classic)**.
2. Click **Generate new token (classic)**.
3. Set Note to `Obsidian Vault Sync` and select the **`repo`** scope (full control of private repositories).
4. Copy your generated token (format starts with `ghp_...`).
5. **In Obsidian Git Plugin:**
   - Open Obsidian **Settings** → **Community Plugins** → **Obsidian Git**.
   - Under Authentication, paste your Personal Access Token in the **Token** field.
6. **In Terminal / Git:**
   - When prompted for Password, paste your `ghp_...` token.
   - Or configure remote URL with your token:
     ```bash
     git remote set-url origin https://<YOUR_TOKEN>@github.com/<USERNAME>/<REPO_NAME>.git
     ```

### Method 2: SSH Key Authentication
1. Generate an SSH key:
   ```bash
   ssh-keygen -t ed25519 -C "your_email@example.com"
   ```
2. Copy your public key:
   ```bash
   cat ~/.ssh/id_ed25519.pub
   ```
3. Add it on GitHub: **Settings** → **SSH and GPG Keys** → **New SSH Key**.
4. Set your repository remote to SSH:
   ```bash
   git remote set-url origin git@github.com:<USERNAME>/<REPO_NAME>.git
   ```

---

## 🌐 Deployment Guide

### GitHub Pages / Static Hosting
1. Run `npm run build` to generate `index.html` and `site-lib/vault-index.json`.
2. Ensure `.nojekyll` is present in the repository root (prevents GitHub Pages from ignoring folders with special characters).
3. Deploy the root directory to GitHub Pages, Cloudflare Pages, or Vercel.

### Node.js / Container Deployment
1. Set `"start": "node server.js"` in `package.json`.
2. Expose port `3000`.
3. The server serves both API endpoints (`/api/vault-discovery`) and static files with correct caching headers.
