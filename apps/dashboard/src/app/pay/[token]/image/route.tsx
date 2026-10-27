import { paymentPreviewFonts } from "@/components/public-payment/payment-preview-font"
import { PaymentPreviewImage } from "@/components/public-payment/payment-preview-image"
import { paymentPreviewModel } from "@/components/public-payment/payment-preview-model"
import { ImageResponse } from "next/og"
import { readPublicPayment } from "../payment-data"

export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const [link, fonts] = await Promise.all([
    readPublicPayment(token),
    paymentPreviewFonts(),
  ])
  return new ImageResponse(
    <PaymentPreviewImage
      preview={paymentPreviewModel(link)}
      hasFonts={fonts.length > 0}
    />,
    {
      width: 1200,
      height: 630,
      // An empty list would replace the built-in fallback font and fail the render.
      fonts: fonts.length > 0 ? fonts : undefined,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    },
  )
}
