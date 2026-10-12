import type { Prisma } from "@ewatrade/db"

/** Verification-only fault at the original assistant receipt write, after native execution. */
export function cashCountReceiptFault(
  tx: Prisma.TransactionClient,
  proposalId: string,
  fault: Error,
  observe: (receipt: unknown) => void,
): Prisma.TransactionClient {
  const proposals = new Proxy(tx.assistantActionProposal, {
    get(owner, key) {
      if (key === "update")
        return (input: Parameters<typeof owner.update>[0]) => {
          if (
            input.where.id === proposalId &&
            input.data.status === "COMPLETED"
          ) {
            observe(input.data.executedResult)
            throw fault
          }
          return owner.update(input)
        }
      const value = Reflect.get(owner, key)
      return typeof value === "function" ? value.bind(owner) : value
    },
  })
  return new Proxy(tx, {
    get(owner, key) {
      if (key === "assistantActionProposal") return proposals
      const value = Reflect.get(owner, key)
      return typeof value === "function" ? value.bind(owner) : value
    },
  })
}
