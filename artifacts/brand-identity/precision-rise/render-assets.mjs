import { mkdir, readFile, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { nativeIconBackground } from "./native-icon-background.mjs"

const require = createRequire(import.meta.url)
const sharp = require(process.env.BRAND_SHARP_MODULE || "sharp")
const assetDir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(assetDir, "../../..")
const source = (name) => readFile(path.join(assetDir, name))
const output = (name) => path.join(root, name)

async function raster(name, width, height) {
  return sharp(await source(name), { density: 384 })
    .resize(width, height, { fit: "contain" })
    .png()
    .toBuffer()
}

const logo = await raster("logo.svg", 1644, 360)
const logoReverse = await raster("logo-reverse.svg", 1644, 360)
const mobileOnly = process.argv.includes("--mobile-only")
if (!mobileOnly) {
  for (const app of ["marketing", "dashboard"]) {
    const publicDir = `apps/${app}/public`
    await writeFile(
      output(`${publicDir}/brand/ewatrade-logo-precision-rise-v1.png`),
      logo,
    )
    await writeFile(
      output(`${publicDir}/brand/ewatrade-mark-precision-rise-v1.png`),
      await raster("mark.svg", 512, 512),
    )
    await writeFile(
      output(`${publicDir}/favicon.png`),
      await raster("mark.svg", 64, 64),
    )
    const sizes = [16, 32, 48]
    const buffers = await Promise.all(
      sizes.map((size) => raster("mark.svg", size, size)),
    )
    const header = Buffer.alloc(6 + sizes.length * 16)
    header.writeUInt16LE(1, 2)
    header.writeUInt16LE(sizes.length, 4)
    let offset = header.length
    buffers.forEach((buffer, i) => {
      const entry = 6 + i * 16
      header[entry] = sizes[i]
      header[entry + 1] = sizes[i]
      header.writeUInt16LE(1, entry + 4)
      header.writeUInt16LE(32, entry + 6)
      header.writeUInt32LE(buffer.length, entry + 8)
      header.writeUInt32LE(offset, entry + 12)
      offset += buffer.length
    })
    await writeFile(
      output(`${publicDir}/favicon.ico`),
      Buffer.concat([header, ...buffers]),
    )
  }
  await writeFile(
    output("apps/marketing/public/brand/ewatrade-social-preview-v4.png"),
    await raster("social-preview.svg", 1200, 630),
  )
}

const mobileBrand = output("apps/mobile/assets/brand")
await mkdir(mobileBrand, { recursive: true })
await writeFile(path.join(mobileBrand, "precision-rise-logo.png"), logo)
await writeFile(
  path.join(mobileBrand, "precision-rise-logo-reverse.png"),
  logoReverse,
)
for (const suffix of ["", "-reverse"]) {
  const wordmark = await sharp(await source(`wordmark${suffix}.svg`), {
    density: 384,
  })
    .resize({ width: 1200 })
    .png()
    .toBuffer()
  await writeFile(
    path.join(mobileBrand, `precision-rise-wordmark${suffix}.png`),
    wordmark,
  )
}
await writeFile(
  output("apps/mobile/assets/images/precision-rise-favicon.png"),
  await raster("mark.svg", 64, 64),
)

for (const variant of [
  { prefix: "", light: "#FFF8E9", dark: "#08372A" },
  { prefix: "dev-", light: "#1769B0", dark: "#082B3B", badge: "dev" },
  { prefix: "preview-", light: "#25123B", dark: "#170B25", badge: "preview" },
]) {
  const stem = `apps/mobile/assets/icons/${variant.prefix}precision-rise-`
  for (const mode of ["light", "dark"]) {
    const mark = await raster(
      mode === "dark" || variant.badge ? "mark-reverse.svg" : "mark.svg",
      584,
      584,
    )
    const layers = [{ input: mark, left: 220, top: 204 }]
    if (variant.badge) {
      const badge = await sharp(await source(`badge-${variant.badge}.svg`), {
        density: 384,
      })
        .resize({ height: 40 })
        .png()
        .toBuffer()
      const meta = await sharp(badge).metadata()
      layers.push({
        input: badge,
        left: Math.round((1024 - meta.width) / 2),
        top: 797,
      })
    }
    const background = variant.badge
      ? nativeIconBackground(variant.badge, mode)
      : {
          create: {
            width: 1024,
            height: 1024,
            channels: 3,
            background: variant[mode],
          },
        }
    const icon = await sharp(
      background.input || background,
      background.raw ? { raw: background.raw } : undefined,
    )
      .composite(layers)
      .removeAlpha()
      .png()
      .toBuffer()
    await writeFile(output(`${stem}ios-${mode}.png`), icon)
    if (mode === "light")
      await writeFile(output(`${stem}loading-icon.png`), icon)
    await writeFile(
      output(`${stem}splash-logo${mode === "dark" ? "-dark" : ""}.png`),
      await raster(
        mode === "dark" || variant.badge ? "mark-reverse.svg" : "mark.svg",
        640,
        640,
      ),
    )
  }
  // Keep all foreground artwork inside Android's central safe circle.
  const adaptive = await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: "#00000000" },
  })
    .composite([
      {
        input: await raster(
          variant.badge ? "mark-reverse.svg" : "mark.svg",
          552,
          552,
        ),
        left: 236,
        top: 236,
      },
    ])
    .png()
    .toBuffer()
  await writeFile(output(`${stem}adaptive-icon.png`), adaptive)
}
console.log(
  mobileOnly
    ? "Rendered production/development/preview native assets."
    : "Rendered web favicons, social card, and production/development/preview native assets.",
)
