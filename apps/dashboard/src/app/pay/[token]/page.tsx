import { PaymentPage } from "@/components/public-payment/payment-page"
import { PAYMENT_PREVIEW_VERSION } from "@/components/public-payment/payment-preview-model"
import { PaymentProvider } from "@/components/public-payment/payment-provider"
import type { Metadata } from "next"
import { publicPaymentOrigin, readPublicPayment } from "./payment-data"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ token: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  const link = await readPublicPayment(token)
  const title = link?.preview.title ?? "Payment information · EwaTrade"
  const description =
    link?.preview.description ??
    "View your payment details and report a bank transfer for the business to confirm."
  let image: string | undefined
  try {
    if (token.length <= 220)
      image = `${publicPaymentOrigin()}/pay/${encodeURIComponent(token)}/image?v=${PAYMENT_PREVIEW_VERSION}`
  } catch {
    /* No untrusted request-origin fallback. */
  }
  return {
    title,
    description,
    robots: { index: false, follow: false, noarchive: true },
    referrer: "no-referrer",
    openGraph: {
      type: "website",
      siteName: "EwaTrade",
      title,
      description,
      images: image
        ? [{ url: image, width: 1200, height: 630, alt: title }]
        : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : [],
    },
  }
}

export default async function PublicPaymentRoute({ params }: Props) {
  const { token } = await params
  const initialLink = await readPublicPayment(token)
  return (
    <PaymentProvider>
      <PaymentPage token={token} initialLink={initialLink ?? undefined} />
    </PaymentProvider>
  )
}
