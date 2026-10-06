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

const styles = StyleSheet.create({
  page: {
    fontFamily: "ReceiptInter",
    fontSize: 10,
    color: "#182420",
    backgroundColor: "#ffffff",
    padding: 40,
    paddingBottom: 55,
  },
  header: {
    borderTopWidth: 4,
    borderTopColor: "#17684f",
    paddingTop: 18,
    marginBottom: 22,
  },
  title: { fontSize: 23, marginBottom: 6 },
  muted: { fontSize: 9, color: "#626d69", lineHeight: 1.5 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 15 },
  meta: { padding: 15, backgroundColor: "#f3f6f4", marginBottom: 20, gap: 5 },
  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: "#dce2df",
    paddingBottom: 9,
    fontSize: 8,
    color: "#626d69",
  },
  line: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: "#edf0ee",
    paddingVertical: 10,
  },
  item: { width: "44%", paddingRight: 12, lineHeight: 1.5 },
  qty: { width: "12%", textAlign: "right", paddingRight: 10 },
  price: { width: "22%", textAlign: "right", paddingRight: 10 },
  amount: { width: "22%", textAlign: "right" },
  summary: { marginTop: 18, marginLeft: "38%", gap: 8 },
  total: {
    fontSize: 13,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: "#dce2df",
  },
  payment: { marginTop: 24, gap: 8 },
  note: {
    marginTop: 24,
    paddingTop: 15,
    borderTopWidth: 1,
    borderColor: "#dce2df",
    lineHeight: 1.6,
  },
  footer: {
    position: "absolute",
    bottom: 25,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#626d69",
    flexDirection: "row",
    justifyContent: "space-between",
  },
})

function date(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text>{label}</Text>
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
        return (
          <Page key={receipt.id} size="A4" wrap style={styles.page}>
            <View style={styles.header} fixed>
              <View style={styles.row}>
                <View style={{ maxWidth: "65%" }}>
                  <Text style={styles.title}>{receipt.businessName}</Text>
                  <Text style={styles.muted}>{receipt.storeName}</Text>
                  {receipt.address ? (
                    <Text style={styles.muted}>{receipt.address}</Text>
                  ) : null}
                  {receipt.supportPhone ? (
                    <Text style={styles.muted}>{receipt.supportPhone}</Text>
                  ) : null}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontSize: 15, marginBottom: 7 }}>
                    Order receipt
                  </Text>
                  <Text>{receipt.orderNumber}</Text>
                </View>
              </View>
            </View>
            <View style={styles.meta} wrap={false}>
              <View style={styles.row}>
                <Text style={styles.muted}>Order date</Text>
                <Text>{date(receipt.createdAt, receipt.timezone)}</Text>
              </View>
              {receipt.customerName ? (
                <View style={styles.row}>
                  <Text style={styles.muted}>Customer</Text>
                  <Text style={{ maxWidth: "70%", textAlign: "right" }}>
                    {receipt.customerName}
                  </Text>
                </View>
              ) : null}
              <View style={styles.row}>
                <Text style={styles.muted}>Payment status</Text>
                <Text>{receipt.paymentLabel}</Text>
              </View>
            </View>
            <View style={styles.tableHead} wrap={false}>
              <Text style={styles.item}>ITEM</Text>
              <Text style={styles.qty}>QTY</Text>
              <Text style={styles.price}>UNIT PRICE</Text>
              <Text style={styles.amount}>AMOUNT</Text>
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
                <Text style={styles.amount}>{money(line.totalMinor)}</Text>
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
              <View style={styles.total}>
                <SummaryLine
                  label="Order total"
                  value={money(receipt.totalMinor)}
                />
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
                  <SummaryLine
                    label="Balance due"
                    value={money(receipt.balanceMinor)}
                  />
                </>
              ) : null}
            </View>
            {receipt.payments.length ? (
              <View style={styles.payment}>
                <Text style={styles.muted}>PAYMENT BREAKDOWN</Text>
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
                This Order receipt reflects the payment status shown above.
              </Text>
            ) : null}
            <View style={styles.footer} fixed>
              <Text>
                {receipt.orderNumber} · Exported{" "}
                {date(receipt.generatedAt, receipt.timezone)}
              </Text>
              <Text
                render={({ pageNumber, totalPages }) =>
                  `${pageNumber} / ${totalPages}`
                }
              />
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
