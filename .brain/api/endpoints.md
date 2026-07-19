# API Endpoints

Typed tRPC routers are the primary application contract.

## Catalog

- Read: `catalog.listItems`, `catalog.getItem`,
  `catalog.listUnitDefinitions`, `catalog.listUnitConfigurations`.
- Setup/manage: `catalog.createSimpleItem`, `catalog.createItem`,
  `catalog.createUnitDefinition`, `catalog.createUnitConfigurationDraft`,
  `catalog.updateUnitConfigurationDraft`,
  `catalog.publishUnitConfiguration`, `catalog.setOfferingAvailability`,
  `catalog.archiveVariant`, `catalog.archiveOffering`.

## Inventory

- Read/report: `inventory.balanceReport`, `operationHistory`,
  `operationAudit`, `auditExport`, `reconciliationReport`,
  `offeringAvailability`, `transfers`.
- Operate: `postBalanceOperation`, `reserveOffering`, `commitReservation`,
  `releaseReservation`, `createStockCount`, `finalizeStockCount`,
  `transformPackagedStock`, `moveCustody`, `dispatchTransfer`,
  `transitionTransfer`, `createCloseout`, `finalizeCloseout`,
  `correctOperation`.

## Commercial Orders

- `orders.create`, `orders.get`, `orders.list`,
  `orders.fulfillProductLine`, `orders.returnProductLine`.

## Offline

- `offline.registerDevice`, `offline.replay`, `offline.conflicts`,
  `offline.review`.

## Service Operations

- Intake/work: `services.createIntakeDraft`, `confirmIntake`,
  `createAndConfirmIntake`, `queue`, `getJob`, `assignees`, `assignJob`,
  `authorizeLine`, `transitionLine`, `rescheduleJob`, `splitLine`,
  `createRework`, `addNote`, `recordException`.
- Evidence: `services.captureEvidence`, `updateEvidenceUpload`,
  `publishEvidence`, `revokeEvidence`.
- Customer access: `serviceAccess.createRequestForm`, `requestForms`,
  `requestForm` (public), `submitRequest` (public), `requests`,
  `updateRequest`, `issueQuote`, `quote` (public), `acceptQuote` (public),
  `createTracking`, `revokeTracking`, `tracking` (public).
- Communications/reporting: `serviceCommunications.createIntent`,
  `recordManualShare`, `recordDeliveryAttempt`,
  `serviceReporting.summary`, `serviceReporting.auditExport`.

## Staff And Billing

The retained `retailOps` router contains only staff membership/onboarding and
subscription administration. Catalog, inventory, orders, offline and Service
operations do not use that compatibility namespace.

## Public Host Ownership

Public Service Request, Quote and Tracking routes are rendered by the
storefront. Registration/login and all authenticated dashboard routes remain on
the shared application host. A business subdomain never routes to an
authenticated dashboard.
