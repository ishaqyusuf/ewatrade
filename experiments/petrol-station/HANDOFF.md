# Petrol simulator: implementation handoff

Implementer: Claude Code, `claude-opus-5-5`. Scope: `experiments/petrol-station/`
only. No product, Brain, root, lockfile, package, server, commit or network
changes. Codex owns browser acceptance, screenshots and Brain updates.

## Final copy fix — 22 October 2026

After a paid or cancelled nozzle sale (and with no demo running), disabled
controls now show one neutral reason, "Authorise a new preset first.", instead
of stale stop reasons. This is display only: availability, actions and the
model are unchanged, the enabled Authorise control is unaffected and the demo
reason still takes priority. Rebuilt once (156.0 KiB). Not browser-tested by me.

| File | sha256 (first 16) |
|---|---|
| `src/lessons.mjs` | `b69b7f73eeafbbab` |
| `index.html` | `75ce1659ca5f38a9` |

## Machine-lessons final repair round — 22 October 2026

Scope: only the five findings in Codex's final review (4313207d, with c53d230c
and 6b85e3ff), all read and ACKed. Codex reports all three lessons working in
a real browser before this round. I did no browser check of these repairs.

1. **Stage stays visible.** `.stage` is sticky on desktop (`top: 12px`) and on
   phone (`top: 0`). The SVG is height-bounded with the viewBox aspect kept:
   `calc(100vh - 32px)` on desktop, 55vh in the single-column tablet layout and
   50vh on phone.
2. **Tank readings.** The SVG tanker and tank readings are numeric only and
   centred in each vessel (the pills already name them). The HTML delivery
   readings and the lost = gained check show three-decimal litres.
3. **Nozzle text fits.** The LCD shows a concise `TARGET x.xxx L`; the full
   budget ÷ price equation stays in the HTML panel. All stop-explanation text
   was rewritten to fit the box at unchanged sizes (titles ≤ 25 characters,
   lines ≤ 30, at most four). The held-trigger and preset/full-car distinction
   is kept.
4. **No stale pay prompt.** Paid and cancelled sales are handled before any
   stop-reason text, in both the HTML status and the plate caption ("Paid … for
   the next customer").
5. **Escaped inputs.** `ui.form.price` and `ui.form.request` are attribute-escaped
   (`& < > " '`) on panel re-render; the literal typed text is preserved.

Check: `node build.mjs` → index.html 155.8 KiB, bundle syntax-compiled,
standalone guard passed. Model tests not rerun (model unchanged).

| File | sha256 (first 16) |
|---|---|
| `model.mjs` (unchanged) | `08f7e1bba05e16b4` |
| `src/plates.mjs` | `56a3d5830e4aec76` |
| `src/lessons.mjs` | `c0cc088094e5ef24` |
| `src/lessons.css` | `cd3a19501d38cbd8` |
| `build.mjs` (unchanged) | `150905273227cb0d` |
| `index.html` | `851d9b53895545e9` |

Remaining limits: SVG plate labels are roughly 10–11 px on a 390 px phone, with
readings repeated in HTML. Final browser, phone and screenshot review is Codex's.

## Machine-lessons revision: checkpoint B (all three lessons) — 22 October 2026

Status: all three lessons are implemented and the source is stable for Codex
browser review. **No browser, phone or keyboard check was done by me** (a
browser launch needs an approval this session cannot get). FS03–FS05 are
source-complete but unaccepted; FS06 is Codex's.

| File | sha256 (first 16) |
|---|---|
| `model.mjs` (unchanged) | `08f7e1bba05e16b4` |
| `src/scene.mjs` (unchanged) | `4119048490dafde0` |
| `src/plates.mjs` | `49a3794227b0ab0e` |
| `src/lessons.mjs` | `a9481f4bd2f4d798` |
| `src/lessons.css` | `576207f05b3a8911` |
| `src/scene.css` | `8ed7002595c17499` |
| `src/lessons.html` | `bbe316850586c88c` |
| `build.mjs` | `150905273227cb0d` |
| `index.html` (154.8 KiB) | `436c329ab94aa696` |
| `versions/operations-v1.html` | `d5e56fc40c1a6fdb` (identical to the previous handed-off index) |

Removed from `src/` after archiving to `versions/operations-v1-src/`: the old
`app.mjs`, `template.html` and `styles.css`.

What changed since checkpoint A:
- A fresh load zooms straight into lesson 1. The station overview is reached
  with Back to station or Escape (30330b7b).
- Lede rewritten for learners. The sources are real `<a>` links; the build guard
  allows anchors but still rejects src, link, CSS url(), fetch, XHR and
  WebSocket, and any URL in CSS or script.
- Lesson 2: price field with ₦1,000 and ₦1,250 chips, "Pump 5 L at this price"
  (settles the previous sale and starts a fresh, price-locked one), "Change
  price mid-sale" (shows the lock), "Stop pump", and a comparison table (price,
  litres, flow seconds, amount). The rotor and encoder angle follow the
  dispenser totaliser, so they never move without measured flow. The pulse
  count is ml ÷ 10 (illustrative).
