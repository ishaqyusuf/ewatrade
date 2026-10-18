/** The shared OTP sender stays outside merchant routing while assistant access is off. */
export function customerWhatsAppEvents<T extends { phoneNumberId: string }>(
  events: readonly T[],
  platformPhoneNumberId: string | undefined,
): T[] {
  const configured = platformPhoneNumberId?.trim()
  if (!configured || !/^\d+$/.test(configured)) return [...events]
  return events.filter((event) => event.phoneNumberId !== configured)
}
