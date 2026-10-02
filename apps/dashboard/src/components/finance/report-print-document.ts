import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import type { FinanceReport } from "./report-csv"

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

export function buildFinanceReportPrintDocument(report: FinanceReport) {
  const money = (value: string) =>
    escapeHtml(formatFinanceMoney(value, report.currencyCode))
  const rows = (values: [string, string][]) =>
    `<dl>${values.map(([label, amount]) => `<div><dt>${escapeHtml(label)}</dt><dd>${money(amount)}</dd></div>`).join("")}</dl>`
  const accounts = (
    values: { code: string; name: string; accountId: string }[],
    amount: (index: number) => string,
  ) =>
    `<table><thead><tr><th>Account</th><th>Amount (${escapeHtml(report.currencyCode)})</th></tr></thead><tbody>${values.map((account, index) => `<tr><td>${escapeHtml(account.code)} · ${escapeHtml(account.name)}<small>${escapeHtml(account.accountId)}</small></td><td>${money(amount(index))}</td></tr>`).join("")}</tbody></table>`
  const p = report.profitAndLoss
  const c = report.cashFlow
  const b = report.balanceSheet
  const t = report.trialBalance
  const through = report.through.toISOString().slice(0, 10)
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Finance report · ${through} · snapshot ${escapeHtml(report.snapshotSequence)}</title><style>
  @page{size:A4;margin:18mm}*{box-sizing:border-box}body{font:12px system-ui,sans-serif;color:#161616;background:white;margin:0}h1{font-size:23px}h2{font-size:17px;margin-top:24px}h3{font-size:14px}p{line-height:1.5}small{display:block;font-size:10px;color:#444;overflow-wrap:anywhere}.coverage{border:1px solid #777;padding:12px}dl div{display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid #ddd;padding:6px 0}dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}table{border-collapse:collapse;width:100%;margin:12px 0;table-layout:fixed}th,td{border-bottom:1px solid #ddd;padding:7px;text-align:left;overflow-wrap:anywhere}td:last-child,th:last-child{text-align:right;font-variant-numeric:tabular-nums}thead{display:table-header-group}tr,dl div,.coverage{break-inside:avoid}h2,h3{break-after:avoid}.check{border-top:1px solid #777;padding-top:8px}.meta{overflow-wrap:anywhere}@media screen{body{max-width:850px;padding:24px;margin:auto}}
  </style></head><body><header><h1>EwaTrade financial report</h1><p>${escapeHtml(report.from.toISOString())} through ${escapeHtml(report.through.toISOString())} UTC · ${escapeHtml(report.currencyCode)}</p><p class="meta">Book ${escapeHtml(report.bookId)} · Journal snapshot ${escapeHtml(report.snapshotSequence)}<br>Bookkeeping starts ${escapeHtml(report.bookkeepingStartsAt.toISOString())} UTC</p><div class="coverage"><strong>Partial financial records — posted finance entries only</strong><p>Automatic Commerce posting and complete source coverage are not enabled. These totals do not represent complete business profit or financial position. Balanced journals do not prove complete records.</p><small>Coverage: ${escapeHtml(report.coverage)} · ${escapeHtml(report.completeness)}<br>Missing coverage: ${report.coverageGaps.map(escapeHtml).join("; ")}</small></div></header>
  <section><h2>Profit and loss — recorded entries</h2>${rows([
    ["Revenue", p.revenueMinor],
    ["Cost of sales", p.costOfSalesMinor],
    ["Gross profit", p.grossProfitMinor],
    ["Other expenses", p.expensesMinor],
    ["Net profit / loss", p.netProfitMinor],
  ])}${accounts(p.accounts, (i) => p.accounts[i]?.periodBalanceMinor ?? "0")}</section>
  <section><h2>Cash flow — recorded cash and bank entries</h2><p>Clearing balances are excluded. Transfers between included accounts cancel; opening imports and unclassified movements remain separate. Owner-paid bills do not move business cash.</p>${rows(
    [
      ["Opening cash and bank", c.openingMinor],
      ["Operating movement", c.operatingMinor],
      ["Owner financing movement", c.financingMinor],
      ["Transfers and clearing", c.transfersAndClearingMinor],
      ["Opening imports", c.openingAdjustmentsMinor],
      ["Unclassified movement", c.unclassifiedMinor],
      ["Net change", c.netChangeMinor],
      ["Closing cash and bank", c.closingMinor],
      ["Reconciliation difference", c.differenceMinor],
    ],
  )}<p class="check">Cash reconciled: ${c.reconciled ? "Yes" : "No"} · Classification complete: ${c.classificationComplete ? "Yes" : "No"}</p><table><thead><tr><th>Source / classification</th><th>Movement</th></tr></thead><tbody>${c.groups.map((g) => `<tr><td>${escapeHtml(g.sourceKind)} · ${escapeHtml(g.category)}</td><td>${money(g.netMinor)}</td></tr>`).join("")}</tbody></table></section>
  <section><h2>Balance sheet — recorded entries as of ${through}</h2><p>Cumulative balances include unclosed earnings through this date, independently of the profit-and-loss start date.</p>${[
    ["Assets", b.assets],
    ["Liabilities", b.liabilities],
    ["Posted equity", b.equity],
  ]
    .map(([title, values]) => {
      const list = values as typeof b.assets
      return `<h3>${title}</h3>${accounts(list, (i) => list[i]?.closingBalanceMinor ?? "0")}`
    })
    .join("")}${rows([
    ["Assets", b.assetsMinor],
    ["Liabilities", b.liabilitiesMinor],
    ["Posted equity", b.postedEquityMinor],
    ["Unclosed earnings", b.unclosedEarningsMinor],
    ["Total equity", b.totalEquityMinor],
    ["Liabilities and equity", b.liabilitiesAndEquityMinor],
    ["Equation difference", b.differenceMinor],
  ])}<p class="check">Balance sheet balanced: ${b.balanced ? "Yes" : "No"}</p></section>
  <section><h2>Trial balance as of ${through}</h2><table><thead><tr><th>Account</th><th>Debit</th><th>Credit</th></tr></thead><tbody>${t.accounts.map((a) => `<tr><td>${escapeHtml(a.code)} · ${escapeHtml(a.name)}<small>${escapeHtml(a.accountId)}</small></td><td>${money(a.closingDebitMinor)}</td><td>${money(a.closingCreditMinor)}</td></tr>`).join("")}<tr><th>Total</th><td>${money(t.debitMinor)}</td><td>${money(t.creditMinor)}</td></tr></tbody></table>${rows([["Journal difference", t.differenceMinor]])}<p class="check">Trial balance balanced: ${t.balanced ? "Yes" : "No"}. Equal debits and credits do not confirm complete records.</p></section><footer><p>Report amounts retain exact minor-unit precision. Use the CSV pack and import amount columns as text when auditing integer minor units.</p></footer></body></html>`
}
