import { playRefundReviewAlert } from "../src/preview-fixtures"
import PlayRefundReviewAlertEmail from "../templates/play-refund-review-alert"

export default function Preview() {
  return <PlayRefundReviewAlertEmail input={playRefundReviewAlert} />
}
