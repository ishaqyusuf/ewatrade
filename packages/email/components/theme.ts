import type { CSSProperties } from "react"

export const emailPalette = {
  action: "#1d5d3e",
  actionHover: "#174c32",
  border: "#dce2d7",
  brandAccent: "#bd773a",
  canvas: "#f0f1eb",
  ink: "#183c2b",
  lime: "#c8d89d",
  muted: "#5b685e",
  paper: "#fffefa",
  quiet: "#f3f5ee",
  success: "#245a3d",
  successBackground: "#edf3e7",
  warning: "#873f1d",
  warningBackground: "#fbecdf",
} as const

export const emailFonts = {
  mono: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
  sans: "Arial, Helvetica, sans-serif",
} as const

export const warmDeskStyles = {
  body: {
    backgroundColor: emailPalette.canvas,
    color: emailPalette.ink,
    fontFamily: emailFonts.sans,
    margin: 0,
    padding: "30px 18px",
  },
  container: {
    backgroundColor: emailPalette.paper,
    border: `1px solid ${emailPalette.border}`,
    borderRadius: "10px",
    boxSizing: "border-box" as const,
    margin: "0 auto",
    maxWidth: "600px",
    overflow: "hidden",
    width: "100%",
  },
  content: {
    padding: "30px 34px",
  },
  eyebrow: {
    color: emailPalette.muted,
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    lineHeight: "18px",
    margin: "0 0 14px",
    textTransform: "uppercase" as const,
  },
  heading: {
    color: emailPalette.ink,
    fontFamily: emailFonts.sans,
    fontSize: "31px",
    fontWeight: 700,
    letterSpacing: "-0.02em",
    lineHeight: "37px",
    margin: "0 0 20px",
  },
  intro: {
    color: emailPalette.ink,
    fontSize: "15px",
    lineHeight: "25px",
    margin: "0 0 22px",
  },
  note: {
    color: emailPalette.muted,
    fontSize: "12px",
    lineHeight: "20px",
    margin: "0 0 26px",
  },
  previewLink: {
    color: emailPalette.ink,
    textDecoration: "underline",
  },
  rule: {
    borderColor: emailPalette.border,
    margin: "0",
  },
  support: {
    color: emailPalette.muted,
    fontSize: "12px",
    lineHeight: "20px",
    margin: "20px 0 0",
  },
  footerContainer: {
    margin: "0 auto",
    maxWidth: "600px",
    width: "100%",
  },
} satisfies Record<string, CSSProperties>

export const warmDeskResponsiveCss = `
  a:focus-visible {
    outline: 3px solid ${emailPalette.brandAccent};
    outline-offset: 4px;
  }

  @media only screen and (max-width: 480px) {
    .warm-desk-body > table > tbody > tr > td {
      padding: 16px 10px !important;
    }

    .warm-desk-header,
    .warm-desk-content {
      padding-left: 22px !important;
      padding-right: 22px !important;
    }

    .warm-desk-heading {
      font-size: 29px !important;
      line-height: 34px !important;
    }
  }
`
