import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const ROOT = "/Users/M1PRO/Documents/code/ewatrade";
const OUTPUT_DIR = `${ROOT}/outputs/ewatrade-prescription-commerce-commercialization`;
const PREVIEW_DIR = `${ROOT}/tmp/commercialization/previews`;
const OUTPUT = `${OUTPUT_DIR}/ewatrade-prescription-commerce-commercial-model.xlsx`;

const C = {
  green: "#079447",
  greenDark: "#056333",
  greenSoft: "#EAF7EF",
  ink: "#111827",
  muted: "#667085",
  line: "#D9E1DD",
  light: "#F5F7F6",
  yellow: "#FFF4CC",
  amber: "#F5A524",
  red: "#D14343",
  redSoft: "#FDECEC",
  blue: "#0000FF",
  white: "#FFFFFF",
  black: "#000000",
  linked: "#008000",
};

const ngn = '"NGN" #,##0;[Red]("NGN" #,##0);-';
const countFmt = '#,##0;[Red](#,##0);-';
const pctFmt = '0.0%;[Red](0.0%);-';

function titleBand(sheet, title, subtitle, lastCol) {
  sheet.showGridLines = false;
  sheet.getRange(`A1:${lastCol}1`).merge();
  sheet.getRange("A1").values = [[title]];
  sheet.getRange(`A1:${lastCol}1`).format = {
    fill: C.greenDark,
    font: { bold: true, color: C.white, size: 18 },
    verticalAlignment: "center",
  };
  sheet.getRange(`A1:${lastCol}1`).format.rowHeight = 34;
  sheet.getRange(`A2:${lastCol}2`).merge();
  sheet.getRange("A2").values = [[subtitle]];
  sheet.getRange(`A2:${lastCol}2`).format = {
    fill: C.greenSoft,
    font: { color: C.greenDark, size: 10 },
    wrapText: true,
    verticalAlignment: "center",
  };
  sheet.getRange(`A2:${lastCol}2`).format.rowHeight = 30;
}

function section(sheet, range, label) {
  sheet.getRange(range).merge();
  const cell = range.split(":")[0];
  sheet.getRange(cell).values = [[label]];
  sheet.getRange(range).format = {
    fill: C.ink,
    font: { bold: true, color: C.white, size: 10 },
    verticalAlignment: "center",
  };
  sheet.getRange(range).format.rowHeight = 22;
}

function header(sheet, range) {
  sheet.getRange(range).format = {
    fill: C.green,
    font: { bold: true, color: C.white, size: 9 },
    wrapText: true,
    verticalAlignment: "center",
    borders: { preset: "inside", style: "thin", color: C.greenDark },
  };
}

function bodyBorder(sheet, range) {
  sheet.getRange(range).format.borders = {
    insideHorizontal: { style: "thin", color: C.line },
    bottom: { style: "thin", color: C.line },
  };
}

function setWidths(sheet, widths) {
  for (const [col, width] of Object.entries(widths)) {
    sheet.getRange(`${col}:${col}`).format.columnWidth = width;
  }
}

function inputStyle(sheet, range) {
  sheet.getRange(range).format = {
    fill: C.yellow,
    font: { color: C.blue },
  };
}

function statusConditional(range) {
  range.conditionalFormats.add("containsText", {
    text: "OK",
    format: { fill: C.greenSoft, font: { bold: true, color: C.greenDark } },
  });
  range.conditionalFormats.add("containsText", {
    text: "PASS",
    format: { fill: C.greenSoft, font: { bold: true, color: C.greenDark } },
  });
  range.conditionalFormats.add("containsText", {
    text: "FAIL",
    format: { fill: C.redSoft, font: { bold: true, color: C.red } },
  });
  range.conditionalFormats.add("containsText", {
    text: "ATTENTION",
    format: { fill: C.yellow, font: { bold: true, color: "#8A5A00" } },
  });
}

const wb = Workbook.create();
const summary = wb.worksheets.add("Summary");
const assumptions = wb.worksheets.add("Assumptions");
const unit = wb.worksheets.add("Unit Economics");
const forecast = wb.worksheets.add("24-Month Plan");
const scenarios = wb.worksheets.add("Scenarios");
const pilot = wb.worksheets.add("Pilot Data");
const kpi = wb.worksheets.add("KPI Scorecard");
const research = wb.worksheets.add("Research Inputs");
const sources = wb.worksheets.add("Sources & Notes");
const checks = wb.worksheets.add("Checks");

wb.comments.setSelf({ displayName: "EwaTrade" });

// Assumptions
titleBand(
  assumptions,
  "Commercial Model Assumptions",
  "Blue/yellow cells are editable hypotheses. Replace them with pharmacy and pilot data before a commercial decision.",
  "F",
);
assumptions.getRange("A4").values = [["Active scenario"]];
assumptions.getRange("B4").values = [["Base"]];
assumptions.getRange("B4").dataValidation = {
  rule: { type: "list", values: ["Conservative", "Base", "Growth"] },
};
inputStyle(assumptions, "B4");
assumptions.getRange("D4:F5").values = [
  ["Formatting legend", null, null],
  ["Editable assumption", "Formula", "Cross-sheet link"],
];
assumptions.getRange("D4:F4").merge();
assumptions.getRange("D4:F4").format = {
  fill: C.ink,
  font: { bold: true, color: C.white },
};
assumptions.getRange("D5").format = { fill: C.yellow, font: { color: C.blue } };
assumptions.getRange("E5").format = { font: { color: C.black } };
assumptions.getRange("F5").format = { font: { color: C.linked } };

assumptions.getRange("A8:F8").values = [[
  "Driver",
  "Active",
  "Conservative",
  "Base",
  "Growth",
  "Unit / note",
]];
header(assumptions, "A8:F8");

