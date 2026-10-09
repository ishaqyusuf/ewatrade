import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToStream,
} from "@react-pdf/renderer"
import { receiptFontSource } from "./embedded-font"
import type { OrderReceipt } from "./types"
import { ReceiptRenderError, receiptMoney } from "./types"

Font.register({
  family: "ReceiptInter",
  src: receiptFontSource,
})
Font.registerHyphenationCallback((word) => [word])

const INK = "#13201b"
const MUTED = "#66736e"
const LINE = "#e3e8e5"
const BRAND = "#17684f"
const TINT = "#f1f6f3"

const styles = StyleSheet.create({
  page: {
    fontFamily: "ReceiptInter",
    fontSize: 9.5,
    color: INK,
    backgroundColor: "#ffffff",
    paddingTop: 44,
    paddingHorizontal: 44,
    paddingBottom: 64,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 18,
    marginBottom: 20,
  },
  business: { fontSize: 20, color: INK, marginBottom: 6 },
  muted: { fontSize: 8.5, color: MUTED, lineHeight: 1.5 },
  label: { fontSize: 7.5, color: MUTED, letterSpacing: 0.8 },
  docTitle: { fontSize: 11, color: BRAND, letterSpacing: 2, marginBottom: 6 },
  pill: {
    marginTop: 8,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 4,
    fontSize: 7.5,
    letterSpacing: 0.8,
  },
  amountBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: TINT,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  amount: { fontSize: 22, color: INK },
  parties: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 18,
    marginBottom: 20,
  },
  party: { maxWidth: "48%", gap: 3 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 15 },
  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: LINE,
    paddingBottom: 7,
  },
  line: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: "#eef1ef",
    paddingVertical: 9,
  },
  item: { width: "46%", paddingRight: 12, lineHeight: 1.5 },
  qty: { width: "10%", textAlign: "right", paddingRight: 10 },
  price: { width: "22%", textAlign: "right", paddingRight: 10 },
  lineAmount: { width: "22%", textAlign: "right" },
  summary: { marginTop: 16, marginLeft: "46%", gap: 7 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 9,
    borderTopWidth: 1,
    borderColor: LINE,
    fontSize: 11.5,
  },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: TINT,
    borderRadius: 6,
    paddingVertical: 7,
    paddingHorizontal: 9,
    marginHorizontal: -9,
    fontSize: 11,
  },
  payment: { marginTop: 22, gap: 7 },
  note: {
    marginTop: 22,
    paddingTop: 14,
    borderTopWidth: 1,
    borderColor: LINE,
    lineHeight: 1.6,
  },
  footer: {
    position: "absolute",
    bottom: 26,
    left: 44,
    right: 44,
    paddingTop: 9,
    borderTopWidth: 1,
    borderColor: LINE,
    fontSize: 7.5,
    color: MUTED,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  made: { flexDirection: "row", alignItems: "center", gap: 5 },
  mark: {
    width: 9,
    height: 9,
    borderRadius: 2.5,
    backgroundColor: BRAND,
  },
})

function date(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

// Settled receipts read green; anything still owed reads amber.
function statusTone(label: string) {
  if (label === "Paid" || label === "No payment due")
    return { backgroundColor: "#ddf1e6", color: "#13603f" }
  if (label === "Refunded" || label.startsWith("Historical"))
    return { backgroundColor: "#eceff0", color: "#4a5652" }
  return { backgroundColor: "#fdebdd", color: "#a4410c" }
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={{ color: MUTED }}>{label}</Text>
      <Text>{value}</Text>
    </View>
  )
}

