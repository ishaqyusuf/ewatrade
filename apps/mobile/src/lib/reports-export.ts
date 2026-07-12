export type RetailOpsReportCsvRow = {
  detail?: string
  label: string
  value: string
}

export type RetailOpsReportCsvSection = {
  rows: RetailOpsReportCsvRow[]
  title: string
}

export type RetailOpsReportCsvInput = {
  businessId?: string | null
  generatedAt: Date
  sections: RetailOpsReportCsvSection[]
  source: string
  syncDeviceFilter?: string | null
}

function escapeCsvCell(value: string) {
  if (!/[",\n\r]/.test(value)) return value

  return `"${value.replace(/"/g, '""')}"`
}

function formatCsvRow(values: string[]) {
  return values.map(escapeCsvCell).join(",")
}

export function buildRetailOpsReportCsv(input: RetailOpsReportCsvInput) {
  const rows = [
    ["Ewatrade Retail Ops report"],
    ["Generated at", input.generatedAt.toISOString()],
    ["Report source", input.source],
    ["Business", input.businessId ?? "current business"],
    ["Sync device filter", input.syncDeviceFilter ?? "all devices"],
    [],
    ["Section", "Label", "Value", "Detail"],
  ]

  for (const section of input.sections) {
    if (section.rows.length === 0) {
      rows.push([section.title, "No rows", "", ""])
      continue
    }

    for (const row of section.rows) {
      rows.push([section.title, row.label, row.value, row.detail ?? ""])
    }
  }

  return `${rows.map(formatCsvRow).join("\n")}\n`
}
