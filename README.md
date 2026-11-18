# Vectorize: raster → SVG, entirely in the browser

Vectorize converts PNG, JPG, BMP and WebP images into clean, compact, scalable SVG.
All processing runs client-side in a Web Worker. Nothing is uploaded and there is no server.

- **Three modes:** Black & white (threshold + outline trace), Color (quantize to 2–64 colors and stack layers back to front), and Line art (true centerline strokes for sketches).
- **Full pipeline:** blur, denoise, contrast, background removal → Otsu / k-means++ / median cut → contour tracing with holes → Ramer–Douglas–Peucker → Schneider Bézier fitting with corner detection → speck removal → compact SVG.
- **Live preview:** debounced re-tracing off the main thread with a progress bar. Side-by-side or before/after slider view, synced zoom and pan (wheel, drag, pinch, keyboard), and a path/node overlay.
- **Editable palette:** recolor or remove any layer.
- **Export:** download SVG, copy SVG code, or export a PNG at 0.5×–8×. Shows path count, node count and file size.
- Light and dark mode, responsive (sidebar on desktop, bottom sheet on mobile), keyboard accessible.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest unit + synthetic-image tests
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/ locally
```

Requires Node 18+ (20 recommended).

## Deploy

The build output (`dist/`) is a static site. Asset paths are relative (`base: './'`), so it works from any sub-path.

**Netlify:** connect the repo; `netlify.toml` already sets `npm run build` → `dist`. Or drag-and-drop the `dist/` folder into Netlify Drop.

**GitHub Pages:** `.github/workflows/deploy.yml` runs the tests, builds with `BASE_PATH=/<repo>/` and publishes on every push to `main`. In the repo settings choose *Pages → Source: GitHub Actions*.

**Anything else** (Vercel, Cloudflare Pages, S3, nginx): run `npm run build` and serve `dist/`. To force an absolute base, use `BASE_PATH=/my/path/ npm run build`.

## Architecture

```
src/
├─ core/                 Pure TypeScript, no DOM. Runs in the worker, on the main thread, and in tests.
│  ├─ types.ts           Settings, geometry and result types
│  ├─ presets.ts         Defaults + Logo / Illustration / Photo / Sketch presets
│  ├─ preprocess.ts      median denoise, 3-pass box (≈Gaussian) blur, contrast, background removal
│  ├─ segment.ts         grayscale, Otsu threshold, B&W labelling
│  ├─ quantize.ts        k-means++ and median cut (flat-pixel sampling, 18-bit lookup cache)
│  ├─ cleanup.ts         speck removal: merge small connected regions into their dominant neighbour
│  ├─ contour.ts         crack-following boundary tracer (outer loops and holes) + edge-midpoint pass
│  ├─ simplify.ts        Ramer–Douglas–Peucker (open + closed, iterative)
│  ├─ bezier.ts          Schneider least-squares cubic fitting, corner detection, chamfer collapsing
│  ├─ centerline.ts      Zhang–Suen thinning, distance transform, skeleton → polylines
│  ├─ svg.ts             compact path-data writer + SVG document builder
│  └─ pipeline.ts        orchestrates everything → TraceResult
├─ worker/               Web Worker entry + message protocol
├─ hooks/                useTracer (worker lifecycle + cancellation), useDebounced, useTheme
├─ lib/                  image decoding/downscaling, exporters (SVG/PNG/clipboard), sample image
└─ components/           DropZone, Preview + Viewport (synced zoom/pan), Controls, Palette, ExportPanel
```

### Data flow

1. **Load:** `createImageBitmap` decodes the file. An `<img>` decode is the fallback, and anything that fails gets a friendly error. Images longer than 2000px on a side are downscaled with high-quality canvas smoothing. A toggle keeps full resolution, capped at 8192px for canvas limits.
2. **Worker:** the main thread sends a copy of the `ImageData` (as a transferable buffer) and the debounced settings. If a request arrives while the worker is busy, the worker is **terminated and recreated**, which cancels the old job instantly instead of queueing it.
3. **Pipeline (in the worker):** preprocess → segment into a label map → remove specks → for each layer: build mask → trace → simplify → fit curves → path data.
4. **Main thread:** `buildSvg(result, overrides)` assembles the final document. It is cheap, so palette edits (recolor or hide) apply instantly without re-tracing.

## Algorithms and trade-offs

**Built-in tracer instead of potrace or imagetracerjs.** The brief allowed either library as long as a built-in tracer was included as a fallback. Vectorize ships only the built-in tracer: it's about 20 KB in the worker, has no WASM or licensing questions (potrace is GPL), and every stage is unit-tested and tunable from the UI. Potrace's optimal-polygon step gives slightly better results on very small glyphs. The `core/` boundary is where a potrace-WASM backend could be added.

**Contour tracing.** The tracer follows pixel *edges* (crack following) rather than pixel centres. Every boundary closes exactly, holes come out as separate loops with opposite winding, and `fill-rule="evenodd"` renders the mask exactly with no hole bookkeeping. Diagonal "saddle" pixels are always resolved the same way. Before simplifying, the loop is re-sampled through the **midpoints of its unit edges**, which turns 1-px staircases into real diagonals. Convex corners briefly become 0.5px chamfers, which a later step collapses back into exact sharp corners.

**Seam-free color layers.** Tracing each color region separately leaves hairline gaps where anti-aliasing and simplification don't line up. Vectorize **stacks** instead: layer *k* covers every pixel whose color ranks at *k* or above, so each layer under-paints everything drawn on top of it. Gaps are impossible by construction, as the synthetic test verifies pixel by pixel. The cost is somewhat larger lower layers. A useful side effect: removing a layer from the palette lets the layer beneath show through. The largest-area color goes at the back. In B&W, white is always at the back, so removing it leaves black shapes on transparency.

**Quantization.** k-means++ (seeded, so results are deterministic) runs on up to 60k sampled pixels. Pixels on edges are **excluded from the sample** when enough flat pixels exist, so clusters aren't wasted on anti-aliasing halos. Near-duplicate centres are merged. Assigning every pixel goes through an 18-bit color cache, which makes 64 colors on a 2.6-megapixel image take about 3 s. Median cut is offered as a faster, more even alternative.

**Simplification and curve fitting.** RDP (the *Simplify* slider, in pixels) removes vertices within tolerance. Vertices that turn more than the *Corner angle* stay sharp. Each run between corners is densified and fitted with **Schneider's algorithm** (least squares plus Newton reparameterisation, splitting at the worst point with a shared tangent, so joins are G1-smooth). *Smoothness* is the fitting tolerance in pixels; 0 outputs plain polygons. Nearly straight cubics are written as lines.

**Line art.** Threshold, then remove specks, then **Zhang–Suen thinning** (frontier-based, so each pass costs about the perimeter rather than the whole image) plus staircase cleanup. Junction pixel clumps are merged, and the skeleton graph is walked into polylines. Short thinning spurs are pruned. Stroke width is 2 × the median distance-transform value along the skeleton. This works best for drawings with fairly even line weight. Solid filled shapes get a single fat stroke, so use B&W mode for those.

**SVG compactness.** Relative commands (`m l h v c s z`) are used throughout. `s` is emitted when a control point is a reflection, and a closing line segment becomes `z`. Coordinates are snapped to a fixed-point grid (1 or 2 decimals) *before* deltas are taken, so rounding never drifts along a path. Leading zeros are dropped (`.5`), separators are omitted where the grammar allows (`-.5`, `1.5.5`), fills use short hex where possible, there's one `<path>` per color, `fill-rule` is set once on the root, and the `viewBox` is the processing size while `width`/`height` are the original size.

## Tests

`npm test` runs 35 Vitest tests:

- **simplify.test.ts:** RDP tolerance guarantees, staircases, closed rings and corners, 200k-point input.
- **bezier.test.ts:** recovering a known cubic, semicircle error bounds, G1 continuity, corners vs curves, chamfer collapsing.
- **svg.test.ts** (jsdom): path-data syntax and precision, drift-free rounding, `s`/`m`/`z` usage, well-formed XML via `DOMParser`, viewBox/size, hex fills, palette overrides and merging, line-art stroke output.
- **synthetic.test.ts:** draws circles, squares, a ring and bitmap-font text, traces them, **parses the emitted path data back, rasterises it with even-odd, and compares it to the input** (over 97% pixel accuracy and zero uncovered pixels). Also checks holes, Otsu B&W, speck removal, curves vs corners, node count falling as Simplify rises, centerline tracing and background removal.

## Keyboard

| Where | Keys |
|---|---|
| Preview (focused) | Arrow keys pan (Shift for faster) · `+`/`−` zoom · `0` fit · `1` 100% |
| Anywhere | `Ctrl/⌘+V` paste an image · `Esc` cancel the colour picker / close the mobile sheet |

All controls are native inputs with labels, and focus rings are always visible.
