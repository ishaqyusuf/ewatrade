import type { ReactNode } from "react"
import type { PaymentPreview } from "./payment-preview-model"

/**
 * The payment link's 1200 × 630 social preview (Workshop finance/payment-link-preview 02,
 * revision 248e31a0): deep green gradient, cream initials badge with business name and order,
 * then the amount the link asks for and "Pay by bank transfer". Sizes, weights and tracking follow
 * the approved .og02 CSS. Satori: flexbox + inline styles.
 */
const GREEN = "#17684f"
const DEEP = "#0e4a38"
const CREAM = "#fff9ed"
const SOFT = "#cfe0d6"
const FONT = "Figtree, Inter"

function EwaTradeMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <path fill={GREEN} d="M17 41 29 20H82L64 38H41L36 47H13Z" />
      <path
        fill={DEEP}
        d="M10 97 17 73 44 48H73L92 29 84 21 112 13 104 41 97 34 80 66H52L22 96Z"
      />
      <path fill={GREEN} d="M42 82H99L86 102H22Z" />
    </svg>
  )
}

const line = {
  display: "flex",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
} as const

function Header({
  badge,
  title,
  subtitle,
}: {
  badge: ReactNode
  title: string
  subtitle: string
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 112,
          height: 112,
          borderRadius: 26,
          background: CREAM,
          color: GREEN,
          fontSize: 44,
          fontWeight: 800,
          flexShrink: 0,
        }}
      >
        {badge}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          minWidth: 0,
          width: 840,
        }}
      >
        <div
          style={{
            ...line,
            fontSize: 48,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </div>
        <div style={{ ...line, fontSize: 34, fontWeight: 500, color: SOFT }}>
          {subtitle}
        </div>
      </div>
    </div>
  )
}

/**
 * Satori falls back per text run, not per glyph: "₦2,000" as one run would render entirely in
 * Inter Regular. The sign gets its own run (Inter, the only bundled face with ₦, stroked to sit
 * with the 800 digits) so the digits stay in Figtree 800.
 */
function Amount({ amount }: { amount: string }) {
  if (!amount.startsWith("₦")) return <>{amount}</>
  return (
    <>
      <span
        style={{
          fontFamily: "Inter",
          fontWeight: 400,
          WebkitTextStroke: "0.04em currentColor",
          marginRight: "0.03em",
        }}
      >
        ₦
      </span>
      <span>{amount.slice(1)}</span>
    </>
  )
}

export function PaymentPreviewImage({
  preview,
  hasFonts,
}: {
  preview: PaymentPreview
  /** False when the local fonts couldn't load: the built-in font has no Naira sign. */
  hasFonts: boolean
}) {
  const header =
    preview.kind === "unavailable" ? (
      <Header
        badge={<EwaTradeMark size={64} />}
        title="EwaTrade"
        subtitle="Payment link"
      />
    ) : (
      <Header
        badge={preview.initials}
        title={preview.businessName}
        subtitle={preview.reference}
      />
    )
  const headline =
    preview.kind === "request" ? (
      hasFonts ? (
        <Amount amount={preview.amount} />
      ) : (
        preview.amount.replace("₦", "NGN ")
      )
    ) : preview.kind === "status" ? (
      preview.status
    ) : (
      "Link unavailable"
    )
  const detail =
    preview.kind === "request"
      ? "Pay by bank transfer"
      : preview.kind === "status"
        ? preview.detail
        : "Ask the business for a new link"
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: "72px 84px 76px",
        background: `linear-gradient(135deg, ${GREEN}, ${DEEP})`,
        color: CREAM,
        fontFamily: FONT,
      }}
    >
      {header}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div
          style={{
            display: "flex",
            whiteSpace: "nowrap",
            fontSize: preview.kind === "request" ? preview.amountSize : 104,
            fontWeight: 800,
            lineHeight: preview.kind === "request" ? 0.95 : 1,
            letterSpacing: preview.kind === "request" ? "-0.035em" : "-0.03em",
          }}
        >
          {headline}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 38,
            fontWeight: 600,
            color: SOFT,
          }}
        >
          {detail}
        </div>
      </div>
    </div>
  )
}
