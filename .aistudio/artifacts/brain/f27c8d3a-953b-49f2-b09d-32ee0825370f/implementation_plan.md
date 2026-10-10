# LaTeX Rendering Stability & Elegant Mermaid Visuals Architecture

A robust enhancement plan to ensure LaTeX math rendering never freezes or stalls the reader pipeline, while dramatically elevating Mermaid diagram aesthetics with clean orthogonal arrow curves, device-responsive viewport scaling, and a smooth click-to-zoom/pan inspection modal.

## User Review & Critical Decisions

> [!IMPORTANT]
> Based on your responses, the following architectural directions are confirmed:
> - **Mermaid Arrow Routing & Curves**: Configured with orthogonal/basis-free curves (`curve: 'linear'`) and generous node/rank padding (55px+) to eliminate overlapping arrows and tangled bezier loops.
> - **Diagram Window Scaling**: Intrinsic responsive bounding (preserving text legibility at $\ge 12\text{px}$) paired with a frictionless click-to-zoom and pan modal featuring mouse dragging, pinch-to-zoom, and reset controls.
> - **LaTeX Stability & Stalling Prevention**: Multi-layered defense including unpaired delimiter detection, aggressive syntax pre-healing, async rendering timeouts (500ms safety breaker), and isolated fallback cards so math parsing never blocks the UI thread.

---

## 1. Overview & Core Concept

### What It Does
- **Rock-Solid LaTeX Engine**: Upgrades `math-renderer.js` to intelligently detect and heal unpaired `$$` blocks (such as those identified in accounting notes), sanitize currency conflicts, handle multi-column accounting schedules, and execute with timeout safeguards so a malformed expression renders a clean fallback card instead of hanging the entire document.
- **Modern, Overlap-Free Diagrams**: Upgrades `mermaid-renderer.js` and `diagrams.css` with clean layout physics, optimal node/rank separation, and elegant typography that harmonizes with the Obsidian dark/light design system.
- **Interactive Diagram Canvas Modal**: Enables full-fidelity inspection across desktop and mobile devices. Clicking or tapping any diagram opens an interactive pan-and-zoom viewport with zoom controls, pinch gesture support, and 1:1 reset.

### Target Audience & Persona
- Students, researchers, and professionals reviewing complex accounting, auditing, economics, and statistical course modules with multi-step workflows, equations, and structured flowcharts.

### Key Value
- Zero browser freezing, 100% note availability, legible diagram text across phone and desktop viewports, and pristine arrow routing without visual collisions.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Reading Notes with Math**: The user opens any complex note (e.g. `acc-301`, `acc-303`, `pyq-acc-301`). All inline and display equations render in sub-millisecond KaTeX speed. Any malformed LaTeX tag displays an elegant inline notification card without interrupting the rest of the note.
2. **Viewing Complex Flowcharts**: Diagrams display at their natural optimal width (clamped to the reader container, never squished into unreadable mini-thumbnails on mobile, nor stretched unnaturally on 4K screens).
3. **Deep Diagram Inspection**: The user clicks the diagram card or corner expand button. A full-screen translucent frosted overlay opens displaying the diagram in vector perfection. The user can drag to pan, scroll wheel or pinch to zoom (25% to 400%), or click "Reset" to return to center.

### Visual Identity & Theme Tokens
- **Canvas Neutrals**: Deep slate background (`--background-secondary`, `#181d28`) in dark mode; soft crisp paper (`#f8fafc`) in light mode.
- **Arrow & Edge Aesthetics**: Crisp Nord-inspired palette (`--frost2`, `#81a1c1`) with 1.5px stroke width and standardized arrowhead markers (`marker-end`) that route cleanly around node boundaries.
- **Node Containers**: Subtle 1px borders, rounded corners (6px), and high-contrast typography (`Inter` / `Plus Jakarta Sans`, 13px font size with 1.45 line-height).
- **Interactive Modal**: Backdrop blur (`backdrop-filter: blur(16px)`), quiet floating toolbar pill with zoom in, zoom out, fit-to-screen, and dismiss affordances.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Arrow Interpolation Curve
- **Chosen Approach**: `curve: 'linear'` (orthogonal segmented paths) with increased `nodeSpacing: 55` and `rankSpacing: 55`.
- **Why**: Mermaid's default `curve: 'basis'` uses B-splines that calculate control points through curve fitting. In flowcharts with multiple subgraphs or backwards links, `basis` produces sweeping wide curves that intersect neighboring nodes and superimpose arrowheads. `linear` routes edges cleanly along Dagre rank channels.
- **Alternatives Considered**: `curve: 'natural'` or `curve: 'monotoneX'` still produce wide loops in vertical flowcharts (`TD`/`TB`).

