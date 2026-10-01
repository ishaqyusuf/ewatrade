import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { deflateSync, inflateSync } from "node:zlib"

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const MOBILE_DIR = resolve(SCRIPT_DIR, "..")
const REPO_ROOT = resolve(MOBILE_DIR, "../..")
const SOURCE_MARK = resolve(
  REPO_ROOT,
  "apps/marketing/public/brand/ewatrade-mark.png",
)
const ICON_DIR = resolve(MOBILE_DIR, "assets/icons")
const CANVAS_SIZE = 1024
const TARGET_ART_WIDTH = 560
const ADAPTIVE_ART_WIDTH = 430
const SOURCE_BACKGROUND_THRESHOLD = 60
const ENVIRONMENTS = {
  production: {
    backgroundBottom: [246, 242, 232],
    backgroundTop: [255, 252, 244],
    palette: "canonical",
    pattern: "none",
  },
  preview: {
    arrow: [255, 191, 63],
    backgroundBottom: [123, 42, 84],
    backgroundTop: [37, 18, 59],
    palette: "environment",
    pattern: "market-print",
    rail: [255, 248, 234],
  },
  development: {
    arrow: [255, 221, 117],
    backgroundBottom: [8, 61, 116],
    backgroundTop: [23, 105, 176],
    palette: "environment",
    pattern: "blueprint",
    rail: [255, 255, 255],
  },
  productionDark: {
    arrow: [60, 230, 149],
    backgroundBottom: [4, 24, 19],
    backgroundTop: [8, 55, 42],
    palette: "environment",
    pattern: "none",
    rail: [235, 248, 238],
  },
}
const OUTPUTS = [
  {
    environment: "production",
    file: "adaptive-icon.png",
    targetArtWidth: ADAPTIVE_ART_WIDTH,
    transparent: true,
  },
  {
    environment: "preview",
    file: "preview-adaptive-icon.png",
    targetArtWidth: ADAPTIVE_ART_WIDTH,
    transparent: true,
  },
  {
    environment: "development",
    file: "dev-adaptive-icon.png",
    targetArtWidth: ADAPTIVE_ART_WIDTH,
    transparent: true,
  },
  { environment: "production", file: "loading-icon.png", transparent: false },
  {
    environment: "preview",
    file: "preview-loading-icon.png",
    transparent: false,
  },
  {
    environment: "development",
    file: "dev-loading-icon.png",
    transparent: false,
  },
  { environment: "production", file: "ios-light.png", transparent: false },
  { environment: "preview", file: "preview-ios-light.png", transparent: false },
  { environment: "development", file: "dev-ios-light.png", transparent: false },
  { environment: "productionDark", file: "ios-dark.png", transparent: false },
  { environment: "preview", file: "preview-ios-dark.png", transparent: false },
  { environment: "development", file: "dev-ios-dark.png", transparent: false },
  {
    canvasSize: 640,
    environment: "production",
    file: "splash-logo.png",
    targetArtWidth: 400,
    transparent: true,
  },
  {
    canvasSize: 640,
    environment: "productionDark",
    file: "splash-logo-dark.png",
    targetArtWidth: 400,
    transparent: true,
  },
  {
    canvasSize: 640,
    environment: "preview",
    file: "preview-splash-logo.png",
    targetArtWidth: 400,
    transparent: true,
  },
  {
    canvasSize: 640,
    environment: "preview",
    file: "preview-splash-logo-dark.png",
    targetArtWidth: 400,
    transparent: true,
  },
  {
    canvasSize: 640,
    environment: "development",
    file: "dev-splash-logo.png",
    targetArtWidth: 400,
    transparent: true,
  },
  {
    canvasSize: 640,
    environment: "development",
    file: "dev-splash-logo-dark.png",
    targetArtWidth: 400,
    transparent: true,
  },
]

