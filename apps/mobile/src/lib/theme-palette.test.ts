import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { themeColorVars } from "./theme-palette"

// global.css repeats the palette as fallbacks; the TS palette is the source.
const css = readFileSync(join(import.meta.dir, "../styles/global.css"), "utf8")
const darkStart = css.indexOf("@media (prefers-color-scheme: dark)")
const sections = {
  light: css.slice(css.indexOf("@layer base {"), darkStart),
  dark: css.slice(darkStart),
}

function cssVars(section: string) {
  const vars: Record<string, string> = {}
  for (const [, name, value] of section.matchAll(
    /(--[a-z0-9-]+):\s*([^;]+);/g,
  )) {
    vars[name] = value.trim()
  }
  delete vars["--radius"]
  return vars
}

describe("theme palette", () => {
  for (const scheme of ["light", "dark"] as const) {
    test(`global.css ${scheme} tokens match the TS palette`, () => {
      expect(cssVars(sections[scheme])).toEqual(themeColorVars(scheme))
    })
  }
})
