import { readFile } from "node:fs/promises"

const path = new URL(
  "../.brain/tasks/2026-10-02-cat02-ticket-progress.md",
  import.meta.url,
)
const source = await readFile(path, "utf8")
const tickets = [...source.matchAll(/^- \[([ x])\] (C\d{2}) — (.+)$/gm)]
const unique = new Set(tickets.map((ticket) => ticket[2]))
if (tickets.length !== 54 || unique.size !== tickets.length)
  throw new Error("CAT02 progress requires 54 unique canonical ticket IDs.")
const completed = tickets.filter((ticket) => ticket[1] === "x").length
console.log(
  JSON.stringify({
    completed,
    total: tickets.length,
    pending: tickets.length - completed,
    percent: Number(((completed / tickets.length) * 100).toFixed(1)),
    pendingIds: tickets
      .filter((ticket) => ticket[1] !== "x")
      .map((ticket) => ticket[2]),
  }),
)
