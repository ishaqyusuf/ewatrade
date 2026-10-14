import { BusinessActivityError } from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"

export async function withBusinessActivityAvailability<T>(
  run: () => Promise<T>,
) {
  if (
    !["local", "dev"].includes(process.env.APP_ENV ?? "") ||
    // The root local/dev Bun launcher does not set NODE_ENV. APP_ENV remains
    // mandatory, and any explicit non-development NODE_ENV still refuses.
    (process.env.NODE_ENV !== undefined &&
      process.env.NODE_ENV !== "development")
  )
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Business Activity is not available in this environment yet.",
    })
  try {
    return await run()
  } catch (error) {
    if (error instanceof BusinessActivityError)
      throw new TRPCError({
        code: error.code,
        message: error.message,
        cause: error,
      })
    throw error
  }
}
