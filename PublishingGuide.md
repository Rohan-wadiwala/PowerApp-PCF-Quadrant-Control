# Publishing & Using the PCF Quadrant Control in a Canvas App

## Overview

This guide walks through every step: installing prerequisites, building the control, packaging it into a Power Platform solution, importing it into an environment, and wiring it up inside a Canvas App.

---

## Part 1 — Prerequisites

### 1.1 Install Node.js
Download and install **Node.js 18 LTS** (or newer) from https://nodejs.org.

Verify:
```
node --version   # v18.x.x or higher
npm --version    # 9.x or higher
```

### 1.2 Install Power Platform CLI (`pac`)

```powershell
# Windows — via winget
winget install Microsoft.PowerAppsCLI

# Or via npm (cross-platform)
npm install -g @microsoft/powerplatform-cli
```

Verify:
```
pac --version
```

### 1.3 Install .NET 6 SDK (required by `pac solution` commands)
Download from https://dotnet.microsoft.com/download/dotnet/6.0

Verify:
```
dotnet --version
```

---

## Part 2 — Build the PCF Control

### 2.1 Install dependencies

Open a terminal in the project root (`C:\Code\PowerApp PCF Quadrant Control\`) and run:

```powershell
npm install
```

This pulls in `pcf-scripts`, TypeScript, and the PCF type definitions.

### 2.2 Generate the manifest types

The `generated/ManifestTypes.d.ts` file included in the repo is a convenience copy.
To regenerate it from the live manifest:

```powershell
npm run refreshTypes
```

### 2.3 Test locally in the PCF test harness

```powershell
npm start
```

A browser window opens at `http://localhost:8181` showing the control in an interactive test harness. You can:

- Click **+ Add Arrow** and click two points on the chart to draw an arrow.
- Click an arrow to select it; green/red handles appear at the endpoints.
- Drag the arrow body to move it; drag an endpoint handle to reposition that point only.
- Press **Delete** or use the toolbar to remove a selected arrow.
- Click **Export JSON** to copy the current arrow array to the clipboard.

### 2.4 Build for production

```powershell
npm run build
```

The compiled output lands in `out/controls/RTK.QuadrantControl/`.

---

## Part 3 — Create the Power Platform Solution

### 3.1 Authenticate with your environment

```powershell
pac auth create --environment https://yourorg.crm.dynamics.com
```

Follow the browser login prompt.

### 3.2 Initialise a solution project

Run these commands **in a separate folder** (e.g., `C:\Code\QuadrantSolution\`):

```powershell
mkdir C:\Code\QuadrantSolution
cd C:\Code\QuadrantSolution

pac solution init `
  --publisher-name "YourPublisherName" `
  --publisher-prefix "rtk"
```

> Use a lowercase 2–8 character prefix. It prefixes all customisations in the environment.

### 3.3 Add the PCF control to the solution

`pac solution add-reference` requires a `.pcfproj` file in the target folder.
The project includes `QuadrantControl.pcfproj` for exactly this purpose.

```powershell
pac solution add-reference `
  --path "C:\Code\PowerApp PCF Quadrant Control"
```

### 3.4 Build the solution package (`.zip`)

```powershell
dotnet build
```

The managed solution zip is created at:
```
C:\Code\QuadrantSolution\bin\Debug\QuadrantSolution.zip
```

For a managed solution (recommended for production):
```powershell
dotnet build --configuration Release
```

---

## Part 4 — Import the Solution into Power Platform

### Option A: Power Apps portal (easiest)

1. Go to https://make.powerapps.com and select your environment.
2. Click **Solutions** in the left navigation.
3. Click **Import solution** → **Browse** → select `QuadrantSolution.zip`.
4. Click **Next** → **Import**.
5. Wait for the import to complete (typically < 1 minute).

### Option B: PAC CLI (automated / CI)

```powershell
pac solution import --path "C:\Code\QuadrantSolution\bin\Debug\QuadrantSolution.zip"
```

---

## Part 5 — Enable PCF Components in a Canvas App

The **Code** tab in the Import Components panel only appears after this feature flag is turned on. It must be enabled once per app.

1. Open your Canvas App in **Power Apps Studio** (make.powerapps.com → Apps → Edit).
2. Click the **Settings** icon (gear ⚙, top-right of Studio).
3. Locate the toggle using the path that matches your Studio version:

   | Studio version | Path |
   |---|---|
   | **2024 / 2025 (current)** | **General** → scroll down to **"Power Apps component framework for canvas apps"** → toggle **On** |
   | **Older** | **Upcoming features → Preview** → toggle **On** |
   | **Older still** | **Upcoming features → Experimental** → toggle **On** |

4. Click **Close** to dismiss Settings.
5. **Save** the app (`Ctrl+S`), then **close and reopen** it in Studio — the toggle requires a full reload to take effect.

> **Tip:** If the toggle is missing entirely, your environment admin may have disabled it via tenant-level governance settings. Ask your admin to enable *"Allow publishing of canvas apps with code components"* in the Power Platform Admin Center (Environment → Settings → Features).

---

## Part 6 — Add the Quadrant Control to a Screen

### 6.1 Verify the solution is imported

Before adding the control, confirm the solution is in your environment:

1. Go to https://make.powerapps.com → **Solutions**.
2. Confirm **QuadrantSolution** (or your chosen name) appears in the list with status **Managed** or **Unmanaged**.
3. If it is missing, complete Part 4 first.

### 6.2 Insert the component

1. Open the Canvas App in Studio and navigate to the target screen.
2. Click **Insert** (＋) in the left toolbar.
3. Scroll to the bottom of the Insert panel and click **Get more components**.
   - If you do not see **Get more components**, the feature flag from Part 5 is not yet active — re-check that step.
4. In the "Import components" dialog, click the **Code** tab.
   - If there is no **Code** tab, the feature flag has not taken effect — save, close, and reopen the app in Studio.
5. Find **Quadrant Control** (publisher prefix `rtk`) → click **Import**.
6. The control now appears under **Insert → Code components**.
7. Click it to place the Quadrant Control on the screen.

### 6.2 Resize

Drag the control handles to your preferred size. The SVG canvas fills the allocated space automatically.

---

## Part 7 — Wiring Up Properties

### 7.1 Quadrant labels

Select the control, then in the **Properties** pane (or formula bar) set:

| Property              | Example value          |
|-----------------------|------------------------|
| `quadrantTopLeft`     | `"High Impact / Low Effort"` |
| `quadrantTopRight`    | `"High Impact / High Effort"` |
| `quadrantBottomLeft`  | `"Low Impact / Low Effort"` |
| `quadrantBottomRight` | `"Low Impact / High Effort"` |
| `xAxisLabel`          | `"Effort →"`           |
| `yAxisLabel`          | `"Impact ↑"`           |

### 7.2 Pre-loading arrows (input)

To supply initial arrows from a Canvas App variable, set `arrowsJson` in the **OnStart** or a button's **OnSelect**:

```
// Store in a global variable
Set(
    gArrows,
    "[{\"id\":\"a1\",\"startX\":0.2,\"startY\":0.75,\"endX\":0.8,\"endY\":0.25,\"color\":\"#0078d4\",\"label\":\"Initiative A\"}]"
);
```

Then bind the control property:

```
QuadrantControl1.arrowsJson = gArrows
```

### 7.3 Reading the output (retrieving arrows)

After the user interacts with the control, read the updated JSON with:

```
QuadrantControl1.arrowsJson
```

Example — save to a collection on a **Save** button:

```
// OnSelect of a "Save" button
Set(gSavedArrows, QuadrantControl1.arrowsJson);

// Optionally patch to Dataverse / SharePoint
Patch(
    MyArrowsTable,
    Defaults(MyArrowsTable),
    { ArrowData: QuadrantControl1.arrowsJson }
)
```

### 7.4 Resetting / loading new arrows

To load a fresh set of arrows programmatically (e.g., from a SharePoint column):

```
// OnSelect of a "Load" button
Set(
    gArrows,
    LookUp(MyArrowsTable, Title = "Session1").ArrowData
);
```

Because `arrowsJson` is a bound property, updating `gArrows` re-renders the control with the loaded arrows.

---

## Part 8 — Arrow JSON Schema

The `arrowsJson` property is a JSON array of `ArrowData` objects:

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
  },
  {
    "id":     "a2",
    "startX": 0.50,
    "startY": 0.50,
    "endX":   0.25,
    "endY":   0.25,
    "color":  "#107c10"
  }
]
```

| Field     | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `id`      | string | Yes      | Unique identifier. Auto-assigned when drawn interactively. |
| `startX`  | number | Yes      | Normalised X of start point (0 = left edge, 1 = right edge). |
| `startY`  | number | Yes      | Normalised Y of start point (0 = top edge, 1 = bottom edge). |
| `endX`    | number | Yes      | Normalised X of end point. |
| `endY`    | number | Yes      | Normalised Y of end point. |
| `label`   | string | No       | Optional text shown mid-arrow. |
| `color`   | string | No       | CSS hex colour (e.g. `"#0078d4"`). Defaults to blue. |

---

## Part 9 — Interaction Reference

| Action | How |
|--------|-----|
| Add arrow | Click **+ Add Arrow**, then click once for start, once for end. |
| Cancel add | Press **Esc** at any time during placement. |
| Select arrow | Click anywhere on the arrow line. |
| Move arrow | Drag the selected arrow body. |
| Move endpoint | Drag the green (start) or red (end) circle handle. |
| Delete arrow | Select arrow, then click **✕ Delete Selected** or press **Delete**. |
| Clear all | Click **⊗ Clear All**. |
| Copy JSON | Click **⬇ Export JSON** — copies the current array to the clipboard. |

---

## Part 10 — Updating the Control

After code changes:

1. `npm run rebuild` (in the PCF project root)
2. `dotnet build` (in the solution project)
3. Re-import the solution zip in the Power Apps portal.

For CI/CD pipelines, use the **Power Platform Build Tools** GitHub Actions or Azure DevOps extension.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Control not visible in Insert panel | Ensure the "PCF for canvas apps" experimental flag is enabled (Part 5). |
| `npm install` fails | Confirm Node.js ≥ 18 is installed and your corporate proxy is configured. |
| `pac solution import` auth error | Re-run `pac auth create` and verify the target environment URL. |
| Arrows disappear after reload | Persist `QuadrantControl1.arrowsJson` to a data source on Save. |
| Control renders blank (white) | Resize the control — it needs non-zero width and height to paint the SVG. |
| TypeScript errors on `generated/ManifestTypes.d.ts` | Run `npm run refreshTypes` to regenerate from the manifest. |
