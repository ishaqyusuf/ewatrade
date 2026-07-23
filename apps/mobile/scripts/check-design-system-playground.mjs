import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const MOBILE_DIR = resolve(new URL("..", import.meta.url).pathname);
const REPO_DIR = resolve(MOBILE_DIR, "../..");

const requiredFiles = [
  {
    file: "src/app/design-system/index.tsx",
    markers: ["DesignSystemScreen"],
  },
  {
    file: "src/app/design-system/_layout.tsx",
    markers: ["Stack", "headerShown: false"],
  },
  {
    file: "src/app/design-system/references/[referenceId]/index.tsx",
    markers: ["Redirect", "DESIGN_01_ROUTES.home"],
  },
  {
    file: "src/app/design-system/references/[referenceId]/image.tsx",
    markers: ["Redirect", "DESIGN_01_ROUTES.image"],
  },
  {
    file: "src/app/design-system/design-01/_layout.tsx",
    markers: ["Stack", "headerShown: false"],
  },
  {
    file: "src/app/design-system/design-01/index.tsx",
    markers: ["Design01HomeScreen"],
  },
  {
    file: "src/app/design-system/design-01/reference.tsx",
    markers: ["Design01ReferenceScreen"],
  },
  {
    file: "src/app/design-system/design-01/image.tsx",
    markers: ["Design01SourceImageScreen"],
  },
  {
    file: "src/app/design-system/design-01/more.tsx",
    markers: ["Design01AdminMorePreviewScreen"],
  },
  {
    file: "src/app/design-system/design-01/more-image.tsx",
    markers: ["Design01AdminMoreSourceImageScreen"],
  },
  {
    file: "src/app/design-system/design-01/orders.tsx",
    markers: ["Design01OrdersScreen"],
  },
  {
    file: "src/app/design-system/design-01/customers.tsx",
    markers: ["Design01CustomersScreen"],
  },
  {
    file: "src/app/design-system/design-01/customer/[customerId].tsx",
    markers: ["Design01CustomerOverviewScreen", "useLocalSearchParams"],
  },
  {
    file: "src/app/design-system/design-01/order/[orderId].tsx",
    markers: ["Design01OrderOverviewScreen", "useLocalSearchParams"],
  },
  {
    file: "src/app/design-system/design-01/source/[referenceId].tsx",
    markers: ["Design01SourceImageScreen", "getDesign01Reference", "Redirect"],
  },
  {
    file: "src/components/mobile/design-system/designs/design-01/design-01-source-image-screen.tsx",
    markers: [
      "Design01SourceImageScreen",
      "Image.resolveAssetSource",
      "isLandscapeBoard",
      "isBoardPanned",
      "forceFabsHidden",
      "ScrollView",
      "implementationRoute",
      "Swipe horizontally",
    ],
  },
  {
    file: "src/app/design-system/design-01/stock.tsx",
    markers: ["Design01WorkspaceScreen", 'title="Add Action"'],
  },
  {
    file: "src/app/design-system/design-01/messages.tsx",
    markers: ["Design01WorkspaceScreen", 'title="Messages"'],
  },
  {
    file: "src/app/design-system/design-01/profile.tsx",
    markers: ["Design01WorkspaceScreen", 'title="Profile"'],
  },
  {
    file: "src/app/login.tsx",
    markers: [
      "DevDesignSystemShortcut",
      "shouldShowInternalDesignSystemEntry",
      'href="/design-system"',
      'accessibilityLabel="Open design system"',
    ],
  },
  {
    file: "src/app/design-system-pattern.tsx",
    markers: [
      "DesignSystemPatternScreen",
      "design-system-pattern-screen",
      "pattern",
    ],
  },
  {
    file: "src/components/mobile/design-system/design-system-screen.tsx",
    markers: [
      "DesignSystemScreen",
      "ReferenceDecisionsSection",
      "Production visibility guard",
    ],
  },
  {
    file: "src/components/mobile/design-system/reference-decisions/data.ts",
    markers: [
      "FIRST_DESIGN_REFERENCE_ID",
      "DESIGN_01_ROUTES.home",
      "DESIGN_01_ROUTES.image",
      "DESIGN_01_LEGACY_REFERENCE_ID",
      "Design 01",
    ],
  },
  {
    file: "src/components/mobile/design-system/reference-decisions/reference-decision-card.tsx",
    markers: [
      "ReferenceDecisionCard",
      "Image",
      "href={reference.route}",
      "Open implemented screen",
    ],
  },
  {
    file: "src/components/mobile/design-system/reference-decisions/reference-decisions-section.tsx",
    markers: [
      "Reference Decisions",
      "ReferenceDecisionCard",
      "Approval-gated sequence",
    ],
  },
  {
    file: "src/components/mobile/bottom-tabs.tsx",
    markers: [
      "MobileBottomTabs",
      "MobileBottomTab",
      "floating",
      "haptic",
      "hideOnScroll",
      "showLabel",
      "showLabelOnActive",
      "labelStack",
      "onTabPress",
      "safeArea",
      "render",
      "activeHref",
      "activeLabel",
      "withTiming",
      "translateY",
      'variant === "operational-detail"',
      "MOBILE_OPERATIONAL_BOTTOM_TAB_TOKENS",
    ],
  },
  {
    file: "src/components/mobile/bottom-tab-item.tsx",
    markers: [
      "MobileBottomTabItem",
      'const accessibilityRole = isAction ? "button" : "tab"',
      "onPress",
      "href",
      "disabled",
      "allowOverflow",
      "tab.render",
      "min-h-11",
      "operational-bottom-tab-action",
      "accessibilityRole={accessibilityRole}",
    ],
  },
  {
    file: "src/components/mobile/design-system-playground/index.tsx",
    markers: [
      "operational-bottom-tab-preview",
      "operational-bottom-tab-attendant-preview",
      "reference-operational-detail.jpg",
      'variant="operational-detail"',
      "Design 01 keeps its separate",
    ],
  },
  {
    file: "src/components/mobile/design-system/references/reference-fabs.tsx",
    markers: [
      "ReferenceFabs",
      "bottomOffset",
      "Toggle reference screen theme",
      "setThemeOverride",
      "secondaryHref",
    ],
  },
  {
    file: "src/components/mobile/design-system/references/reference-immersive-screen-shell.tsx",
    markers: [
      "ReferenceImmersiveScreenShell",
      "StatusBar",
      "scrolledStatusBarColor",
      "scrolledStatusBarStyle",
      "statusBarSwitchOffset = 1",
      "isBottomTabHidden",
      "scrollDelta > 4",
      "statusBarSwitchOffset",
      "KeyboardAwareScrollView",
      "bottomTabBar",
    ],
  },
  {
    file: "src/components/mobile/design-system/references/reference-bottom-tab-bar.tsx",
    markers: [
      "ReferenceBottomTabBar",
      "MobileBottomTabs",
      "referenceTone",
      "floating",
      "haptic",
      "hideOnScroll",
      'labelStack="horizontal"',
      "safeArea",
      "showLabelOnActive",
    ],
  },
  {
    file: "src/components/mobile/design-system/designs/design-01/design-01.data.ts",
    markers: [
      "DESIGN_01_ROUTES",
      "/design-system/design-01",
      "/design-system/design-01/reference",
      "/design-system/design-01/image",
      "/design-system/design-01/orders",
      "/design-system/design-01/customers",
      "/design-system/design-01/profile",
      "DESIGN_01_REFERENCE_IMAGES",
      "DESIGN_01_ADMIN_MORE_REFERENCE",
      "DESIGN_01_COMMERCE_REFERENCE",
      "DESIGN_01_CUSTOMERS_REFERENCE",
      "implementationRoute",
      "@assets/images/design-system/reference-home-shell.jpg",
      "@assets/images/design-system/reference-admin-more.png",
      "@design/reference-commerce-home-customer-orders.png",
      "@design/reference-products-create-media.png",
      "@design/reference-customer-orders-insights.png",
      "@design/reference-customers-profile-orders.png",
      "@design/reference-customer-wishlist-reviews-loyalty.png",
    ],
  },
  {
    file: "src/components/mobile/design-system/designs/design-01/design-01-commerce.data.ts",
    markers: [
      "DESIGN_01_CUSTOMERS",
      "DESIGN_01_ORDERS",
      "getDesign01Customer",
      "getDesign01Order",
      "getDesign01CustomerValue",
    ],
  },
  {
    file: "src/components/mobile/design-system/designs/design-01/design-01-commerce-primitives.tsx",
    markers: [
      "Design01CommerceListShell",
      "Design01FilterChip",
      "Design01CustomerRow",
      "Design01OrderRow",
      "ReferenceFabs",
    ],
  },
  {
    file: "src/components/mobile/design-system/designs/design-01/design-01-orders-screen.tsx",
    forbiddenMarkers: ["ReferenceBottomTabBar", "bottomTabBar"],
    markers: [
      "Design01OrdersScreen",
      "design-01-orders-screen",
      "Design01CommerceListShell",
      "DESIGN_01_COMMERCE_REFERENCE",
    ],
  },
  {
    file: "src/components/mobile/design-system/designs/design-01/design-01-customers-screen.tsx",
    forbiddenMarkers: ["ReferenceBottomTabBar", "bottomTabBar"],
    markers: [
      "Design01CustomersScreen",
      "design-01-customers-screen",
      "Design01CommerceListShell",
      "DESIGN_01_CUSTOMERS_REFERENCE",
    ],
  },
  {
    file: "src/components/mobile/design-system/designs/design-01/design-01-customer-overview-screen.tsx",
    forbiddenMarkers: ["ReferenceBottomTabBar", "bottomTabBar"],
    markers: [
      "Design01CustomerOverviewScreen",
      "design-01-customer-overview-screen",
      "Recent orders",
      "Customer information",
    ],
  },
  {
    file: "src/components/mobile/design-system/designs/design-01/design-01-order-overview-screen.tsx",
    forbiddenMarkers: ["ReferenceBottomTabBar", "bottomTabBar"],
    markers: [
      "Design01OrderOverviewScreen",
      "design-01-order-overview-screen",
      "recordPayment",
      "advanceFulfilment",
      "Payment and fulfilment",
    ],
  },
  {
    file: "src/components/mobile/design-system/designs/design-01/design-01-admin-more-preview-screen.tsx",
    markers: [
      "Design01AdminMorePreviewScreen",
      "Menu",
      "Store & workspace",
      "Account settings",
      "App theme",
      "DESIGN_01_ROUTES.moreImage",
    ],
  },
  {
    file: "src/components/mobile/design-system/designs/design-01/design-01-home-hero.tsx",
    markers: [
      "Design01HomeHero",
      "paddingTop: insets.top",
      "borderBottomLeftRadius",
    ],
  },
  {
    file: "src/components/mobile/design-system/designs/design-01/design-01-home-content.tsx",
    markers: [
      "Design01HomeContent",
      "Service Categories",
      "Pressable",
      "haptic",
      "min-h-24 justify-center gap-3 rounded-[24px] bg-muted p-4",
      "Popular Products",
      "Ready for owner visual review",
    ],
  },
  {
    file: "src/components/mobile/design-system/designs/design-01/design-01-home-screen.tsx",
    markers: [
      "Design01HomeScreen",
      "Open source image for Design 01",
      "ReferenceImmersiveScreenShell",
      "ReferenceBottomTabBar",
      'label: "Add"',
      "render: ({ active })",
      "backgroundColor: colors.primary",
      "top: -20",
      'name="Plus"',
      "statusBarColor",
      "useColors",
      "DESIGN_01_MESSAGES_TAB",
    ],
  },
  {
    file: "src/components/mobile/design-system/designs/design-01/design-01-reference-screen.tsx",
    markers: [
      "Design01ReferenceScreen",
      "Reference System",
      "DESIGN_01_REFERENCE_IMAGES",
      "Open Design 01 home",
    ],
  },
  {
    file: "src/components/mobile/design-system/designs/design-01/design-01-workspace-screen.tsx",
    forbiddenMarkers: ["ReferenceBottomTabBar", "bottomTabBar"],
    markers: [
      "Design01WorkspaceScreen",
      "Functional Route Ready",
      "Home-only bottom tabs",
      "secondaryHref={DESIGN_01_ROUTES.reference}",
    ],
  },
  {
    file: "src/components/mobile/design-system/designs/design-01/design-01-source-image-screen.tsx",
    markers: [
      "Design01SourceImageScreen",
      "reference.title",
      "Design01AdminMoreSourceImageScreen",
      "Back to {implementationLabel}",
    ],
  },
  {
    file: "metro.config.js",
    markers: ["designRoot", 'resolve(__dirname, "../../.design")'],
  },
  {
    file: "tsconfig.json",
    markers: ['"@design/*": ["../../.design/*"]'],
  },
  {
    file: "../.design/reference-commerce-home-customer-orders.png",
    markers: [],
  },
  {
    file: "../.design/reference-products-create-media.png",
    markers: [],
  },
  {
    file: "../.design/reference-customer-orders-insights.png",
    markers: [],
  },
  {
    file: "../.design/reference-customers-profile-orders.png",
    markers: [],
  },
  {
    file: "../.design/reference-customer-wishlist-reviews-loyalty.png",
    markers: [],
  },
  {
    file: "src/components/mobile/design-system-playground/data.ts",
    markers: [
      "Tokens",
      "Typography",
      "Headers",
      "Actions",
      "Forms",
      "Lists",
      "Status",
      "Modals/Sheets",
      "Navigation/Footers",
      "Analytics",
      "Retail Ops Patterns",
      "salesToday",
      "shareLinkViews",
      "syncConflicts",
    ],
  },
  {
    file: "src/components/mobile/design-system-playground/analytics-bar-chart.tsx",
    markers: [
      "MobileAnalyticsBarChart",
      "chart-empty-state",
      "chart-loading-state",
      "chart-error-state",
      "chart-legend",
    ],
  },
  {
    file: "src/components/ui/text.tsx",
    markers: ["text-base text-foreground", "TextClassContext"],
  },
  {
    file: "src/components/ui/view.tsx",
    markers: ["ViewClassContext", "variant", "card", "screen"],
  },
  {
    file: "../.scratch/mobile-design-system-playground-implementation/issues/06-playground-qa-gemini-gravity-review-and-approval-handoff.md",
    markers: ["Gemini", "Gravity", "approval gate"],
  },
  {
    file: "../.scratch/wayfinder-mobile-design-system-playground/spec.md",
    markers: [
      "Status: ready-for-agent",
      "design-system playground",
      "Gemini",
      "Gravity",
    ],
  },
];

