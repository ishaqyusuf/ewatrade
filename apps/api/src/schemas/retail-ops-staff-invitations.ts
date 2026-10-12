import { z } from "zod"
export {
  staffInvitationCommandInput,
  staffInvitationCommandReviewInput,
} from "@ewatrade/db/queries"
const id = z.string().trim().min(1).max(160)
export const staffInvitationCommandReadSchema = z
  .object({ commandId: id })
  .strict()
export const staffInvitationsReadSchema = z
  .object({ membershipId: id })
  .strict()
