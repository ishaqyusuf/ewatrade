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
import {
  type CustomerStatementDocument,
  customerStatementBalanceWords,
  customerStatementMoney,
} from "./statement"
import { ReceiptRenderError } from "./types"

Font.register({ family: "ReceiptInter", src: receiptFontSource })
Font.registerHyphenationCallback((word) => [word])

const INK = "#13201b"
const MUTED = "#66736e"
const LINE = "#e3e8e5"
const BRAND = "#17684f"
const TINT = "#f1f6f3"
const ROW = "#f7f9f8"

const styles = StyleSheet.create({
  page: {
    fontFamily: "ReceiptInter",
    fontSize: 8.5,
    color: INK,
    backgroundColor: "#ffffff",
    paddingTop: 40,
    paddingHorizontal: 40,
    paddingBottom: 56,
    lineHeight: 1.45,
  },
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 20,
    paddingBottom: 14,
    borderBottomWidth: 1.5,
    borderColor: BRAND,
  },
  business: { fontSize: 16, marginBottom: 4 },
  muted: { color: MUTED },
  title: {
    color: BRAND,
    fontSize: 10,
    letterSpacing: 1.6,
    marginBottom: 6,
    textAlign: "right",
  },
  right: { textAlign: "right" },
  mid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 20,
    marginTop: 16,
    marginBottom: 14,
  },
  label: {
    fontSize: 7,
    letterSpacing: 0.8,
    color: MUTED,
    marginBottom: 4,
  },
  customer: { fontSize: 11, marginBottom: 2 },
  box: {
    width: 210,
    backgroundColor: TINT,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  boxRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  boxClose: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderColor: "#d5e2db",
    marginTop: 4,
    paddingTop: 6,
    fontSize: 10,
  },
  head: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: INK,
    paddingVertical: 5,
    fontSize: 7,
    letterSpacing: 0.4,
    color: MUTED,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: LINE,
    paddingVertical: 5,
  },
  edge: { backgroundColor: ROW },
  closing: { borderBottomWidth: 1.5, borderColor: INK },
  date: { width: 64, paddingHorizontal: 6 },
  details: { flex: 1, paddingHorizontal: 6 },
  money: { width: 78, paddingHorizontal: 6, textAlign: "right" },
  balance: { width: 100, paddingHorizontal: 6, textAlign: "right" },
  sub: { color: MUTED, fontSize: 7.5 },
  pay: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  footer: {
    position: "absolute",
    left: 40,
    right: 40,
    bottom: 22,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
    fontSize: 7,
    color: MUTED,
  },
})

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

/** "2026-10-01" → "1 Oct 2026" without any time zone shift. */
export function statementDay(value: string) {
  const [year, month, day] = value.split("-")
  return `${Number(day)} ${MONTHS[Number(month) - 1] ?? ""} ${year}`
}

function zonedDay(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value))
}

