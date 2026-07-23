import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const MOBILE_DIR = resolve(new URL("..", import.meta.url).pathname);
const REPO_DIR = resolve(MOBILE_DIR, "../..");

const contracts = [
  {
    file: "src/app/(admin-tabs)/_layout.tsx",
    markers: [
      "AdminTabsProvider",
      "AdminCreateActionSheet",
      "AdminTabBar",
      'initialRouteName="admin-home"',
      '<Tabs.Screen name="orders"',
      '<Tabs.Screen name="catalog"',
      '<Tabs.Screen name="more"',
      'command.payload.kind === "commercial_order"',
    ],
  },
  {
    file: "src/components/mobile/admin-tabs/admin-tab-bar.tsx",
    markers: [
      "MobileBottomTabs",
      'label: "+"',
      'kind: "action"',
      "hideOnScroll",
      "isHidden={isHidden}",
      'testID="admin-root-tab-dock"',
    ],
  },
  {
    file: "src/components/mobile/bottom-tab-item.tsx",
    markers: [
      "allowFontScaling={false}",
      "adjustsFontSizeToFit",
      'textAlign: "center"',
      'width: "100%"',
    ],
  },
  {
    file: "src/components/mobile/admin-tabs/admin-orders-screen.tsx",
    markers: [
      "FlatList",
      "CommercePendingOrderRow",
      "useAdminDockScroll",
      "Orders pending sync",
      "Search order, customer, or item",
      "No matching orders",
      "orders.refetch",
    ],
  },
  {
    file: "src/components/mobile/catalog-items-sheet.tsx",
    markers: ['presentation?: "modal" | "tab"', 'presentation === "tab"'],
  },
  {
    file: "src/components/mobile/admin-tabs/admin-more-screen.tsx",
    markers: [
      "Menu",
      "My Store",
      "buildAdminMoreSections",
      "syncAlertCount",
      'title="App theme"',
      '(["system", "light", "dark"] as const)',
      "setThemeOverride(value)",
      'accessibilityRole="radio"',
      "unsynced",
      "useResetAdminDock",
    ],
  },
  {
    file: "src/lib/admin-navigation.ts",
    markers: [
      'AdminTabKey = "home" | "orders" | "catalog" | "more"',
      'AdminCatalogTabLabel = "Products" | "Services" | "Catalog"',
      'normalizedRole === "MANAGER"',
      'routeName: "catalog"',
      'label: "App theme"',
    ],
  },
  {
    file: "src/app/_layout.tsx",
    markers: ['name="(admin-tabs)"', "canAccessAdminTabs"],
  },
  {
    file: "assets/images/design-system/reference-admin-more.png",
    markers: [],
  },
  {
    file: "src/components/mobile/design-system/designs/design-01/design-01.data.ts",
    markers: [
      "DESIGN_01_ADMIN_MORE_REFERENCE",
      "reference-admin-more.png",
      "DESIGN_01_ROUTES.moreImage",
    ],
  },
];

const failures = [];

for (const contract of contracts) {
  const path = join(MOBILE_DIR, contract.file);
  if (!existsSync(path)) {
    failures.push(`${contract.file} is missing`);
    continue;
  }
  if (contract.markers.length === 0) continue;
  const source = readFileSync(path, "utf8");
  for (const marker of contract.markers) {
    if (!source.includes(marker)) {
      failures.push(`${contract.file} is missing marker: ${marker}`);
    }
  }
}

const gitignore = readFileSync(join(REPO_DIR, ".gitignore"), "utf8");
if (!gitignore.split("\n").includes("/.designs/")) {
  failures.push(".gitignore must ignore the root /.designs/ archive");
}

const rasterExtensions = new Set([".jpeg", ".jpg", ".png", ".webp"]);
function findRasterFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findRasterFiles(path);
    return rasterExtensions.has(extname(entry.name).toLowerCase())
      ? [path]
      : [];
  });
}

for (const path of findRasterFiles(join(REPO_DIR, ".scratch"))) {
  failures.push(`${relative(REPO_DIR, path)} must be archived under .designs/`);
}

if (failures.length > 0) {
  console.error("Admin tabs contract check failed.");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Admin tabs contract check passed.");
