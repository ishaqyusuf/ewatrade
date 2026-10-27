import { isManualPaymentShortCode } from "@ewatrade/utils/manual-payments"
import { GET as paymentImage } from "../../../pay/[token]/image/route"

export const dynamic = "force-dynamic"

/** The short link's social image: the same renderer and headers as /pay/<token>/image. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params
  // Anything but an exact short code renders the generic unavailable image without a lookup.
  const token = isManualPaymentShortCode(code) ? code : ""
  return paymentImage(request, { params: Promise.resolve({ token }) })
}
