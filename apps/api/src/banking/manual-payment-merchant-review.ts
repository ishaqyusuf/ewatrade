import type { readManualPaymentReportFundsReview } from "@ewatrade/db/queries"

type FundsReview = Awaited<
  ReturnType<typeof readManualPaymentReportFundsReview>
>
export function isManualPaymentFinanceReviewer(role: string) {
  return role === "OWNER" || role === "ADMIN"
}

/** Used by actual merchant report projection; Sales reads never query finance data. */
export async function projectMerchantPaymentFundsReview(
  role: string,
  load: () => Promise<FundsReview>,
) {
  if (!isManualPaymentFinanceReviewer(role))
    return {
      customerFundsReview: null,
      customerFundsReviewState: "forbidden" as const,
    }
  try {
    const review = await load()
    return {
      customerFundsReview: review,
      customerFundsReviewState: review
        ? ("ready" as const)
        : ("not_configured" as const),
    }
  } catch {
    return {
      customerFundsReview: null,
      customerFundsReviewState: "unavailable" as const,
    }
  }
}
