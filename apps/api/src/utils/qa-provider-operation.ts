import type { QaLiveEffectOperation } from "@ewatrade/utils/qa-provider-policy"

const EXACT_QA_PROVIDER_OPERATIONS: Readonly<
  Record<string, QaLiveEffectOperation>
> = {
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
