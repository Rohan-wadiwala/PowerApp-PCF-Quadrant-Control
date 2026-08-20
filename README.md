# PCF Quadrant Control

> Interactive four-quadrant chart PCF control for Power Apps Canvas Apps — add, drag, and export arrows between quadrants as JSON.

A **Power Apps Component Framework (PCF)** code component that renders a configurable 4-quadrant SVG matrix chart. Users can interactively draw arrows between quadrants, reposition them by dragging, and exchange the full arrow dataset as JSON — making it well suited for prioritisation matrices, effort/impact charts, and any 2×2 visualisation use case.

---

## Features

- **Four-quadrant SVG chart** with configurable corner labels and optional X/Y axis labels
- **Interactive arrows** — click two points to draw an arrow from start to end
- **Drag to reposition** — drag the arrow body to move the whole arrow, or drag the green/red endpoint handles to adjust individual points
- **Selection highlight** — click any arrow to select it; a yellow glow and endpoint handles appear
- **Delete** selected arrow (toolbar button or `Delete` / `Backspace` key)
- **Clear all** arrows in one click
- **Export JSON** — copies the current arrow array to the clipboard
- **JSON input/output** — accepts a pre-loaded arrow array via the `arrowsJson` bound property and emits the updated array whenever arrows change
- **Responsive** — uses `ResizeObserver` to fill its allocated space automatically as the Canvas App container resizes
- **Keyboard support** — `Esc` cancels arrow placement; `Delete` / `Backspace` removes the selected arrow

---

## Quick Start

```powershell
# 1. Install dependencies
npm install

# 2. Run in the local test harness (http://localhost:8181)
npm start

# 3. Build for deployment
npm run build
```

See [PublishingGuide.md](PublishingGuide.md) for the full end-to-end guide covering packaging, solution import, and wiring the control inside a Canvas App.

---

## Project Structure

```
PowerApp PCF Quadrant Control/
├── QuadrantControl/
│   ├── index.ts                    # Control implementation (TypeScript)
│   ├── ControlManifest.Input.xml   # PCF manifest — properties & resources
│   ├── css/
│   │   └── QuadrantControl.css     # Control styles
│   ├── strings/
│   │   └── QuadrantControl.1033.resx  # English resource strings
│   └── generated/
│       └── ManifestTypes.d.ts      # Auto-generated TypeScript types
├── QuadrantControl.pcfproj         # SDK-style MSBuild project (for dotnet build)
├── package.json                    # npm dependencies and build scripts
├── tsconfig.json                   # TypeScript configuration
├── eslint.config.js                # ESLint v9 flat config
├── PublishingGuide.md              # Step-by-step deployment & embedding guide
└── README.md                       # This file
```

---

## Control Properties

| Property | Type | Usage | Description |
|---|---|---|---|
| `arrowsJson` | `SingleLine.Text` | bound | JSON array of arrows. Accepts pre-loaded data as input; emits the updated array as output whenever arrows change. |
| `quadrantTopLeft` | `SingleLine.Text` | input | Label for the top-left quadrant. |
| `quadrantTopRight` | `SingleLine.Text` | input | Label for the top-right quadrant. |
| `quadrantBottomLeft` | `SingleLine.Text` | input | Label for the bottom-left quadrant. |
| `quadrantBottomRight` | `SingleLine.Text` | input | Label for the bottom-right quadrant. |
| `xAxisLabel` | `SingleLine.Text` | input | Optional label rendered along the bottom edge (e.g. `"Effort →"`). |
| `yAxisLabel` | `SingleLine.Text` | input | Optional label rendered along the left edge (e.g. `"Impact ↑"`). |

---

## Arrow JSON Schema

The `arrowsJson` property is a JSON array of arrow objects:

```json
[
  {
    "id":     "a1",
    "startX": 0.15,
    "startY": 0.80,
    "endX":   0.85,
    "endY":   0.20,
    "label":  "Move to high-impact",
    "color":  "#0078d4"
  }
]
```

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Unique identifier. Auto-assigned when drawn interactively. |
| `startX` | number | Yes | Normalised X of start point (0 = left edge, 1 = right edge). |
| `startY` | number | Yes | Normalised Y of start point (0 = top edge, 1 = bottom edge). |
| `endX` | number | Yes | Normalised X of end point. |
| `endY` | number | Yes | Normalised Y of end point. |
| `label` | string | No | Optional text shown at the midpoint of the arrow. |
| `color` | string | No | CSS hex colour (e.g. `"#0078d4"`). Defaults to blue. |

Coordinates are normalised (0–1) so arrow positions are resolution-independent and scale correctly as the control is resized.

---

## Interaction Reference

| Action | How |
|---|---|
| Add arrow | Click **＋ Add Arrow**, then click once for the start point, once for the end point. |
| Cancel placement | Press `Esc` at any time during placement. |
| Select arrow | Click anywhere on the arrow line. |
| Move arrow | Drag the selected arrow body. |
| Move endpoint | Drag the green (start) or red (end) circle handle. |
| Delete arrow | Select arrow, then click **✕ Delete Selected** or press `Delete`. |
| Clear all | Click **⊗ Clear All**. |
| Copy JSON | Click **⬇ Export JSON** — copies the current array to the clipboard. |

---

## Publishing & Embedding

See **[PublishingGuide.md](PublishingGuide.md)** for the complete guide, which covers:

1. Prerequisites (Node.js, Power Platform CLI, .NET SDK)
2. Building the PCF control locally
3. Testing in the PCF test harness (`npm start`)
4. Creating a Power Platform solution project
5. Packaging the solution (`dotnet build`)
6. Importing the solution into a Power Apps environment
7. Enabling the PCF feature flag in Canvas App Studio
8. Inserting the control on a Canvas App screen
9. Wiring up properties and reading the output JSON
10. Updating the control after code changes

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 18 LTS or later | https://nodejs.org |
| Power Platform CLI (`pac`) | Latest | `winget install Microsoft.PowerAppsCLI` |
| .NET SDK | 6.0 or later | Required by `dotnet build` |

---

## Build Scripts

| Command | Description |
|---|---|
| `npm install` | Install all dependencies |
| `npm start` | Start local test harness at `http://localhost:8181` |
| `npm run build` | Production build — outputs to `out/controls/` |
| `npm run rebuild` | Clean then build |
| `npm run refreshTypes` | Regenerate `generated/ManifestTypes.d.ts` from the manifest |

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Control not visible in Insert panel | Enable "Power Apps component framework for canvas apps" in Settings → General inside Canvas App Studio, then save and reopen the app. |
| Control renders blank after adding to screen | Re-check that the solution was imported **after** the latest `npm run build`. Reimport if needed. |
| `npm install` fails | Confirm Node.js ≥ 18 and that any corporate proxy is configured. |
| `pac solution import` auth error | Re-run `pac auth create` with the correct environment URL. |
| Arrows disappear after app reload | Persist `QuadrantControl1.arrowsJson` to a data source in your Save logic. |
| TypeScript errors on `ManifestTypes.d.ts` | Run `npm run refreshTypes` to regenerate from the manifest. |

---

## License

MIT