- Lesson 3: two car cases (room 8/50 L, nearly full 44/50 L), naira/litre
  request with a live budget ÷ price = target equation, then authorise, put
  nozzle in filler, squeeze, release, and hang up and pay (receipt line).
  Nozzle accuracy (b8e8fc35): a UI-only `triggerHeld` state models the hand.
  At a preset stop the dispenser valve closes but the nozzle stays open until
  released, and the caption no longer claims the car is not full. A full car
  trips the nozzle shut even while held (diaphragm lifts, latch rises, port
  covered, tube shown in vacuum colour, numbered 1–4 trip badges). The model is
  unchanged.
- Demos press the same controls: lesson 1 opens the valve; lesson 2 runs 5 L at
  ₦1,000 and then ₦1,250; lesson 3 does a preset stop with release and pay, then
  a nearly-full car trip and pay.

Checks run:
- `node build.mjs` → index.html 154.8 KiB, bundle syntax-compiled, standalone
  guard passed.
- Node smoke tests (driving real `LESSONS` controls and plate updates via the
  existing `tools/raster.mjs` fakeDom, no rendering):
  - Pricing: 5.000 L × ₦1,250.00/L = ₦6,250.00 after a ₦1,000 run that charged ₦5,000.00.
  - Nozzle: ₦5,000 stops at the preset with 5.000 L and receipt R-0001; a manual
    release after 3 s charges 2.000 L.
  - Nozzle plate: the preset stop keeps the trigger open while held and closes it
    when released; the nearly-full car stops at 6.000 L with reason vehicle-full,
    trigger closed and trip badges on.
  - Delivery: lost = gained (12,000 L), tanker empty.
- Model tests were not rerun (model unchanged; 20/20 earlier).

Known limits:
- Plate text is SVG text scaled with the stage. On a 390 px phone the plate is
  about 0.37× its authored size, so part labels come out roughly 10–11 px. All
  essential readings are repeated in the HTML panel at full size.
- The plate composition, label placement and phone legibility have not been seen
  in a real browser by me.
- CSS `transition: d` on the diaphragm and transform-origin on valve and trigger
  rely on current Chromium/Safari behaviour; under reduced motion these snap.
- Fuel-flow dashes stand still under reduced motion; flow is still shown by the
  colour and the readings.

## Machine-lessons revision: checkpoint A (camera + delivery lesson)

Owner rejected the operations UI. Controlling brief:
`.brain/plans/2026-10-22-petrol-machine-lessons.md`. The old bundle is preserved
byte-for-byte at `versions/operations-v1.html`, with its sources copied to
`versions/operations-v1-src/` (reference only). `model.mjs` is unchanged.

New sources: `src/lessons.html`, `src/lessons.css`, `src/scene.css` (station
SVG rules), `src/plates.mjs` (three enlarged cutaway plates + overview pins) and
`src/lessons.mjs` (controller). `build.mjs` now bundles model → scene → plates →
lessons into `index.html`.

- Camera: animates the real SVG `viewBox` (geometric zoom, eased, about 1 s;
  instant under reduced motion) from the station to the lesson rectangle. The
  enlarged plate then fades in inside that rectangle. "Back to station" and
  Escape reverse it. All camera rectangles are 4:3, so the stage keeps its size
  on desktop and phone.
- Lesson 1 (tanker to storage) is runnable: open/close outlet valve
  (startDischarge/haltDischarge), side-section tanker, valve, hose, fill pipe,
  drop tube, underground tank, a vent showing air only, a head dimension between
  the fuel surfaces, a "lost = gained" check, pause/replay/demo and a speed menu.
- Lessons 2 and 3 have their plates drawn; their controllers follow in the next
  checkpoint.

Checks: `node build.mjs` → index.html 138.8 KiB, bundle syntax-compiled,
standalone guard passed. A Node smoke test drove the plate updates on model
states with no errors (after 5 min at 600 L/min: tanker 9,000 L, tank 9,000 L,
3,000 L moved). No browser check by me; that is Codex-owned.

---

# Earlier operations build (superseded)