const assumptionRows = [
  ["Monthly prescription requests per branch", null, 600, 1500, 3000, "requests"],
  ["Valid request to quote rate", null, 0.8, 0.9, 0.95, "% of requests"],
  ["Quote to paid conversion", null, 0.35, 0.5, 0.6, "% of quotes"],
  ["Delivery share of paid orders", null, 0.2, 0.35, 0.45, "% of paid orders"],
  ["Average customer delivery fee", null, 1200, 1500, 1800, "NGN"],
  ["Implementation fee per new branch", null, 250000, 350000, 500000, "NGN"],
  ["Monthly platform subscription per branch", null, 100000, 150000, 250000, "NGN"],
  ["Completed prescription order fee", null, 100, 150, 200, "NGN/order"],
  ["EwaTrade delivery coordination margin", null, 0.1, 0.15, 0.2, "% of delivery fee"],
  ["OCR/vision cost per request", null, 30, 25, 20, "NGN/request"],
  ["Messaging cost per request", null, 20, 18, 15, "NGN/request"],
  ["Storage and security cost per request", null, 15, 12, 10, "NGN/request"],
  ["Fixed support cost per branch per month", null, 60000, 50000, 45000, "NGN/month"],
  ["Maximum branches in 24-month plan", null, 3, 8, 15, "branches"],
  ["Branch activation cadence", null, 8, 4, 2, "months/new branch"],
  ["Average medicine basket", null, 15000, 25000, 40000, "NGN/order"],
  ["Pharmacy gross margin on medicine basket", null, 0.15, 0.2, 0.25, "% of basket"],
  ["Share of paid orders considered recovered", null, 0.1, 0.15, 0.2, "% of paid orders"],
  ["Monthly EwaTrade product overhead", null, 300000, 500000, 800000, "NGN/company"],
];
assumptions.getRange(`A9:F${8 + assumptionRows.length}`).values = assumptionRows;
for (let row = 9; row <= 8 + assumptionRows.length; row += 1) {
  assumptions.getRange(`B${row}`).formulas = [[
    `=IF($B$4="Conservative",C${row},IF($B$4="Base",D${row},E${row}))`,
  ]];
}
assumptions.getRange("B9:B27").format.font = { color: C.black };
inputStyle(assumptions, "C9:E27");
bodyBorder(assumptions, "A9:F27");
assumptions.getRange("B9:E9").format.numberFormat = countFmt;
for (const r of [10, 11, 12, 17, 25, 26]) {
  assumptions.getRange(`B${r}:E${r}`).format.numberFormat = pctFmt;
}
for (const r of [13, 14, 15, 16, 18, 19, 20, 21, 24, 27]) {
  assumptions.getRange(`B${r}:E${r}`).format.numberFormat = ngn;
}
for (const r of [22, 23]) assumptions.getRange(`B${r}:E${r}`).format.numberFormat = countFmt;
assumptions.freezePanes.freezeRows(8);
setWidths(assumptions, { A: 40, B: 16, C: 16, D: 16, E: 16, F: 24 });
assumptions.getRange("A9:F27").format.wrapText = true;
assumptions.getRange("C9:E27").format.horizontalAlignment = "right";
for (const cell of ["C9", "D9", "E9", "C15", "D15", "E15"]) {
  wb.comments.addThread(
    { cell: assumptions.getRange(cell) },
    "Illustrative pricing/volume hypothesis. Replace with observed pharmacy or pilot evidence.",
  );
}

// Unit economics
titleBand(
  unit,
  "Unit Economics",
  "Active-scenario monthly economics for one pharmacy branch. Delivery fee revenue is shown only as EwaTrade coordination margin.",
  "D",
);
unit.getRange("A4:D4").values = [["Metric", "Value", "Unit", "Interpretation"]];
header(unit, "A4:D4");
section(unit, "A5:D5", "VOLUME");
unit.getRange("A6:D9").values = [
  ["Prescription requests", null, "requests/month", "All valid and invalid intake attempts"],
  ["Quotes issued", null, "quotes/month", "Requests that reach a pharmacist-approved quote"],
  ["Paid orders", null, "orders/month", "Quoted requests converted to payment"],
  ["Delivery orders", null, "orders/month", "Paid orders selecting delivery"],
];
unit.getRange("B6:B9").formulas = [
  ["='Assumptions'!B9"],
  ["=B6*'Assumptions'!B10"],
  ["=B7*'Assumptions'!B11"],
  ["=B8*'Assumptions'!B12"],
];
section(unit, "A11:D11", "EWATRADE REVENUE");
unit.getRange("A12:D16").values = [
  ["Platform subscription", null, "NGN/month", "Recurring branch fee"],
  ["Completed-order fees", null, "NGN/month", "Paid orders multiplied by fixed success fee"],
  ["Delivery coordination margin", null, "NGN/month", "Margin retained from customer-paid delivery fees"],
  ["Implementation fee amortised", null, "NGN/month", "Setup fee divided over twelve months for unit view"],
  ["Total monthly revenue", null, "NGN/month", "Recurring plus amortised implementation revenue"],
];
unit.getRange("B12:B16").formulas = [
  ["='Assumptions'!B15"],
  ["=B8*'Assumptions'!B16"],
  ["=B9*'Assumptions'!B13*'Assumptions'!B17"],
  ["='Assumptions'!B14/12"],
  ["=SUM(B12:B15)"],
];
section(unit, "A18:D18", "DIRECT COST AND CONTRIBUTION");
unit.getRange("A19:D25").values = [
  ["Request-processing cost", null, "NGN/month", "OCR, messaging, storage, and security"],
  ["Branch support cost", null, "NGN/month", "Operational support allocation"],
  ["Total direct cost", null, "NGN/month", "Request-processing plus branch support"],
  ["Monthly contribution", null, "NGN/month", "Revenue after direct cost"],
  ["Contribution margin", null, "%", "Contribution divided by revenue"],
  ["Revenue per request", null, "NGN/request", "Total monthly revenue divided by request volume"],
  ["Contribution per request", null, "NGN/request", "Monthly contribution divided by request volume"],
];
unit.getRange("B19:B25").formulas = [
  ["=B6*SUM('Assumptions'!B18:B20)"],
  ["='Assumptions'!B21"],
  ["=SUM(B19:B20)"],
  ["=B16-B21"],
  ["=IFERROR(B22/B16,0)"],
  ["=IFERROR(B16/B6,0)"],
  ["=IFERROR(B22/B6,0)"],
];
section(unit, "A27:D27", "ILLUSTRATIVE PHARMACY VALUE");
unit.getRange("A28:D31").values = [
  ["Gross profit represented by paid orders", null, "NGN/month", "Paid medicine value multiplied by pharmacy gross margin"],
  ["Estimated recovered pharmacy gross profit", null, "NGN/month", "Share of order gross profit assumed incremental or retained"],
  ["Estimated monthly EwaTrade cost to pharmacy", null, "NGN/month", "Subscription, order fees, and amortised implementation"],
  ["Illustrative pharmacy value multiple", null, "x", "Recovered gross profit divided by pharmacy-paid EwaTrade fees"],
];
unit.getRange("B28:B31").formulas = [
  ["=B8*'Assumptions'!B24*'Assumptions'!B25"],
  ["=B28*'Assumptions'!B26"],
  ["=B12+B13+B15"],
  ["=IFERROR(B29/B30,0)"],
];
unit.getRange("B6:B31").format.font = { color: C.linked };
for (const r of [12,13,14,15,16,19,20,21,22,24,25,28,29,30]) unit.getRange(`B${r}`).format.numberFormat = ngn;
unit.getRange("B23").format.numberFormat = pctFmt;
unit.getRange("B31").format.numberFormat = "0.0x";
unit.getRange("B6:B9").format.numberFormat = countFmt;
bodyBorder(unit, "A6:D9");
bodyBorder(unit, "A12:D16");
bodyBorder(unit, "A19:D25");
bodyBorder(unit, "A28:D31");
unit.getRange("A16:D16").format.font = { bold: true };
unit.getRange("A22:D23").format.font = { bold: true };
setWidths(unit, { A: 36, B: 18, C: 18, D: 55 });
unit.getRange("A4:D31").format.wrapText = true;
unit.freezePanes.freezeRows(4);

