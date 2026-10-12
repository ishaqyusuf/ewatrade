import { z } from "zod"

/** Read navigation only; native directory still validates cursor/filters and fresh authority. */
export const staffDirectoryTargetSchema = z
  .object({
    kind: z.literal("staff_directory"),
    filters: z
      .object({
        search: z.string().trim().min(1).max(120).optional(),
        role: z
          .enum([
            "OWNER",
            "ADMIN",
            "MANAGER",
            "CASHIER",
            "OPERATOR",
            "SUPPORT",
            "MEMBER",
          ])
          .optional(),
        status: z
          .enum(["ACTIVE", "INVITED", "SUSPENDED", "REMOVED"])
          .optional(),
        assignmentStoreId: z.string().trim().min(1).max(160).optional(),
        cursor: z.string().min(1).max(1024).optional(),
      })
      .strict(),
  })
  .strict()