function readPng(filePath) {
  const buffer = readFileSync(filePath)

  if (buffer.toString("latin1", 0, 8) !== "\x89PNG\r\n\x1a\n") {
    throw new Error(`${filePath} is not a PNG file`)
  }

  let width = 0
  let height = 0
  let colorType = 0
  let bitDepth = 0
  const idatChunks = []

  for (let offset = 8; offset < buffer.length; ) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString("ascii", offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    offset += 12 + length

    if (type === "IHDR") {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
    } else if (type === "IDAT") {
      idatChunks.push(data)
    } else if (type === "IEND") {
      break
    }
  }

  if (bitDepth !== 8 || ![2, 6].includes(colorType)) {
    throw new Error(
      `${filePath} must be an 8-bit RGB or RGBA PNG; got bitDepth=${bitDepth}, colorType=${colorType}`,
    )
  }

  const channels = colorType === 6 ? 4 : 3
  const stride = width * channels
  const inflated = inflateSync(Buffer.concat(idatChunks))
  const rgba = new Uint8Array(width * height * 4)
  let sourceOffset = 0
  let previous = new Uint8Array(stride)

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset]
    sourceOffset += 1
    const scanline = inflated.subarray(sourceOffset, sourceOffset + stride)
    sourceOffset += stride
    const row = new Uint8Array(stride)

    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? row[x - channels] : 0
      const up = previous[x] ?? 0
      const upLeft = x >= channels ? previous[x - channels] : 0
      const value = scanline[x]

      if (filter === 0) row[x] = value
      else if (filter === 1) row[x] = (value + left) & 255
      else if (filter === 2) row[x] = (value + up) & 255
      else if (filter === 3)
        row[x] = (value + Math.floor((left + up) / 2)) & 255
      else if (filter === 4) row[x] = (value + paeth(left, up, upLeft)) & 255
      else throw new Error(`Unsupported PNG filter ${filter}`)
    }

    for (let x = 0; x < width; x += 1) {
      const source = x * channels
      const target = (y * width + x) * 4
      rgba[target] = row[source]
      rgba[target + 1] = row[source + 1]
      rgba[target + 2] = row[source + 2]
      rgba[target + 3] = channels === 4 ? row[source + 3] : 255
    }

    previous = row
  }

  return { width, height, data: rgba }
}

function writePng(filePath, image, { transparent }) {
  const colorType = transparent ? 6 : 2
  const channels = transparent ? 4 : 3
  const stride = image.width * channels
  const raw = Buffer.alloc((stride + 1) * image.height)
  let rawOffset = 0

  for (let y = 0; y < image.height; y += 1) {
    raw[rawOffset] = 0
    rawOffset += 1

    for (let x = 0; x < image.width; x += 1) {
      const source = (y * image.width + x) * 4
      raw[rawOffset] = image.data[source]
      raw[rawOffset + 1] = image.data[source + 1]
      raw[rawOffset + 2] = image.data[source + 2]
      if (transparent) raw[rawOffset + 3] = image.data[source + 3]
      rawOffset += channels
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(image.width, 0)
  ihdr.writeUInt32BE(image.height, 4)
  ihdr[8] = 8
  ihdr[9] = colorType
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const png = Buffer.concat([
    Buffer.from("\x89PNG\r\n\x1a\n", "latin1"),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ])

  writeFileSync(filePath, png)
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii")
  const chunk = Buffer.alloc(12 + data.length)
  chunk.writeUInt32BE(data.length, 0)
  typeBuffer.copy(chunk, 4)
  data.copy(chunk, 8)
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length)
  return chunk
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft
  const leftDistance = Math.abs(estimate - left)
  const upDistance = Math.abs(estimate - up)
  const upLeftDistance = Math.abs(estimate - upLeft)

  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left
  if (upDistance <= upLeftDistance) return up
  return upLeft
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function extractArtwork(source) {
  const background = averageCornerColor(source)
  const data = new Uint8Array(source.data)

  for (let index = 0; index < data.length; index += 4) {
    const distance = Math.hypot(
      data[index] - background[0],
      data[index + 1] - background[1],
      data[index + 2] - background[2],
    )

    data[index + 3] = Math.round(
      clamp(
        ((distance - 12) / (SOURCE_BACKGROUND_THRESHOLD - 12)) * 255,
        0,
        255,
      ),
    )
  }

  return { ...source, data }
}

function averageCornerColor(image) {
  const samples = [
    [0, 0],
    [image.width - 1, 0],
    [0, image.height - 1],
    [image.width - 1, image.height - 1],
  ]
  const color = [0, 0, 0]

  for (const [x, y] of samples) {
    const index = (y * image.width + x) * 4
    color[0] += image.data[index]
    color[1] += image.data[index + 1]
    color[2] += image.data[index + 2]
  }

  return color.map((channel) => Math.round(channel / samples.length))
}

function resizePremultiplied(image, targetWidth, targetHeight) {
  const data = new Uint8Array(targetWidth * targetHeight * 4)
  const scaleX = image.width / targetWidth
  const scaleY = image.height / targetHeight

  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = (y + 0.5) * scaleY - 0.5
    const y0 = clamp(Math.floor(sourceY), 0, image.height - 1)
    const y1 = clamp(y0 + 1, 0, image.height - 1)
    const yWeight = sourceY - y0

    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = (x + 0.5) * scaleX - 0.5
      const x0 = clamp(Math.floor(sourceX), 0, image.width - 1)
      const x1 = clamp(x0 + 1, 0, image.width - 1)
      const xWeight = sourceX - x0
      const samples = [
        [x0, y0, (1 - xWeight) * (1 - yWeight)],
        [x1, y0, xWeight * (1 - yWeight)],
        [x0, y1, (1 - xWeight) * yWeight],
        [x1, y1, xWeight * yWeight],
      ]
      let red = 0
      let green = 0
      let blue = 0
      let alpha = 0

      for (const [sampleX, sampleY, weight] of samples) {
        const source = (sampleY * image.width + sampleX) * 4
        const sampleAlpha = image.data[source + 3] / 255
        alpha += sampleAlpha * weight
        red += image.data[source] * sampleAlpha * weight
        green += image.data[source + 1] * sampleAlpha * weight
        blue += image.data[source + 2] * sampleAlpha * weight
      }

      const target = (y * targetWidth + x) * 4
      data[target] = alpha > 0 ? Math.round(red / alpha) : 0
      data[target + 1] = alpha > 0 ? Math.round(green / alpha) : 0
      data[target + 2] = alpha > 0 ? Math.round(blue / alpha) : 0
      data[target + 3] = Math.round(alpha * 255)
    }
  }

  return { width: targetWidth, height: targetHeight, data }
}

