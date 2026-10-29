import type { WorkspaceFeaturePresenceFacts } from "../workspace-feature-presence"

type Scope = { tenantId: string; storeId: string }
type CatalogItem = {
  id: string
  tenantId: string
  kind: "PRODUCT" | "SERVICE"
  status: string
  systemRole: string | null
}
type Offering = {
  id: string
  catalogItemId: string
  variantId: string
  status: string
  pricingPolicy: string
  fixedPriceMinor: number | null
}
type Tables = {
  CatalogItem: CatalogItem[]
  SellableOffering: Offering[]
  SellableVariant: { id: string; status: string }[]
  StoreOfferingAvailability: {
    offeringId: string
    storeId: string
    isAvailable: boolean
  }[]
  CommercialOrder: (Scope & {
    customerEmail: string | null
    customerName: string | null
    customerPhone: string | null
  })[]
  ServiceJob: Scope[]
  Customer: { tenantId: string }[]
  Membership: { tenantId: string; role: string; status: string }[]
  StockOperation: Scope[]
  PrescriptionStoreSettings: (Scope & { status: string })[]
}
const emptyFacts: WorkspaceFeaturePresenceFacts = {
  hasProductItems: false,
  hasServiceItems: false,
  hasActiveSellableItems: false,
  hasOrders: false,
  hasCustomers: false,
  hasServiceJobs: false,
  hasStaff: false,
  hasInventoryActivity: false,
  hasPrescriptionCommerce: false,
}