export function CustomerStatementPdf({
  statement,
}: { statement: CustomerStatementDocument }) {
  const money = (value: string) =>
    customerStatementMoney(value, statement.currencyCode)
  const balance = (value: string) =>
    customerStatementBalanceWords(value, statement.currencyCode)
  const closing = BigInt(statement.closingMinor)
  const business = statement.business
  const contact = [business.phone, business.email].filter(Boolean).join(" · ")
  const issued = zonedDay(statement.issuedAt, statement.timezone)
  return (
    <Document
      title={`Statement · ${statement.customer.name} · ${statement.from} to ${statement.through}`}
      author={business.name}
    >
      <Page size="A4" wrap style={styles.page}>
        <View style={styles.top} wrap={false}>
          <View style={{ maxWidth: "60%" }}>
            <Text style={styles.business}>{business.name}</Text>
            {business.storeName && business.storeName !== business.name ? (
              <Text style={styles.muted}>{business.storeName}</Text>
            ) : null}
            {business.address ? (
              <Text style={styles.muted}>{business.address}</Text>
            ) : null}
            {contact ? <Text style={styles.muted}>{contact}</Text> : null}
          </View>
          <View>
            <Text style={styles.title}>STATEMENT</Text>
            <Text style={styles.right}>
              {statementDay(statement.from)} – {statementDay(statement.through)}
            </Text>
            <Text style={[styles.muted, styles.right]}>
              Issued {issued} · {statement.currencyCode}
            </Text>
          </View>
        </View>
        <View style={styles.mid} wrap={false}>
          <View style={{ maxWidth: "50%" }}>
            <Text style={styles.label}>STATEMENT FOR</Text>
            <Text style={styles.customer}>{statement.customer.name}</Text>
            {statement.customer.phone ? (
              <Text style={styles.muted}>{statement.customer.phone}</Text>
            ) : null}
            {statement.customer.email ? (
              <Text style={styles.muted}>{statement.customer.email}</Text>
            ) : null}
          </View>
          <View style={styles.box}>
            <View style={styles.boxRow}>
              <Text>Opening balance</Text>
              <Text>{balance(statement.openingMinor)}</Text>
            </View>
            <View style={styles.boxRow}>
              <Text>Charged</Text>
              <Text>{money(statement.chargedMinor)}</Text>
            </View>
            <View style={styles.boxRow}>
              <Text>Paid</Text>
              <Text>{money(statement.paidMinor)}</Text>
            </View>
            <View style={styles.boxClose}>
              <Text>
                {closing > BigInt(0)
                  ? "Balance owed"
                  : closing < BigInt(0)
                    ? "Paid ahead"
                    : "Balance"}
              </Text>
              <Text>
                {money((closing < BigInt(0) ? -closing : closing).toString())}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.head} fixed>
          <Text style={styles.date}>DATE</Text>
          <Text style={styles.details}>DETAILS</Text>
          <Text style={styles.money}>CHARGED</Text>
          <Text style={styles.money}>PAID</Text>
          <Text style={styles.balance}>BALANCE</Text>
        </View>
        <View style={[styles.row, styles.edge]} wrap={false}>
          <Text style={styles.date}>{statementDay(statement.from)}</Text>
          <Text style={styles.details}>Opening balance</Text>
          <Text style={styles.money} />
          <Text style={styles.money} />
          <Text style={styles.balance}>{balance(statement.openingMinor)}</Text>
        </View>
        {statement.lines.map((line) => (
          <View key={line.id} style={styles.row} wrap={false}>
            <Text style={styles.date}>
              {zonedDay(line.effectiveAt, statement.timezone)}
            </Text>
            <View style={styles.details}>
              <Text>{line.title}</Text>
              {line.detail ? (
                <Text style={styles.sub}>{line.detail}</Text>
              ) : null}
            </View>
            <Text style={styles.money}>
              {line.side === "DEBIT" ? money(line.amountMinor) : ""}
            </Text>
            <Text style={styles.money}>
              {line.side === "CREDIT" ? money(line.amountMinor) : ""}
            </Text>
            <Text style={styles.balance}>{balance(line.runningMinor)}</Text>
          </View>
        ))}
        {statement.lines.length ? null : (
          <View style={styles.row} wrap={false}>
            <Text style={styles.date} />
            <Text style={[styles.details, styles.muted]}>
              No charges or payments in these dates
            </Text>
          </View>
        )}
        <View style={[styles.row, styles.edge, styles.closing]} wrap={false}>
          <Text style={styles.date}>{statementDay(statement.through)}</Text>
          <Text style={styles.details}>Closing balance</Text>
          <Text style={styles.money}>{money(statement.chargedMinor)}</Text>
          <Text style={styles.money}>{money(statement.paidMinor)}</Text>
          <Text style={styles.balance}>{balance(statement.closingMinor)}</Text>
        </View>
        {statement.paymentAccounts.length ? (
          <View style={styles.pay} wrap={false}>
            <Text style={[styles.label, { width: 100, marginBottom: 0 }]}>
              HOW TO PAY
            </Text>
            <View style={{ flex: 1, gap: 3 }}>
              {statement.paymentAccounts.map((account) => (
                <Text key={`${account.bankName}:${account.accountNumber}`}>
                  {account.bankName}
                  {account.mobileMoney ? " (mobile money)" : ""} ·{" "}
                  {account.accountNumber} · {account.accountHolder}
                </Text>
              ))}
            </View>
          </View>
        ) : null}
        <View style={styles.footer} fixed>
          <Text style={{ flex: 1 }}>
            {`Shows the charges and payments added to ${statement.customer.name}’s account up to ${issued}. Orders not added to the account aren’t included.`}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  )
}

export async function renderCustomerStatement(
  statement: CustomerStatementDocument,
) {
  await Font.load({ fontFamily: "ReceiptInter" })
  const font = Font.getFont({ fontFamily: "ReceiptInter" }).data
  const strings = [
    statement.business.name,
    statement.business.storeName ?? "",
    statement.business.address ?? "",
    statement.business.phone ?? "",
    statement.business.email ?? "",
    statement.customer.name,
    statement.customer.phone ?? "",
    statement.customer.email ?? "",
    ...statement.lines.flatMap((line) => [line.title, line.detail ?? ""]),
    ...statement.paymentAccounts.flatMap((account) => [
      account.bankName,
      account.accountNumber,
      account.accountHolder,
    ]),
  ]
  if (strings.some((value) => value.length > 2000))
    throw new ReceiptRenderError(
      "A statement field is too long to render safely. Contact support.",
    )
  for (const character of strings.join("")) {
    const codePoint = character.codePointAt(0)
    if (
      codePoint &&
      codePoint > 32 &&
      font &&
      !font.hasGlyphForCodePoint(codePoint)
    )
      throw new ReceiptRenderError(
        "This statement contains characters the current template cannot display. Contact support for language support.",
      )
  }
  const stream = await renderToStream(
    <CustomerStatementPdf statement={statement} />,
  )
  const chunks: Uint8Array[] = []
  let byteLength = 0
  for await (const chunk of stream) {
    const bytes = Buffer.from(chunk)
    byteLength += bytes.length
    if (byteLength > 10_000_000)
      throw new ReceiptRenderError(
        "This statement is too large. Choose shorter dates.",
      )
    chunks.push(bytes)
  }
  return Buffer.concat(chunks)
}