function recolorArtwork(image, environment) {
  const treatment = ENVIRONMENTS[environment]
  if (!treatment) throw new Error(`Unknown icon environment: ${environment}`)
  if (treatment.palette === "canonical") return image

  const data = new Uint8Array(image.data)

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3]
    if (alpha < 8) continue

    const hue = rgbToHue(data[index], data[index + 1], data[index + 2])
    const isGreenHue = hue >= 80 && hue <= 170
    const isGreenDominant =
      data[index + 1] > data[index] * 1.15 &&
      data[index + 1] > data[index + 2] * 1.05

    const isArrow = isGreenHue && isGreenDominant
    const sourceColor = [data[index], data[index + 1], data[index + 2]]
    const sourceLuminance = luminance(sourceColor)
    const referenceLuminance = isArrow ? 96 : 28
    const texture = clamp(
      1 + (sourceLuminance - referenceLuminance) / 420,
      0.82,
      1.16,
    )
    const targetColor = isArrow ? treatment.arrow : treatment.rail

    data[index] = Math.round(clamp(targetColor[0] * texture, 0, 255))
    data[index + 1] = Math.round(clamp(targetColor[1] * texture, 0, 255))
    data[index + 2] = Math.round(clamp(targetColor[2] * texture, 0, 255))
  }

  return { ...image, data }
}

function luminance([red, green, blue]) {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722
}

function rgbToHue(red, green, blue) {
  const r = red / 255
  const g = green / 255
  const b = blue / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min

  if (delta === 0) return 0
  if (max === r) return 60 * (((g - b) / delta) % 6)
  if (max === g) return 60 * ((b - r) / delta + 2)
  return 60 * ((r - g) / delta + 4)
}

function composeIcon(
  mark,
  { environment, transparent, canvasSize = CANVAS_SIZE },
) {
  const data = new Uint8Array(canvasSize * canvasSize * 4)
  if (!transparent) {
    paintBackground(data, canvasSize, ENVIRONMENTS[environment])
  }

  const offsetX = Math.round((canvasSize - mark.width) / 2)
  const offsetY = Math.round((canvasSize - mark.height) / 2)

  for (let y = 0; y < mark.height; y += 1) {
    for (let x = 0; x < mark.width; x += 1) {
      const source = (y * mark.width + x) * 4
      const target = ((offsetY + y) * canvasSize + offsetX + x) * 4
      const alpha = mark.data[source + 3] / 255
      const inverseAlpha = 1 - alpha

      data[target] = Math.round(
        mark.data[source] * alpha + data[target] * inverseAlpha,
      )
      data[target + 1] = Math.round(
        mark.data[source + 1] * alpha + data[target + 1] * inverseAlpha,
      )
      data[target + 2] = Math.round(
        mark.data[source + 2] * alpha + data[target + 2] * inverseAlpha,
      )
      data[target + 3] = transparent
        ? Math.round(mark.data[source + 3] + data[target + 3] * inverseAlpha)
        : 255
    }
  }

  return { width: canvasSize, height: canvasSize, data }
}

