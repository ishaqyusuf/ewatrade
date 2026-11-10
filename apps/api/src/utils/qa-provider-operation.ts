import {
  type BillingEnvironment,
  isWebReconciliationConfigured,
} from "@ewatrade/payments/web-subscriptions"
import type { QaLiveEffectOperation } from "@ewatrade/utils/qa-provider-policy"

const PAYSTACK_WEB_TEST_PROCEDURES = new Set([
  "retailops.createsubscriptioncheckoutintent",
  "retailops.checkwebsubscriptionpayment",
  "retailops.managewebsubscription",
])

/** A registered provider Test Mode adapter, never a general QA policy bypass. */
export function qaProviderAdapterForProcedure(
  path: string,
  env: BillingEnvironment = process.env,
  hasAuthorizedQaSession = false,
): "live" | "test" {
  if (
    hasAuthorizedQaSession &&
    PAYSTACK_WEB_TEST_PROCEDURES.has(path.toLowerCase()) &&
    env.PAYSTACK_QA_SUBSCRIPTIONS_TEST_ADAPTER_ENABLED === "true" &&
    (env.APP_ENV === "local" || env.APP_ENV === "preview") &&
    env.DEV_PROFILE === env.APP_ENV &&
    env.WEB_BILLING_ENVIRONMENT === "sandbox" &&
    isWebReconciliationConfigured(env)
  )
    return "test"
  return "live"
}

const EXACT_QA_PROVIDER_OPERATIONS: Readonly<
  Record<string, QaLiveEffectOperation>
> = {
  "storesubscriptions.verifypurchase": "subscription",
  "retailops.checkwebsubscriptionpayment": "subscription",
  "retailops.managewebsubscription": "subscription",
  "domains.checkavailability": "domain_registration",
  "domains.connectexternal": "domain_hosting",
  "domains.createcheckout": "domain_registration",
  "domains.verifyconnection": "domain_hosting",
  "prescriptions.mediaaccess": "media_analysis",
  "prescriptions.refund": "refund",
  "prescriptions.starttranscription": "media_analysis",
  "prescriptions.updatewhatsappconnectionlifecycle": "whatsapp",
  "prescriptions.uploadmedia": "media_analysis",
  "prescriptions.suspendwhatsappstorebinding": "whatsapp",
  "servicecommerce.media.requestmediaviewergrant": "media_analysis",
}

export function qaLiveEffectForProcedure(
  path: string,
): QaLiveEffectOperation | null {
  const normalized = path.toLowerCase()
  const exact = EXACT_QA_PROVIDER_OPERATIONS[normalized]
  if (exact) return exact
  if (normalized.endsWith("createsubscriptioncheckoutintent")) {
    return "subscription"
  }
  if (
    /(?:connectwhatsappmanually|retestwhatsappconnection|whatsappembeddedsignup|selectwhatsappembeddedsignupnumber|savecustomerwhatsappconnection|completechannelembeddedsignup|channelembeddedsignup|retestcustomerchannelconnection)/.test(
      normalized,
    )
  ) {
    return "whatsapp"
  }
  if (/(media.*(?:analysis|analyz|ocr)|prescription.*ocr)/.test(normalized)) {
    return "media_analysis"
  }
  if (/(harddelete|permanentdelete)/.test(normalized)) return "destructive"
  return null
}
