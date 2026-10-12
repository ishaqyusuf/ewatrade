import { capabilityForAction } from "@ewatrade/assistant/capabilities/manifest"
import {
  generalActionSchema,
  generalReceiptSchema,
  type GeneralProposal,
} from "@ewatrade/assistant/general/contracts"

type HistoryRow = {
  id: string
  action: string
  actionVersion: number
  status: GeneralProposal["status"]
  payload: unknown
  executedResult: unknown
}
type Capability = ReturnType<typeof capabilityForAction>
type UnavailableReason =
  | "payload_unavailable"
  | "version_unavailable"
  | "receipt_unavailable"
  | "client_unavailable"

/** Historical formats cannot prevent valid messages/actions from loading or issue approvals. */
export async function projectGeneralProposalHistory<Row extends HistoryRow>(
  rows: Row[],
  options: {
    supports: (capability: Capability) => boolean
    read: (row: Row) => Promise<GeneralProposal>
  },
) {
  const unavailableProposals: Array<{
    id: string
    status: HistoryRow["status"]
    reason: UnavailableReason
  }> = []
  const available: Row[] = []
  const unavailable = (row: Row, reason: UnavailableReason) => {
    unavailableProposals.push({ id: row.id, status: row.status, reason })
  }
  for (const row of rows) {
    const parsed = generalActionSchema.safeParse(row.payload)
    if (!parsed.success) {
      unavailable(row, "payload_unavailable")
      continue
    }
    let capability: Capability
    try {
      capability = capabilityForAction(parsed.data.action)
    } catch {
      unavailable(row, "payload_unavailable")
      continue
    }
    if (
      row.action !== parsed.data.action ||
      row.actionVersion !== capability.version
    ) {
      unavailable(row, "version_unavailable")
      continue
    }
    if (!options.supports(capability)) {
      unavailable(row, "client_unavailable")
      continue
    }
    if (
      row.executedResult != null &&
      !generalReceiptSchema.safeParse(row.executedResult).success
    ) {
      unavailable(row, "receipt_unavailable")
      continue
    }
    available.push(row)
  }
  return {
    proposals: await Promise.all(available.map(options.read)),
    unavailableProposals,
  }
}
