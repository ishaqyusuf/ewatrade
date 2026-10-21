import { Badge } from "@ewatrade/ui"

const LABELS: Record<string, string> = {
  deleted: "Deleted",
  pending_retrieval: "Downloading",
  pending_upload: "Uploading",
  quarantined: "Held for checking",
  rejected: "Blocked as unsafe",
  retention_hold: "Kept for records",
  retryable: "Check failed, will retry",
  safe: "Passed the safety check",
  safety_pending: "Being checked",
  stored: "Saved",
}

export function MediaStatus({ lifecycle }: { lifecycle: string }) {
  return <Badge variant="secondary">{LABELS[lifecycle] ?? "Unavailable"}</Badge>
}