// Scenario comparison
titleBand(
  scenarios,
  "Scenario Comparison",
  "Three illustrative cases using the editable assumptions. This is not a forecast of actual demand.",
  "H",
);
scenarios.getRange("A5:H5").values = [[
  "Scenario", "Requests", "Paid orders", "Monthly revenue", "Direct cost", "Contribution", "Margin", "Pharmacy value multiple",
]];
header(scenarios, "A5:H5");
scenarios.getRange("A6:A8").values = [["Conservative"], ["Base"], ["Growth"]];
for (let i = 0; i < 3; i += 1) {
  const row = 6 + i;
  const col = ["C", "D", "E"][i];
  scenarios.getRange(`B${row}:H${row}`).formulas = [[
    `='Assumptions'!${col}9`,
    `=B${row}*'Assumptions'!${col}10*'Assumptions'!${col}11`,
    `='Assumptions'!${col}15+C${row}*'Assumptions'!${col}16+C${row}*'Assumptions'!${col}12*'Assumptions'!${col}13*'Assumptions'!${col}17+'Assumptions'!${col}14/12`,
    `=B${row}*SUM('Assumptions'!${col}18:${col}20)+'Assumptions'!${col}21`,
    `=D${row}-E${row}`,
    `=IFERROR(F${row}/D${row},0)`,
    `=IFERROR((C${row}*'Assumptions'!${col}24*'Assumptions'!${col}25*'Assumptions'!${col}26)/('Assumptions'!${col}15+C${row}*'Assumptions'!${col}16+'Assumptions'!${col}14/12),0)`,
  ]];
}
scenarios.getRange("B6:H8").format.font = { color: C.linked };
scenarios.getRange("B6:C8").format.numberFormat = countFmt;
scenarios.getRange("D6:F8").format.numberFormat = ngn;
scenarios.getRange("G6:G8").format.numberFormat = pctFmt;
scenarios.getRange("H6:H8").format.numberFormat = "0.0x";
bodyBorder(scenarios, "A6:H8");
setWidths(scenarios, { A: 18, B: 15, C: 15, D: 19, E: 18, F: 18, G: 13, H: 22 });
scenarios.freezePanes.freezeRows(5);

// 24-month model
titleBand(
  forecast,
  "24-Month Commercial Plan",
  "Formula-driven branch ramp and monthly contribution based on the selected scenario. Company product overhead is shown separately.",
  "Q",
);
forecast.getRange("A5:Q5").values = [[
  "Month", "Month #", "Branches", "New branches", "Requests", "Quotes", "Paid orders", "Delivery orders",
  "Platform revenue", "Implementation revenue", "Order-fee revenue", "Delivery-margin revenue", "Total revenue",
  "Request-processing cost", "Branch support cost", "Branch contribution", "Contribution after product overhead",
]];
header(forecast, "A5:Q5");
const months = [];
for (let i = 0; i < 24; i += 1) months.push([new Date(2026, 8 + i, 1), i + 1]);
forecast.getRange("A6:B29").values = months;
forecast.getRange("A6:A29").format.numberFormat = "mmm yyyy";
forecast.getRange("C6:Q6").formulas = [[
  "=MIN('Assumptions'!$B$22,1+INT((B6-1)/'Assumptions'!$B$23))",
  "=C6",
  "=C6*'Assumptions'!$B$9",
  "=E6*'Assumptions'!$B$10",
  "=F6*'Assumptions'!$B$11",
  "=G6*'Assumptions'!$B$12",
  "=C6*'Assumptions'!$B$15",
  "=D6*'Assumptions'!$B$14",
  "=G6*'Assumptions'!$B$16",
  "=H6*'Assumptions'!$B$13*'Assumptions'!$B$17",
  "=SUM(I6:L6)",
  "=E6*SUM('Assumptions'!$B$18:$B$20)",
  "=C6*'Assumptions'!$B$21",
  "=M6-N6-O6",
  "=P6-'Assumptions'!$B$27",
]];
forecast.getRange("C6:Q29").fillDown();
forecast.getRange("D7").formulas = [["=MAX(0,C7-C6)"]];
forecast.getRange("D7:D29").fillDown();
forecast.getRange("C6:Q29").format.font = { color: C.linked };
forecast.getRange("C6:H29").format.numberFormat = countFmt;
forecast.getRange("I6:Q29").format.numberFormat = ngn;
bodyBorder(forecast, "A6:Q29");
forecast.freezePanes.freezeRows(5);
forecast.freezePanes.freezeColumns(2);
setWidths(forecast, {
  A: 14, B: 10, C: 11, D: 12, E: 14, F: 14, G: 14, H: 14,
  I: 18, J: 20, K: 18, L: 20, M: 18, N: 20, O: 18, P: 19, Q: 24,
});

