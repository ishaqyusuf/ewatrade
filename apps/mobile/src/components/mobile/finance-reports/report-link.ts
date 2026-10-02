export function prepareFinanceReportLink(
  accountId: string,
  from: string,
  through: string,
  snapshot: string,
  startsAt: Date,
) {
  const start = new Date(from)
  const end = new Date(through)
  if (
    !accountId.trim() ||
    accountId.length > 128 ||
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    start < startsAt ||
    end < start ||
    !/^(0|[1-9]\d{0,18})$/.test(snapshot) ||
    BigInt(snapshot) > BigInt("9223372036854775807")
  )
    throw new Error(
      "This report account link has invalid dates or snapshot. Open it again from Financial reports.",
    )
  return { accountId, from: start, through: end, snapshotSequence: snapshot }
}
