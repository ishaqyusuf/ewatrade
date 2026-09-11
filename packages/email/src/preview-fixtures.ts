import type { CommercialOrderFulfillmentReminderEmailInput } from "../templates/commercial-order-fulfillment-reminder"
import type { MarketingLeadEmailInput } from "../templates/marketing-early-access-admin"
import type { RetailOpsStaffInviteEmailInput } from "../templates/retail-ops-staff-invite"
import type { WorkspaceWelcomeEmailInput } from "../templates/workspace-welcome"

export const earlyAccessLead = {
  accessExpiresAt: "6 September 2026, 18:00 WAT",
  accessUrl: "https://ewatrade.com/signup?access_token=preview-early-access",
  companyName: "Amina Home & Trade",
  email: "amina@example.com",
  fullName: "Amina Bello",
  id: "lead_ewa_0829",
  message:
    "We sell home essentials through our shop and WhatsApp. I need stock and orders to agree at the end of the day.",
  phone: "+234 803 555 0198",
  roleTitle: "Owner",
} satisfies MarketingLeadEmailInput

export const waitlistLead = {
  companyName: "Northbank Essentials",
  email: "tunde@example.com",
  fullName: "Tunde Okafor",
  id: "lead_wait_1204",
} satisfies MarketingLeadEmailInput

export const staffInvite = {
  appUrl: "https://app.ewatrade.com",
  businessName: "Amina Home & Trade",
  invitedByName: "Amina Bello",
  inviteeEmail: "zainab@example.com",
  inviteeName: "Zainab Musa",
  inviteUrl: "https://app.ewatrade.com/staff/invite/preview-token",
  role: "ATTENDANT",
} satisfies RetailOpsStaffInviteEmailInput

export const orderReminder = {
  businessName: "Amina Home & Trade",
  customerName: "Feyi Adeyemi",
  deliveryDueLabel: "30 August 2026 · 2:00 PM WAT",
  orderId: "order_preview_1048",
  orderNumber: "EWA-1048",
  storeName: "Lekki Store",
  timing: "day_before",
} satisfies CommercialOrderFulfillmentReminderEmailInput

export const workspaceWelcome = {
  businessName: "Amina Home & Trade",
  dashboardHostname: "app.ewatrade.com",
  dashboardUrl: "https://app.ewatrade.com",
  firstName: "Amina",
  posHostname: "amina-home-pos.ewatrade.com",
  storefrontHostname: "amina-home.ewatrade.com",
} satisfies WorkspaceWelcomeEmailInput