// Pilot data entry
titleBand(
  pilot,
  "Pilot Request Data",
  "Administrative measurement only. Do not enter patient names, phone numbers, diagnoses, medicine details, or prescription-image links.",
  "Z",
);
pilot.getRange("A4:Z4").values = [[
  "Request ID", "Request date", "Channel", "Source type", "Source/partner code", "Valid request?", "Image clarification?",
  "Lines submitted", "Lines corrected", "Quote issued?", "Minutes to quote", "Availability outcome", "Quote value NGN",
  "Paid?", "Paid value NGN", "Fulfilment choice", "Delivery zone", "Delivery fee NGN", "Promise time", "Ready/handoff time",
  "Ready on promise?", "Cancelled/refunded?", "Pharmacy error?", "Safety incident?", "Privacy incident?", "Notes",
]];
header(pilot, "A4:Z4");
pilot.getRange("A5:Z204").format.borders = {
  insideHorizontal: { style: "thin", color: C.line },
};
pilot.getRange("A5:T204").format.font = { color: C.blue };
pilot.getRange("V5:Z204").format.font = { color: C.blue };
pilot.getRange("U5").formulas = [["=IF(OR(S5=\"\",T5=\"\"),\"\",IF(T5<=S5,\"Yes\",\"No\"))"]];
pilot.getRange("U5:U204").fillDown();
pilot.getRange("U5:U204").format.font = { color: C.black };
pilot.getRange("B5:B204").format.numberFormat = "yyyy-mm-dd";
pilot.getRange("M5:M204").format.numberFormat = ngn;
pilot.getRange("O5:O204").format.numberFormat = ngn;
pilot.getRange("R5:R204").format.numberFormat = ngn;
pilot.getRange("S5:T204").format.numberFormat = "yyyy-mm-dd hh:mm";
pilot.getRange("H5:I204").format.numberFormat = countFmt;
pilot.getRange("K5:K204").format.numberFormat = "0.0";
pilot.getRange("C5:C204").dataValidation = { rule: { type: "list", values: ["Web", "WhatsApp", "Staff-assisted", "Storefront", "App"] } };
pilot.getRange("D5:D204").dataValidation = { rule: { type: "list", values: ["Hospital", "Clinic", "Doctor", "Diagnostic centre", "Pharmacy QR", "Website/social", "Repeat customer", "Other"] } };
for (const col of ["F", "G", "J", "N", "V", "W", "X", "Y"]) {
  pilot.getRange(`${col}5:${col}204`).dataValidation = { rule: { type: "list", values: ["Yes", "No"] } };
}
pilot.getRange("L5:L204").dataValidation = { rule: { type: "list", values: ["Full", "Partial", "Unavailable", "Clarification required", "Declined"] } };
pilot.getRange("P5:P204").dataValidation = { rule: { type: "list", values: ["Pickup", "Delivery"] } };
pilot.getRange("Q5:Q204").dataValidation = { rule: { type: "list", values: ["Not applicable", "Hospital/campus fixed zone", "Nearby zone", "Citywide zone", "Approved long-distance lane", "Manual quote"] } };
pilot.tables.add("A4:Z204", true, "PilotRequestData");
pilot.freezePanes.freezeRows(4);
pilot.freezePanes.freezeColumns(2);
setWidths(pilot, {
  A: 16, B: 14, C: 16, D: 20, E: 20, F: 14, G: 18, H: 14, I: 14, J: 14, K: 16, L: 22, M: 17,
  N: 11, O: 17, P: 18, Q: 26, R: 17, S: 20, T: 20, U: 18, V: 19, W: 17, X: 17, Y: 17, Z: 36,
});

