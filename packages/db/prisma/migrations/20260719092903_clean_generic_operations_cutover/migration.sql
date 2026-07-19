/*
  Warnings:

  - The values [SENT,FAILED,SKIPPED] on the enum `ServiceNotificationIntentStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [PENDING,CONFIRMED,REJECTED,CANCELLED] on the enum `ServiceRequestStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `assignedUserId` on the `ServiceJob` table. All the data in the column will be lost.
  - You are about to drop the column `dueAt` on the `ServiceJob` table. All the data in the column will be lost.
  - You are about to drop the column `legacyId` on the `ServiceJob` table. All the data in the column will be lost.
  - You are about to drop the column `metadata` on the `ServiceJob` table. All the data in the column will be lost.
  - You are about to drop the column `orderId` on the `ServiceJob` table. All the data in the column will be lost.
  - You are about to drop the column `retailOpsCustomerId` on the `ServiceJob` table. All the data in the column will be lost.
  - You are about to drop the column `source` on the `ServiceJob` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `ServiceJob` table. All the data in the column will be lost.
  - You are about to drop the column `trackingToken` on the `ServiceJob` table. All the data in the column will be lost.
  - You are about to drop the column `cancellationNote` on the `ServiceJobLine` table. All the data in the column will be lost.
  - You are about to drop the column `cancelledByUserId` on the `ServiceJobLine` table. All the data in the column will be lost.
  - You are about to drop the column `metadata` on the `ServiceJobLine` table. All the data in the column will be lost.
  - You are about to drop the column `nameSnapshot` on the `ServiceJobLine` table. All the data in the column will be lost.
  - You are about to drop the column `orderItemId` on the `ServiceJobLine` table. All the data in the column will be lost.
  - You are about to drop the column `productId` on the `ServiceJobLine` table. All the data in the column will be lost.
  - You are about to drop the column `productVariantId` on the `ServiceJobLine` table. All the data in the column will be lost.
  - You are about to drop the column `quantity` on the `ServiceJobLine` table. All the data in the column will be lost.
  - You are about to drop the column `totalPriceMinor` on the `ServiceJobLine` table. All the data in the column will be lost.
  - You are about to drop the column `unitPriceMinor` on the `ServiceJobLine` table. All the data in the column will be lost.
  - You are about to drop the column `variantNameSnapshot` on the `ServiceJobLine` table. All the data in the column will be lost.
  - You are about to drop the column `channel` on the `ServiceNotificationIntent` table. All the data in the column will be lost.
  - You are about to drop the column `dedupeKey` on the `ServiceNotificationIntent` table. All the data in the column will be lost.
  - You are about to drop the column `failureReason` on the `ServiceNotificationIntent` table. All the data in the column will be lost.
  - You are about to drop the column `legacyId` on the `ServiceNotificationIntent` table. All the data in the column will be lost.
  - You are about to drop the column `manualCopy` on the `ServiceNotificationIntent` table. All the data in the column will be lost.
  - You are about to drop the column `metadata` on the `ServiceNotificationIntent` table. All the data in the column will be lost.
  - You are about to drop the column `providerId` on the `ServiceNotificationIntent` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `ServiceNotificationIntent` table. All the data in the column will be lost.
  - You are about to drop the column `convertedOrderId` on the `ServiceRequest` table. All the data in the column will be lost.
  - You are about to drop the column `currencyCode` on the `ServiceRequest` table. All the data in the column will be lost.
  - You are about to drop the column `legacyId` on the `ServiceRequest` table. All the data in the column will be lost.
  - You are about to drop the column `metadata` on the `ServiceRequest` table. All the data in the column will be lost.
  - You are about to drop the column `notes` on the `ServiceRequest` table. All the data in the column will be lost.
  - You are about to drop the column `requestLinkId` on the `ServiceRequest` table. All the data in the column will be lost.
  - You are about to drop the column `retailOpsCustomerId` on the `ServiceRequest` table. All the data in the column will be lost.
  - You are about to drop the column `totalMinor` on the `ServiceRequest` table. All the data in the column will be lost.
  - You are about to drop the column `trackingToken` on the `ServiceRequest` table. All the data in the column will be lost.
  - You are about to drop the column `metadata` on the `ServiceRequestLine` table. All the data in the column will be lost.
  - You are about to drop the column `nameSnapshot` on the `ServiceRequestLine` table. All the data in the column will be lost.
  - You are about to drop the column `productId` on the `ServiceRequestLine` table. All the data in the column will be lost.
  - You are about to drop the column `productVariantId` on the `ServiceRequestLine` table. All the data in the column will be lost.
  - You are about to drop the column `quantity` on the `ServiceRequestLine` table. All the data in the column will be lost.
  - You are about to drop the column `totalPriceMinor` on the `ServiceRequestLine` table. All the data in the column will be lost.
  - You are about to drop the column `unitPriceMinor` on the `ServiceRequestLine` table. All the data in the column will be lost.
  - You are about to drop the column `variantNameSnapshot` on the `ServiceRequestLine` table. All the data in the column will be lost.
  - You are about to drop the `BarcodeEvent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Cart` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CartItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CashierSession` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DeliveryAssignment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DeliveryBid` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DeliveryRequest` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DispatchProviderProfile` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `InventoryItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `InventoryMovement` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Order` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `OrderItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `OrderPaymentEvent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Product` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProductShareLink` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProductShareLinkAnalyticsDaily` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProductShareLinkEvent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProductShareLinkNotification` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProductShareLinkOrderRequest` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProductShareLinkReservation` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProductShareLinkView` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProductUnitPriceHistory` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProductUnitTemplate` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProductUnitTemplateUnit` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProductVariant` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Receipt` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RetailOpsCloseout` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RetailOpsCloseoutReview` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RetailOpsCustomer` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RetailOpsCustomerEvent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RetailOpsCustomerIdentity` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RetailOpsPaymentDeclaration` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RetailOpsStockDeclaration` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RetailOpsSyncEvent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RetailOpsSyncRun` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ServiceItemProfile` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ServiceJobEvent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ServiceJobEvidence` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ServiceRequestLink` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StaffStockWallet` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StockDelivery` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StockDeliveryLine` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TrackingEvent` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[tenantId,clientJobId]` on the table `ServiceJob` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,businessEventKey,audienceKey,templatePurpose]` on the table `ServiceNotificationIntent` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[currentQuoteId]` on the table `ServiceRequest` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,clientRequestId]` on the table `ServiceRequest` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `clientJobId` to the `ServiceJob` table without a default value. This is not possible if the table is not empty.
  - Added the required column `commercialOrderId` to the `ServiceJob` table without a default value. This is not possible if the table is not empty.
  - Added the required column `createdByUserId` to the `ServiceJob` table without a default value. This is not possible if the table is not empty.
  - Added the required column `allocatedQuantity` to the `ServiceJobLine` table without a default value. This is not possible if the table is not empty.
  - Added the required column `allocationSnapshot` to the `ServiceJobLine` table without a default value. This is not possible if the table is not empty.
  - Added the required column `authorizationPolicy` to the `ServiceJobLine` table without a default value. This is not possible if the table is not empty.
  - Added the required column `authorizationStatus` to the `ServiceJobLine` table without a default value. This is not possible if the table is not empty.
  - Added the required column `commercialOrderLineId` to the `ServiceJobLine` table without a default value. This is not possible if the table is not empty.
  - Added the required column `audienceKey` to the `ServiceNotificationIntent` table without a default value. This is not possible if the table is not empty.
  - Added the required column `businessEventKey` to the `ServiceNotificationIntent` table without a default value. This is not possible if the table is not empty.
  - Added the required column `createdByUserId` to the `ServiceNotificationIntent` table without a default value. This is not possible if the table is not empty.
  - Added the required column `renderedMessage` to the `ServiceNotificationIntent` table without a default value. This is not possible if the table is not empty.
  - Added the required column `templatePurpose` to the `ServiceNotificationIntent` table without a default value. This is not possible if the table is not empty.
  - Added the required column `clientRequestId` to the `ServiceRequest` table without a default value. This is not possible if the table is not empty.
  - Added the required column `payloadHash` to the `ServiceRequest` table without a default value. This is not possible if the table is not empty.
  - Added the required column `requestFormId` to the `ServiceRequest` table without a default value. This is not possible if the table is not empty.
  - Added the required column `offeringId` to the `ServiceRequestLine` table without a default value. This is not possible if the table is not empty.
  - Added the required column `offeringName` to the `ServiceRequestLine` table without a default value. This is not possible if the table is not empty.
  - Added the required column `optionSelections` to the `ServiceRequestLine` table without a default value. This is not possible if the table is not empty.
  - Added the required column `requestedQuantity` to the `ServiceRequestLine` table without a default value. This is not possible if the table is not empty.
  - Added the required column `variantName` to the `ServiceRequestLine` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ServiceWorkPolicy" AS ENUM ('CHARGE_ONLY', 'TRACKED');

-- CreateEnum
CREATE TYPE "WorkAuthorizationPolicy" AS ENUM ('ON_ORDER_CONFIRMATION', 'AFTER_REQUIRED_PAYMENT', 'MANUAL_RELEASE');

-- CreateEnum
CREATE TYPE "WorkAuthorizationStatus" AS ENUM ('PENDING_PAYMENT', 'PENDING_RELEASE', 'AUTHORIZED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ServiceIntakeStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ServicePriority" AS ENUM ('NORMAL', 'URGENT');

-- CreateEnum
CREATE TYPE "ServiceJobLineStatus" AS ENUM ('QUEUED', 'IN_PROGRESS', 'BLOCKED', 'READY_FOR_HANDOFF', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ServiceWorkEventType" AS ENUM ('CREATED', 'AUTHORIZED', 'AUTHORIZATION_REVOKED', 'STATUS_CHANGED', 'SPLIT', 'ASSIGNED', 'REASSIGNED', 'DUE_COMMITMENT_CREATED', 'DUE_COMMITMENT_REVISED', 'NOTE_ADDED', 'EVIDENCE_CAPTURED', 'EVIDENCE_PUBLISHED', 'EVIDENCE_REVOKED', 'PICKUP', 'DELIVERY', 'REMOTE_HANDOFF', 'DELAY', 'FAILED_ATTEMPT', 'QUALITY_EXCEPTION', 'CUSTOMER_REJECTION', 'REWORK', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ServiceExceptionType" AS ENUM ('DELAY', 'QUALITY', 'FAILED_ATTEMPT', 'CUSTOMER_REJECTION', 'OTHER');

-- CreateEnum
CREATE TYPE "ServiceExceptionOutcome" AS ENUM ('OPEN', 'RESOLVED', 'REWORK_REQUIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ServiceEvidencePurpose" AS ENUM ('INTAKE_CONDITION', 'PROGRESS', 'COMPLETION', 'EXCEPTION', 'APPROVAL', 'HANDOFF', 'OTHER');

-- CreateEnum
CREATE TYPE "ServiceEvidenceMediaType" AS ENUM ('PHOTO', 'VIDEO', 'FILE');

-- CreateEnum
CREATE TYPE "ServiceEvidenceVisibility" AS ENUM ('PRIVATE', 'PUBLISHED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ServiceEvidenceUploadStatus" AS ENUM ('LOCAL', 'QUEUED', 'UPLOADING', 'AVAILABLE', 'FAILED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ServiceEvidenceAuditAction" AS ENUM ('CAPTURED', 'UPLOAD_QUEUED', 'UPLOAD_STARTED', 'UPLOAD_SUCCEEDED', 'UPLOAD_FAILED', 'ACCESSED', 'PUBLISHED', 'PUBLICATION_REVOKED');

-- CreateEnum
CREATE TYPE "ServiceRequestFormStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DISABLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ServiceQuoteStatus" AS ENUM ('DRAFT', 'ISSUED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'SUPERSEDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "CustomerTrackingStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ServiceDeliveryAttemptStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OfflineCommandType" AS ENUM ('PRODUCT_SETUP', 'STOCK_RECEIPT', 'STOCK_COUNT', 'COMMERCIAL_ORDER', 'CUSTODY_MOVE', 'INVENTORY_CLOSEOUT', 'SERVICE_INTAKE', 'SERVICE_TRANSITION', 'SERVICE_NOTE', 'SERVICE_SELF_ASSIGNMENT', 'SERVICE_EVIDENCE_CAPTURE');

-- CreateEnum
CREATE TYPE "OfflineCommandStatus" AS ENUM ('PENDING', 'APPLIED', 'REVIEW_REQUIRED', 'BLOCKED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "OfflineConflictCode" AS ENUM ('STALE_CONFIGURATION', 'OFFERING_OR_PRICE_CHANGED', 'BALANCE_REVISION_CHANGED', 'RESERVATION_CHANGED', 'PERMISSION_CHANGED', 'UNSUPPORTED_CLIENT', 'IDEMPOTENCY_MISMATCH', 'DEPENDENCY_BLOCKED', 'INVALID_COMMAND', 'SERVICE_TRANSITION_CHANGED', 'SERVICE_ASSIGNMENT_CHANGED', 'SERVICE_PROMISE_CHANGED', 'SERVICE_EVIDENCE_CHANGED');

-- CreateEnum
CREATE TYPE "OfflineReviewDecision" AS ENUM ('RETRY', 'DISCARD');

-- AlterEnum
BEGIN;
CREATE TYPE "ServiceNotificationIntentStatus_new" AS ENUM ('PENDING', 'READY', 'COMPLETED', 'CANCELLED');
ALTER TABLE "public"."ServiceNotificationIntent" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ServiceNotificationIntent" ALTER COLUMN "status" TYPE "ServiceNotificationIntentStatus_new" USING ("status"::text::"ServiceNotificationIntentStatus_new");
ALTER TYPE "ServiceNotificationIntentStatus" RENAME TO "ServiceNotificationIntentStatus_old";
ALTER TYPE "ServiceNotificationIntentStatus_new" RENAME TO "ServiceNotificationIntentStatus";
DROP TYPE "public"."ServiceNotificationIntentStatus_old";
ALTER TABLE "ServiceNotificationIntent" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "ServiceRequestStatus_new" AS ENUM ('SUBMITTED', 'NEEDS_INFORMATION', 'QUOTED', 'DECLINED', 'WITHDRAWN', 'CONVERTED');
ALTER TABLE "public"."ServiceRequest" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ServiceRequest" ALTER COLUMN "status" TYPE "ServiceRequestStatus_new" USING ("status"::text::"ServiceRequestStatus_new");
ALTER TYPE "ServiceRequestStatus" RENAME TO "ServiceRequestStatus_old";
ALTER TYPE "ServiceRequestStatus_new" RENAME TO "ServiceRequestStatus";
DROP TYPE "public"."ServiceRequestStatus_old";
ALTER TABLE "ServiceRequest" ALTER COLUMN "status" SET DEFAULT 'SUBMITTED';
COMMIT;

-- DropForeignKey
ALTER TABLE "BarcodeEvent" DROP CONSTRAINT "BarcodeEvent_cashierSessionId_fkey";

-- DropForeignKey
ALTER TABLE "BarcodeEvent" DROP CONSTRAINT "BarcodeEvent_userId_fkey";

-- DropForeignKey
ALTER TABLE "Cart" DROP CONSTRAINT "Cart_storeId_fkey";

-- DropForeignKey
ALTER TABLE "CartItem" DROP CONSTRAINT "CartItem_cartId_fkey";

-- DropForeignKey
ALTER TABLE "CartItem" DROP CONSTRAINT "CartItem_productVariantId_fkey";

-- DropForeignKey
ALTER TABLE "CashierSession" DROP CONSTRAINT "CashierSession_storeId_fkey";

-- DropForeignKey
ALTER TABLE "CashierSession" DROP CONSTRAINT "CashierSession_userId_fkey";

-- DropForeignKey
ALTER TABLE "DeliveryAssignment" DROP CONSTRAINT "DeliveryAssignment_dispatchProviderProfileId_fkey";

-- DropForeignKey
ALTER TABLE "DeliveryAssignment" DROP CONSTRAINT "DeliveryAssignment_requestId_fkey";

-- DropForeignKey
ALTER TABLE "DeliveryBid" DROP CONSTRAINT "DeliveryBid_dispatchProviderProfileId_fkey";

-- DropForeignKey
ALTER TABLE "DeliveryBid" DROP CONSTRAINT "DeliveryBid_dispatchTenantId_fkey";

-- DropForeignKey
ALTER TABLE "DeliveryBid" DROP CONSTRAINT "DeliveryBid_requestId_fkey";

-- DropForeignKey
ALTER TABLE "DeliveryRequest" DROP CONSTRAINT "DeliveryRequest_orderId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryItem" DROP CONSTRAINT "InventoryItem_productVariantId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryItem" DROP CONSTRAINT "InventoryItem_storeId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_cashierSessionId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_inventoryItemId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_orderId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_orderItemId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_productId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_productVariantId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_relatedProductVariantId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_staffStockWalletId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_stockDeliveryId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_stockDeliveryLineId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_storeId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_retailOpsCustomerId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_storeId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_orderId_fkey";

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_productId_fkey";

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_productVariantId_fkey";

-- DropForeignKey
ALTER TABLE "OrderPaymentEvent" DROP CONSTRAINT "OrderPaymentEvent_orderId_fkey";

-- DropForeignKey
ALTER TABLE "OrderPaymentEvent" DROP CONSTRAINT "OrderPaymentEvent_storeId_fkey";

-- DropForeignKey
ALTER TABLE "OrderPaymentEvent" DROP CONSTRAINT "OrderPaymentEvent_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_storeId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_unitTemplateId_fkey";

-- DropForeignKey
ALTER TABLE "ProductShareLink" DROP CONSTRAINT "ProductShareLink_productId_fkey";

-- DropForeignKey
ALTER TABLE "ProductShareLink" DROP CONSTRAINT "ProductShareLink_storeId_fkey";

-- DropForeignKey
ALTER TABLE "ProductShareLink" DROP CONSTRAINT "ProductShareLink_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ProductShareLinkAnalyticsDaily" DROP CONSTRAINT "ProductShareLinkAnalyticsDaily_productId_fkey";

-- DropForeignKey
ALTER TABLE "ProductShareLinkAnalyticsDaily" DROP CONSTRAINT "ProductShareLinkAnalyticsDaily_shareLinkId_fkey";

-- DropForeignKey
ALTER TABLE "ProductShareLinkAnalyticsDaily" DROP CONSTRAINT "ProductShareLinkAnalyticsDaily_storeId_fkey";

-- DropForeignKey
ALTER TABLE "ProductShareLinkAnalyticsDaily" DROP CONSTRAINT "ProductShareLinkAnalyticsDaily_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ProductShareLinkEvent" DROP CONSTRAINT "ProductShareLinkEvent_shareLinkId_fkey";

-- DropForeignKey
ALTER TABLE "ProductShareLinkEvent" DROP CONSTRAINT "ProductShareLinkEvent_storeId_fkey";

-- DropForeignKey
ALTER TABLE "ProductShareLinkEvent" DROP CONSTRAINT "ProductShareLinkEvent_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ProductShareLinkNotification" DROP CONSTRAINT "ProductShareLinkNotification_orderRequestId_fkey";

-- DropForeignKey
ALTER TABLE "ProductShareLinkNotification" DROP CONSTRAINT "ProductShareLinkNotification_shareLinkId_fkey";

-- DropForeignKey
ALTER TABLE "ProductShareLinkNotification" DROP CONSTRAINT "ProductShareLinkNotification_storeId_fkey";

-- DropForeignKey
ALTER TABLE "ProductShareLinkNotification" DROP CONSTRAINT "ProductShareLinkNotification_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ProductShareLinkOrderRequest" DROP CONSTRAINT "ProductShareLinkOrderRequest_orderId_fkey";

-- DropForeignKey
ALTER TABLE "ProductShareLinkOrderRequest" DROP CONSTRAINT "ProductShareLinkOrderRequest_productId_fkey";

-- DropForeignKey
ALTER TABLE "ProductShareLinkOrderRequest" DROP CONSTRAINT "ProductShareLinkOrderRequest_shareLinkId_fkey";

-- DropForeignKey
ALTER TABLE "ProductShareLinkOrderRequest" DROP CONSTRAINT "ProductShareLinkOrderRequest_storeId_fkey";

-- DropForeignKey
ALTER TABLE "ProductShareLinkOrderRequest" DROP CONSTRAINT "ProductShareLinkOrderRequest_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ProductShareLinkReservation" DROP CONSTRAINT "ProductShareLinkReservation_orderId_fkey";

-- DropForeignKey
ALTER TABLE "ProductShareLinkReservation" DROP CONSTRAINT "ProductShareLinkReservation_orderItemId_fkey";

-- DropForeignKey
ALTER TABLE "ProductShareLinkReservation" DROP CONSTRAINT "ProductShareLinkReservation_orderRequestId_fkey";

-- DropForeignKey
ALTER TABLE "ProductShareLinkReservation" DROP CONSTRAINT "ProductShareLinkReservation_productId_fkey";

-- DropForeignKey
ALTER TABLE "ProductShareLinkReservation" DROP CONSTRAINT "ProductShareLinkReservation_productVariantId_fkey";

-- DropForeignKey
ALTER TABLE "ProductShareLinkReservation" DROP CONSTRAINT "ProductShareLinkReservation_shareLinkId_fkey";

-- DropForeignKey
ALTER TABLE "ProductShareLinkReservation" DROP CONSTRAINT "ProductShareLinkReservation_storeId_fkey";

-- DropForeignKey
ALTER TABLE "ProductShareLinkReservation" DROP CONSTRAINT "ProductShareLinkReservation_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ProductShareLinkView" DROP CONSTRAINT "ProductShareLinkView_productId_fkey";

-- DropForeignKey
ALTER TABLE "ProductShareLinkView" DROP CONSTRAINT "ProductShareLinkView_shareLinkId_fkey";

-- DropForeignKey
ALTER TABLE "ProductShareLinkView" DROP CONSTRAINT "ProductShareLinkView_storeId_fkey";

-- DropForeignKey
ALTER TABLE "ProductShareLinkView" DROP CONSTRAINT "ProductShareLinkView_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ProductUnitPriceHistory" DROP CONSTRAINT "ProductUnitPriceHistory_productId_fkey";

-- DropForeignKey
ALTER TABLE "ProductUnitPriceHistory" DROP CONSTRAINT "ProductUnitPriceHistory_productVariantId_fkey";

-- DropForeignKey
ALTER TABLE "ProductUnitPriceHistory" DROP CONSTRAINT "ProductUnitPriceHistory_storeId_fkey";

-- DropForeignKey
ALTER TABLE "ProductUnitPriceHistory" DROP CONSTRAINT "ProductUnitPriceHistory_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ProductUnitTemplate" DROP CONSTRAINT "ProductUnitTemplate_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ProductUnitTemplateUnit" DROP CONSTRAINT "ProductUnitTemplateUnit_templateId_fkey";

-- DropForeignKey
ALTER TABLE "ProductVariant" DROP CONSTRAINT "ProductVariant_productId_fkey";

-- DropForeignKey
ALTER TABLE "ProductVariant" DROP CONSTRAINT "ProductVariant_unitTemplateId_fkey";

-- DropForeignKey
ALTER TABLE "ProductVariant" DROP CONSTRAINT "ProductVariant_unitTemplateUnitId_fkey";

-- DropForeignKey
ALTER TABLE "Receipt" DROP CONSTRAINT "Receipt_cashierSessionId_fkey";

-- DropForeignKey
ALTER TABLE "Receipt" DROP CONSTRAINT "Receipt_issuedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "Receipt" DROP CONSTRAINT "Receipt_orderId_fkey";

-- DropForeignKey
ALTER TABLE "Receipt" DROP CONSTRAINT "Receipt_storeId_fkey";

-- DropForeignKey
ALTER TABLE "RetailOpsCloseout" DROP CONSTRAINT "RetailOpsCloseout_cashierSessionId_fkey";

-- DropForeignKey
ALTER TABLE "RetailOpsCloseout" DROP CONSTRAINT "RetailOpsCloseout_storeId_fkey";

-- DropForeignKey
ALTER TABLE "RetailOpsCloseout" DROP CONSTRAINT "RetailOpsCloseout_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "RetailOpsCloseoutReview" DROP CONSTRAINT "RetailOpsCloseoutReview_cashierSessionId_fkey";

-- DropForeignKey
ALTER TABLE "RetailOpsCloseoutReview" DROP CONSTRAINT "RetailOpsCloseoutReview_closeoutId_fkey";

-- DropForeignKey
ALTER TABLE "RetailOpsCloseoutReview" DROP CONSTRAINT "RetailOpsCloseoutReview_storeId_fkey";

-- DropForeignKey
ALTER TABLE "RetailOpsCloseoutReview" DROP CONSTRAINT "RetailOpsCloseoutReview_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "RetailOpsCustomer" DROP CONSTRAINT "RetailOpsCustomer_mergedIntoCustomerId_fkey";

-- DropForeignKey
ALTER TABLE "RetailOpsCustomer" DROP CONSTRAINT "RetailOpsCustomer_storeId_fkey";

-- DropForeignKey
ALTER TABLE "RetailOpsCustomer" DROP CONSTRAINT "RetailOpsCustomer_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "RetailOpsCustomerEvent" DROP CONSTRAINT "RetailOpsCustomerEvent_customerId_fkey";

-- DropForeignKey
ALTER TABLE "RetailOpsCustomerEvent" DROP CONSTRAINT "RetailOpsCustomerEvent_orderId_fkey";

-- DropForeignKey
ALTER TABLE "RetailOpsCustomerEvent" DROP CONSTRAINT "RetailOpsCustomerEvent_storeId_fkey";

-- DropForeignKey
ALTER TABLE "RetailOpsCustomerEvent" DROP CONSTRAINT "RetailOpsCustomerEvent_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "RetailOpsCustomerIdentity" DROP CONSTRAINT "RetailOpsCustomerIdentity_customerId_fkey";

-- DropForeignKey
ALTER TABLE "RetailOpsCustomerIdentity" DROP CONSTRAINT "RetailOpsCustomerIdentity_storeId_fkey";

-- DropForeignKey
ALTER TABLE "RetailOpsCustomerIdentity" DROP CONSTRAINT "RetailOpsCustomerIdentity_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "RetailOpsPaymentDeclaration" DROP CONSTRAINT "RetailOpsPaymentDeclaration_cashierSessionId_fkey";

-- DropForeignKey
ALTER TABLE "RetailOpsPaymentDeclaration" DROP CONSTRAINT "RetailOpsPaymentDeclaration_closeoutId_fkey";

-- DropForeignKey
ALTER TABLE "RetailOpsPaymentDeclaration" DROP CONSTRAINT "RetailOpsPaymentDeclaration_storeId_fkey";

-- DropForeignKey
ALTER TABLE "RetailOpsPaymentDeclaration" DROP CONSTRAINT "RetailOpsPaymentDeclaration_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "RetailOpsStockDeclaration" DROP CONSTRAINT "RetailOpsStockDeclaration_cashierSessionId_fkey";

-- DropForeignKey
ALTER TABLE "RetailOpsStockDeclaration" DROP CONSTRAINT "RetailOpsStockDeclaration_closeoutId_fkey";

-- DropForeignKey
ALTER TABLE "RetailOpsStockDeclaration" DROP CONSTRAINT "RetailOpsStockDeclaration_productId_fkey";

-- DropForeignKey
ALTER TABLE "RetailOpsStockDeclaration" DROP CONSTRAINT "RetailOpsStockDeclaration_productVariantId_fkey";

-- DropForeignKey
ALTER TABLE "RetailOpsStockDeclaration" DROP CONSTRAINT "RetailOpsStockDeclaration_storeId_fkey";

-- DropForeignKey
ALTER TABLE "RetailOpsStockDeclaration" DROP CONSTRAINT "RetailOpsStockDeclaration_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "RetailOpsSyncEvent" DROP CONSTRAINT "RetailOpsSyncEvent_offlineDeviceId_fkey";

-- DropForeignKey
ALTER TABLE "RetailOpsSyncEvent" DROP CONSTRAINT "RetailOpsSyncEvent_storeId_fkey";

-- DropForeignKey
ALTER TABLE "RetailOpsSyncEvent" DROP CONSTRAINT "RetailOpsSyncEvent_syncRunId_fkey";

-- DropForeignKey
ALTER TABLE "RetailOpsSyncEvent" DROP CONSTRAINT "RetailOpsSyncEvent_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "RetailOpsSyncRun" DROP CONSTRAINT "RetailOpsSyncRun_offlineDeviceId_fkey";

-- DropForeignKey
ALTER TABLE "RetailOpsSyncRun" DROP CONSTRAINT "RetailOpsSyncRun_storeId_fkey";

-- DropForeignKey
ALTER TABLE "RetailOpsSyncRun" DROP CONSTRAINT "RetailOpsSyncRun_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceItemProfile" DROP CONSTRAINT "ServiceItemProfile_productId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceJob" DROP CONSTRAINT "ServiceJob_orderId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceJob" DROP CONSTRAINT "ServiceJob_retailOpsCustomerId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceJob" DROP CONSTRAINT "ServiceJob_storeId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceJobEvent" DROP CONSTRAINT "ServiceJobEvent_serviceJobId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceJobEvidence" DROP CONSTRAINT "ServiceJobEvidence_serviceJobId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceJobLine" DROP CONSTRAINT "ServiceJobLine_orderItemId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceJobLine" DROP CONSTRAINT "ServiceJobLine_productId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceJobLine" DROP CONSTRAINT "ServiceJobLine_productVariantId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceNotificationIntent" DROP CONSTRAINT "ServiceNotificationIntent_storeId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceRequest" DROP CONSTRAINT "ServiceRequest_convertedOrderId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceRequest" DROP CONSTRAINT "ServiceRequest_requestLinkId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceRequest" DROP CONSTRAINT "ServiceRequest_retailOpsCustomerId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceRequest" DROP CONSTRAINT "ServiceRequest_storeId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceRequestLine" DROP CONSTRAINT "ServiceRequestLine_productId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceRequestLine" DROP CONSTRAINT "ServiceRequestLine_productVariantId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceRequestLink" DROP CONSTRAINT "ServiceRequestLink_storeId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceRequestLink" DROP CONSTRAINT "ServiceRequestLink_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "StaffStockWallet" DROP CONSTRAINT "StaffStockWallet_productId_fkey";

-- DropForeignKey
ALTER TABLE "StaffStockWallet" DROP CONSTRAINT "StaffStockWallet_productVariantId_fkey";

-- DropForeignKey
ALTER TABLE "StaffStockWallet" DROP CONSTRAINT "StaffStockWallet_staffUserId_fkey";

-- DropForeignKey
ALTER TABLE "StaffStockWallet" DROP CONSTRAINT "StaffStockWallet_storeId_fkey";

-- DropForeignKey
ALTER TABLE "StaffStockWallet" DROP CONSTRAINT "StaffStockWallet_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "StockDelivery" DROP CONSTRAINT "StockDelivery_storeId_fkey";

-- DropForeignKey
ALTER TABLE "StockDeliveryLine" DROP CONSTRAINT "StockDeliveryLine_deliveryId_fkey";

-- DropForeignKey
ALTER TABLE "StockDeliveryLine" DROP CONSTRAINT "StockDeliveryLine_productId_fkey";

-- DropForeignKey
ALTER TABLE "StockDeliveryLine" DROP CONSTRAINT "StockDeliveryLine_productVariantId_fkey";

-- DropForeignKey
ALTER TABLE "TrackingEvent" DROP CONSTRAINT "TrackingEvent_requestId_fkey";

-- DropIndex
DROP INDEX "ServiceJob_assignedUserId_status_idx";

-- DropIndex
DROP INDEX "ServiceJob_orderId_key";

-- DropIndex
DROP INDEX "ServiceJob_retailOpsCustomerId_createdAt_idx";

-- DropIndex
DROP INDEX "ServiceJob_tenantId_storeId_legacyId_key";

-- DropIndex
DROP INDEX "ServiceJob_tenantId_storeId_status_dueAt_idx";

-- DropIndex
DROP INDEX "ServiceJob_trackingToken_key";

-- DropIndex
DROP INDEX "ServiceJobLine_orderItemId_key";

-- DropIndex
DROP INDEX "ServiceJobLine_productId_createdAt_idx";

-- DropIndex
DROP INDEX "ServiceJobLine_productVariantId_idx";

-- DropIndex
DROP INDEX "ServiceJobLine_serviceJobId_cancelledAt_idx";

-- DropIndex
DROP INDEX "ServiceJobLine_serviceJobId_createdAt_idx";

-- DropIndex
DROP INDEX "ServiceNotificationIntent_dedupeKey_key";

-- DropIndex
DROP INDEX "ServiceNotificationIntent_tenantId_storeId_legacyId_key";

-- DropIndex
DROP INDEX "ServiceRequest_convertedOrderId_key";

-- DropIndex
DROP INDEX "ServiceRequest_requestLinkId_createdAt_idx";

-- DropIndex
DROP INDEX "ServiceRequest_retailOpsCustomerId_createdAt_idx";

-- DropIndex
DROP INDEX "ServiceRequest_tenantId_storeId_legacyId_key";

-- DropIndex
DROP INDEX "ServiceRequest_trackingToken_key";

-- DropIndex
DROP INDEX "ServiceRequestLine_productId_idx";

-- DropIndex
DROP INDEX "ServiceRequestLine_productVariantId_idx";

-- DropIndex
DROP INDEX "ServiceRequestLine_requestId_createdAt_idx";

-- AlterTable
ALTER TABLE "ServiceJob" DROP COLUMN "assignedUserId",
DROP COLUMN "dueAt",
DROP COLUMN "legacyId",
DROP COLUMN "metadata",
DROP COLUMN "orderId",
DROP COLUMN "retailOpsCustomerId",
DROP COLUMN "source",
DROP COLUMN "status",
DROP COLUMN "trackingToken",
ADD COLUMN     "clientJobId" TEXT NOT NULL,
ADD COLUMN     "commercialOrderId" TEXT NOT NULL,
ADD COLUMN     "createdByUserId" TEXT NOT NULL,
ADD COLUMN     "currentAssigneeUserId" TEXT,
ADD COLUMN     "intakeId" TEXT,
ADD COLUMN     "priority" "ServicePriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reworkOfJobId" TEXT,
ADD COLUMN     "splitFromJobId" TEXT;

-- AlterTable
ALTER TABLE "ServiceJobLine" DROP COLUMN "cancellationNote",
DROP COLUMN "cancelledByUserId",
DROP COLUMN "metadata",
DROP COLUMN "nameSnapshot",
DROP COLUMN "orderItemId",
DROP COLUMN "productId",
DROP COLUMN "productVariantId",
DROP COLUMN "quantity",
DROP COLUMN "totalPriceMinor",
DROP COLUMN "unitPriceMinor",
DROP COLUMN "variantNameSnapshot",
ADD COLUMN     "allocatedQuantity" DECIMAL(38,6) NOT NULL,
ADD COLUMN     "allocationSnapshot" JSONB NOT NULL,
ADD COLUMN     "authorizationPolicy" "WorkAuthorizationPolicy" NOT NULL,
ADD COLUMN     "authorizationSource" TEXT,
ADD COLUMN     "authorizationStatus" "WorkAuthorizationStatus" NOT NULL,
ADD COLUMN     "authorizedAt" TIMESTAMP(3),
ADD COLUMN     "commercialOrderLineId" TEXT NOT NULL,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reworkOfLineId" TEXT,
ADD COLUMN     "status" "ServiceJobLineStatus" NOT NULL DEFAULT 'QUEUED';

-- AlterTable
ALTER TABLE "ServiceNotificationIntent" DROP COLUMN "channel",
DROP COLUMN "dedupeKey",
DROP COLUMN "failureReason",
DROP COLUMN "legacyId",
DROP COLUMN "manualCopy",
DROP COLUMN "metadata",
DROP COLUMN "providerId",
DROP COLUMN "type",
ADD COLUMN     "audienceKey" TEXT NOT NULL,
ADD COLUMN     "businessEventKey" TEXT NOT NULL,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "createdByUserId" TEXT NOT NULL,
ADD COLUMN     "renderedMessage" TEXT NOT NULL,
ADD COLUMN     "renderedSubject" TEXT,
ADD COLUMN     "templatePurpose" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ServiceOffering" ADD COLUMN     "authorizationPolicy" "WorkAuthorizationPolicy" NOT NULL DEFAULT 'ON_ORDER_CONFIRMATION',
ADD COLUMN     "guidance" TEXT,
ADD COLUMN     "quantityScale" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "workPolicy" "ServiceWorkPolicy" NOT NULL DEFAULT 'CHARGE_ONLY';

-- AlterTable
ALTER TABLE "ServiceRequest" DROP COLUMN "convertedOrderId",
DROP COLUMN "currencyCode",
DROP COLUMN "legacyId",
DROP COLUMN "metadata",
DROP COLUMN "notes",
DROP COLUMN "requestLinkId",
DROP COLUMN "retailOpsCustomerId",
DROP COLUMN "totalMinor",
DROP COLUMN "trackingToken",
ADD COLUMN     "clientRequestId" TEXT NOT NULL,
ADD COLUMN     "currentQuoteId" TEXT,
ADD COLUMN     "details" TEXT,
ADD COLUMN     "payloadHash" TEXT NOT NULL,
ADD COLUMN     "requestFormId" TEXT NOT NULL,
ADD COLUMN     "requestedAt" TIMESTAMP(3),
ADD COLUMN     "staffResponse" TEXT,
ALTER COLUMN "status" SET DEFAULT 'SUBMITTED';

-- AlterTable
ALTER TABLE "ServiceRequestLine" DROP COLUMN "metadata",
DROP COLUMN "nameSnapshot",
DROP COLUMN "productId",
DROP COLUMN "productVariantId",
DROP COLUMN "quantity",
DROP COLUMN "totalPriceMinor",
DROP COLUMN "unitPriceMinor",
DROP COLUMN "variantNameSnapshot",
ADD COLUMN     "details" TEXT,
ADD COLUMN     "offeringId" TEXT NOT NULL,
ADD COLUMN     "offeringName" TEXT NOT NULL,
ADD COLUMN     "optionSelections" JSONB NOT NULL,
ADD COLUMN     "requestedQuantity" DECIMAL(38,6) NOT NULL,
ADD COLUMN     "variantName" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "currencyCodeSnapshot" TEXT,
ADD COLUMN     "totalCostMinorSnapshot" DECIMAL(38,6),
ADD COLUMN     "unitCostMinorSnapshot" INTEGER;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "addressLine1" TEXT,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "countryCode" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "region" TEXT;

-- DropTable
DROP TABLE "BarcodeEvent";

-- DropTable
DROP TABLE "Cart";

-- DropTable
DROP TABLE "CartItem";

-- DropTable
DROP TABLE "CashierSession";

-- DropTable
DROP TABLE "DeliveryAssignment";

-- DropTable
DROP TABLE "DeliveryBid";

-- DropTable
DROP TABLE "DeliveryRequest";

-- DropTable
DROP TABLE "DispatchProviderProfile";

-- DropTable
DROP TABLE "InventoryItem";

-- DropTable
DROP TABLE "InventoryMovement";

-- DropTable
DROP TABLE "Order";

-- DropTable
DROP TABLE "OrderItem";

-- DropTable
DROP TABLE "OrderPaymentEvent";

-- DropTable
DROP TABLE "Product";

-- DropTable
DROP TABLE "ProductShareLink";

-- DropTable
DROP TABLE "ProductShareLinkAnalyticsDaily";

-- DropTable
DROP TABLE "ProductShareLinkEvent";

-- DropTable
DROP TABLE "ProductShareLinkNotification";

-- DropTable
DROP TABLE "ProductShareLinkOrderRequest";

-- DropTable
DROP TABLE "ProductShareLinkReservation";

-- DropTable
DROP TABLE "ProductShareLinkView";

-- DropTable
DROP TABLE "ProductUnitPriceHistory";

-- DropTable
DROP TABLE "ProductUnitTemplate";

-- DropTable
DROP TABLE "ProductUnitTemplateUnit";

-- DropTable
DROP TABLE "ProductVariant";

-- DropTable
DROP TABLE "Receipt";

-- DropTable
DROP TABLE "RetailOpsCloseout";

-- DropTable
DROP TABLE "RetailOpsCloseoutReview";

-- DropTable
DROP TABLE "RetailOpsCustomer";

-- DropTable
DROP TABLE "RetailOpsCustomerEvent";

-- DropTable
DROP TABLE "RetailOpsCustomerIdentity";

-- DropTable
DROP TABLE "RetailOpsPaymentDeclaration";

-- DropTable
DROP TABLE "RetailOpsStockDeclaration";

-- DropTable
DROP TABLE "RetailOpsSyncEvent";

-- DropTable
DROP TABLE "RetailOpsSyncRun";

-- DropTable
DROP TABLE "ServiceItemProfile";

-- DropTable
DROP TABLE "ServiceJobEvent";

-- DropTable
DROP TABLE "ServiceJobEvidence";

-- DropTable
DROP TABLE "ServiceRequestLink";

-- DropTable
DROP TABLE "StaffStockWallet";

-- DropTable
DROP TABLE "StockDelivery";

-- DropTable
DROP TABLE "StockDeliveryLine";

-- DropTable
DROP TABLE "TrackingEvent";

-- DropEnum
DROP TYPE "AssignmentStatus";

-- DropEnum
DROP TYPE "DeliveryBidStatus";

-- DropEnum
DROP TYPE "DeliveryRequestStatus";

-- DropEnum
DROP TYPE "InventoryMovementDirection";

-- DropEnum
DROP TYPE "InventoryMovementSource";

-- DropEnum
DROP TYPE "InventoryMovementType";

-- DropEnum
DROP TYPE "OrderPaymentEventType";

-- DropEnum
DROP TYPE "PosSessionStatus";

-- DropEnum
DROP TYPE "ProductShareLinkEventType";

-- DropEnum
DROP TYPE "ProductShareLinkNotificationChannel";

-- DropEnum
DROP TYPE "ProductShareLinkNotificationRecipientType";

-- DropEnum
DROP TYPE "ProductShareLinkNotificationStatus";

-- DropEnum
DROP TYPE "ProductShareLinkOrderRequestStatus";

-- DropEnum
DROP TYPE "ProductShareLinkReservationStatus";

-- DropEnum
DROP TYPE "ProductShareLinkStatus";

-- DropEnum
DROP TYPE "ProductStatus";

-- DropEnum
DROP TYPE "ProductUnitPriceChangeSource";

-- DropEnum
DROP TYPE "RetailOpsCloseoutReviewResult";

-- DropEnum
DROP TYPE "RetailOpsCloseoutStatus";

-- DropEnum
DROP TYPE "RetailOpsCustomerEventType";

-- DropEnum
DROP TYPE "RetailOpsCustomerIdentityType";

-- DropEnum
DROP TYPE "RetailOpsPaymentDeclarationMethod";

-- DropEnum
DROP TYPE "RetailOpsStockDeclarationSource";

-- DropEnum
DROP TYPE "RetailOpsStockDeclarationType";

-- DropEnum
DROP TYPE "RetailOpsSyncEventStatus";

-- DropEnum
DROP TYPE "RetailOpsSyncRunStatus";

-- DropEnum
DROP TYPE "ServiceFulfillmentMode";

-- DropEnum
DROP TYPE "ServiceJobEventType";

-- DropEnum
DROP TYPE "ServiceJobStatus";

-- DropEnum
DROP TYPE "ServiceNotificationIntentType";

-- DropEnum
DROP TYPE "StockDeliverySource";

-- DropEnum
DROP TYPE "StockDeliveryStatus";

-- CreateTable
CREATE TABLE "ServiceIntake" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "clientIntakeId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "ServiceIntakeStatus" NOT NULL DEFAULT 'DRAFT',
    "commercialOrderId" TEXT,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "customerEmail" TEXT,
    "requestedAt" TIMESTAMP(3),
    "instructions" TEXT,
    "conditionNote" TEXT,
    "priority" "ServicePriority" NOT NULL DEFAULT 'NORMAL',
    "dueCommitmentAt" TIMESTAMP(3),
    "requestedAssigneeId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceIntake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceIntakeLine" (
    "id" TEXT NOT NULL,
    "intakeId" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "quantity" DECIMAL(38,6) NOT NULL,
    "expectedFixedPriceMinor" INTEGER,
    "approvedQuotePriceMinor" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceIntakeLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceWorkEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "serviceJobId" TEXT NOT NULL,
    "serviceJobLineId" TEXT,
    "clientCommandId" TEXT,
    "type" "ServiceWorkEventType" NOT NULL,
    "fromStatus" "ServiceJobLineStatus",
    "toStatus" "ServiceJobLineStatus",
    "actorUserId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "reason" TEXT,
    "payload" JSONB,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceWorkEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceWorkAssignment" (
    "id" TEXT NOT NULL,
    "serviceJobId" TEXT NOT NULL,
    "assignedUserId" TEXT NOT NULL,
    "previousUserId" TEXT,
    "assignedByUserId" TEXT NOT NULL,
    "reason" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceWorkAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceDueCommitment" (
    "id" TEXT NOT NULL,
    "serviceJobId" TEXT NOT NULL,
    "promisedAt" TIMESTAMP(3) NOT NULL,
    "previousPromisedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "reason" TEXT,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceDueCommitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceInternalNote" (
    "id" TEXT NOT NULL,
    "serviceJobId" TEXT NOT NULL,
    "serviceJobLineId" TEXT,
    "clientCommandId" TEXT,
    "body" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceInternalNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceException" (
    "id" TEXT NOT NULL,
    "serviceJobId" TEXT NOT NULL,
    "serviceJobLineId" TEXT,
    "type" "ServiceExceptionType" NOT NULL,
    "outcome" "ServiceExceptionOutcome" NOT NULL DEFAULT 'OPEN',
    "description" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "resolvedByUserId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceEvidence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "serviceJobId" TEXT NOT NULL,
    "serviceJobLineId" TEXT,
    "clientEvidenceId" TEXT NOT NULL,
    "purpose" "ServiceEvidencePurpose" NOT NULL,
    "mediaType" "ServiceEvidenceMediaType" NOT NULL,
    "label" TEXT,
    "assetReference" TEXT,
    "safePublicAssetId" TEXT,
    "uploadStatus" "ServiceEvidenceUploadStatus" NOT NULL DEFAULT 'LOCAL',
    "visibility" "ServiceEvidenceVisibility" NOT NULL DEFAULT 'PRIVATE',
    "uploaderUserId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "safetyMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceEvidenceAuditEvent" (
    "id" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "action" "ServiceEvidenceAuditAction" NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceEvidenceAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRequestForm" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "ServiceRequestFormStatus" NOT NULL DEFAULT 'DRAFT',
    "publicTokenDigest" TEXT NOT NULL,
    "activeFrom" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceRequestForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRequestFormOffering" (
    "id" TEXT NOT NULL,
    "requestFormId" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceRequestFormOffering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceQuote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "requestId" TEXT,
    "clientQuoteId" TEXT NOT NULL,
    "currentVersionId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceQuoteVersion" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "clientVersionId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ServiceQuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "currencyCode" TEXT NOT NULL,
    "subtotalMinor" INTEGER NOT NULL,
    "discountMinor" INTEGER NOT NULL DEFAULT 0,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL,
    "acceptanceTokenDigest" TEXT,
    "expiresAt" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "acceptedOrderId" TEXT,
    "acceptanceClientId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceQuoteVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceQuoteLine" (
    "id" TEXT NOT NULL,
    "quoteVersionId" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "catalogItemName" TEXT NOT NULL,
    "variantName" TEXT NOT NULL,
    "optionSelections" JSONB NOT NULL,
    "offeringName" TEXT NOT NULL,
    "quantity" DECIMAL(38,6) NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceQuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerTrackingAccess" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "serviceJobId" TEXT NOT NULL,
    "tokenDigest" TEXT NOT NULL,
    "status" "CustomerTrackingStatus" NOT NULL DEFAULT 'ACTIVE',
    "customerScopeKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "rotatedFromId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "revokedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "lastAccessedAt" TIMESTAMP(3),
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "rateWindowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rateWindowCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerTrackingAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceManualShare" (
    "id" TEXT NOT NULL,
    "notificationIntentId" TEXT NOT NULL,
    "sharedByUserId" TEXT NOT NULL,
    "channel" "ServiceNotificationChannel" NOT NULL DEFAULT 'MANUAL',
    "sharedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "ServiceManualShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceDeliveryAttempt" (
    "id" TEXT NOT NULL,
    "notificationIntentId" TEXT NOT NULL,
    "channel" "ServiceNotificationChannel" NOT NULL,
    "providerKey" TEXT NOT NULL,
    "providerAttemptId" TEXT,
    "status" "ServiceDeliveryAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineCommand" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "offlineDeviceId" TEXT NOT NULL,
    "clientCommandId" TEXT NOT NULL,
    "type" "OfflineCommandType" NOT NULL,
    "status" "OfflineCommandStatus" NOT NULL DEFAULT 'PENDING',
    "eventVersion" INTEGER NOT NULL DEFAULT 1,
    "payloadHash" TEXT NOT NULL,
    "dependencyClientIds" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "conflictCode" "OfflineConflictCode",
    "conflictMessage" TEXT,
    "attemptedState" JSONB,
    "authoritativeState" JSONB,
    "createdAtClient" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfflineCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineConflictReview" (
    "id" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "decision" "OfflineReviewDecision" NOT NULL,
    "reason" TEXT,
    "dependentClientIds" JSONB NOT NULL,
    "reviewedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfflineConflictReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceIntake_commercialOrderId_key" ON "ServiceIntake"("commercialOrderId");

-- CreateIndex
CREATE INDEX "ServiceIntake_tenantId_storeId_status_createdAt_idx" ON "ServiceIntake"("tenantId", "storeId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceIntake_tenantId_clientIntakeId_key" ON "ServiceIntake"("tenantId", "clientIntakeId");

-- CreateIndex
CREATE INDEX "ServiceIntakeLine_intakeId_idx" ON "ServiceIntakeLine"("intakeId");

-- CreateIndex
CREATE INDEX "ServiceIntakeLine_offeringId_idx" ON "ServiceIntakeLine"("offeringId");

-- CreateIndex
CREATE INDEX "ServiceWorkEvent_serviceJobId_effectiveAt_idx" ON "ServiceWorkEvent"("serviceJobId", "effectiveAt");

-- CreateIndex
CREATE INDEX "ServiceWorkEvent_serviceJobLineId_effectiveAt_idx" ON "ServiceWorkEvent"("serviceJobLineId", "effectiveAt");

-- CreateIndex
CREATE INDEX "ServiceWorkEvent_actorUserId_effectiveAt_idx" ON "ServiceWorkEvent"("actorUserId", "effectiveAt");

-- CreateIndex
CREATE INDEX "ServiceWorkEvent_type_effectiveAt_idx" ON "ServiceWorkEvent"("type", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceWorkEvent_tenantId_clientCommandId_key" ON "ServiceWorkEvent"("tenantId", "clientCommandId");

-- CreateIndex
CREATE INDEX "ServiceWorkAssignment_serviceJobId_assignedAt_idx" ON "ServiceWorkAssignment"("serviceJobId", "assignedAt");

-- CreateIndex
CREATE INDEX "ServiceWorkAssignment_assignedUserId_endedAt_idx" ON "ServiceWorkAssignment"("assignedUserId", "endedAt");

-- CreateIndex
CREATE INDEX "ServiceDueCommitment_serviceJobId_supersededAt_idx" ON "ServiceDueCommitment"("serviceJobId", "supersededAt");

-- CreateIndex
CREATE INDEX "ServiceDueCommitment_promisedAt_supersededAt_idx" ON "ServiceDueCommitment"("promisedAt", "supersededAt");

-- CreateIndex
CREATE INDEX "ServiceInternalNote_serviceJobId_createdAt_idx" ON "ServiceInternalNote"("serviceJobId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceInternalNote_serviceJobLineId_createdAt_idx" ON "ServiceInternalNote"("serviceJobLineId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceInternalNote_serviceJobId_clientCommandId_key" ON "ServiceInternalNote"("serviceJobId", "clientCommandId");

-- CreateIndex
CREATE INDEX "ServiceException_serviceJobId_outcome_occurredAt_idx" ON "ServiceException"("serviceJobId", "outcome", "occurredAt");

-- CreateIndex
CREATE INDEX "ServiceException_serviceJobLineId_occurredAt_idx" ON "ServiceException"("serviceJobLineId", "occurredAt");

-- CreateIndex
CREATE INDEX "ServiceEvidence_serviceJobId_visibility_createdAt_idx" ON "ServiceEvidence"("serviceJobId", "visibility", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceEvidence_serviceJobLineId_createdAt_idx" ON "ServiceEvidence"("serviceJobLineId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceEvidence_uploadStatus_createdAt_idx" ON "ServiceEvidence"("uploadStatus", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceEvidence_tenantId_clientEvidenceId_key" ON "ServiceEvidence"("tenantId", "clientEvidenceId");

-- CreateIndex
CREATE INDEX "ServiceEvidenceAuditEvent_evidenceId_effectiveAt_idx" ON "ServiceEvidenceAuditEvent"("evidenceId", "effectiveAt");

-- CreateIndex
CREATE INDEX "ServiceEvidenceAuditEvent_action_effectiveAt_idx" ON "ServiceEvidenceAuditEvent"("action", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRequestForm_publicTokenDigest_key" ON "ServiceRequestForm"("publicTokenDigest");

-- CreateIndex
CREATE INDEX "ServiceRequestForm_tenantId_storeId_status_idx" ON "ServiceRequestForm"("tenantId", "storeId", "status");

-- CreateIndex
CREATE INDEX "ServiceRequestFormOffering_offeringId_idx" ON "ServiceRequestFormOffering"("offeringId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRequestFormOffering_requestFormId_offeringId_key" ON "ServiceRequestFormOffering"("requestFormId", "offeringId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceQuote_currentVersionId_key" ON "ServiceQuote"("currentVersionId");

-- CreateIndex
CREATE INDEX "ServiceQuote_tenantId_storeId_createdAt_idx" ON "ServiceQuote"("tenantId", "storeId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceQuote_requestId_idx" ON "ServiceQuote"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceQuote_tenantId_clientQuoteId_key" ON "ServiceQuote"("tenantId", "clientQuoteId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceQuoteVersion_acceptanceTokenDigest_key" ON "ServiceQuoteVersion"("acceptanceTokenDigest");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceQuoteVersion_acceptedOrderId_key" ON "ServiceQuoteVersion"("acceptedOrderId");

-- CreateIndex
CREATE INDEX "ServiceQuoteVersion_status_expiresAt_idx" ON "ServiceQuoteVersion"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceQuoteVersion_quoteId_version_key" ON "ServiceQuoteVersion"("quoteId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceQuoteVersion_quoteId_clientVersionId_key" ON "ServiceQuoteVersion"("quoteId", "clientVersionId");

-- CreateIndex
CREATE INDEX "ServiceQuoteLine_quoteVersionId_idx" ON "ServiceQuoteLine"("quoteVersionId");

-- CreateIndex
CREATE INDEX "ServiceQuoteLine_offeringId_idx" ON "ServiceQuoteLine"("offeringId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerTrackingAccess_tokenDigest_key" ON "CustomerTrackingAccess"("tokenDigest");

-- CreateIndex
CREATE INDEX "CustomerTrackingAccess_serviceJobId_status_idx" ON "CustomerTrackingAccess"("serviceJobId", "status");

-- CreateIndex
CREATE INDEX "CustomerTrackingAccess_tenantId_status_expiresAt_idx" ON "CustomerTrackingAccess"("tenantId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "ServiceManualShare_notificationIntentId_sharedAt_idx" ON "ServiceManualShare"("notificationIntentId", "sharedAt");

-- CreateIndex
CREATE INDEX "ServiceDeliveryAttempt_notificationIntentId_attemptedAt_idx" ON "ServiceDeliveryAttempt"("notificationIntentId", "attemptedAt");

-- CreateIndex
CREATE INDEX "ServiceDeliveryAttempt_providerKey_status_attemptedAt_idx" ON "ServiceDeliveryAttempt"("providerKey", "status", "attemptedAt");

-- CreateIndex
CREATE INDEX "OfflineCommand_tenantId_status_createdAtClient_idx" ON "OfflineCommand"("tenantId", "status", "createdAtClient");

-- CreateIndex
CREATE INDEX "OfflineCommand_storeId_status_createdAtClient_idx" ON "OfflineCommand"("storeId", "status", "createdAtClient");

-- CreateIndex
CREATE INDEX "OfflineCommand_offlineDeviceId_createdAtClient_idx" ON "OfflineCommand"("offlineDeviceId", "createdAtClient");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineCommand_tenantId_clientCommandId_key" ON "OfflineCommand"("tenantId", "clientCommandId");

-- CreateIndex
CREATE INDEX "OfflineConflictReview_commandId_createdAt_idx" ON "OfflineConflictReview"("commandId", "createdAt");

-- CreateIndex
CREATE INDEX "OfflineConflictReview_reviewedByUserId_createdAt_idx" ON "OfflineConflictReview"("reviewedByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceJob_tenantId_storeId_priority_createdAt_idx" ON "ServiceJob"("tenantId", "storeId", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceJob_commercialOrderId_idx" ON "ServiceJob"("commercialOrderId");

-- CreateIndex
CREATE INDEX "ServiceJob_currentAssigneeUserId_createdAt_idx" ON "ServiceJob"("currentAssigneeUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceJob_reworkOfJobId_idx" ON "ServiceJob"("reworkOfJobId");

-- CreateIndex
CREATE INDEX "ServiceJob_splitFromJobId_idx" ON "ServiceJob"("splitFromJobId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceJob_tenantId_clientJobId_key" ON "ServiceJob"("tenantId", "clientJobId");

-- CreateIndex
CREATE INDEX "ServiceJobLine_serviceJobId_status_createdAt_idx" ON "ServiceJobLine"("serviceJobId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceJobLine_commercialOrderLineId_createdAt_idx" ON "ServiceJobLine"("commercialOrderLineId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceJobLine_authorizationStatus_status_idx" ON "ServiceJobLine"("authorizationStatus", "status");

-- CreateIndex
CREATE INDEX "ServiceJobLine_reworkOfLineId_idx" ON "ServiceJobLine"("reworkOfLineId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceNotificationIntent_tenantId_businessEventKey_audienc_key" ON "ServiceNotificationIntent"("tenantId", "businessEventKey", "audienceKey", "templatePurpose");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRequest_currentQuoteId_key" ON "ServiceRequest"("currentQuoteId");

-- CreateIndex
CREATE INDEX "ServiceRequest_requestFormId_createdAt_idx" ON "ServiceRequest"("requestFormId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRequest_tenantId_clientRequestId_key" ON "ServiceRequest"("tenantId", "clientRequestId");

-- CreateIndex
CREATE INDEX "ServiceRequestLine_requestId_idx" ON "ServiceRequestLine"("requestId");

-- CreateIndex
CREATE INDEX "ServiceRequestLine_offeringId_idx" ON "ServiceRequestLine"("offeringId");

-- AddForeignKey
ALTER TABLE "ServiceIntake" ADD CONSTRAINT "ServiceIntake_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceIntake" ADD CONSTRAINT "ServiceIntake_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceIntake" ADD CONSTRAINT "ServiceIntake_commercialOrderId_fkey" FOREIGN KEY ("commercialOrderId") REFERENCES "CommercialOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceIntakeLine" ADD CONSTRAINT "ServiceIntakeLine_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "ServiceIntake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceIntakeLine" ADD CONSTRAINT "ServiceIntakeLine_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "SellableOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJob" ADD CONSTRAINT "ServiceJob_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJob" ADD CONSTRAINT "ServiceJob_commercialOrderId_fkey" FOREIGN KEY ("commercialOrderId") REFERENCES "CommercialOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJob" ADD CONSTRAINT "ServiceJob_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "ServiceIntake"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJob" ADD CONSTRAINT "ServiceJob_reworkOfJobId_fkey" FOREIGN KEY ("reworkOfJobId") REFERENCES "ServiceJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJob" ADD CONSTRAINT "ServiceJob_splitFromJobId_fkey" FOREIGN KEY ("splitFromJobId") REFERENCES "ServiceJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJobLine" ADD CONSTRAINT "ServiceJobLine_commercialOrderLineId_fkey" FOREIGN KEY ("commercialOrderLineId") REFERENCES "CommercialOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJobLine" ADD CONSTRAINT "ServiceJobLine_reworkOfLineId_fkey" FOREIGN KEY ("reworkOfLineId") REFERENCES "ServiceJobLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceWorkEvent" ADD CONSTRAINT "ServiceWorkEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceWorkEvent" ADD CONSTRAINT "ServiceWorkEvent_serviceJobId_fkey" FOREIGN KEY ("serviceJobId") REFERENCES "ServiceJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceWorkEvent" ADD CONSTRAINT "ServiceWorkEvent_serviceJobLineId_fkey" FOREIGN KEY ("serviceJobLineId") REFERENCES "ServiceJobLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceWorkAssignment" ADD CONSTRAINT "ServiceWorkAssignment_serviceJobId_fkey" FOREIGN KEY ("serviceJobId") REFERENCES "ServiceJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceDueCommitment" ADD CONSTRAINT "ServiceDueCommitment_serviceJobId_fkey" FOREIGN KEY ("serviceJobId") REFERENCES "ServiceJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceInternalNote" ADD CONSTRAINT "ServiceInternalNote_serviceJobId_fkey" FOREIGN KEY ("serviceJobId") REFERENCES "ServiceJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceInternalNote" ADD CONSTRAINT "ServiceInternalNote_serviceJobLineId_fkey" FOREIGN KEY ("serviceJobLineId") REFERENCES "ServiceJobLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceException" ADD CONSTRAINT "ServiceException_serviceJobId_fkey" FOREIGN KEY ("serviceJobId") REFERENCES "ServiceJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceException" ADD CONSTRAINT "ServiceException_serviceJobLineId_fkey" FOREIGN KEY ("serviceJobLineId") REFERENCES "ServiceJobLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceEvidence" ADD CONSTRAINT "ServiceEvidence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceEvidence" ADD CONSTRAINT "ServiceEvidence_serviceJobId_fkey" FOREIGN KEY ("serviceJobId") REFERENCES "ServiceJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceEvidence" ADD CONSTRAINT "ServiceEvidence_serviceJobLineId_fkey" FOREIGN KEY ("serviceJobLineId") REFERENCES "ServiceJobLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceEvidenceAuditEvent" ADD CONSTRAINT "ServiceEvidenceAuditEvent_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "ServiceEvidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequestForm" ADD CONSTRAINT "ServiceRequestForm_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequestForm" ADD CONSTRAINT "ServiceRequestForm_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequestFormOffering" ADD CONSTRAINT "ServiceRequestFormOffering_requestFormId_fkey" FOREIGN KEY ("requestFormId") REFERENCES "ServiceRequestForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequestFormOffering" ADD CONSTRAINT "ServiceRequestFormOffering_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "SellableOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_requestFormId_fkey" FOREIGN KEY ("requestFormId") REFERENCES "ServiceRequestForm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_currentQuoteId_fkey" FOREIGN KEY ("currentQuoteId") REFERENCES "ServiceQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequestLine" ADD CONSTRAINT "ServiceRequestLine_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "SellableOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceQuote" ADD CONSTRAINT "ServiceQuote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceQuote" ADD CONSTRAINT "ServiceQuote_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceQuote" ADD CONSTRAINT "ServiceQuote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceQuote" ADD CONSTRAINT "ServiceQuote_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "ServiceQuoteVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceQuoteVersion" ADD CONSTRAINT "ServiceQuoteVersion_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "ServiceQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceQuoteVersion" ADD CONSTRAINT "ServiceQuoteVersion_acceptedOrderId_fkey" FOREIGN KEY ("acceptedOrderId") REFERENCES "CommercialOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceQuoteLine" ADD CONSTRAINT "ServiceQuoteLine_quoteVersionId_fkey" FOREIGN KEY ("quoteVersionId") REFERENCES "ServiceQuoteVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceQuoteLine" ADD CONSTRAINT "ServiceQuoteLine_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "SellableOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerTrackingAccess" ADD CONSTRAINT "CustomerTrackingAccess_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerTrackingAccess" ADD CONSTRAINT "CustomerTrackingAccess_serviceJobId_fkey" FOREIGN KEY ("serviceJobId") REFERENCES "ServiceJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerTrackingAccess" ADD CONSTRAINT "CustomerTrackingAccess_rotatedFromId_fkey" FOREIGN KEY ("rotatedFromId") REFERENCES "CustomerTrackingAccess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceNotificationIntent" ADD CONSTRAINT "ServiceNotificationIntent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceManualShare" ADD CONSTRAINT "ServiceManualShare_notificationIntentId_fkey" FOREIGN KEY ("notificationIntentId") REFERENCES "ServiceNotificationIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceDeliveryAttempt" ADD CONSTRAINT "ServiceDeliveryAttempt_notificationIntentId_fkey" FOREIGN KEY ("notificationIntentId") REFERENCES "ServiceNotificationIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineCommand" ADD CONSTRAINT "OfflineCommand_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineCommand" ADD CONSTRAINT "OfflineCommand_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineCommand" ADD CONSTRAINT "OfflineCommand_offlineDeviceId_fkey" FOREIGN KEY ("offlineDeviceId") REFERENCES "OfflineDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineConflictReview" ADD CONSTRAINT "OfflineConflictReview_commandId_fkey" FOREIGN KEY ("commandId") REFERENCES "OfflineCommand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
