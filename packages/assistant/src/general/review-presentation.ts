import { z } from "zod"

/**
 * One reviewable shape for every GENERAL draft: who and how much first, short
 * facts, an optional table and foldable sections. Server review builders fill
 * it next to their review lines; clients draw any draft from it and fall back
 * to the lines when it is absent. Display data only; never sent to the model.
 */
const text = (max: number) => z.string().max(max)

const fact = z
  .object({
    /** Omitted for a standalone fact such as "10 goods received". */
    label: text(40).optional(),
    value: text(160),
  })
  .strict()

const row = z
  .object({
    label: text(240),
    value: text(240),
    /** A smaller second line under the label. */
    detail: text(400).optional(),
  })
  .strict()

const column = z
  .object({ label: text(40), align: z.enum(["start", "end"]).optional() })
  .strict()

export const generalReviewPresentationSchema = z
  .object({
    summary: z
      .object({
        /** The counterparty or record the draft is about. */
        party: text(240),
        context: text(400).optional(),
        amount: text(60).optional(),
        /** What the amount is, e.g. "payable". */
        amountLabel: text(60).optional(),
      })
      .strict(),
    facts: z.array(fact).max(8).optional(),
    table: z
      .object({
        columns: z.array(column).min(1).max(4),
        rows: z
          .array(
            z
              .object({
                cells: z.array(text(200)).min(1).max(4),
                detail: text(240).optional(),
              })
              .strict(),
          )
          .max(60),
        total: z
          .object({ label: text(40), value: text(60) })
          .strict()
          .optional(),
        /** Rows shown before "+ n more"; the rest stay one click away. */
        preview: z.number().int().min(1).max(60).optional(),
      })
      .strict()
      .optional(),
    sections: z
      .array(
        z
          .object({
            title: text(60),
            /** Shown in the folded header, e.g. "10 items · 1 new category". */
            summary: text(160).optional(),
            rows: z.array(row).max(60).optional(),
            chips: z
              .array(
                z
                  .object({ label: text(120), isNew: z.boolean().optional() })
                  .strict(),
              )
              .max(60)
              .optional(),
            note: text(800).optional(),
          })
          .strict(),
      )
      .max(4)
      .optional(),
    note: text(800).optional(),
  })
  .strict()

export type GeneralReviewPresentation = z.infer<
  typeof generalReviewPresentationSchema
>