### Decision 2: Diagram Scaling & Responsiveness
- **Chosen Approach**: Intrinsic viewBox scaling with `min-width` preservation and horizontal scroll wrap on small screens + dedicated interactive pan/zoom modal.
- **Why**: Forcing `width: 100%` on wide SVG diagrams (e.g. 1000px wide) compresses them to 320px on mobile screens, making text smaller than 4px. Preserving intrinsic text height and allowing modal zoom gives the best of both worlds: clean layout integration and legible inspection.
- **Alternatives Considered**: Truncation or CSS zoom which breaks responsive document flow.

### Decision 3: LaTeX Parser Safety & Delimiter Balancing
- **Chosen Approach**: Pre-scan balancing for `$$` and `$` delimiters before regex extraction. If an odd count of `$$` is detected, pair them locally by section boundaries rather than spanning multiple headers. Add a 500ms timeout per formula execution with graceful error fallback.
- **Why**: KaTeX is fast for valid math, but catastrophic delimiter mismatching can pass 50,000 characters of Markdown text to KaTeX as a single equation, locking up the thread.

---

## 4. Technical Architecture & Data Strategy

```
┌──────────────────────────────────────────────────────────────┐
│                    Note Rendering Pipeline                   │
└──────────────────────────────┬───────────────────────────────┘
                               │
               ┌───────────────▼───────────────┐
               │    1. Delimiter Sanitizer     │
               │   - Currency protection ($)   │
               │   - Unpaired $$ delimiter fix │
               └───────────────┬───────────────┘
                               │
               ┌───────────────▼───────────────┐
               │   2. Math Extraction Engine   │
               │   - Tokenize to @@KATEX_@@    │
               │   - 500ms safeguard timeout   │
               └───────────────┬───────────────┘
                               │
               ┌───────────────▼───────────────┐
               │    3. Markdown Parser (GFM)   │
               │   - Marked.js parsing         │
               └───────────────┬───────────────┘
                               │
               ┌───────────────▼───────────────┐
               │    4. Token Restoration       │
               │   - Restore rendered KaTeX    │
               └───────────────┬───────────────┘
                               │
               ┌───────────────▼───────────────┐
               │    5. Mermaid Initialization  │
               │   - Linear curves (no overlap)│
               │   - Node & rank padding (55px)│
               │   - Responsive SVG container  │
               └───────────────┬───────────────┘
                               │
               ┌───────────────▼───────────────┐
               │  6. Interactive Modal Engine  │
               │   - Pan / Pinch / Wheel Zoom  │
               │   - Fullscreen SVG vector     │
               └───────────────────────────────┘
```

### Component & State Mapping

1. `site-lib/scripts/math-renderer.js`:
   - Add delimiter balance checker `healUnpairedDelimiters(text)` to close stray `$$` before extraction.
   - Wrap `renderExpression` in try-catch with timeout protection and structured fallback badge (`<div class="math-error-card">`).
   - Enhance accounting macros (`\multicolumn`, `\begin{array}`, `\cline`, `\hline`).

2. `site-lib/scripts/mermaid-renderer.js`:
   - Update `mermaid.initialize` configuration: `curve: 'linear'`, `nodeSpacing: 55`, `rankSpacing: 55`, `padding: 20`.
   - Update SVG injection to maintain intrinsic aspect ratio and add click-to-preview event listener.

3. `site-lib/scripts/media-preview.js`:
   - Upgrade modal viewer for SVG diagrams to support smooth pan dragging, mouse wheel zoom, touch pinch-to-zoom, and zoom reset.

4. `site-lib/styles/diagrams.css`:
   - Fine-tune `.mermaid-diagram-container` styles: clean max-width limits, subtle scrollbars, cursor pointer affordances, and arrow path rendering.
