import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const MOBILE_DIR = join(REPO_ROOT, "apps/mobile")
const FILES = {
  config: join(MOBILE_DIR, "app.config.ts"),
  dashboard: join(MOBILE_DIR, "src/app/dashboard.tsx"),
  layout: join(MOBILE_DIR, "src/app/_layout.tsx"),
  route: join(MOBILE_DIR, "src/app/service-orders-modal.tsx"),
  serviceOrders: join(
    MOBILE_DIR,
    "src/components/mobile/service-orders-sheet.tsx",
  ),
}

const CONTRACTS = [
  {
    file: FILES.layout,
    markers: [
      'name="service-orders-modal"',
      "isAuthenticated && !isInvitedStaff",
    ],
    reason:
      "service-order route must stay protected for signed-in owner/staff users",
  },
  {
    file: FILES.route,
    markers: [
      "WorkflowModalScreen",
      "allowSalesRep",
      "ServiceOrdersContent",
      'title="Service orders"',
    ],
    reason:
      "service-order route must stay a full-screen workflow available to reps",
  },
  {
    file: FILES.dashboard,
    markers: [
      'router.push("/service-orders-modal")',
      'label: "Service order"',
      'label: "Services"',
      "onServiceOrders={openServiceOrders}",
      "onServices={openServiceOrders}",
    ],
    reason:
      "admin and sales-rep homes must keep reachable service-order entry points",
  },
  {
    file: FILES.config,
    markers: [
      '"expo-image-picker"',
      "cameraPermission",
      "microphonePermission",
      "photosPermission",
    ],
    reason:
      "native intake photo/video capture must keep Expo camera and microphone permissions configured",
  },
  {
    file: FILES.serviceOrders,
    markers: [
      "retailOps.dryCleaningServiceItems.queryOptions",
      "retailOps.dryCleaningServiceOrders.queryOptions",
      "retailOps.dryCleaningSettings.queryOptions",
      "retailOps.createDryCleaningServiceItem.mutationOptions",
      "retailOps.createDryCleaningServiceOrder.mutationOptions",
      "retailOps.updateDryCleaningServiceOrderStatus.mutationOptions",
      "retailOps.updateDryCleaningSettings.mutationOptions",
    ],
    reason:
      "mobile service workflow must use the production dry-cleaning tRPC surface",
  },
  {
    file: FILES.serviceOrders,
    markers: [
      'import * as ImagePicker from "expo-image-picker"',
      "requestCameraPermissionsAsync",
      "launchCameraAsync",
      "KeyboardAwareScrollView",
      "FormField",
      "QuantityStepper",
      "ActionButton",
      "SecondaryOperationalRow",
      "StatusBanner",
      "Evidence link fallback",
      "Intake media",
      "Snap photo",
      "Record video",
      "SM",
      "LG",
    ],
    reason:
      "service workflow must keep keyboard-safe reusable inputs/buttons, native photo/video evidence, and SM/LG intake setup",
  },
  {
    file: FILES.serviceOrders,
    markers: [
      "isOfflineMode",
      "Dry-cleaning service orders need a live connection",
      "Product sales still keep the existing offline queue",
    ],
    reason:
      "service workflow must be honest that dry-cleaning offline sync is not implemented yet",
  },
]

const failures = []

for (const contract of CONTRACTS) {
  const source = readFileSync(contract.file, "utf8")
  const missingMarkers = contract.markers.filter(
    (marker) => !source.includes(marker),
  )

  if (missingMarkers.length > 0) {
    failures.push({
      file: contract.file,
      message: `missing ${missingMarkers.join(", ")} (${contract.reason})`,
    })
  }
}

if (failures.length > 0) {
  console.error("Service orders flow check failed.")

  for (const failure of failures) {
    console.error(`- ${relative(REPO_ROOT, failure.file)}: ${failure.message}`)
  }

  process.exit(1)
}

console.log("Service orders flow check passed.")