// KPI scorecard
titleBand(
  kpi,
  "Pilot KPI Scorecard",
  "Targets are provisional decision gates. Metrics calculate from the Pilot Data sheet and stay blank until data is entered.",
  "G",
);
kpi.getRange("A4:G4").values = [["Type", "Metric", "Actual", "Target", "Status", "Calculation", "Decision use"]];
header(kpi, "A4:G4");
const kpiRows = [
  ["Primary", "Quote-to-paid conversion", null, 0.5, null, "Paid orders / quotes issued", "Tests whether the workflow creates commercial value"],
  ["Primary", "Median quotation turnaround", null, 10, null, "Median minutes from valid request to quote", "Tests whether digital intake is meaningfully faster"],
  ["Primary", "Ready-on-promise rate", null, 0.95, null, "Orders ready by promised handoff / due orders", "Tests fulfilment reliability"],
  ["Driver", "Image-clarification rate", null, 0.15, null, "Requests requiring clearer image / valid requests", "Shows customer capture friction"],
  ["Driver", "OCR line-correction rate", null, 0.2, null, "Corrected lines / submitted lines", "Sizes transcription quality and staff workload"],
  ["Driver", "Full-availability rate", null, 0.6, null, "Full quotes / quotes issued", "Shows stock coverage"],
  ["Driver", "Delivery selection rate", null, 0.3, null, "Delivery orders / paid orders", "Sizes dispatch demand"],
  ["Guardrail", "Safety incidents", null, 0, null, "Count of requests with a safety incident", "Must remain zero"],
  ["Guardrail", "Privacy incidents", null, 0, null, "Count of requests with a privacy incident", "Must remain zero"],
  ["Guardrail", "Pharmacy-error rate", null, 0, null, "Requests with pharmacy error / paid orders", "Protects dispensing and packing quality"],
];
kpi.getRange("A5:G14").values = kpiRows;
kpi.getRange("C5:C14").formulas = [
  ["=IF(COUNTIF('Pilot Data'!$J$5:$J$204,\"Yes\")=0,\"\",COUNTIF('Pilot Data'!$N$5:$N$204,\"Yes\")/COUNTIF('Pilot Data'!$J$5:$J$204,\"Yes\"))"],
  ["=IF(COUNT('Pilot Data'!$K$5:$K$204)=0,\"\",MEDIAN('Pilot Data'!$K$5:$K$204))"],
  ["=IF(COUNTIF('Pilot Data'!$U$5:$U$204,\"Yes\")+COUNTIF('Pilot Data'!$U$5:$U$204,\"No\")=0,\"\",COUNTIF('Pilot Data'!$U$5:$U$204,\"Yes\")/(COUNTIF('Pilot Data'!$U$5:$U$204,\"Yes\")+COUNTIF('Pilot Data'!$U$5:$U$204,\"No\")))"],
  ["=IF(COUNTIF('Pilot Data'!$F$5:$F$204,\"Yes\")=0,\"\",COUNTIF('Pilot Data'!$G$5:$G$204,\"Yes\")/COUNTIF('Pilot Data'!$F$5:$F$204,\"Yes\"))"],
  ["=IF(SUM('Pilot Data'!$H$5:$H$204)=0,\"\",SUM('Pilot Data'!$I$5:$I$204)/SUM('Pilot Data'!$H$5:$H$204))"],
  ["=IF(COUNTIF('Pilot Data'!$J$5:$J$204,\"Yes\")=0,\"\",COUNTIF('Pilot Data'!$L$5:$L$204,\"Full\")/COUNTIF('Pilot Data'!$J$5:$J$204,\"Yes\"))"],
  ["=IF(COUNTIF('Pilot Data'!$N$5:$N$204,\"Yes\")=0,\"\",COUNTIF('Pilot Data'!$P$5:$P$204,\"Delivery\")/COUNTIF('Pilot Data'!$N$5:$N$204,\"Yes\"))"],
  ["=IF(COUNTA('Pilot Data'!$A$5:$A$204)=0,\"\",COUNTIF('Pilot Data'!$X$5:$X$204,\"Yes\"))"],
  ["=IF(COUNTA('Pilot Data'!$A$5:$A$204)=0,\"\",COUNTIF('Pilot Data'!$Y$5:$Y$204,\"Yes\"))"],
  ["=IF(COUNTIF('Pilot Data'!$N$5:$N$204,\"Yes\")=0,\"\",COUNTIF('Pilot Data'!$W$5:$W$204,\"Yes\")/COUNTIF('Pilot Data'!$N$5:$N$204,\"Yes\"))"],
];
kpi.getRange("E5:E14").formulas = [
  ["=IF(C5=\"\",\"NO DATA\",IF(C5>=D5,\"PASS\",\"ATTENTION\"))"],
  ["=IF(C6=\"\",\"NO DATA\",IF(C6<=D6,\"PASS\",\"ATTENTION\"))"],
  ["=IF(C7=\"\",\"NO DATA\",IF(C7>=D7,\"PASS\",\"ATTENTION\"))"],
  ["=IF(C8=\"\",\"NO DATA\",IF(C8<=D8,\"PASS\",\"ATTENTION\"))"],
  ["=IF(C9=\"\",\"NO DATA\",IF(C9<=D9,\"PASS\",\"ATTENTION\"))"],
  ["=IF(C10=\"\",\"NO DATA\",IF(C10>=D10,\"PASS\",\"ATTENTION\"))"],
  ["=IF(C11=\"\",\"NO DATA\",IF(C11>=D11,\"PASS\",\"ATTENTION\"))"],
  ["=IF(C12=\"\",\"NO DATA\",IF(C12=D12,\"PASS\",\"FAIL\"))"],
  ["=IF(C13=\"\",\"NO DATA\",IF(C13=D13,\"PASS\",\"FAIL\"))"],
  ["=IF(C14=\"\",\"NO DATA\",IF(C14=D14,\"PASS\",\"FAIL\"))"],
];
kpi.getRange("C5:C14").format.font = { color: C.linked };
kpi.getRange("D5:D14").format.font = { color: C.blue };
inputStyle(kpi, "D5:D14");
for (const r of [5,7,8,9,10,11,14]) kpi.getRange(`C${r}:D${r}`).format.numberFormat = pctFmt;
kpi.getRange("C6:D6").format.numberFormat = "0.0";
kpi.getRange("C12:D13").format.numberFormat = countFmt;
statusConditional(kpi.getRange("E5:E14"));
bodyBorder(kpi, "A5:G14");
setWidths(kpi, { A: 14, B: 31, C: 16, D: 15, E: 15, F: 42, G: 48 });
kpi.getRange("A4:G14").format.wrapText = true;
kpi.freezePanes.freezeRows(4);

