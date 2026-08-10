import { Badge } from "@ewatrade/ui"

const LABELS: Record<string, string> = {
  deleted: "Deleted",
  pending_retrieval: "Retrieving",
  pending_upload: "Uploading",
  quarantined: "Quarantined",
  rejected: "Rejected",
  retention_hold: "Retention hold",
  retryable: "Needs retry",
  safe: "Safe to review",
  safety_pending: "Safety review",
  stored: "Stored",
}

export function MediaStatus({ lifecycle }: { lifecycle: string }) {
  return <Badge variant="secondary">{LABELS[lifecycle] ?? "Unavailable"}</Badge>
}
