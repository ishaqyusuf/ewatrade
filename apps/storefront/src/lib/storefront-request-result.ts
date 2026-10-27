/** Return an honest retry state without remounting the controlled customer form. */
export async function storefrontRequestResult<T>(
  submit: () => Promise<T>,
  unavailable: (error: unknown) => boolean,
) {
  try {
    return { kind: "received" as const, receipt: await submit() }
  } catch (error) {
    return {
      kind: "error" as const,
      message: unavailable(error)
        ? "We couldn’t send this request. The service may have changed. Refresh to check availability, or enquire with the business on WhatsApp."
        : "We couldn’t confirm your request. Your details are still here. Try again to check the same request.",
    }
  }
}