// Research inputs
titleBand(
  research,
  "Commercialization Research Inputs",
  "Track the evidence needed to replace hypotheses with pharmacy, customer, operational, technical, and compliance facts.",
  "H",
);
research.getRange("A4:H4").values = [["Category", "Data item", "Decision supported", "Owner/source", "Status", "Required before", "Current value", "Notes"]];
header(research, "A4:H4");
const researchRows = [
  ["Demand", "Prescription requests by day and hour", "Staffing, capacity, and pricing", "Pharmacy operations", "Missing", "Pilot launch", null, null],
  ["Demand", "Requests by web, WhatsApp, walk-in, and phone", "Channel design and attribution", "Customer service lead", "Missing", "Pilot launch", null, null],
  ["Demand", "Average prescription lines per request", "OCR cost and staff workload", "Pharmacist lead", "Missing", "Pilot launch", null, null],
  ["Commercial", "Average medicine basket", "Order fee and pharmacy ROI", "Finance/POS", "Missing", "Pricing approval", null, null],
  ["Commercial", "Pharmacy gross margin by basket", "Willingness to pay and ROI", "Finance lead", "Missing", "Pricing approval", null, null],
  ["Commercial", "Current lost-sale/abandonment reasons", "Value proposition and conversion", "Branch manager", "Missing", "Pilot design", null, null],
  ["Operations", "Current quotation turnaround", "Baseline and service-level target", "Attendant observation", "Missing", "Pilot launch", null, null],
  ["Operations", "Staff minutes per prescription", "Cost and productivity", "Time-and-motion observation", "Missing", "Pilot launch", null, null],
  ["Operations", "Stock accuracy and availability outcomes", "Inventory integration priority", "Inventory/POS owner", "Missing", "Pilot launch", null, null],
  ["Operations", "Packing and pickup waiting time", "Customer benefit and staffing", "Branch manager", "Missing", "Pilot launch", null, null],
  ["Delivery", "Delivery demand by zone", "Service-zone design", "Dispatch coordinator", "Missing", "Delivery launch", null, null],
  ["Delivery", "Courier fee, payout, distance, and completion time", "Delivery margin", "Dispatch/finance", "Missing", "Pricing approval", null, null],
  ["Delivery", "Cold-chain and restricted-item eligibility", "Safe lane rules", "Pharmacist/quality lead", "Missing", "Delivery launch", null, null],
  ["Customer", "Web versus WhatsApp preference", "Entry-point priority", "Customer interviews", "Missing", "Pilot design", null, null],
  ["Customer", "Willingness to pay for delivery", "Zone pricing", "Customer interviews", "Missing", "Pricing approval", null, null],
  ["Customer", "Trust requirements for remote quotation", "Copy and review flow", "Customer interviews", "Missing", "Pilot design", null, null],
  ["Buyer", "Budget owner and approval process", "Sales motion", "Pharmacy owner", "Missing", "Commercial proposal", null, null],
  ["Buyer", "Preferred subscription versus transaction pricing", "Pricing architecture", "Owner/finance interviews", "Missing", "Pricing approval", null, null],
  ["Technical", "Current POS/inventory/accounting systems", "Integration scope", "IT/operations owner", "Missing", "Pilot architecture", null, null],
  ["Technical", "WhatsApp number/provider and device ownership", "Inbound channel design", "Customer service/IT", "Missing", "Pilot architecture", null, null],
  ["Technical", "Internet, devices, and shift access", "Staff workspace design", "Branch observation", "Missing", "Pilot launch", null, null],
  ["Compliance", "PCN electronic-pharmacy role and licence pathway", "Launch authority", "Pharmacy/legal/PCN", "Missing", "Production launch", null, null],
  ["Compliance", "Controller/processor roles and lawful basis", "Data-processing design", "Privacy/legal", "Missing", "Production launch", null, null],
  ["Compliance", "Prescription-image retention and access policy", "Storage and security", "Pharmacy/legal/privacy", "Missing", "Production launch", null, null],
  ["Compliance", "Courier and medicine-distribution SOP", "Delivery approval", "Pharmacist/quality/logistics", "Missing", "Delivery launch", null, null],
];
research.getRange(`A5:H${4 + researchRows.length}`).values = researchRows;
research.getRange(`E5:E${4 + researchRows.length}`).dataValidation = { rule: { type: "list", values: ["Missing", "Requested", "Provided", "Validated"] } };
inputStyle(research, `D5:H${4 + researchRows.length}`);
research.getRange(`A5:C${4 + researchRows.length}`).format.font = { color: C.black };
research.tables.add(`A4:H${4 + researchRows.length}`, true, "ResearchInputs");
research.freezePanes.freezeRows(4);
setWidths(research, { A: 16, B: 34, C: 34, D: 28, E: 14, F: 20, G: 24, H: 42 });
research.getRange(`A4:H${4 + researchRows.length}`).format.wrapText = true;

// Sources
titleBand(
  sources,
  "Sources And Model Notes",
  "Official sources establish the regulatory frame. Competitor sources validate channel behaviour only. Internal assumptions remain unvalidated.",
  "H",
);
sources.getRange("A4:H4").values = [["ID", "Category", "Source", "URL / reference", "What it supports", "Caveat", "Accessed", "Owner"]];
header(sources, "A4:H4");
const sourceRows = [
  ["REG-01", "Official regulation", "PCN Electronic Pharmacy Regulations 2026", "https://pcn.gov.ng/wp-content/uploads/2026/04/Electronic-Pharmacy-Regulation-2026-B81-108.pdf", "Current electronic-pharmacy framework", "Confirm exact EwaTrade role with PCN/legal counsel", new Date(2026, 7, 7), "Legal/compliance"],
  ["REG-02", "Official publication", "PCN Publications", "https://pcn.gov.ng/about-pharmacy-council-nigeria/publications/", "Official publication and update source", "Monitor for later circulars and implementation guidance", new Date(2026, 7, 7), "Legal/compliance"],
  ["PRIV-01", "Official law", "Nigeria Data Protection Act 2023", "https://ndpc.gov.ng/wp-content/uploads/2024/03/Nigeria_Data_Protection_Act_2023.pdf", "Sensitive-data and controller/processor framework", "Not legal advice; confirm obligations with privacy counsel", new Date(2026, 7, 7), "Privacy/legal"],
  ["CAT-01", "Category example", "Drugstore.ng", "https://drugstore.ng/", "Prescription upload, pharmacist chat, WhatsApp, delivery", "Validates behaviour, not EwaTrade demand or performance", new Date(2026, 7, 7), "Product"],
  ["CAT-02", "Category example", "Sanlive Pharmacy prescription upload", "https://sanlivepharmacy.com/upload/prescription", "Image/PDF upload, pharmacist review, delivery", "Self-described provider capability", new Date(2026, 7, 7), "Product"],
  ["CAT-03", "Category example", "Amkamed services", "https://www.amkamed.com/our-services", "WhatsApp prescription intake, pharmacist review, logistics", "Self-described provider capability", new Date(2026, 7, 7), "Product"],
  ["INT-01", "Internal product", "EwaTrade Brain: generic service operations", ".brain/features/generic-service-operations.md", "Requests, versioned quotes, orders, payments, messaging", "Prescription-specific workflow is not implemented", new Date(2026, 7, 7), "Product/engineering"],
  ["INT-02", "Internal product", "EwaTrade Brain: delivery scheduling", ".brain/features/commercial-order-delivery-scheduling.md", "Delivery commitments and fulfilment primitives", "Rider app and prescription delivery policy remain incomplete", new Date(2026, 7, 7), "Product/engineering"],
  ["INT-03", "Internal product", "EwaTrade Brain: prescription commerce concept", ".brain/features/hospital-prescription-fast-lane.md", "Current concept, workflow, and open decisions", "Must be updated as commercialization decisions mature", new Date(2026, 7, 7), "Product"],
  ["HYP-01", "Model hypothesis", "Illustrative scenario assumptions", "Assumptions sheet", "Pricing and unit-economics model", "Replace with pharmacy and pilot evidence", new Date(2026, 7, 7), "EwaTrade leadership"],
];
sources.getRange(`A5:H${4 + sourceRows.length}`).values = sourceRows;
sources.getRange(`G5:G${4 + sourceRows.length}`).format.numberFormat = "yyyy-mm-dd";
sources.tables.add(`A4:H${4 + sourceRows.length}`, true, "SourceLog");
sources.freezePanes.freezeRows(4);
setWidths(sources, { A: 12, B: 20, C: 34, D: 64, E: 42, F: 44, G: 14, H: 22 });
sources.getRange(`A4:H${4 + sourceRows.length}`).format.wrapText = true;

