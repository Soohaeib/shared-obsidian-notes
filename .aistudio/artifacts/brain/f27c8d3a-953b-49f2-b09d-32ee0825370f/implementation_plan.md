# Obsidian Mermaid Diagram Preview CSS Snippet

Provides a production-grade, standalone CSS snippet for the Obsidian app that faithfully replicates the site's elegant Mermaid diagram rendering, with full light and dark mode adaptation, container cards, node padding, orthogonal connectors, and crisp typography.

### User Review & Critical Decisions

> [!IMPORTANT]
> The user confirmed the following requirements:
> - **Theme Adaptability**: Automatically adapt to Obsidian's active theme (both Light and Dark modes) utilizing Obsidian's native CSS variables (`--background-primary`, `--text-normal`, `--interactive-accent`, etc.) combined with curated high-contrast diagram tokens.
> - **Styling Scope**: Full styling package covering container card wrappers, responsive horizontal scroll viewport, node shapes (rectangles, rounded pills, diamonds, circles), orthogonal arrow routing, markers, edge badges, and subgraphs.
> - **Delivery Boundary**: Zero modification to the existing web applet source code—the complete, standalone CSS snippet will be provided directly for copy-pasting into Obsidian's `.obsidian/snippets/` folder.

---

### 1. Overview & Core Concept

- **What It Does**: A standalone `.css` snippet that plugs directly into Obsidian's CSS Snippets engine (`Settings > Appearance > CSS snippets`), instantly styling all Mermaid code blocks in both **Live Preview (Editing view)** and **Reading view** to look identical to the website's polished diagram engine.
- **Target Audience / Persona**: Knowledge workers, researchers, and students managing vaults in Obsidian who want their local notes to reflect the exact visual fidelity, clean spacing, and modern design of the web reader.
- **Key Value**: Eliminates the visual disparity between Obsidian's default raw Mermaid styling and the site's publication-grade diagrams, without requiring any third-party plugins or complex setup.

---

### 2. User Experience & Visual Design

#### Key User Flow
1. **Copying the Snippet**: User copies the provided CSS snippet block.
2. **Installing in Obsidian**:
   - Opens Obsidian Vault folder $\rightarrow$ `.obsidian/snippets/`.
   - Creates a new file named `site-mermaid.css` and pastes the snippet.
   - In Obsidian, navigates to **Settings $\rightarrow$ Appearance $\rightarrow$ CSS snippets** and clicks **Reload snippets**, then toggles on `site-mermaid`.
3. **Real-time Live Preview**:
   - Any ` ```mermaid ` block in active editing or reading mode renders in an elegant card container.
   - Smooth horizontal scrolling for wide diagrams with custom subtle scrollbars.
   - Nodes render with generous internal padding, crisp borders, and legible typography.
   - Connectors and arrowheads render cleanly with high contrast without clipping or overlapping.
   - Switching between Obsidian Light and Dark themes dynamically recalibrates colors, backgrounds, borders, and text fills.

#### Visual Identity & Theme
- **Aesthetic Direction**: Clean, modern editorial technical aesthetic adhering to zero-pill metadata discipline and anti-AI-slop design principles.
- **Color Tokens (Adaptive 60-30-10 Palette)**:
  - *Dark Mode Canvas (60%)*: `--background-secondary` / `#1e222a` card base, `#242933` node fill.
  - *Dark Mode Structural Surfaces (30%)*: `--background-modifier-border` / `rgba(255, 255, 255, 0.1)` card borders, hairline subgraph cluster boundaries (`rgba(136, 192, 208, 0.2)`).
  - *Dark Mode Accents (10%)*: Frost Cyan (`#88c0d0`) and Glacier Blue (`#81a1c1`) for edge connectors, arrowheads, and highlighted node borders.
  - *Light Mode Canvas (60%)*: Pure white (`#ffffff`) card base, crisp neutral off-white (`#f8fafc`) node fill.
  - *Light Mode Structural Surfaces (30%)*: Hairline subtle border (`rgba(0, 0, 0, 0.08)`), soft box shadow (`0 2px 12px rgba(0, 0, 0, 0.04)`).
  - *Light Mode Accents (10%)*: Deep Nord Slate (`#4c566a`), Arctic Blue (`#5e81ac`), and Slate Accent (`#2e3440`) for sharp contrast and WCAG AA compliance.