Implementer: Claude Code, model `claude-opus-5-5`. Scope: `experiments/petrol-station/` only.
Nothing was edited outside this folder: no product, Brain, root config or lockfile
changes, no installs, servers, commits or network calls. Codex owns review,
real-browser acceptance and Brain updates.

## Final handoff: repair round (22 October 2026)

Status: source stable and ready for Codex final review. Real browser acceptance
is **Codex-owned and pending/partial**. I did not run a browser: launching
Chrome or Quick Look needs an approval this session cannot get.

### Files

| File | Purpose | sha256 (first 16) |
|---|---|---|
| `model.mjs` | pure model (unchanged in this round) | `08f7e1bba05e16b4` |
| `model.test.mjs` | 20 invariant/edge tests | — |
| `src/app.mjs` | controls, modes, playback | `08fad79203531afa` |
| `src/scene.mjs` | isometric SVG scene | `4119048490dafde0` |
| `src/styles.css` | styles | `9b520226b7382c1f` |
| `src/template.html` | page markup | `6a2adfea14c4f198` |
| `build.mjs` | bundler + checks | `9581a685edb8a94a` |
| `index.html` | built standalone bundle (129.9 KiB) | `d5e56fc40c1a6fdb` |
| `dev.html` | module-source page (generated) | — |
| `README.md` | run/build, controls, assumptions, rounding | — |
| `tools/raster.mjs`, `tools/preview.mjs`, `screenshots/preview-*.png` | offline geometry previews (see Limits) | — |

### Repairs in this round (from Codex reviews 82598092, fb3edbe9, f3471649, d196d2dc, d298bbed; all read and ACKed)

1. Hidden panels: a global `[hidden] { display: none !important; }` rule. The
   `.explore-panel { display: grid }` rule no longer shows the panel in Guided or Auto.
2. Reset now also clears `whyTimer`, `whyOverride` and the live announcer text,
   on top of the auto timer, animation frame, playback carry and flow phase.
3. Labels: Attendant moved to the open soil face (700, 712), clear of
   Product line (560, 640) and Submersible pump (420, 680).
4. Volume shows three decimals (whole ml) in the HTML pump/car readouts, the SVG
   dispenser face, the SVG meter callout and the event log. So the visible
   litres match the ml-based charge, including partial, manual, power and
   e-stop stops. The receipt already used three decimals.
5. Auto never performs fault recovery (from 82598092). The UI layer refuses to
   auto-dispatch `resetEmergency`, `powerOn` after a power cut, or
   `startDischarge` on a halted delivery. Instead it shows "Auto stopped —
   recover in Guided or Explore". The model is unchanged. Explore can open
   without a delivery, so the empty and low-stock scenarios are reachable directly.

### Checks actually run

- `node experiments/petrol-station/build.mjs` → `index.html 129.9 KiB
  (standalone) · dev.html`. The build compiles the bundle as a syntax check
  (`new Function`, not run). It also fails on external `src`/`href`, `@import`,
  remote `url()`, `fetch`/XHR/WebSocket or any URL other than the SVG namespace.
- Model: `node --test experiments/petrol-station/model.test.mjs` → 20/20 pass
  (checkpoint 1). I did not rerun it in this round because the model is
  unchanged. Codex independently reran 20/20 and a 1000 ms vs 137 ms tick
  journey (25,980 L closing, ₦20,000 collected, one receipt, zero variance).
- Codex reported a real-browser Guided end-to-end PASS on the first bundle at
  https://petrol-station.localhost (no console errors). The repairs above came
  after that, so they need Codex's browser re-check.

### Known limitations

- No browser, phone, keyboard or reduced-motion check by me. `tools/` output is
  a custom rasteriser's **geometry approximation**: text appears as bars,
  patterns and gradients as flat colours, and CSS support is partial. It is not
  browser proof.
- The scene is illustrative and not to scale. Large surfaces (canopy top, soil
  faces) are still fairly plain; extra detail was deprioritised for this
  handoff. On phones the scene uses fixed per-step camera crops, which have not
  been browser-tuned.
- Event text and reasons are English only. There is no persistence (by design).
- Not modelled: evaporation, temperature correction, dead stock, partial
  payments, diesel.

## Checkpoint 1: pure model

`model.mjs` and `model.test.mjs`. 20/20 pass covering conservation, overfill and
empty limits, interlocks, price snapshot, half-up rounding and budget clamp,
manual/power/e-stop freeze, payment and close idempotency, auto vs manual vs
tick-slicing equivalence, and purity. Codex accepted it as FS02 source (82598092).
