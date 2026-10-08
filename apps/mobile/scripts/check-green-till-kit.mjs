// Guards the Green Till shared kit (Phase 0) so screens can rely on it.
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"

const SOURCE_DIR = join(resolve(new URL("..", import.meta.url).pathname), "src")

const contracts = [
  {
    file: "components/mobile/green-till/hero-card.tsx",
    markers: [
      "export function HeroCard",
      "BrandMark",
      "rgba(255,255,255,0.07)",
      'fontVariant: ["tabular-nums"]',
      'tone="cream"',
      "progress",
      "stats",
    ],
  },
  {
    file: "components/mobile/green-till/kit.tsx",
    markers: [
      "export function SectionHeader",
      "export function QuickActionRow",
      "size-[54px]",
      "bg-gold",
      "export function AttentionRail",
      "if (!items.length) return null",
      "export function ListCard",
      "export function RecordRow",
      "export function StatusPill",
      'fontWeight: "700"',
      "export function SetupSteps",
      "export function GhostPreview",
      "border-dashed",
      "export function NudgeCard",
      "export function ToggleRow",
    ],
  },
  {
    file: "components/mobile/action-button.tsx",
    markers: ['tone?: "cream" | "gold" | "soft"', "bg-gold"],
  },
  {
    file: "components/mobile/status-banner.tsx",
    markers: ["bg-tint-amber", "bg-tint-rose", "linkLabel"],
  },
  {
    file: "styles/global.css",
    markers: ["--color-gold:", "--tint-mint:", "--tint-rose-foreground:"],
  },
  {
    file: "components/ui/switch.tsx",
    markers: ["bg-muted-foreground/45"],
  },
]

/** Line numbers of JSX opening tags that carry both className and style. */
function mixedClassNameAndStyle(source) {
  const lines = []
  const tag = /<[A-Z][\w.]*/g
  for (let match = tag.exec(source); match; match = tag.exec(source)) {
    let depth = 0
    let end = match.index + 1
    for (; end < source.length; end += 1) {
      const char = source[end]
      if (char === "{") depth += 1
      else if (char === "}") depth -= 1
      else if (char === ">" && depth === 0 && source[end - 1] !== "=") break
    }
    const opening = source.slice(match.index, end)
    if (/\sclassName=/.test(opening) && /\sstyle=/.test(opening))
      lines.push(source.slice(0, match.index).split("\n").length)
  }
  return lines
}

const failures = []
for (const { file, markers } of contracts) {
  const source = readFileSync(join(SOURCE_DIR, file), "utf8")
  for (const marker of markers)
    if (!source.includes(marker)) failures.push(`${file}: missing ${marker}`)
  // Lesson: never mix className and inline style on one element.
  if (file.endsWith(".tsx"))
    for (const line of mixedClassNameAndStyle(source))
      failures.push(
        `${file}:${line}: className and inline style on one element`,
      )
}

if (failures.length) {
  console.error(`Green Till kit check failed:\n${failures.join("\n")}`)
  process.exit(1)
}
console.log("Green Till kit check passed.")
