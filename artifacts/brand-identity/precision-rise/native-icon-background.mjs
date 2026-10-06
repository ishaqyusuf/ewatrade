// Preserve the original environment treatments from generate-launcher-icons.mjs.
// Patterns belong to opaque launcher/iOS canvases, never adaptive foregrounds.
export function nativeIconBackground(environment, mode, size = 1024) {
  const development = environment === "dev"
  const top =
    mode === "dark"
      ? development
        ? [8, 43, 59]
        : [23, 11, 37]
      : development
        ? [23, 105, 176]
        : [37, 18, 59]
  const bottom =
    mode === "dark"
      ? development
        ? [4, 25, 38]
        : [61, 21, 42]
      : development
        ? [8, 61, 116]
        : [123, 42, 84]
  const data = Buffer.alloc(size * size * 3)
  const mix = (from, to, progress) => from + (to - from) * progress
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const radialDistance = Math.hypot(x - size * 0.32, y - size * 0.18) / size
      const highlight = Math.min(
        0.035,
        Math.max(0, (0.58 - radialDistance) * 0.08),
      )
      const patterned = development
        ? x % 64 <= 1 || y % 64 <= 1
        : x % 42 <= 2 && y % 42 <= 2
      for (let channel = 0; channel < 3; channel += 1) {
        const base = Math.round(
          mix(top[channel], bottom[channel], y / Math.max(size - 1, 1)) *
            (1 + highlight),
        )
        data[(y * size + x) * 3 + channel] = patterned
          ? Math.round(mix(base, 255, 0.1))
          : base
      }
    }
  }
  if (development) {
    const inset = Math.round(size * 0.08)
    const guide = (x, y) => {
      for (let channel = 0; channel < 3; channel += 1) {
        const index = (y * size + x) * 3 + channel
        data[index] = Math.round(mix(data[index], 255, 0.24))
      }
    }
    for (let coordinate = inset; coordinate < size - inset; coordinate += 1) {
      guide(coordinate, inset)
      guide(coordinate, size - inset - 1)
      guide(inset, coordinate)
      guide(size - inset - 1, coordinate)
    }
    const tickLength = Math.round(size * 0.025)
    for (const coordinate of [size * 0.25, size * 0.5, size * 0.75]) {
      const position = Math.round(coordinate)
      for (let offset = 0; offset < tickLength; offset += 1) {
        guide(position, inset + offset)
        guide(inset + offset, position)
      }
    }
  }
  return { input: data, raw: { width: size, height: size, channels: 3 } }
}
