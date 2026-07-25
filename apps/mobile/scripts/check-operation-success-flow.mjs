import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const MOBILE_DIR = resolve(new URL("..", import.meta.url).pathname)
const SOURCE_DIR = join(MOBILE_DIR, "src")

const checks = [
  {
    file: "lib/operation-success-navigation.ts",
    markers: [
      "CommonActions.reset",
      'name: "dashboard"',
      'name: "operation-success"',
      "index: 1",
    ],
  },
  {
    file: "app/operation-success.tsx",
    markers: ["useLocalSearchParams", "OperationSuccessScreen"],
  },
  {
    file: "app/create-sale-modal.tsx",
    markers: [
      "showOperationSuccess",
      'kind: "order"',
      "completion.reference",
      "completion.paymentState",
      "completion.status",
    ],
  },
  {
    file: "app/first-product-setup-modal.tsx",
    markers: [
      "showOperationSuccess",
      "kind: completion.kind",
      "name: completion.name",
      'status: "created"',
    ],
  },
  {
    file: "components/mobile/operation-success-screen.tsx",
    markers: [
      "Order created",
      "Product created",
      "Service created",
      "Order queued",
      "SuccessDetailRow",
      'accessibilityLabel="Go to home"',
      'router.replace("/dashboard")',
    ],
  },
  {
    file: "app/_layout.tsx",
    markers: [
      'name="operation-success"',
      "fullScreenGestureEnabled: true",
      "gestureEnabled: true",
    ],
  },
]

const failures = []

for (const check of checks) {
  const filePath = join(SOURCE_DIR, check.file)
  const source = readFileSync(filePath, "utf8")

  for (const marker of check.markers) {
    if (source.includes(marker)) continue

    failures.push(
      `${relative(MOBILE_DIR, filePath)} is missing success-flow marker ${marker}`,
    )
  }
}

for (const file of [
  "app/create-sale-modal.tsx",
  "app/first-product-setup-modal.tsx",
]) {
  const filePath = join(SOURCE_DIR, file)
  const source = readFileSync(filePath, "utf8")

  if (source.includes("onComplete={() => router.replace(")) {
    failures.push(
      `${relative(MOBILE_DIR, filePath)} bypasses the full-screen success route`,
    )
  }
}

if (failures.length > 0) {
  console.error("Operation success flow check failed.")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log("Operation success flow check passed.")
