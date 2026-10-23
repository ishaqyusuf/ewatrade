# How a petrol station's machines work

An offline, interactive explanation of three petrol-station mechanisms. Each one
opens with a real zoom from the station into a large internal cutaway. Petrol
only. This is a learning artifact: not an EwaTrade feature, not an equipment
controller and not an operating procedure. Every figure is a **simulated
example**.

## Run

- Open `index.html` directly. It is fully bundled: no backend, CDN, remote font
  or network request. Source links open only when you click them.
- Local preview (coordinator's existing static server): https://petrol-station.localhost
- `dev.html` loads the editable ES modules directly and needs a static server.
- The earlier operations simulator is preserved as `versions/operations-v1.html`
  (standalone). Its sources are kept for reference in `versions/operations-v1-src/`.

## Build and test

```sh
node experiments/petrol-station/build.mjs              # index.html + dev.html; syntax-checks the bundle
node --test experiments/petrol-station/model.test.mjs  # fuel/money model invariants
```

| File | Role |
|---|---|
| `model.mjs` | Pure deterministic fuel/money model (unchanged from the accepted version) |
| `src/scene.mjs`, `src/scene.css` | Isometric station drawing |
| `src/plates.mjs` | Three enlarged cutaway plates, camera rectangles and station pins |
| `src/lessons.mjs` | Lesson controller: camera, controls, readings, pause/replay/demo |
| `src/lessons.html`, `src/lessons.css` | Page markup and layout |
| `build.mjs` | Dependency-free bundler with standalone checks |
| `tools/` | Optional offline geometry preview (approximate; not browser proof) |

## Using it

The machine stage stays in view (sticky) while you use the controls beside or
below it. The page opens by zooming into lesson 1. The lesson buttons move the SVG camera
(its `viewBox`) to the machine's real place in the station, then reveal the
enlarged cutaway there. **Back to station** (or Escape) zooms back out to the
overview, where numbered pins show where each machine is. Every lesson has
Pause/Resume, Replay, **Play demo** (it presses the same controls you can) and
a speed menu. Under reduced motion the camera jumps instead of animating, and
the flow markers stay still.

1. **Tanker to storage.** Open and close the tanker's outlet valve. The tanker's
   fuel sits higher than the tank's, and that height difference (the head)
   drains it by gravity through the hose, fill pipe and drop tube. The tanker
   loses exactly what the tank gains. Displaced air leaves through the vent;
   fuel does not. The flow stops when the valve closes, the tanker empties or the
   tank is full. Shown at 100×.
2. **Litres to price.** An opened dispenser: fuel turns the meter, the encoder
   on its shaft sends electric pulses (blue dashes) to the calculator, and the
   display shows litres × price = amount. Pump 5 L at ₦1,000 and then at ₦1,250.
   The comparison table shows the same 5.000 L and the same 7.5 s of flow, with
   different money. The rotor turns only as fuel is measured. Changing the price
   mid-sale doesn't change the locked price; each run is a new sale. Real time.
3. **Customer and nozzle.** Choose naira or litres; the preset shows budget ÷
   price = target litres. Put the nozzle in the filler, squeeze the trigger
   (the stem lifts the main valve against its spring) and release it to stop.
   There are two different automatic stops:
   - *Preset reached*: the dispenser closes its own valve upstream. The nozzle
     doesn't trip, so you still hold the trigger until you release it.
   - *Car full* (the "nearly full car" option): fuel covers the sensing port,
     air stops, suction lifts the diaphragm, the latch lets go and the spring
     snaps the valve shut.

   You pay only for the litres that flowed. Shown at 3×.

## Assumptions (illustrative, not market or manufacturer data)

| Item | Value |
|---|---|
| Tank capacity / opening stock | 30,000 L / 6,000 L |
| Lesson tanker load | 12,000 L |
| Gravity drop / nozzle flow | 600 L/min / 40 L/min |
| Prices | ₦1,000 and ₦1,250 per litre (examples) |
| Car tank | 50 L; arrives with 8 L, or 44 L in the "nearly full" case |
| Meter | 1 rotor turn and 100 pulses per litre (illustrative, not a calibration) |

The drawing is not to scale. Not modelled: pressure or flow equations, real
discharge procedures, evaporation, temperature correction, diesel. Other
delivery arrangements exist.

## Units and rounding

- Volume is in integer millilitres, money in integer kobo and price in kobo per litre.
- Charge = litres × price, rounded half-up to the kobo:
  `floor((ml × koboPerLitre + 500) / 1000)`.
- A naira budget becomes the largest whole-millilitre target within it,
  `floor(budget × 1000 / price)`, so the charge never exceeds the budget.
- Litres are always shown to three decimals (whole millilitres), so the visible
  equation agrees with the money.
- The price is locked when a sale is authorised. A later price change applies
  to the next sale.

## Sources

Linked in the page's "Sources and assumptions" disclosure: Veeder-Root (how fuel
reaches the nozzle), Gilbarco Endura and application guide 577014-339 (meter
encoder, pulses per volume), PEI (automatic nozzle sensing and diaphragm) and
OPW 12VW instructions (liquid covering the shut-off port).
