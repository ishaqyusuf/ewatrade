// Fits every bundled catalog illustration to the same safe area of its 128px
// canvas, so no drawing looks bigger or smaller than its neighbours.
//
// It measures each drawing's painted bounds in headless Chromium (getBBox per
// shape, plus half the stroke width where the shape is stroked), then wraps
// the geometry in a translate/scale on its top-level group. Geometry is never
// edited, and the group's stroke width is divided by the scale so every
// drawing keeps a painted 3-unit stroke. Re-running starts from the original
// geometry, so the output is stable.
//
//   bun scripts/normalize-catalog-illustrations.mjs          rewrite the JSON
//   bun scripts/normalize-catalog-illustrations.mjs --check  fail if stale
import { readFile, writeFile } from "node:fs/promises"
import { chromium } from "playwright"

const CANVAS = 128
const STROKE = 3
// The painted drawing's longer side fills this share of the canvas.
const SAFE_AREA = 0.8
const RENDER = 512

const path = new URL(
  "../packages/utils/src/catalog-illustration-artwork.json",
  import.meta.url,
)
const check = process.argv.includes("--check")
const source = await readFile(path, "utf8")
const artwork = JSON.parse(source)

const GROUP =
  /^(<svg [^>]*><title>[^<]*<\/title>)<g (?:transform="[^"]*" )?stroke="\{\{ink\}\}" stroke-width="[^"]*" (stroke-linecap="round" stroke-linejoin="round">.*<\/g><\/svg>\n)$/s

function original(id, template) {
  const match = template.match(GROUP)
  if (!match) throw new Error(`${id} does not have the expected SVG shape.`)
  return {
    head: match[1],
    tail: match[2],
    svg: `${match[1]}<g stroke="{{ink}}" stroke-width="${STROKE}" ${match[2]}`,
  }
}

function round(value) {
  return Number(value.toFixed(4))
}

// Painted box at scale s: each shape's box scaled, grown by its stroke half.
function paintedBox(shapes, s) {
  const box = {
    x1: Number.POSITIVE_INFINITY,
    y1: Number.POSITIVE_INFINITY,
    x2: Number.NEGATIVE_INFINITY,
    y2: Number.NEGATIVE_INFINITY,
  }
  for (const shape of shapes) {
    const grow = shape.stroked ? STROKE / 2 : 0
    box.x1 = Math.min(box.x1, shape.x * s - grow)
    box.y1 = Math.min(box.y1, shape.y * s - grow)
    box.x2 = Math.max(box.x2, (shape.x + shape.width) * s + grow)
    box.y2 = Math.max(box.y2, (shape.y + shape.height) * s + grow)
  }
  return box
}

function side(box) {
  return Math.max(box.x2 - box.x1, box.y2 - box.y1)
}

function fit(shapes) {
  const target = CANVAS * SAFE_AREA
  let low = 0.1
  let high = 4
  for (let step = 0; step < 60; step += 1) {
    const mid = (low + high) / 2
    if (side(paintedBox(shapes, mid)) < target) low = mid
    else high = mid
  }
  const s = round(low)
  const box = paintedBox(shapes, s)
  return {
    s,
    tx: round(CANVAS / 2 - (box.x1 + box.x2) / 2),
    ty: round(CANVAS / 2 - (box.y1 + box.y2) / 2),
    before: side(paintedBox(shapes, 1)) / CANVAS,
  }
}

function paint(svg) {
  return svg
    .replaceAll("{{ink}}", "#000")
    .replaceAll("{{fill}}", "#fff")
    .replaceAll("{{accent}}", "#888")
    .replaceAll("{{highlight}}", "#ccc")
}

// Playwright's own Chromium when it is installed, else the local Chrome.
const browser = await chromium
  .launch()
  .catch(() => chromium.launch({ channel: "chrome" }))
try {
  const page = await browser.newPage()
  const entries = Object.entries(artwork.templates).map(([id, template]) => ({
    id,
    ...original(id, template),
  }))
  await page.setContent(
    entries
      .map((entry) => `<div data-id="${entry.id}">${paint(entry.svg)}</div>`)
      .join(""),
  )
  const measured = await page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll("[data-id]")].map((holder) => [
        holder.dataset.id,
        [...holder.querySelectorAll("path, rect, circle, ellipse")].map(
          (shape) => {
            const box = shape.getBBox()
            return {
              x: box.x,
              y: box.y,
              width: box.width,
              height: box.height,
              stroked: getComputedStyle(shape).stroke !== "none",
            }
          },
        ),
      ]),
    ),
  )

  const templates = {}
  const report = []
  for (const entry of entries) {
    const { s, tx, ty, before } = fit(measured[entry.id])
    templates[entry.id] =
      `${entry.head}<g transform="translate(${tx} ${ty}) scale(${s})" ` +
      `stroke="{{ink}}" stroke-width="${round(STROKE / s)}" ${entry.tail}`
    report.push({ id: entry.id, before, scale: s })
  }

  // Render the result and read its pixels back: nothing may touch the edge.
  const pixels = await page.evaluate(
    async ({ svgs, size }) => {
      const canvas = document.createElement("canvas")
      canvas.width = size
      canvas.height = size
      const context = canvas.getContext("2d", { willReadFrequently: true })
      const result = {}
      for (const [id, svg] of Object.entries(svgs)) {
        const image = new Image()
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
        await image.decode()
        context.clearRect(0, 0, size, size)
        context.drawImage(image, 0, 0, size, size)
        const data = context.getImageData(0, 0, size, size).data
        let x1 = size
        let y1 = size
        let x2 = -1
        let y2 = -1
        for (let y = 0; y < size; y += 1)
          for (let x = 0; x < size; x += 1)
            if (data[(y * size + x) * 4 + 3] > 8) {
              x1 = Math.min(x1, x)
              y1 = Math.min(y1, y)
              x2 = Math.max(x2, x)
              y2 = Math.max(y2, y)
            }
        result[id] = { x1, y1, x2: x2 + 1, y2: y2 + 1 }
      }
      return result
    },
    {
      svgs: Object.fromEntries(
        Object.entries(templates).map(([id, svg]) => [id, paint(svg)]),
      ),
      size: RENDER,
    },
  )

  const unit = RENDER / CANVAS
  const problems = []
  for (const row of report) {
    const box = pixels[row.id]
    if (box.x2 <= box.x1) {
      problems.push(`${row.id} rendered nothing`)
      continue
    }
    row.after = Math.max(box.x2 - box.x1, box.y2 - box.y1) / RENDER
    row.offset = Math.max(
      Math.abs((box.x1 + box.x2) / 2 - RENDER / 2),
      Math.abs((box.y1 + box.y2) / 2 - RENDER / 2),
    )
    if (Math.abs(row.after - SAFE_AREA) > 0.02)
      problems.push(`${row.id} fills ${(row.after * 100).toFixed(1)}%`)
    if (row.offset > unit)
      problems.push(
        `${row.id} is off centre by ${(row.offset / unit).toFixed(1)}`,
      )
    if (box.x1 <= 0 || box.y1 <= 0 || box.x2 >= RENDER || box.y2 >= RENDER)
      problems.push(`${row.id} touches the canvas edge`)
  }

  const fills = report.map((row) => row.before)
  const after = report.map((row) => row.after ?? 0)
  const percent = (value) => `${(value * 100).toFixed(1)}%`
  console.log(
    `${report.length} illustrations: before ${percent(Math.min(...fills))}-${percent(Math.max(...fills))}, ` +
      `after ${percent(Math.min(...after))}-${percent(Math.max(...after))} of the canvas.`,
  )
  if (problems.length) {
    console.error(problems.join("\n"))
    process.exitCode = 1
  }

  const next = `${JSON.stringify({ ...artwork, templates }, null, 2)}\n`
  if (check) {
    if (next !== source) {
      console.error("Artwork is not normalized. Run without --check.")
      process.exitCode = 1
    }
  } else if (!problems.length && next !== source) {
    await writeFile(path, next)
    console.log("Rewrote packages/utils/src/catalog-illustration-artwork.json")
  }
} finally {
  await browser.close()
}