export function workspaceFeaturePresenceCases() {
  const cases: {
    name: string
    input: Scope
    tables: Tables
    expected: WorkspaceFeaturePresenceFacts
  }[] = []
  function add(
    name: string,
    populate: (tables: Tables, scope: Scope) => void,
    expected: Partial<WorkspaceFeaturePresenceFacts>,
  ) {
    const input = { tenantId: `tenant-${name}`, storeId: `store-${name}` }
    const tables: Tables = {
      CatalogItem: [],
      SellableOffering: [],
      SellableVariant: [],
      StoreOfferingAvailability: [],
      CommercialOrder: [],
      ServiceJob: [],
      Customer: [],
      Membership: [],
      StockOperation: [],
      PrescriptionStoreSettings: [],
    }
    populate(tables, input)
    cases.push({
      name,
      input,
      tables,
      expected: { ...emptyFacts, ...expected },
    })
  }
  function catalog(
    tables: Tables,
    scope: Scope,
    kind: "PRODUCT" | "SERVICE" = "PRODUCT",
  ) {
    const id = `${scope.tenantId}-${tables.CatalogItem.length}`
    const item: CatalogItem = {
      id,
      tenantId: scope.tenantId,
      kind,
      status: "ACTIVE",
      systemRole: null,
    }
    const offering: Offering = {
      id: `offering-${id}`,
      catalogItemId: id,
      variantId: `variant-${id}`,
      status: "ACTIVE",
      pricingPolicy: "FIXED",
      fixedPriceMinor: 100,
    }
    const variant = { id: offering.variantId, status: "ACTIVE" }
    const availability = {
      offeringId: offering.id,
      storeId: scope.storeId,
      isAvailable: true,
    }
    tables.CatalogItem.push(item)
    tables.SellableOffering.push(offering)
    tables.SellableVariant.push(variant)
    tables.StoreOfferingAvailability.push(availability)
    return { item, offering, variant, availability }
  }
  function order(tables: Tables, scope: Scope) {
    const row = {
      ...scope,
      customerEmail: null as string | null,
      customerName: null as string | null,
      customerPhone: null as string | null,
    }
    tables.CommercialOrder.push(row)
    return row
  }

  add("empty", () => {}, {})
  add(
    "product",
    (t, s) => {
      catalog(t, s)
    },
    { hasProductItems: true, hasActiveSellableItems: true },
  )
  add(
    "service",
    (t, s) => {
      catalog(t, s, "SERVICE")
    },
    { hasServiceItems: true, hasActiveSellableItems: true },
  )
  add(
    "both-kinds",
    (t, s) => {
      catalog(t, s)
      catalog(t, s, "SERVICE")
    },
    {
      hasProductItems: true,
      hasServiceItems: true,
      hasActiveSellableItems: true,
    },
  )
  add(
    "system-item",
    (t, s) => {
      catalog(t, s).item.systemRole = "HIDDEN"
    },
    {},
  )
  add(
    "foreign-catalog",
    (t, s) => {
      catalog(t, s).item.tenantId = `foreign-${s.tenantId}`
    },
    {},
  )
  add(
    "other-store-catalog",
    (t, s) => {
      catalog(t, s).availability.storeId = `other-${s.storeId}`
    },
    {},
  )
  add(
    "no-offering",
    (t, s) => {
      catalog(t, s)
      t.SellableOffering.length = 0
    },
    {},
  )
  add(
    "draft-item",
    (t, s) => {
      catalog(t, s).item.status = "DRAFT"
    },
    { hasProductItems: true },
  )
  add(
    "archived-item",
    (t, s) => {
      catalog(t, s).item.status = "ARCHIVED"
    },
    { hasProductItems: true },
  )
  add(
    "draft-offering",
    (t, s) => {
      catalog(t, s).offering.status = "DRAFT"
    },
    { hasProductItems: true },
  )
  add(
    "variable-price",
    (t, s) => {
      catalog(t, s).offering.pricingPolicy = "VARIABLE"
    },
    { hasProductItems: true },
  )
  add(
    "null-price",
    (t, s) => {
      catalog(t, s).offering.fixedPriceMinor = null
    },
    { hasProductItems: true },
  )
  add(
    "zero-price",
    (t, s) => {
      catalog(t, s).offering.fixedPriceMinor = 0
    },
    { hasProductItems: true, hasActiveSellableItems: true },
  )
  add(
    "draft-variant",
    (t, s) => {
      catalog(t, s).variant.status = "DRAFT"
    },
    { hasProductItems: true },
  )
  add(
    "missing-variant",
    (t, s) => {
      catalog(t, s)
      t.SellableVariant.length = 0
    },
    { hasProductItems: true },
  )
  add(
    "unavailable",
    (t, s) => {
      catalog(t, s).availability.isAvailable = false
    },
    { hasProductItems: true },
  )
  add(
    "directory-customer",
    (t, s) => {
      t.Customer.push({ tenantId: s.tenantId })
    },
    { hasCustomers: true },
  )
  add(
    "foreign-customer",
    (t, s) => {
      t.Customer.push({ tenantId: `foreign-${s.tenantId}` })
    },
    {},
  )
  add(
    "anonymous-order",
    (t, s) => {
      order(t, s)
    },
    { hasOrders: true },
  )
  for (const field of [
    "customerEmail",
    "customerName",
    "customerPhone",
  ] as const) {
    add(
      `identified-${field}`,
      (t, s) => {
        order(t, s)[field] = "inert"
      },
      { hasOrders: true, hasCustomers: true },
    )
    add(
      `empty-${field}`,
      (t, s) => {
        order(t, s)[field] = ""
      },
      { hasOrders: true, hasCustomers: true },
    )
  }
  add(
    "foreign-order",
    (t, s) => {
      order(t, { ...s, tenantId: `foreign-${s.tenantId}` }).customerName =
        "inert"
    },
    {},
  )
  add(
    "other-store-order",
    (t, s) => {
      order(t, { ...s, storeId: `other-${s.storeId}` }).customerName = "inert"
    },
    {},
  )
  for (const table of ["ServiceJob", "StockOperation"] as const) {
    const expected =
      table === "ServiceJob"
        ? { hasServiceJobs: true }
        : { hasInventoryActivity: true }
    add(
      table,
      (t, s) => {
        t[table].push(s)
      },
      expected,
    )
    add(
      `foreign-${table}`,
      (t, s) => {
        t[table].push({ ...s, tenantId: `foreign-${s.tenantId}` })
      },
      {},
    )
    add(
      `other-store-${table}`,
      (t, s) => {
        t[table].push({ ...s, storeId: `other-${s.storeId}` })
      },
      {},
    )
  }
  for (const role of [
    "ADMIN",
    "MANAGER",
    "CASHIER",
    "OPERATOR",
    "OWNER",
    "MEMBER",
  ]) {
    add(
      `staff-${role}`,
      (t, s) => {
        t.Membership.push({ tenantId: s.tenantId, role, status: "ACTIVE" })
      },
      { hasStaff: role !== "OWNER" && role !== "MEMBER" },
    )
  }
  add(
    "removed-staff",
    (t, s) => {
      t.Membership.push({
        tenantId: s.tenantId,
        role: "MANAGER",
        status: "REMOVED",
      })
    },
    { hasStaff: true },
  )
  add(
    "foreign-staff",
    (t, s) => {
      t.Membership.push({
        tenantId: `foreign-${s.tenantId}`,
        role: "MANAGER",
        status: "ACTIVE",
      })
    },
    {},
  )
  add(
    "prescription",
    (t, s) => {
      t.PrescriptionStoreSettings.push({ ...s, status: "ACTIVE" })
    },
    { hasPrescriptionCommerce: true },
  )
  add(
    "draft-prescription",
    (t, s) => {
      t.PrescriptionStoreSettings.push({ ...s, status: "DRAFT" })
    },
    {},
  )
  add(
    "foreign-prescription",
    (t, s) => {
      t.PrescriptionStoreSettings.push({
        ...s,
        tenantId: `foreign-${s.tenantId}`,
        status: "ACTIVE",
      })
    },
    {},
  )
  add(
    "other-store-prescription",
    (t, s) => {
      t.PrescriptionStoreSettings.push({
        ...s,
        storeId: `other-${s.storeId}`,
        status: "ACTIVE",
      })
    },
    {},
  )
  return cases
}
