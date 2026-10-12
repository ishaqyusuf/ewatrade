import { serviceWorkOriginalInput } from "@ewatrade/db/service-work-original"
import {
  readGeneralServiceWorkEditorContext,
  readGeneralServiceWorkOriginal,
  reviewGeneralServiceWork,
  serviceWorkEditorContextInput,
  serviceWorkReviewInput,
} from "../../assistant/general-service-work-queries"
import { createTRPCRouter, protectedProcedure } from "../init"

/** Authenticated original records and preparation; no lifecycle mutation here. */
export const serviceAssistantWorkRouter = createTRPCRouter({
  editorContext: protectedProcedure
    .input(serviceWorkEditorContextInput)
    .query(({ ctx, input }) => readGeneralServiceWorkEditorContext(ctx, input)),
  review: protectedProcedure
    .input(serviceWorkReviewInput)
    .query(({ ctx, input }) => reviewGeneralServiceWork(ctx, input)),
  original: protectedProcedure
    .input(serviceWorkOriginalInput)
    .query(({ ctx, input }) => readGeneralServiceWorkOriginal(ctx, input)),
})
