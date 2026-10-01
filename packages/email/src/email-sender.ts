const ADDRESS = "[^\\s@<>,]+@[^\\s@<>,]+\\.[^\\s@<>,]+"
const PLAIN_SENDER = new RegExp(`^${ADDRESS}$`)
const NAMED_SENDER = new RegExp(`^[^<>\\r\\n,]{1,100} <${ADDRESS}>$`)

/** Accept the two sender shapes supported by our Resend transport. */
export function isValidEmailSender(value: string | undefined): boolean {
  const sender = value?.trim() ?? ""
  return PLAIN_SENDER.test(sender) || NAMED_SENDER.test(sender)
}
