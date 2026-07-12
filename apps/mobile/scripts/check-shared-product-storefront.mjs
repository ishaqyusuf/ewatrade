import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const PAGE_FILE = join(
  REPO_ROOT,
  "apps/storefront/src/app/p/[tenantSlug]/[storeSlug]/[productSlug]/page.tsx",
)
const FORM_FILE = join(
  REPO_ROOT,
  "apps/storefront/src/app/p/[tenantSlug]/[storeSlug]/[productSlug]/shared-product-order-form.tsx",
)
const NOT_FOUND_FILE = join(
  REPO_ROOT,
  "apps/storefront/src/app/p/[tenantSlug]/[storeSlug]/[productSlug]/not-found.tsx",
)
const OG_ROUTE_FILE = join(
  REPO_ROOT,
  "apps/storefront/src/app/api/og/shared-product/route.tsx",
)
const ORDER_UTILS_FILE = join(
  REPO_ROOT,
  "apps/storefront/src/app/p/[tenantSlug]/[storeSlug]/[productSlug]/shared-product-order-utils.ts",
)
const SHARE_QUERIES_FILE = join(
  REPO_ROOT,
  "packages/db/src/queries/retail-ops-share-links.ts",
)
const CONTRACTS = [
  {
    file: PAGE_FILE,
    markers: [
      "generateMetadata",
      "openGraph",
      "twitter",
      "/api/og/shared-product",
      "getSharedProductPreviewImageUrl",
      "generatedPreviewImage",
      "productImageUrl: sharedProduct.product.imageUrl",
      "previewImageAlt",
      "alt: previewImageAlt",
      "siteName: sharedProduct.store.name",
      "getRetailOpsSharedProduct",
      "recordView",
      "notFound()",
    ],
    reason:
      "shared links must keep rich preview metadata, token lookup, view tracking, and invalid-link handling",
  },
  {
    file: ORDER_UTILS_FILE,
    markers: [
      "CUSTOMER_ACCOUNT_EXISTS",
      "CUSTOMER_LOGIN_FAILED",
      "CUSTOMER_PASSWORD_REQUIRED",
      "getOrderQuantity",
      "getCustomerAuthMode",
      "getSharedPath",
      "getFormValue",
      "getErrorMessage",
      "getStorefrontBaseUrl",
      "getSharedProductPreviewImageUrl",
    ],
    reason:
      "shared-link checkout helpers must keep encoded paths, customer auth defaults, normalized quantity, customer-facing error copy, and product-image preview fallback logic",
  },
  {
    file: PAGE_FILE,
    markers: [
      '"use server"',
      "resolveSharedLinkCustomer",
      "auth.api",
      "prisma.user.findUnique",
      "signUpEmail",
      "signInEmail",
      "customerAccount: customer.account",
      "customerEmail: customer.email",
      "customerName: customer.name",
      "createRetailOpsSharedProductOrderRequest",
      "enqueueRetailOpsSharedLinkOrderNotification",
      "recordRetailOpsSharedLinkNotificationDispatch",
      'status: "queued"',
      'status: "failed"',
      "failureReason",
      "redirect(nextUrl)",
    ],
    reason:
      "shared-link checkout must preserve customer register/login, normalized quantity, platform customer identity, pending order creation, notification audit, and redirect outcomes",
  },
  {
    file: PAGE_FILE,
    markers: [
      "SharedProductOrderForm",
      "availableVariants",
      "Available units",
      "Request this product",
    ],
    reason:
      "public product page must keep business/product display and order form handoff",
  },
  {
    file: NOT_FOUND_FILE,
    markers: [
      "metadata",
      "Product link unavailable",
      "This link may have been deactivated, expired, or moved.",
      "Ask the business for a new product link",
    ],
    reason:
      "invalid, missing, or deactivated shared product links must show a clear customer-facing unavailable state",
  },
  {
    file: FORM_FILE,
    markers: [
      '"use client"',
      'data-testid="shared-product-order-form"',
      'data-testid="shared-product-order-requested"',
      'data-testid="shared-product-order-error"',
      'data-testid="shared-product-variant-radio"',
      'data-testid="shared-product-quantity-input"',
      'data-testid="shared-product-total"',
      'data-testid="shared-product-register-radio"',
      'data-testid="shared-product-login-radio"',
      'data-testid="shared-product-customer-name"',
      'data-testid="shared-product-customer-email"',
      'data-testid="shared-product-customer-password"',
      'data-testid="shared-product-customer-phone"',
      'data-testid="shared-product-notes"',
      'data-testid="shared-product-submit"',
      "toWholeQuantity",
      "safeQuantity",
      "totalMinor",
      'name="quantity"',
      'name="customerAuthMode"',
      'value="register"',
      'value="login"',
      "checked={customerAuthMode ===",
      'autoComplete="email"',
      '"new-password"',
      '"current-password"',
      'required={customerAuthMode === "register"}',
      "minLength={8}",
      "disabled={!hasAvailableVariant}",
      "Submit order request",
      "Currently unavailable",
    ],
    reason:
      "shared product order form must keep variant selection, whole quantity total, register/login mode requirements, password behavior, and unavailable-state behavior",
  },
  {
    file: OG_ROUTE_FILE,
    markers: [
      'import { ImageResponse } from "next/og"',
      'export const runtime = "nodejs"',
      "getSearchValue",
      'getSearchValue(url, "name", "Product")',
      'getSearchValue(url, "business", "ewatrade")',
      'getSearchValue(url, "price", "")',
      "new ImageResponse",
      "ewatrade",
      "{business}",
      "{name}",
      "From {price}",
      "View product units and submit an order request.",
      "height: 630",
      "width: 1200",
    ],
    reason:
      "shared product rich preview image route must keep bounded query input, product/business/price rendering, and social-preview dimensions",
  },
  {
    file: SHARE_QUERIES_FILE,
    markers: [
      'shareLink.status !== "ACTIVE"',
      "SHARE_LINK_NOT_FOUND",
      "!existingShareLink?.active",
      "This product link is no longer available.",
      "getRetailOpsSharedProduct",
      "createRetailOpsSharedProductOrderRequest",
    ],
    reason:
      "shared product lookups and order requests must reject deactivated durable or fallback links before customers can order",
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
      ...contract,
      missingMarkers,
    })
  }
}

if (failures.length > 0) {
  console.error(
    "Shared product storefront check failed. Restore the public product-link metadata, customer auth, order request, notification, or form behavior.",
  )

  for (const failure of failures) {
    console.error(
      `- ${relative(REPO_ROOT, failure.file)}: missing ${failure.missingMarkers.join(
        ", ",
      )} (${failure.reason})`,
    )
  }

  process.exit(1)
}

console.log("Shared product storefront check passed.")