// Checks
titleBand(checks, "Model Checks", "PASS confirms internal formula and assumption controls, not market validation.", "G");
checks.getRange("A4:G4").values = [["Check", "Actual", "Expected", "Difference", "Tolerance", "Status", "Where to fix / notes"]];
header(checks, "A4:G4");
checks.getRange("A5:A11").values = [
  ["Active scenario is valid"],
  ["Monthly requests are positive"],
  ["Quote conversion is between 0% and 100%"],
  ["Delivery margin is between 0% and 100%"],
  ["Unit economics contribution ties"],
  ["Scenario contribution ties"],
  ["Forecast starts with at least one branch"],
];
checks.getRange("C5:C11").values = [[1], ["> 0"], ["0 to 1"], ["0 to 1"], ["Revenue - direct cost"], ["Revenue - direct cost"], [">= 1"]];
checks.getRange("E5:E11").values = [[0], [0], [0], [0], [1], [1], [0]];
checks.getRange("G5:G11").values = [["Assumptions!B4"], ["Assumptions!B9"], ["Assumptions!B11"], ["Assumptions!B17"], ["Unit Economics!B16:B22"], ["Scenarios!D7:F7"], ["24-Month Plan!C6"]];
checks.getRange("B5:B11").formulas = [
  ["=COUNTIF('Assumptions'!C8:E8,'Assumptions'!B4)"],
  ["='Assumptions'!B9"],
  ["='Assumptions'!B11"],
  ["='Assumptions'!B17"],
  ["='Unit Economics'!B22"],
  ["='Scenarios'!F7"],
  ["='24-Month Plan'!C6"],
];
checks.getRange("D5:D11").formulas = [
  ["=B5-C5"],
  ["=IF(B6>0,0,ABS(B6)+1)"],
  ["=MAX(0,B7-1)+MAX(0,-B7)"],
  ["=MAX(0,B8-1)+MAX(0,-B8)"],
  ["=B9-('Unit Economics'!B16-'Unit Economics'!B21)"],
  ["=B10-('Scenarios'!D7-'Scenarios'!E7)"],
  ["=MAX(0,1-B11)"],
];
checks.getRange("F5:F11").formulas = [
  ["=IF(ABS(D5)<=E5,\"PASS\",\"FAIL\")"],
  ["=IF(D6=0,\"PASS\",\"FAIL\")"],
  ["=IF(D7=0,\"PASS\",\"FAIL\")"],
  ["=IF(D8=0,\"PASS\",\"FAIL\")"],
  ["=IF(ABS(D9)<=E9,\"PASS\",\"FAIL\")"],
  ["=IF(ABS(D10)<=E10,\"PASS\",\"FAIL\")"],
  ["=IF(D11=0,\"PASS\",\"FAIL\")"],
];
checks.getRange("B5:F11").format.font = { color: C.linked };
statusConditional(checks.getRange("F5:F11"));
bodyBorder(checks, "A5:G11");
checks.getRange("A13:C13").values = [["MODEL STATUS", null, null]];
checks.getRange("A13:C13").merge();
checks.getRange("D13:F13").merge();
checks.getRange("D13").formulas = [["=IF(COUNTIF(F5:F11,\"FAIL\")=0,\"PASS\",\"FAIL\")"]];
checks.getRange("A13:C13").format = { fill: C.ink, font: { bold: true, color: C.white, size: 13 } };
checks.getRange("D13:F13").format = { fill: C.greenSoft, font: { bold: true, color: C.greenDark, size: 13 }, horizontalAlignment: "center" };
statusConditional(checks.getRange("D13:F13"));
setWidths(checks, { A: 36, B: 24, C: 28, D: 16, E: 14, F: 14, G: 40 });
checks.getRange("A4:G13").format.wrapText = true;

// Executive summary, built after dependencies exist.
titleBand(
  summary,
  "EwaTrade Prescription Commerce Commercial Model",
  "Illustrative commercialization model for pharmacy-owned prescription intake, quotation, payment, pickup, and delivery.",
  "J",
);
summary.getRange("A4:J4").merge();
summary.getRange("A4").values = [["EXECUTIVE SUMMARY"]];
summary.getRange("A4:J4").format = { fill: C.ink, font: { bold: true, color: C.white, size: 11 } };
summary.getRange("A5:J6").merge();
summary.getRange("A5").values = [["The recommended model combines implementation, monthly branch subscription, completed-order fees, and optional delivery coordination margin. All outputs are hypotheses until the pharmacy baseline and pilot replace the editable assumptions."]];
summary.getRange("A5:J6").format = { fill: C.light, font: { color: C.ink, size: 11 }, wrapText: true, verticalAlignment: "center" };