export function ReceiptDocument({ receipts }: { receipts: OrderReceipt[] }) {
  return (
    <Document
      title={
        receipts.length === 1
          ? `Receipt ${receipts[0]?.orderNumber}`
          : "Order receipts"
      }
      author="EwaTrade"
    >
      {receipts.map((receipt) => {
        const money = (minor: number) =>
          receiptMoney(minor, receipt.currencyCode)
        const owing = receipt.balanceMinor > 0
        return (
          <Page key={receipt.id} size="A4" wrap style={styles.page}>
            <View style={styles.header} fixed>
              <View style={{ maxWidth: "62%" }}>
                <Text style={styles.business}>{receipt.businessName}</Text>
                {receipt.storeName !== receipt.businessName ? (
                  <Text style={styles.muted}>{receipt.storeName}</Text>
                ) : null}
                {receipt.address ? (
                  <Text style={styles.muted}>{receipt.address}</Text>
                ) : null}
                {receipt.supportPhone ? (
                  <Text style={styles.muted}>{receipt.supportPhone}</Text>
                ) : null}
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.docTitle}>RECEIPT</Text>
                <Text>{receipt.orderNumber}</Text>
                <Text style={styles.muted}>
                  {date(receipt.createdAt, receipt.timezone)}
                </Text>
                <Text style={[styles.pill, statusTone(receipt.paymentLabel)]}>
                  {receipt.paymentLabel.toUpperCase()}
                </Text>
              </View>
            </View>
            <View style={styles.amountBox} wrap={false}>
              <Text style={{ color: MUTED }}>
                {owing ? "Amount due" : "Order total"}
              </Text>
              <Text style={styles.amount}>
                {money(owing ? receipt.balanceMinor : receipt.totalMinor)}
              </Text>
            </View>
            <View style={styles.parties} wrap={false}>
              <View style={styles.party}>
                <Text style={styles.label}>BILLED TO</Text>
                <Text>{receipt.customerName || "Walk-in customer"}</Text>
              </View>
              <View style={[styles.party, { alignItems: "flex-end" }]}>
                <Text style={styles.label}>PAYMENT</Text>
                <Text>{receipt.paymentLabel}</Text>
              </View>
            </View>
            <View style={styles.tableHead} wrap={false}>
              <Text style={[styles.item, styles.label]}>ITEM</Text>
              <Text style={[styles.qty, styles.label]}>QTY</Text>
              <Text style={[styles.price, styles.label]}>UNIT PRICE</Text>
              <Text style={[styles.lineAmount, styles.label]}>AMOUNT</Text>
            </View>
            {receipt.lines.map((line) => (
              <View key={line.id} style={styles.line} wrap={false}>
                <View style={styles.item}>
                  <Text>{line.name}</Text>
                  {line.unitName ? (
                    <Text style={styles.muted}>{line.unitName}</Text>
                  ) : null}
                  {line.note ? (
                    <Text style={styles.muted}>{line.note}</Text>
                  ) : null}
                </View>
                <Text style={styles.qty}>{line.quantity}</Text>
                <Text style={styles.price}>
                  {line.unitPriceMinor === null
                    ? "Item total"
                    : money(line.unitPriceMinor)}
                </Text>
                <Text style={styles.lineAmount}>{money(line.totalMinor)}</Text>
              </View>
            ))}
            <View style={styles.summary} wrap={false}>
              <SummaryLine
                label="Subtotal"
                value={money(receipt.subtotalMinor)}
              />
              {receipt.discountMinor ? (
                <SummaryLine
                  label="Discount"
                  value={`−${money(receipt.discountMinor)}`}
                />
              ) : null}
              {receipt.taxMinor ? (
                <SummaryLine label="Tax" value={money(receipt.taxMinor)} />
              ) : null}
              {receipt.serviceChargeMinor ? (
                <SummaryLine
                  label="Service charge"
                  value={money(receipt.serviceChargeMinor)}
                />
              ) : null}
              <View style={styles.totalRow}>
                <Text>Order total</Text>
                <Text>{money(receipt.totalMinor)}</Text>
              </View>
              {receipt.settings.showPaymentBreakdown ? (
                <>
                  <SummaryLine
                    label="Net payment received"
                    value={money(receipt.receivedMinor)}
                  />
                  {receipt.refundedMinor ? (
                    <SummaryLine
                      label="Refunds recorded"
                      value={money(receipt.refundedMinor)}
                    />
                  ) : null}
                  <View style={styles.balanceRow}>
                    <Text>Balance due</Text>
                    <Text>{money(receipt.balanceMinor)}</Text>
                  </View>
                </>
              ) : null}
            </View>
            {receipt.payments.length ? (
              <View style={styles.payment}>
                <Text style={styles.label}>PAYMENT BREAKDOWN</Text>
                {receipt.payments.map((payment) => (
                  <View key={payment.id} style={styles.row} wrap={false}>
                    <View style={{ maxWidth: "65%" }}>
                      <Text>
                        {payment.type === "REFUND" ? "Refund" : "Payment"} ·{" "}
                        {payment.method}
                      </Text>
                      <Text style={styles.muted}>
                        {date(payment.recordedAt, receipt.timezone)}
                      </Text>
                    </View>
                    <Text>
                      {payment.type === "REFUND" ? "−" : ""}
                      {money(payment.amountMinor)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            {receipt.settings.thankYouNote ? (
              <Text style={styles.note}>{receipt.settings.thankYouNote}</Text>
            ) : null}
            {receipt.paymentLabel !== "Paid" &&
            receipt.paymentLabel !== "No payment due" ? (
              <Text style={{ ...styles.muted, marginTop: 12 }}>
                This receipt reflects the payment status shown above.
              </Text>
            ) : null}
            <View style={styles.footer} fixed>
              <Text
                render={({ pageNumber, totalPages }) =>
                  `${receipt.orderNumber} · Exported ${date(receipt.generatedAt, receipt.timezone)} · Page ${pageNumber} of ${totalPages}`
                }
              />
              <View style={styles.made}>
                <View style={styles.mark} />
                <Text>Made with ẸwáTrade</Text>
              </View>
            </View>
          </Page>
        )
      })}
    </Document>
  )
}

export async function renderOrderReceipts(receipts: OrderReceipt[]) {
  await Font.load({ fontFamily: "ReceiptInter" })
  const font = Font.getFont({ fontFamily: "ReceiptInter" }).data
  const strings = receipts.flatMap((receipt) => [
    receipt.businessName,
    receipt.storeName,
    receipt.address,
    receipt.customerName ?? "",
    receipt.settings.thankYouNote,
    ...receipt.lines.flatMap((line) => [
      line.name,
      line.unitName ?? "",
      line.note ?? "",
    ]),
  ])
  if (strings.some((value) => value.length > 2000))
    throw new ReceiptRenderError(
      "A receipt field is too long to render safely. Contact support.",
    )
  for (const character of strings.join("")) {
    const codePoint = character.codePointAt(0)
    if (
      codePoint &&
      codePoint > 32 &&
      font &&
      !font.hasGlyphForCodePoint(codePoint)
    ) {
      throw new ReceiptRenderError(
        "This receipt contains characters the current template cannot display. Contact support for language support.",
      )
    }
  }
  const stream = await renderToStream(<ReceiptDocument receipts={receipts} />)
  const chunks: Uint8Array[] = []
  let byteLength = 0
  for await (const chunk of stream) {
    const bytes = Buffer.from(chunk)
    byteLength += bytes.length
    if (byteLength > 10_000_000) {
      throw new ReceiptRenderError(
        "This export is too large. Select fewer Orders.",
      )
    }
    chunks.push(bytes)
  }
  const bytes = Buffer.concat(chunks)
  if (bytes.length > 10_000_000)
    throw new ReceiptRenderError(
      "This export is too large. Select fewer Orders.",
    )
  return bytes
}
