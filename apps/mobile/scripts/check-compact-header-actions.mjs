import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"

const MOBILE_DIR = resolve(new URL("..", import.meta.url).pathname)

function checkPressableContract({
  endMarker,
  file,
  markers,
  name,
  startMarker,
}) {
  const source = readFileSync(join(MOBILE_DIR, file), "utf8")
  const start = source.indexOf(startMarker)

  if (start === -1) {
    return [`${file}: ${name} is missing ${startMarker}`]
  }

  const end = source.indexOf(endMarker, start)
  if (end === -1) {
    return [`${file}: ${name} is missing its closing ${endMarker}`]
  }

  const pressable = source.slice(start, end + endMarker.length)

  return markers
    .filter((marker) => !pressable.includes(marker))
    .map((marker) => `${file}: ${name} is missing ${marker}`)
}

const contracts = [
  {
    endMarker: "</Pressable>",
    file: "src/components/mobile/customer-conversations/customer-shell-header.tsx",
    markers: [
      'accessibilityLabel="Open Business workspace"',
      'accessibilityRole="button"',
      'className="min-h-11 min-w-28 flex-row items-center justify-center gap-2 rounded-full bg-muted px-5 active:bg-accent"',
      "setLastMobileShell(\"business\")",
      "transition",
      ">Business</Text>",
    ],
    name: "Customer Chats Business workspace action",
    startMarker:
      '<Pressable\n          accessibilityLabel="Open Business workspace"',
  },
  {
    endMarker: "</Pressable>",
    file: "src/app/dashboard.tsx",
    markers: [
      'accessibilityRole="button"',
      'className="min-h-11 min-w-20 justify-center rounded-full px-5 active:bg-accent will-change-pressable"',
      'onPress={() => router.push("/orders" as never)}',
      "transition",
      ">See all</Text>",
    ],
    name: "Recent orders See all action",
    startMarker:
      '<Pressable\n              accessibilityRole="button"\n              className="min-h-11 min-w-20 justify-center rounded-full px-5 active:bg-accent will-change-pressable"',
  },
  {
    endMarker: "</Pressable>",
    file: "src/components/mobile/simple-catalog-item-screen.tsx",
    markers: [
      "accessibilityLabel={removeLabel}",
      'accessibilityRole="button"',
      'className="min-h-11 min-w-20 items-center justify-center rounded-full px-5 active:bg-destructive/10"',
      "onPress={onRemove}",
      "transition",
      ">Remove</Text>",
    ],
    name: "Section header Remove action",
    startMarker: "<Pressable\n            accessibilityLabel={removeLabel}",
  },
  {
    endMarker: "</Pressable>",
    file: "src/components/mobile/simple-catalog-item-screen.tsx",
    markers: [
      "accessibilityLabel={addLabel}",
      'accessibilityRole="button"',
      'className="min-h-11 min-w-20 items-center justify-center rounded-full px-5 active:bg-primary/10"',
      "onPress={onAdd}",
      "transition",
      ">Add</Text>",
    ],
    name: "Section header Add action",
    startMarker: "<Pressable\n        accessibilityLabel={addLabel}",
  },
]

const failures = contracts.flatMap(checkPressableContract)

if (failures.length > 0) {
  console.error(
    "Compact header action check failed. Keep top text actions horizontally padded with visible pressed feedback.",
  )
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log("Compact header action check passed.")