const cards = [
  ["A8:B8", "A9:B10", "Monthly revenue / branch", "='Unit Economics'!B16", ngn],
  ["D8:E8", "D9:E10", "Monthly contribution / branch", "='Unit Economics'!B22", ngn],
  ["G8:H8", "G9:H10", "Contribution margin", "='Unit Economics'!B23", pctFmt],
  ["I8:J8", "I9:J10", "Pharmacy value multiple", "='Unit Economics'!B31", "0.0x"],
];
for (const [labelRange, valueRange, label, formula, fmt] of cards) {
  summary.getRange(labelRange).merge();
  summary.getRange(labelRange.split(":")[0]).values = [[label]];
  summary.getRange(labelRange).format = { fill: C.greenSoft, font: { bold: true, color: C.greenDark, size: 9 }, horizontalAlignment: "center" };
  summary.getRange(valueRange).merge();
  summary.getRange(valueRange.split(":")[0]).formulas = [[formula]];
  summary.getRange(valueRange).format = { fill: C.white, font: { bold: true, color: C.linked, size: 17 }, horizontalAlignment: "center", verticalAlignment: "center", borders: { preset: "outside", style: "thin", color: C.line } };
  summary.getRange(valueRange).format.numberFormat = fmt;
}
section(summary, "A12:J12", "SCENARIO COMPARISON");
summary.getRange("A13:D13").values = [["Scenario", "Monthly revenue", "Contribution", "Margin"]];
header(summary, "A13:D13");
summary.getRange("A14:A16").formulas = [["='Scenarios'!A6"], ["='Scenarios'!A7"], ["='Scenarios'!A8"]];
summary.getRange("B14:D16").formulas = [
  ["='Scenarios'!D6", "='Scenarios'!F6", "='Scenarios'!G6"],
  ["='Scenarios'!D7", "='Scenarios'!F7", "='Scenarios'!G7"],
  ["='Scenarios'!D8", "='Scenarios'!F8", "='Scenarios'!G8"],
];
summary.getRange("A14:D16").format.font = { color: C.linked };
summary.getRange("B14:C16").format.numberFormat = ngn;
summary.getRange("D14:D16").format.numberFormat = pctFmt;
bodyBorder(summary, "A14:D16");

const chart = summary.charts.add("bar", summary.getRange("A13:B16"));
chart.title = "Illustrative monthly revenue by scenario (NGN)";
chart.titleTextStyle.fontSize = 12;
chart.hasLegend = false;
chart.xAxis = { axisType: "textAxis", textStyle: { fontSize: 9 } };
chart.yAxis = { numberFormatCode: '"NGN" #,##0', textStyle: { fontSize: 8 } };
chart.setPosition("F13", "J25");

section(summary, "A18:D18", "ACTIVE-SCENARIO OPERATING VIEW");
summary.getRange("A19:D23").values = [
  ["Requests / month", null, "Paid orders / month", null],
  ["Quotes / month", null, "Delivery orders / month", null],
  ["Revenue / request", null, "Contribution / request", null],
  ["24-month ending branches", null, "Month 24 contribution after overhead", null],
  ["Model status", null, "Pilot data status", "No data entered"],
];
summary.getRange("B19:B23").formulas = [
  ["='Unit Economics'!B6"],
  ["='Unit Economics'!B7"],
  ["='Unit Economics'!B24"],
  ["='24-Month Plan'!C29"],
  ["='Checks'!D13"],
];
summary.getRange("D19:D22").formulas = [
  ["='Unit Economics'!B8"],
  ["='Unit Economics'!B9"],
  ["='Unit Economics'!B25"],
  ["='24-Month Plan'!Q29"],
];
summary.getRange("B19:D23").format.font = { color: C.linked };
summary.getRange("B19:B20").format.numberFormat = countFmt;
summary.getRange("D19:D20").format.numberFormat = countFmt;
summary.getRange("B21:D21").format.numberFormat = ngn;
summary.getRange("B22").format.numberFormat = countFmt;
summary.getRange("D22").format.numberFormat = ngn;
statusConditional(summary.getRange("B23"));
bodyBorder(summary, "A19:D23");

summary.getRange("A26:J27").merge();
summary.getRange("A26").values = [["Use this workbook as a decision model, not evidence of demand. Replace blue/yellow cells, enter de-identified pilot records, and require all Checks to pass before commercial approval."]];
summary.getRange("A26:J27").format = { fill: C.yellow, font: { bold: true, color: "#6B4E00" }, wrapText: true, verticalAlignment: "center" };
setWidths(summary, { A: 27, B: 22, C: 31, D: 22, E: 14, F: 18, G: 18, H: 18, I: 20, J: 20 });
summary.freezePanes.freezeRows(4);

// Workbook-level formatting and export.
for (const sheet of [summary, assumptions, unit, forecast, scenarios, pilot, kpi, research, sources, checks]) {
  const used = sheet.getUsedRange();
  used.format.font.name = "Arial";
  used.format.verticalAlignment = "center";
}

await fs.mkdir(OUTPUT_DIR, { recursive: true });
await fs.mkdir(PREVIEW_DIR, { recursive: true });

const inspection = await wb.inspect({
  kind: "table",
  range: "Summary!A1:J27",
  include: "values,formulas",
  tableMaxRows: 30,
  tableMaxCols: 12,
  maxChars: 12000,
});
console.log(inspection.ndjson);

const errorScan = await wb.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log(errorScan.ndjson);

const checkInspection = await wb.inspect({
  kind: "table",
  range: "Checks!A4:G13",
  include: "values,formulas",
  tableMaxRows: 15,
  tableMaxCols: 8,
  maxChars: 8000,
});
console.log(checkInspection.ndjson);

for (const sheetName of [
  "Summary",
  "Assumptions",
  "Unit Economics",
  "24-Month Plan",
  "Scenarios",
  "Pilot Data",
  "KPI Scorecard",
  "Research Inputs",
  "Sources & Notes",
  "Checks",
]) {
  const blob = await wb.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  const safe = sheetName.toLowerCase().replaceAll(" ", "-").replaceAll("&", "and");
  await fs.writeFile(`${PREVIEW_DIR}/${safe}.png`, new Uint8Array(await blob.arrayBuffer()));
}

const output = await SpreadsheetFile.exportXlsx(wb);
await output.save(OUTPUT);
console.log(`SAVED ${OUTPUT}`);
