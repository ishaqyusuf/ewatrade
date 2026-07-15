#!/usr/bin/env node
import postcss from "postcss"
import tailwind from "@tailwindcss/postcss"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(dirname(fileURLToPath(import.meta.url)))

const requiredSemanticTokens = [
  "accent",
  "accent-foreground",
  "background",
  "border",
  "card",
  "card-foreground",
  "destructive",
  "destructive-foreground",
  "foreground",
  "input",
  "muted",
  "muted-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "ring",
  "secondary",
  "secondary-foreground",
  "success",
  "success-foreground",
  "warn",
  "warn-foreground",
]

const requiredPaletteTokens = [
  "color-red-500",
  "color-red-950",
  "color-orange-500",
  "color-amber-500",
  "color-yellow-500",
  "color-lime-500",
  "color-green-500",
  "color-emerald-500",
  "color-teal-500",
  "color-cyan-500",
  "color-sky-500",
  "color-blue-500",
  "color-indigo-500",
  "color-violet-500",
  "color-purple-500",
  "color-fuchsia-500",
  "color-pink-500",
  "color-rose-500",
  "color-slate-500",
  "color-gray-500",
  "color-zinc-500",
  "color-neutral-500",
  "color-stone-500",
]

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8")
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function assertFile(relativePath) {
  assert(existsSync(join(root, relativePath)), `Missing ${relativePath}`)
}

assertFile("src/lib/nativewind-theme-vars.ts")

const layout = read("src/app/_layout.tsx")
const metroConfig = read("metro.config.js")
const themeVars = read("src/lib/nativewind-theme-vars.ts")
const tailwindConfig = read("tailwind.config.ts")
const globalCss = read("src/styles/global.css")

assert(
  metroConfig.includes("withNativewind(config, {"),
  "Metro config must pass options to withNativewind.",
)
assert(
  metroConfig.includes('input: "./src/styles/global.css"'),
  "Metro config must use src/styles/global.css as the NativeWind input.",
)
assert(
  layout.includes('import { VariableContextProvider } from "nativewind"'),
  "Root layout must import VariableContextProvider from nativewind.",
)
assert(
  layout.includes('import { nativewindThemeVars } from "@/lib/nativewind-theme-vars"'),
  "Root layout must import nativewindThemeVars.",
)
assert(
  layout.includes("<VariableContextProvider value={themeVariables}>"),
  "Root layout must wrap the app with VariableContextProvider.",
)
assert(
  layout.includes("nativewindThemeVars(colorScheme)"),
  "Root layout must derive NativeWind variables from the active color scheme.",
)
assert(
  !layout.includes("vars("),
  "Root layout must not use vars() as a style object for app-wide theme variables.",
)
assert(
  !themeVars.includes("vars("),
  "nativewindThemeVars must return a raw variable map, not a vars() style object.",
)
assert(
  themeVars.includes("...TAILWIND_COLOR_VARIABLES"),
  "nativewindThemeVars must include Tailwind palette variables for bg-red-500/text-red-500 runtime resolution.",
)

for (const token of requiredSemanticTokens) {
  assert(
    themeVars.includes(`"--${token}"`),
    `nativewindThemeVars is missing --${token}.`,
  )
  assert(
    globalCss.includes(`--${token}:`),
    `global.css is missing --${token}.`,
  )
  assert(
    tailwindConfig.includes(`var(--${token})`),
    `tailwind.config.ts is missing var(--${token}).`,
  )
}

for (const token of requiredPaletteTokens) {
  assert(
    themeVars.includes(`"--${token}"`),
    `nativewindThemeVars is missing --${token}.`,
  )
}

const compiled = await postcss([tailwind()]).process(
  `${globalCss}\n@source inline("bg-red-500 bg-red-500/10 text-red-500 text-red-500/5 bg-primary bg-primary/10 text-primary-foreground text-primary-foreground/5");`,
  { from: join(root, "src/styles/global.css") },
)

for (const className of [
  ".bg-red-500",
  ".bg-red-500\\/10",
  ".text-red-500",
  ".text-red-500\\/5",
  ".bg-primary",
  ".bg-primary\\/10",
  ".text-primary-foreground",
  ".text-primary-foreground\\/5",
]) {
  assert(
    compiled.css.includes(className),
    `Tailwind output is missing ${className}.`,
  )
}

console.log(
  `NativeWind theme variable guard passed (${requiredSemanticTokens.length} semantic tokens, ${requiredPaletteTokens.length} palette samples).`,
)
