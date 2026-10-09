import { generalAssistantAvailability } from "../../assistant/general-availability"
import { createTRPCRouter, protectedProcedure } from "../init"
export const assistantRouter = createTRPCRouter({
  availability: protectedProcedure.query(() =>
    generalAssistantAvailability(process.env),
  ),
})
