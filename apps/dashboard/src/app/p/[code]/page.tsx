import { isManualPaymentShortCode } from "@ewatrade/utils/manual-payments"
import type { Metadata } from "next"
import PublicPaymentRoute, {
  generateMetadata as paymentMetadata,
} from "../../pay/[token]/page"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ code: string }> }

/**
 * Short payment-link address (/p/<code>): the same public payment page and metadata as
 * /pay/<token>, with the code as the token, so the address bar stays short.
 */
async function tokenParams(params: Props["params"]) {
  const { code } = await params
  // Anything but an exact short code is no link: no lookup, the generic unavailable state.
  return { token: isManualPaymentShortCode(code) ? code : "" }
}

export function generateMetadata({ params }: Props): Promise<Metadata> {
  return paymentMetadata({ params: tokenParams(params) })
}

export default function ShortPaymentRoute({ params }: Props) {
  return <PublicPaymentRoute params={tokenParams(params)} />
}