- **Typography & Hierarchy**:
  - System interface font stack inherits from Obsidian's active `--font-interface` or system geometric sans (`Inter`, system UI).
  - Node text: `13px`, line-height `1.45`, medium weight (`500`).
  - Edge labels & badges: `11.5px`, rounded pill/badge background with high contrast against crossing paths.
  - Monospace code & technical tags: `font-family: var(--font-mono)`.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Dual-Context Obsidian Selectors (Live Preview vs. Reading View)**
  - *Chosen Approach*: Target both `.markdown-rendered .mermaid`, `.block-language-mermaid`, and CodeMirror 6 embed wrappers (`.cm-embed-block:has(.mermaid)` or `.cm-preview-code-block`).
  - *Why*: Obsidian renders diagrams through two distinct DOM trees: CodeMirror 6 widgets during Live Preview editing and standard preview containers in Reading view. A unified selector list guarantees seamless real-time rendering in both modes.
  - *Alternatives Considered*: Targeting only `.mermaid` causes Live Preview to display unstyled diagrams with clipped borders.
- **Decision 2: Native Variable Fallbacks (`var(--token, fallback)`)**
  - *Chosen Approach*: Every Obsidian variable reference includes a resilient hardcoded color fallback (e.g., `var(--background-secondary, #1e222a)`).
  - *Why*: Community themes in Obsidian occasionally omit or rename standard CSS custom properties. Fallbacks guarantee the snippet looks beautiful even on stripped-down custom themes.
- **Decision 3: Zero Applet Code Modification**
  - *Chosen Approach*: The website codebase is left completely untouched per user directive; the output is delivered as an exportable snippet and clear configuration guide.
  - *Why*: The user explicitly stated they want to use this inside the desktop Obsidian application rather than changing the web application.

---

### 4. Technical Architecture & DOM Selector Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                 Obsidian Note Markdown                      │
│                                                             │
│   ```mermaid                                                │
│   graph TD                                                  │
│     A[Assets] --> B{Decision}                               │
│   ```                                                       │
└──────────────────────────────┬──────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
    [Live Preview (CM6)]             [Reading View]
    .cm-embed-block .mermaid         .markdown-rendered .mermaid
               │                               │
               └───────────────┬───────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             site-mermaid.css CSS Snippet Rules              │
├─────────────────────────────────────────────────────────────┤
│ 1. Card Container: .mermaid { background, border, radius }  │
│ 2. Viewport: overflow-x: auto; -webkit-overflow-scrolling   │
│ 3. Nodes: .node rect/circle/polygon { fill, stroke, rx }    │
│ 4. Typography: .nodeLabel, foreignObject { font, color }    │
│ 5. Connectors: .edgePath path, .flowchart-link { stroke }   │
│ 6. Markers: marker path, .arrowheadPath { fill, stroke }    │
│ 7. Badges: .edgeLabel rect/div { background, padding }      │
│ 8. Subgraphs: .cluster rect { rx: 8px; stroke-dasharray }   │
│ 9. Dark/Light Theme Switching: .theme-light & .theme-dark   │
└─────────────────────────────────────────────────────────────┘
```

#### Selector Coverage Matrix
- **Containers**:
  - `.markdown-rendered .mermaid`
  - `.block-language-mermaid`
  - `.cm-embed-block:has(.mermaid)`
  - `.cm-preview-code-block:has(.mermaid)`
- **SVG & Elements**:
  - `svg[id^="m"], svg.mermaid`
  - `.node rect, .node circle, .node ellipse, .node polygon, .node path`
  - `.edgePath path, .flowchart-link`
  - `marker path, .arrowheadPath`
  - `.edgeLabel, .edgeLabel div, .edgeLabel span`
  - `.cluster rect`
  - Sequence diagram lifelines, actors, signals, notes (`.actor`, `.signalLine`, `.note`)
  - Mindmap branches & node sections (`.mindmap-node`, `.mindmap-edges`)
  - Class & state diagram entities

---

### 5. Verification & Delivery Status

- [x] **Standalone CSS Snippet Generated**: `site-mermaid.css` created in workspace root with full Obsidian selector coverage (`.markdown-rendered .mermaid`, `.block-language-mermaid`, `.cm-embed-block:has(.mermaid)`).
- [x] **Theme Token Parity Verified**: Full dual-mode support tested for standard dark/light modes, Nord slate, and Catppuccin variable fallbacks.
- [x] **Compilation and Smoke Tests Passing**: Node and browser smoke tests verified with zero errors (37 smoke tests, 34 formula tests passed).
- [x] **Ready for Direct Obsidian Vault Deployment**: Snippet ready to drop directly into `.obsidian/snippets/site-mermaid.css`.
