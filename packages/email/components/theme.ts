import type { CSSProperties } from "react"

export const emailPalette = {
  action: "#ff6f3d",
  actionHover: "#ee5d2d",
  border: "#c8cec6",
  borderStrong: "#9da9a1",
  canvas: "#e9ebe5",
  ink: "#10251d",
  lime: "#c9ff63",
  muted: "#5d6f67",
  paper: "#fffefa",
  quiet: "#f3f2eb",
  success: "#166534",
  warning: "#9a3412",
} as const

export const emailFonts = {
  mono: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
  sans: '"Avenir Next", Avenir, "Segoe UI", Helvetica, Arial, sans-serif',
  serif: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
} as const

export const fieldLedgerStyles = {
  body: {
    backgroundColor: emailPalette.canvas,
    color: emailPalette.ink,
    fontFamily: emailFonts.sans,
    margin: 0,
    padding: 0,
  },
  container: {
    backgroundColor: emailPalette.paper,
    border: `1px solid ${emailPalette.borderStrong}`,
    borderRadius: 0,
    margin: "40px auto",
    maxWidth: "600px",
    overflow: "hidden",
    width: "100%",
  },
  content: {
    padding: "34px",
  },
  eyebrow: {
    color: emailPalette.muted,
    fontSize: "10px",
    fontWeight: 800,
    letterSpacing: "0.17em",
    lineHeight: "18px",
    margin: "0 0 13px",
    textTransform: "uppercase" as const,
  },
  heading: {
    color: emailPalette.ink,
    fontFamily: emailFonts.serif,
    fontSize: "38px",
    fontWeight: 400,
    letterSpacing: "-0.045em",
    lineHeight: "40px",
    margin: "0 0 16px",
  },
  intro: {
    color: emailPalette.ink,
    fontSize: "15px",
    lineHeight: "25px",
    margin: "0 0 20px",
  },
  note: {
    borderLeft: `3px solid ${emailPalette.action}`,
    color: emailPalette.muted,
    fontSize: "12px",
    lineHeight: "19px",
    margin: "24px 0 0",
    padding: "2px 0 2px 13px",
  },
  previewLink: {
    color: emailPalette.muted,
    textDecoration: "underline",
  },
  rule: {
    borderColor: emailPalette.border,
    margin: "26px 0 22px",
  },
  support: {
    color: emailPalette.muted,
    fontSize: "12px",
    lineHeight: "19px",
    margin: 0,
  },
} satisfies Record<string, CSSProperties>

export const fieldLedgerResponsiveCss = `
  @media only screen and (max-width: 480px) {
    .field-ledger-container {
      margin: 0 auto !important;
      width: 100% !important;
    }

    .field-ledger-header,
    .field-ledger-content,
    .field-ledger-footer {
      padding-left: 20px !important;
      padding-right: 20px !important;
    }

    .field-ledger-content {
      padding-bottom: 25px !important;
      padding-top: 25px !important;
    }

    .field-ledger-heading {
      font-size: 31px !important;
      line-height: 34px !important;
    }

    .field-ledger-footer-copy {
      font-size: 10px !important;
    }
  }
`