const failures = [];
const referenceSlashOpacityPattern =
  /\b(?:bg|border|text|ring|shadow|from|via|to)-[a-z0-9-]+\/\d+\b/;

for (const check of requiredFiles) {
  const filePath = check.file.startsWith("../.")
    ? join(REPO_DIR, check.file.replace("../", ""))
    : join(MOBILE_DIR, check.file);

  if (!existsSync(filePath)) {
    failures.push(`${relative(REPO_DIR, filePath)} is missing`);
    continue;
  }

  const contents = readFileSync(filePath, "utf8");

  if (
    (check.file.startsWith("src/components/mobile/design-system/references/") ||
      check.file.startsWith(
        "src/components/mobile/design-system/designs/design-01/",
      )) &&
    referenceSlashOpacityPattern.test(contents)
  ) {
    failures.push(
      `${relative(
        REPO_DIR,
        filePath,
      )} uses slash opacity classes in reference UI; use semantic tokens or explicit computed colors instead`,
    );
  }

  for (const marker of check.markers) {
    if (contents.includes(marker)) continue;
    failures.push(
      `${relative(REPO_DIR, filePath)} is missing marker: ${marker}`,
    );
  }

  for (const marker of check.forbiddenMarkers ?? []) {
    if (!contents.includes(marker)) continue;
    failures.push(
      `${relative(REPO_DIR, filePath)} must not include marker: ${marker}`,
    );
  }
}

if (failures.length > 0) {
  console.error("Mobile design-system playground check failed.");

  for (const failure of failures) {
    console.error(`- ${failure}`);
  }

  process.exit(1);
}

console.log("Mobile design-system playground check passed.");
