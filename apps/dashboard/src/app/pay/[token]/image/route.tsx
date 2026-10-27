import { ImageResponse } from "next/og"
import { readPublicPayment } from "../payment-data"

export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const link = await readPublicPayment(token)
  // Only the business name belongs on a forwardable social preview.
  const businessName = link?.businessName.slice(0, 100) ?? "Your business"
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: "#0e4a38",
        color: "#fff9ed",
        padding: "64px 72px",
        flexDirection: "column",
        justifyContent: "space-between",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          fontSize: 32,
          fontWeight: 700,
        }}
      >
        <svg aria-hidden="true" width="48" height="48" viewBox="0 0 120 120">
          <path fill="#fff9ed" d="M17 41 29 20H82L64 38H41L36 47H13Z" />
          <path
            fill="#bad2c1"
            d="M10 97 17 73 44 48H73L92 29 84 21 112 13 104 41 97 34 80 66H52L22 96Z"
          />
          <path fill="#fff9ed" d="M42 82H99L86 102H22Z" />
        </svg>
        EwaTrade
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", fontSize: 28, color: "#bad2c1" }}>
          PAYMENT INFORMATION
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 64,
            fontWeight: 700,
            lineHeight: 1.1,
          }}
        >
          {businessName}
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#e3eadb" }}>
          View bank details. Report your transfer.
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 23, color: "#bad2c1" }}>
        The business confirms when your payment is received.
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    },
  )
}
