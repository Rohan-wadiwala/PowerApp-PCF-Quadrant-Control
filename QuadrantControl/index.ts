import { IInputs, IOutputs } from "./generated/ManifestTypes";

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

interface ArrowData {
    id: string;
    startX: number; // normalised 0–1 (left→right)
    startY: number; // normalised 0–1 (top→bottom)
    endX: number;
    endY: number;
    label?: string;
    color?: string;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type DragMode =
    | "none"
    | "adding-start"   // waiting for first click (start point)
    | "adding-end"     // waiting for second click (end point)
    | "dragging-arrow" // moving whole arrow
    | "dragging-start" // moving start handle
    | "dragging-end";  // moving end handle

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ARROW_COLORS = [
    "#0078d4", "#107c10", "#d83b01", "#5c2d91",
    "#008272", "#ca5010", "#004e8c", "#e3008c",
];

const HANDLE_RADIUS = 9;
const HIT_WIDTH = 18;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(v: number): number {
    return Math.max(0, Math.min(1, v));
}

function uid(): string {
    return "a" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

function safeColorId(color: string): string {
    return "ah_" + color.replace(/[^a-zA-Z0-9]/g, "");
}

// ---------------------------------------------------------------------------
// PCF Control
// ---------------------------------------------------------------------------

export class QuadrantControl implements ComponentFramework.StandardControl<IInputs, IOutputs> {

    // DOM
    private container!: HTMLDivElement;
    private svgEl!: SVGSVGElement;
    private statusEl!: HTMLDivElement;

    // State
    private arrows: ArrowData[] = [];
    private selectedId: string | null = null;
    private dragMode: DragMode = "none";
    private pendingStartNX = 0;
    private pendingStartNY = 0;
    private pendingDotEl: SVGCircleElement | null = null;
    private previewLineEl: SVGLineElement | null = null;
    private dragLastNX = 0;
    private dragLastNY = 0;
    private colorIndex = 0;

    // Labels
    private labelTL = "Q1 — Top Left";
    private labelTR = "Q2 — Top Right";
    private labelBL = "Q3 — Bottom Left";
    private labelBR = "Q4 — Bottom Right";
    private xAxisLabel = "";
    private yAxisLabel = "";

    // The container element passed by PCF — its size IS the control's allocated size.
    private _pcfContainer!: HTMLDivElement;

    // Cached allocated dimensions updated by the ResizeObserver AND context.mode.
    private _allocW = 0;
    private _allocH = 0;

    // PCF
    private notifyOutputChanged!: () => void;
    private _resizeObserver?: ResizeObserver;

    // Bound handlers stored for cleanup
    private _onMouseMove!: (e: MouseEvent) => void;
    private _onMouseUp!: (e: MouseEvent) => void;
    private _onKeyDown!: (e: KeyboardEvent) => void;

    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------

    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        _state: ComponentFramework.Dictionary,
        container: HTMLDivElement,
    ): void {
        try {
            this._initImpl(context, notifyOutputChanged, container);
        } catch (err) {
            const errDiv = document.createElement("div");
            errDiv.style.cssText = "padding:12px;color:#c42b1c;font-family:monospace;" +
                "font-size:11px;border:2px solid #c42b1c;background:#fdf3f2;" +
                "white-space:pre-wrap;word-break:break-all";
            errDiv.textContent = "QuadrantControl init error: " + String(err);
            container.appendChild(errDiv);
        }
    }

    private _initImpl(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        container: HTMLDivElement,
    ): void {
        this.notifyOutputChanged = notifyOutputChanged;

        // Root container
        this.container = document.createElement("div");
        this.container.className = "qc-root";

        // Toolbar
        this.container.appendChild(this.buildToolbar());

        // Status bar
        this.statusEl = document.createElement("div");
        this.statusEl.className = "qc-status";
        this.statusEl.style.display = "none";
        this.container.appendChild(this.statusEl);

        // SVG canvas
        this.svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
        this.svgEl.setAttribute("class", "qc-svg");
        this.container.appendChild(this.svgEl);

        // Bind and register global events (needed so drag works outside the SVG)
        this._onMouseMove = this.onMouseMove.bind(this);
        this._onMouseUp   = this.onMouseUp.bind(this);
        this._onKeyDown   = this.onKeyDown.bind(this);
        this.svgEl.addEventListener("click",     this.onSvgClick.bind(this));
        this.svgEl.addEventListener("mousemove", this._onMouseMove);
        document.addEventListener("mousemove",   this._onMouseMove);
        document.addEventListener("mouseup",     this._onMouseUp);
        document.addEventListener("keydown",     this._onKeyDown);

        this._pcfContainer = container;
        container.appendChild(this.container);

        // ResizeObserver on the PCF container is the primary source of truth for
        // width/height. It fires AFTER layout, so dimensions are always accurate.
        // This handles Canvas App Width/Height property changes, test harness resize,
        // and initial sizing — all in one place.
        this._resizeObserver = new ResizeObserver(entries => {
            const rect = entries[0]?.contentRect;
            if (rect && rect.width > 0 && rect.height > 0) {
                this._allocW = rect.width;
                this._allocH = rect.height;
                this.render();
            }
        });
        this._resizeObserver.observe(container);

        this.loadFromContext(context);
        this.render();
    }

    public updateView(context: ComponentFramework.Context<IInputs>): void {
        try {
            this.loadFromContext(context);
            this.render();
        } catch (_err) {
            // updateView errors are non-fatal — silently ignore
        }
    }

    public getOutputs(): IOutputs {
        return { arrowsJson: JSON.stringify(this.arrows) };
    }

    public destroy(): void {
        document.removeEventListener("mousemove", this._onMouseMove);
        document.removeEventListener("mouseup",   this._onMouseUp);
        document.removeEventListener("keydown",   this._onKeyDown);
        this._resizeObserver?.disconnect();
    }

    // -----------------------------------------------------------------------
    // Context loading
    // -----------------------------------------------------------------------

    private loadFromContext(context: ComponentFramework.Context<IInputs>): void {
        // Quadrant labels
        const tl = context.parameters.quadrantTopLeft?.raw;
        const tr = context.parameters.quadrantTopRight?.raw;
        const bl = context.parameters.quadrantBottomLeft?.raw;
        const br = context.parameters.quadrantBottomRight?.raw;
        const xl = context.parameters.xAxisLabel?.raw;
        const yl = context.parameters.yAxisLabel?.raw;
        if (tl) this.labelTL = tl;
        if (tr) this.labelTR = tr;
        if (bl) this.labelBL = bl;
        if (br) this.labelBR = br;
        if (xl) this.xAxisLabel = xl;
        if (yl) this.yAxisLabel = yl;

        // context.mode is a secondary source — also updated by the ResizeObserver.
        // Both paths write to _allocW/_allocH; render() reads from there.
        const w = context.mode.allocatedWidth;
        const h = context.mode.allocatedHeight;
        if (w > 0) this._allocW = w;
        if (h > 0) this._allocH = h;

        // Load arrow JSON only when it actually changed
        const raw = context.parameters.arrowsJson?.raw;
        if (raw) {
            const current = JSON.stringify(this.arrows);
            if (raw !== current) {
                try {
                    const parsed = JSON.parse(raw);
                    this.arrows = Array.isArray(parsed)
                        ? parsed
                        : Array.isArray(parsed?.arrows) ? parsed.arrows : [];
                } catch {
                    // Invalid JSON — leave current state unchanged
                }
            }
        }
    }

    // -----------------------------------------------------------------------
    // Toolbar
    // -----------------------------------------------------------------------

    private buildToolbar(): HTMLDivElement {
        const bar = document.createElement("div");
        bar.className = "qc-toolbar";

        bar.appendChild(this.makeBtn("＋ Add Arrow",      "qc-btn qc-btn-primary",   () => this.startAddArrow()));
        bar.appendChild(this.makeBtn("✕ Delete Selected", "qc-btn qc-btn-danger",    () => this.deleteSelected()));
        bar.appendChild(this.makeBtn("⊗ Clear All",       "qc-btn qc-btn-secondary", () => this.clearAll()));
        bar.appendChild(this.makeBtn("⬇ Export JSON",     "qc-btn qc-btn-secondary", () => this.exportJson()));

        return bar;
    }

    private makeBtn(label: string, cls: string, handler: () => void): HTMLButtonElement {
        const btn = document.createElement("button");
        btn.type      = "button";
        btn.textContent = label;
        btn.className   = cls;
        btn.addEventListener("click", handler);
        return btn;
    }

    // -----------------------------------------------------------------------
    // Actions
    // -----------------------------------------------------------------------

    private startAddArrow(): void {
        this.dragMode = "adding-start";
        this.svgEl.style.cursor = "crosshair";
        this.setStatus("Click to place the arrow start point  |  Esc to cancel");
    }

    private cancelAddArrow(): void {
        this.dragMode = "none";
        this.svgEl.style.cursor = "";
        this.setStatus("");
        this.removePendingDot();
        this.removePreviewLine();
    }

    private deleteSelected(): void {
        if (!this.selectedId) return;
        this.arrows    = this.arrows.filter(a => a.id !== this.selectedId);
        this.selectedId = null;
        this.render();
        this.notifyOutputChanged();
    }

    private clearAll(): void {
        if (this.arrows.length === 0) return;
        this.arrows    = [];
        this.selectedId = null;
        this.dragMode   = "none";
        this.cancelAddArrow();
        this.render();
        this.notifyOutputChanged();
    }

    private exportJson(): void {
        const json = JSON.stringify(this.arrows, null, 2);
        if (navigator.clipboard) {
            navigator.clipboard.writeText(json).then(() =>
                this.setStatus("JSON copied to clipboard.", 3000));
        } else {
            // Fallback for browsers without clipboard API
            window.prompt("Arrow JSON (copy with Ctrl+A, Ctrl+C):", json);
        }
        this.notifyOutputChanged();
    }

    private finishAddArrow(endNX: number, endNY: number): void {
        const color = ARROW_COLORS[this.colorIndex % ARROW_COLORS.length];
        this.colorIndex++;

        this.arrows.push({
            id:     uid(),
            startX: this.pendingStartNX,
            startY: this.pendingStartNY,
            endX:   clamp(endNX),
            endY:   clamp(endNY),
            color,
        });

        this.selectedId = this.arrows[this.arrows.length - 1].id;
        this.dragMode   = "none";
        this.svgEl.style.cursor = "";
        this.setStatus("");
        this.removePendingDot();
        this.removePreviewLine();
        this.render();
        this.notifyOutputChanged();
    }

    // -----------------------------------------------------------------------
    // Status bar
    // -----------------------------------------------------------------------

    private setStatus(msg: string, clearAfterMs?: number): void {
        this.statusEl.textContent   = msg;
        this.statusEl.style.display = msg ? "block" : "none";
        if (clearAfterMs) {
            setTimeout(() => {
                this.statusEl.textContent   = "";
                this.statusEl.style.display = "none";
            }, clearAfterMs);
        }
    }

    // -----------------------------------------------------------------------
    // Coordinate helpers
    // -----------------------------------------------------------------------

    private svgRect(): DOMRect {
        return this.svgEl.getBoundingClientRect();
    }

    private toNorm(clientX: number, clientY: number): { nx: number; ny: number } {
        const r = this.svgRect();
        return {
            nx: clamp((clientX - r.left) / r.width),
            ny: clamp((clientY - r.top)  / r.height),
        };
    }

    private toPx(nx: number, ny: number): { x: number; y: number } {
        const r = this.svgRect();
        return { x: nx * r.width, y: ny * r.height };
    }

    // -----------------------------------------------------------------------
    // Event handlers
    // -----------------------------------------------------------------------

    private onSvgClick(e: MouseEvent): void {
        const { nx, ny } = this.toNorm(e.clientX, e.clientY);

        if (this.dragMode === "adding-start") {
            this.pendingStartNX = nx;
            this.pendingStartNY = ny;
            this.dragMode       = "adding-end";
            this.showPendingDot(nx, ny);
            this.setStatus("Click to place the arrow end point  |  Esc to cancel");

        } else if (this.dragMode === "adding-end") {
            this.finishAddArrow(nx, ny);

        } else if (this.dragMode === "none") {
            // Click on background → deselect
            if (this.selectedId) {
                this.selectedId = null;
                this.render();
            }
        }
    }

    private onMouseMove(e: MouseEvent): void {
        const { nx, ny } = this.toNorm(e.clientX, e.clientY);

        switch (this.dragMode) {

            case "adding-end": {
                this.updatePreviewLine(nx, ny);
                break;
            }

            case "dragging-arrow": {
                const arrow = this.arrows.find(a => a.id === this.selectedId);
                if (!arrow) break;
                const dx = nx - this.dragLastNX;
                const dy = ny - this.dragLastNY;
                // Clamp whole arrow: neither endpoint can go outside [0,1]
                const newSX = clamp(arrow.startX + dx);
                const newSY = clamp(arrow.startY + dy);
                const newEX = clamp(arrow.endX   + dx);
                const newEY = clamp(arrow.endY   + dy);
                arrow.startX = newSX; arrow.startY = newSY;
                arrow.endX   = newEX; arrow.endY   = newEY;
                this.dragLastNX = nx; this.dragLastNY = ny;
                this.renderArrowsOnly();
                break;
            }

            case "dragging-start": {
                const arrow = this.arrows.find(a => a.id === this.selectedId);
                if (!arrow) break;
                arrow.startX = clamp(nx);
                arrow.startY = clamp(ny);
                this.renderArrowsOnly();
                break;
            }

            case "dragging-end": {
                const arrow = this.arrows.find(a => a.id === this.selectedId);
                if (!arrow) break;
                arrow.endX = clamp(nx);
                arrow.endY = clamp(ny);
                this.renderArrowsOnly();
                break;
            }
        }
    }

    private onMouseUp(_e: MouseEvent): void {
        if (
            this.dragMode === "dragging-arrow" ||
            this.dragMode === "dragging-start" ||
            this.dragMode === "dragging-end"
        ) {
            this.dragMode = "none";
            this.svgEl.style.cursor = "";
            this.render();
            this.notifyOutputChanged();
        }
    }

    private onKeyDown(e: KeyboardEvent): void {
        if (e.key === "Escape") {
            this.cancelAddArrow();
        } else if ((e.key === "Delete" || e.key === "Backspace") && this.selectedId) {
            this.deleteSelected();
        }
    }

    // -----------------------------------------------------------------------
    // Rendering — full
    // -----------------------------------------------------------------------

    // Returns the SVG canvas dimensions to use for the current render pass.
    // Primary source: _allocW/_allocH (kept fresh by ResizeObserver + context.mode).
    // Fallback: read the PCF container's live client dimensions.
    private svgDimensions(): { w: number; h: number } {
        const totalW = this._allocW > 0
            ? this._allocW
            : (this._pcfContainer?.clientWidth  || 600);
        const totalH = this._allocH > 0
            ? this._allocH
            : (this._pcfContainer?.clientHeight || 500);

        const toolbarH = this.container.querySelector<HTMLElement>(".qc-toolbar")?.offsetHeight ?? 40;
        const statusH  = this.statusEl.style.display !== "none"
            ? (this.statusEl.offsetHeight || 0)
            : 0;

        return {
            w: Math.max(80, totalW),
            h: Math.max(80, totalH - toolbarH - statusH - 2), // -2 for top/bottom border
        };
    }

    private render(): void {
        const { w, h } = this.svgDimensions();

        // Pin SVG element size explicitly so it doesn't rely on CSS flex timing
        this.svgEl.style.width  = w + "px";
        this.svgEl.style.height = h + "px";

        this.svgEl.innerHTML = "";

        // 1. Defs (arrowhead markers)
        this.svgEl.appendChild(this.buildDefs());

        // 2. Background layer
        const bgLayer = this.svgNS("g") as SVGGElement;
        bgLayer.setAttribute("class", "qc-bg-layer");
        this.drawBackground(bgLayer, w, h);
        this.svgEl.appendChild(bgLayer);

        // 3. Arrows layer
        const arrowLayer = this.svgNS("g") as SVGGElement;
        arrowLayer.setAttribute("class", "qc-arrows-layer");
        this.arrows.forEach(a => this.drawArrow(a, w, h, arrowLayer));
        this.svgEl.appendChild(arrowLayer);
    }

    // Faster re-render during drag — only replaces the arrows layer
    private renderArrowsOnly(): void {
        const layer = this.svgEl.querySelector<SVGGElement>(".qc-arrows-layer");
        if (!layer) { this.render(); return; }
        const { w, h } = this.svgDimensions();
        layer.innerHTML = "";
        this.arrows.forEach(a => this.drawArrow(a, w, h, layer));
    }

    // -----------------------------------------------------------------------
    // SVG building helpers
    // -----------------------------------------------------------------------

    private buildDefs(): SVGDefsElement {
        const defs = this.svgNS("defs") as SVGDefsElement;
        const colors = new Set<string>(this.arrows.map(a => a.color || "#0078d4"));
        colors.add("#0078d4"); // always include default
        colors.add("#ff6600"); // preview arrow
        colors.forEach(c => defs.appendChild(this.makeMarker(c)));
        return defs;
    }

    private makeMarker(color: string): SVGMarkerElement {
        const m = this.svgNS("marker") as SVGMarkerElement;
        m.setAttribute("id",          safeColorId(color));
        m.setAttribute("markerWidth",  "10");
        m.setAttribute("markerHeight", "7");
        m.setAttribute("refX",         "8");
        m.setAttribute("refY",         "3.5");
        m.setAttribute("orient",       "auto");
        const poly = this.svgNS("polygon");
        poly.setAttribute("points", "0 0, 10 3.5, 0 7");
        poly.setAttribute("fill",   color);
        m.appendChild(poly);
        return m;
    }

    private drawBackground(layer: SVGGElement, w: number, h: number): void {
        const AXIS_PADDING = this.yAxisLabel ? 28 : 0; // room for Y-axis label on left
        const BOTTOM_PAD   = this.xAxisLabel ? 24 : 0;
        const midX = (w - AXIS_PADDING) / 2 + AXIS_PADDING;
        const midY = (h - BOTTOM_PAD)   / 2;

        const quadConfigs = [
            { x: AXIS_PADDING, y: 0,    w: midX - AXIS_PADDING, h: midY,           fill: "#ebf3fd", label: this.labelTL },
            { x: midX,         y: 0,    w: w - midX,             h: midY,           fill: "#ebfbeb", label: this.labelTR },
            { x: AXIS_PADDING, y: midY, w: midX - AXIS_PADDING,  h: h - midY - BOTTOM_PAD, fill: "#fdf3e7", label: this.labelBL },
            { x: midX,         y: midY, w: w - midX,             h: h - midY - BOTTOM_PAD, fill: "#f3ebfd", label: this.labelBR },
        ];

        // Quadrant backgrounds + corner labels
        quadConfigs.forEach(q => {
            const rect = this.svgNS("rect") as SVGRectElement;
            rect.setAttribute("x",      q.x.toString());
            rect.setAttribute("y",      q.y.toString());
            rect.setAttribute("width",  q.w.toString());
            rect.setAttribute("height", q.h.toString());
            rect.setAttribute("fill",   q.fill);
            rect.setAttribute("stroke", "#c8cdd3");
            rect.setAttribute("stroke-width", "1");
            layer.appendChild(rect);

            const tx = q.x + q.w / 2;
            const ty = q.y + 22;
            layer.appendChild(this.makeSvgText(tx, ty, q.label, {
                fontSize: "13", fontWeight: "600", fill: "#444", anchor: "middle",
            }));
        });

        // Centre divider lines
        layer.appendChild(this.makeSvgLine(AXIS_PADDING, midY, w, midY, "#9ba5b0", 2));
        layer.appendChild(this.makeSvgLine(midX,         0,    midX, h - BOTTOM_PAD, "#9ba5b0", 2));

        // Outer border
        const border = this.svgNS("rect") as SVGRectElement;
        border.setAttribute("x",            AXIS_PADDING.toString());
        border.setAttribute("y",            "0");
        border.setAttribute("width",        (w - AXIS_PADDING).toString());
        border.setAttribute("height",       (h - BOTTOM_PAD).toString());
        border.setAttribute("fill",         "none");
        border.setAttribute("stroke",       "#9ba5b0");
        border.setAttribute("stroke-width", "2");
        layer.appendChild(border);

        // X-axis label
        if (this.xAxisLabel) {
            const xt = this.makeSvgText(
                (AXIS_PADDING + w) / 2,
                h - 4,
                this.xAxisLabel,
                { fontSize: "12", fontWeight: "500", fill: "#666", anchor: "middle" },
            );
            layer.appendChild(xt);
        }

        // Y-axis label (rotated)
        if (this.yAxisLabel) {
            const yt = this.makeSvgText(
                12,
                (h - BOTTOM_PAD) / 2,
                this.yAxisLabel,
                { fontSize: "12", fontWeight: "500", fill: "#666", anchor: "middle" },
            );
            yt.setAttribute("transform", `rotate(-90, 12, ${(h - BOTTOM_PAD) / 2})`);
            layer.appendChild(yt);
        }
    }

    // -----------------------------------------------------------------------
    // Arrow rendering
    // -----------------------------------------------------------------------

    private drawArrow(arrow: ArrowData, w: number, h: number, layer: SVGGElement): void {
        const { x: x1, y: y1 } = this.toPxDirect(arrow.startX, arrow.startY, w, h);
        const { x: x2, y: y2 } = this.toPxDirect(arrow.endX,   arrow.endY,   w, h);
        const isSelected        = arrow.id === this.selectedId;
        const color             = arrow.color || "#0078d4";
        const markerId          = safeColorId(color);

        // Selection glow behind the line
        if (isSelected) {
            const glow = this.makeSvgLine(x1, y1, x2, y2, "rgba(255,210,0,0.45)", 12);
            glow.setAttribute("stroke-linecap", "round");
            layer.appendChild(glow);
        }

        // Main arrow line
        const line = this.makeSvgLine(x1, y1, x2, y2, color, isSelected ? 3 : 2);
        line.setAttribute("stroke-linecap", "round");
        line.setAttribute("marker-end", `url(#${markerId})`);
        layer.appendChild(line);

        // Transparent wide hit area for easier clicking/dragging
        const hit = this.makeSvgLine(x1, y1, x2, y2, "transparent", HIT_WIDTH);
        hit.style.cursor = "move";
        hit.addEventListener("mousedown", (e: MouseEvent) => {
            e.stopPropagation();
            const { nx, ny } = this.toNorm(e.clientX, e.clientY);
            this.selectedId   = arrow.id;
            this.dragMode     = "dragging-arrow";
            this.dragLastNX   = nx;
            this.dragLastNY   = ny;
            this.svgEl.style.cursor = "grabbing";
            this.render();
        });
        hit.addEventListener("click", (e: MouseEvent) => {
            e.stopPropagation();
            if (this.dragMode === "none") {
                this.selectedId = arrow.id;
                this.render();
            }
        });
        layer.appendChild(hit);

        // Mid-line label
        if (arrow.label) {
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            layer.appendChild(this.makeSvgText(mx, my - 10, arrow.label, {
                fontSize: "12", fontWeight: "500", fill: color, anchor: "middle",
            }));
        }

        // Drag handles (only when selected)
        if (isSelected) {
            this.drawHandle(layer, x1, y1, arrow.id, "start", "#107c10");
            this.drawHandle(layer, x2, y2, arrow.id, "end",   "#d83b01");
        }
    }

    private drawHandle(
        layer: SVGGElement,
        x: number,
        y: number,
        arrowId: string,
        type: "start" | "end",
        color: string,
    ): void {
        const circle = this.svgNS("circle") as SVGCircleElement;
        circle.setAttribute("cx",           x.toString());
        circle.setAttribute("cy",           y.toString());
        circle.setAttribute("r",            HANDLE_RADIUS.toString());
        circle.setAttribute("fill",         color);
        circle.setAttribute("stroke",       "white");
        circle.setAttribute("stroke-width", "2");
        circle.style.cursor = "grab";

        circle.addEventListener("mousedown", (e: MouseEvent) => {
            e.stopPropagation();
            this.selectedId = arrowId;
            this.dragMode   = type === "start" ? "dragging-start" : "dragging-end";
            this.svgEl.style.cursor = "grabbing";
        });

        layer.appendChild(circle);
    }

    // -----------------------------------------------------------------------
    // "Add arrow" visual helpers (pending dot + preview line)
    // -----------------------------------------------------------------------

    private showPendingDot(nx: number, ny: number): void {
        this.removePendingDot();
        const { x, y } = this.toPxFromNorm(nx, ny);
        const dot = this.svgNS("circle") as SVGCircleElement;
        dot.setAttribute("cx",           x.toString());
        dot.setAttribute("cy",           y.toString());
        dot.setAttribute("r",            "7");
        dot.setAttribute("fill",         "#ff6600");
        dot.setAttribute("stroke",       "white");
        dot.setAttribute("stroke-width", "2");
        dot.setAttribute("class",        "qc-pending-dot");
        dot.style.pointerEvents = "none";
        this.svgEl.appendChild(dot);
        this.pendingDotEl = dot;
    }

    private removePendingDot(): void {
        this.pendingDotEl?.remove();
        this.pendingDotEl = null;
    }

    private updatePreviewLine(endNX: number, endNY: number): void {
        const { x: x1, y: y1 } = this.toPxFromNorm(this.pendingStartNX, this.pendingStartNY);
        const { x: x2, y: y2 } = this.toPxFromNorm(endNX,              endNY);

        if (!this.previewLineEl) {
            const line = this.makeSvgLine(x1, y1, x2, y2, "#ff6600", 2);
            line.setAttribute("stroke-dasharray", "7 4");
            line.setAttribute("stroke-linecap",   "round");
            line.setAttribute("marker-end",       `url(#${safeColorId("#ff6600")})`);
            line.setAttribute("class",            "qc-preview-line");
            line.style.pointerEvents = "none";
            this.svgEl.appendChild(line);
            this.previewLineEl = line;
        } else {
            this.previewLineEl.setAttribute("x1", x1.toString());
            this.previewLineEl.setAttribute("y1", y1.toString());
            this.previewLineEl.setAttribute("x2", x2.toString());
            this.previewLineEl.setAttribute("y2", y2.toString());
        }
    }

    private removePreviewLine(): void {
        this.previewLineEl?.remove();
        this.previewLineEl = null;
    }

    // -----------------------------------------------------------------------
    // Low-level SVG element factory helpers
    // -----------------------------------------------------------------------

    private svgNS(tag: string): SVGElement {
        return document.createElementNS("http://www.w3.org/2000/svg", tag);
    }

    private makeSvgLine(
        x1: number, y1: number,
        x2: number, y2: number,
        stroke: string,
        strokeWidth: number,
    ): SVGLineElement {
        const line = this.svgNS("line") as SVGLineElement;
        line.setAttribute("x1",           x1.toString());
        line.setAttribute("y1",           y1.toString());
        line.setAttribute("x2",           x2.toString());
        line.setAttribute("y2",           y2.toString());
        line.setAttribute("stroke",       stroke);
        line.setAttribute("stroke-width", strokeWidth.toString());
        return line;
    }

    private makeSvgText(
        x: number, y: number,
        content: string,
        opts: { fontSize?: string; fontWeight?: string; fill?: string; anchor?: string },
    ): SVGTextElement {
        const text = this.svgNS("text") as SVGTextElement;
        text.setAttribute("x",            x.toString());
        text.setAttribute("y",            y.toString());
        text.setAttribute("font-family",  "Segoe UI, system-ui, sans-serif");
        text.setAttribute("font-size",    opts.fontSize   ?? "13");
        text.setAttribute("font-weight",  opts.fontWeight ?? "400");
        text.setAttribute("fill",         opts.fill       ?? "#333");
        text.setAttribute("text-anchor",  opts.anchor     ?? "start");
        text.style.userSelect = "none";
        text.textContent = content;
        return text;
    }

    private toPxFromNorm(nx: number, ny: number): { x: number; y: number } {
        const r = this.svgRect();
        return { x: nx * (r.width || 600), y: ny * (r.height || 500) };
    }

    // Avoids re-calling getBoundingClientRect inside a tight loop
    private toPxDirect(nx: number, ny: number, w: number, h: number): { x: number; y: number } {
        return { x: nx * w, y: ny * h };
    }
}