function paintBackground(data, size, treatment) {
  for (let y = 0; y < size; y += 1) {
    const verticalProgress = y / Math.max(size - 1, 1)
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4
      const radialDistance = Math.hypot(x - size * 0.32, y - size * 0.18) / size
      const highlight = clamp((0.58 - radialDistance) * 0.08, 0, 0.035)
      const color = treatment.backgroundTop.map((channel, channelIndex) =>
        Math.round(
          mix(
            channel,
            treatment.backgroundBottom[channelIndex],
            verticalProgress,
          ) *
            (1 + highlight),
        ),
      )

      if (treatment.pattern === "market-print" && x % 42 <= 2 && y % 42 <= 2) {
        for (let channel = 0; channel < 3; channel += 1) {
          color[channel] = Math.round(mix(color[channel], 255, 0.1))
        }
      }

      if (treatment.pattern === "blueprint" && (x % 64 <= 1 || y % 64 <= 1)) {
        for (let channel = 0; channel < 3; channel += 1) {
          color[channel] = Math.round(mix(color[channel], 255, 0.1))
        }
      }

      data[index] = clamp(color[0], 0, 255)
      data[index + 1] = clamp(color[1], 0, 255)
      data[index + 2] = clamp(color[2], 0, 255)
      data[index + 3] = 255
    }
  }

  if (treatment.pattern === "blueprint") {
    paintBlueprintGuides(data, size)
  }
}

function paintBlueprintGuides(data, size) {
  const inset = Math.round(size * 0.08)
  const guideColor = [255, 255, 255]
  const guideAlpha = 0.24

  for (let x = inset; x < size - inset; x += 1) {
    blendPixel(data, size, x, inset, guideColor, guideAlpha)
    blendPixel(data, size, x, size - inset - 1, guideColor, guideAlpha)
  }

  for (let y = inset; y < size - inset; y += 1) {
    blendPixel(data, size, inset, y, guideColor, guideAlpha)
    blendPixel(data, size, size - inset - 1, y, guideColor, guideAlpha)
  }

  const tickLength = Math.round(size * 0.025)
  for (const coordinate of [size * 0.25, size * 0.5, size * 0.75]) {
    const position = Math.round(coordinate)
    for (let offset = 0; offset < tickLength; offset += 1) {
      blendPixel(data, size, position, inset + offset, guideColor, guideAlpha)
      blendPixel(data, size, inset + offset, position, guideColor, guideAlpha)
    }
  }
}

function blendPixel(data, size, x, y, color, alpha) {
  if (x < 0 || y < 0 || x >= size || y >= size) return
  const index = (y * size + x) * 4
  data[index] = Math.round(mix(data[index], color[0], alpha))
  data[index + 1] = Math.round(mix(data[index + 1], color[1], alpha))
  data[index + 2] = Math.round(mix(data[index + 2], color[2], alpha))
}

function mix(from, to, progress) {
  return from + (to - from) * progress
}

function measureArtwork(image, { transparent }) {
  const background = [image.data[0], image.data[1], image.data[2]]
  let minX = image.width
  let minY = image.height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const index = (y * image.width + x) * 4
      const alpha = image.data[index + 3]
      const isVisible = transparent
        ? alpha > 8
        : Math.hypot(
            image.data[index] - background[0],
            image.data[index + 1] - background[1],
            image.data[index + 2] - background[2],
          ) > 20

      if (isVisible) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
  }

  return {
    bounds: [minX, minY, maxX, maxY],
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

const source = extractArtwork(readPng(SOURCE_MARK))
const sourceMeasurement = measureArtwork(source, { transparent: true })
for (const output of OUTPUTS) {
  const targetTileSize = Math.round(
    ((output.targetArtWidth ?? TARGET_ART_WIDTH) / sourceMeasurement.width) *
      source.width,
  )
  const resizedMark = resizePremultiplied(
    source,
    targetTileSize,
    targetTileSize,
  )
  const mark = recolorArtwork(resizedMark, output.environment)
  const image = composeIcon(mark, output)
  const destination = resolve(ICON_DIR, output.file)
  writePng(destination, image, output)
  const measurement = measureArtwork(image, output)
  console.log(
    `${output.file}: ${image.width}x${image.height}, artwork ${measurement.width}x${measurement.height}`,
  )
}
