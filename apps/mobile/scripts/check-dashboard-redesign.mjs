import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const MOBILE_DIR = resolve(new URL("..", import.meta.url).pathname);
const SOURCE_DIR = join(MOBILE_DIR, "src");

const requiredMarkers = [
  {
    file: "app/dashboard.tsx",
    markers: [
      "MobileAppShell",
      "StatusBanner",
      "OperationsDashboardSurface",
      "isSalesRepRole",
      "getOfflineProvisionalProjection",
      "hasProduct",
      'item.kind === "product"',
      "packagedBalanceCount",
      'row.kind === "PACKAGED_STOCK"',
      "!isAttendant && hasProduct",
      "!isAttendant && packagedBalanceCount >= 2",
      "Quick actions",
      "Recent orders",
      "Product and Service Offerings",
      "Add your first item",
      "Create a Product or Service",
    ],
  },
  {
    file: "components/mobile/app-shell.tsx",
    markers: [
      "StatusBar",
      "contentStatusBarStyle",
      "heroStatusBarStyle",
      "hero",
      "statusBarColor",
      "mobile-shell-status-bar-background",
      "hasStartedScroll",
      "isBottomTabHidden",
      "onScroll={handleScroll}",
      "hideOnScroll",
    ],
  },
];

const forbiddenMarkers = [
  {
    file: "app/dashboard.tsx",
    markers: [
      "Retail ops",
      "Feed",
      "Bag",
      "showSecondaryAdminHomeSections",
      'headerAction={<Logout tone="hero" />}',
    ],
  },
  {
    file: "components/mobile/app-shell.tsx",
    markers: ["hideOnScroll={false}"],
  },
];

const failures = [];

for (const check of requiredMarkers) {
  const filePath = join(SOURCE_DIR, check.file);
  const contents = readFileSync(filePath, "utf8");

  for (const marker of check.markers) {
    if (contents.includes(marker)) continue;

    failures.push({
      file: relative(MOBILE_DIR, filePath),
      message: `missing marker: ${marker}`,
    });
  }
}

for (const check of forbiddenMarkers) {
  const filePath = join(SOURCE_DIR, check.file);
  const contents = readFileSync(filePath, "utf8");

  for (const marker of check.markers) {
    if (!contents.includes(marker)) continue;

    failures.push({
      file: relative(MOBILE_DIR, filePath),
      message: `contains obsolete marker: ${marker}`,
    });
  }
}

if (failures.length > 0) {
  console.error("Mobile generic operations dashboard check failed.");

  for (const failure of failures) {
    console.error(`- ${failure.file}: ${failure.message}`);
  }

  process.exit(1);
}

console.log("Mobile generic operations dashboard check passed.");
