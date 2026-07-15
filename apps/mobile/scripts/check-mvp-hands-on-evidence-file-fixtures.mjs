import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const SCRIPT_PATH = new URL(
  "./check-mvp-hands-on-evidence-file.mjs",
  import.meta.url,
).pathname
const SECTIONS = [
  "Launch And Auth",
  "First Product And Dashboard",
  "Staff And Sessions",
  "Sale And Customer Book",
  "Offline And Sync",
  "Inventory, Reports, And Subscription",
  "Share Links And Web Checkout",
]
const VALID_PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])
const VALID_JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xdb])
const PRODUCTION_PUBLIC_CONFIGURED_VALUES = {
  API_URL: "https://ewatrade.com",
  STOREFRONT_URL: "https://ewatrade.com",
  EXPO_PUBLIC_API_URL: "https://ewatrade.com",
  EXPO_PUBLIC_BASE_URL: "https://ewatrade.com",
  EXPO_PUBLIC_WEB_URL: "https://ewatrade.com",
  NEXT_PUBLIC_API_URL: "https://ewatrade.com",
  NEXT_PUBLIC_APP_URL: "https://ewatrade.com",
  NEXT_PUBLIC_STOREFRONT_URL: "https://ewatrade.com",
}
const LIVE_BLOCKER_REPORT_SECTIONS = [
  "Google OAuth",
  "Google OAuth Live API QA",
  "Shared-Link Live Write And Email QA",
  "Shared-Link Public Preview",
  "Shared-Link Browser Checkout",
]
const BLOCKER_REPORT_MISSING_REQUIRED_ROWS = [
  {
    keys: ["SHARED_LINK_PREVIEW_URL"],
    label: "Deployed share URL",
    section: "Shared-Link Public Preview",
  },
]

runScenario({
  expectedStatus: 0,
  fileName: "complete-evidence.md",
  label: "complete evidence file",
  shouldInclude: ["MVP hands-on evidence file check passed."],
  body: ({ fixtureDir, preflightArtifacts, sectionArtifacts }) =>
    buildEvidenceFile({
      preflightArtifacts,
      releaseSummary: buildCompleteReleaseSummary({
        artifacts: createReleaseArtifacts(fixtureDir),
      }),
      sectionCheckbox: "[x]",
      sectionArtifacts,
    }),
})

runScenario({
  expectedStatus: 0,
  fileName: "complete-evidence-with-blockers.md",
  label: "complete evidence with blocker report",
  preflightOptions: {
    readinessPassed: false,
  },
  shouldInclude: ["MVP hands-on evidence file check passed."],
  body: ({ fixtureDir, preflightArtifacts, sectionArtifacts }) => {
    const artifacts = createReleaseArtifacts(fixtureDir)
    const blockerReportPath = join(fixtureDir, "live-blockers.json")

    writeFileSync(
      blockerReportPath,
      buildBlockerReportFixtureJson({
        generatedAt: "2026-07-12T10:00:00.000Z",
      }),
    )

    return buildEvidenceFile({
      includeBlockerReportPreflight: true,
      preflightArtifacts,
      releaseSummary: buildCompleteReleaseSummary({
        artifacts,
        liveBlockerReport: `qa:mvp-live-blocker-report:prod wrote ${blockerReportPath}.`,
        remainingBlockers:
          "Shared-Link Public Preview still needs a deployed share URL.",
      }),
      sectionCheckbox: "[x]",
      sectionArtifacts,
    })
  },
})

runScenario({
  expectedStatus: 0,
  fileName: "complete-evidence-with-device-log.md",
  label: "complete evidence with device smoke log",
  shouldInclude: ["MVP hands-on evidence file check passed."],
  body: ({ fixtureDir, preflightArtifacts, sectionArtifacts }) => {
    const artifacts = createReleaseArtifacts(fixtureDir)

    artifacts.deviceSmoke = join(fixtureDir, "device-smoke.log")
    writeFileSync(
      artifacts.deviceSmoke,
      "Mobile Retail Ops full device smoke completed with screenshots archived separately.\n",
    )

    return buildEvidenceFile({
      preflightArtifacts,
      releaseSummary: buildCompleteReleaseSummary({ artifacts }),
      sectionCheckbox: "[x]",
      sectionArtifacts,
    })
  },
})

runScenario({
  expectedStatus: 0,
  fileName: "complete-local-evidence.md",
  label: "complete local evidence file",
  shouldInclude: ["MVP hands-on evidence file check passed."],
  body: ({ fixtureDir, preflightArtifacts, sectionArtifacts }) =>
    buildEvidenceFile({
      apiTargetHost: "http://localhost:3001",
      preflightArtifacts,
      qaMode: "local",
      releaseSummary: buildCompleteReleaseSummary({
        artifacts: createReleaseArtifacts(fixtureDir),
        productionCommands: false,
      }),
      sectionCheckbox: "[x]",
      sectionArtifacts,
      storefrontTargetHost: "http://127.0.0.1:3000",
      useProductionPreflightCommands: false,
    }),
})

runScenario({
  expectedStatus: 1,
  fileName: "incomplete-evidence.md",
  label: "unchecked and blank evidence file",
  shouldInclude: [
    "Run Context field Date must be filled.",
    "Launch And Auth still has unchecked smoke checklist items.",
    "Launch And Auth must include filled Evidence.",
    "Release Gate Summary still has unchecked release gates.",
    "Preflight Commands still has unchecked commands.",
    "Release Gate Summary must include filled Google evidence.",
    "Release Gate Summary must state Remaining blockers",
  ],
  body: buildEvidenceFile({
    blankContext: true,
    releaseSummary: [
      "- [ ] Live Google provider flow has current evidence.",
      "- [ ] Live shared-link write/email flow has current evidence.",
      "- Remaining blockers:",
    ].join("\n"),
    sectionCheckbox: "[ ]",
    withSectionFields: false,
  }),
})

runScenario({
  expectedStatus: 1,
  fileName: "invalid-run-context-date.md",
  label: "invalid run context date",
  shouldInclude: [
    "Run Context field Date must use YYYY-MM-DD so release evidence can be matched to the QA run.",
  ],
  body: ({ fixtureDir, preflightArtifacts, sectionArtifacts }) =>
    buildEvidenceFile({
      date: "July 12, 2026",
      preflightArtifacts,
      releaseSummary: buildCompleteReleaseSummary({
        artifacts: createReleaseArtifacts(fixtureDir),
      }),
      sectionArtifacts,
      sectionCheckbox: "[x]",
    }),
})

runScenario({
  expectedStatus: 1,
  fileName: "invalid-qa-mode.md",
  label: "invalid QA mode",
  shouldInclude: [
    "Run Context field QA mode must be either local or production.",
  ],
  body: ({ fixtureDir, preflightArtifacts, sectionArtifacts }) =>
    buildEvidenceFile({
      preflightArtifacts,
      qaMode: "prod",
      releaseSummary: buildCompleteReleaseSummary({
        artifacts: createReleaseArtifacts(fixtureDir),
      }),
      sectionArtifacts,
      sectionCheckbox: "[x]",
    }),
})

runScenario({
  expectedStatus: 1,
  fileName: "production-evidence-with-local-target-hosts.md",
  label: "production evidence with local target hosts",
  shouldInclude: [
    "Run Context field API target host must not use a local host when QA mode is production.",
    "Run Context field Storefront target host must not use a local host when QA mode is production.",
  ],
  body: ({ fixtureDir, preflightArtifacts, sectionArtifacts }) =>
    buildEvidenceFile({
      apiTargetHost: "http://localhost:3001",
      preflightArtifacts,
      releaseSummary: buildCompleteReleaseSummary({
        artifacts: createReleaseArtifacts(fixtureDir),
      }),
      sectionArtifacts,
      sectionCheckbox: "[x]",
      storefrontTargetHost: "http://ewa.local:3000",
    }),
})

runScenario({
  expectedStatus: 1,
  fileName: "missing-preflight-artifacts.md",
  label: "missing preflight artifacts",
  shouldInclude: [
    "Preflight Commands hands-on checklist command must reference an absolute log or report artifact path.",
    "Preflight Commands live env checklist command must reference an absolute log or report artifact path.",
    "Preflight Commands live readiness command must reference an absolute log or report artifact path.",
    "Preflight Commands full readiness command must reference an absolute log or report artifact path.",
  ],
  body: ({ fixtureDir, sectionArtifacts }) =>
    buildEvidenceFile({
      releaseSummary: buildCompleteReleaseSummary({
        artifacts: createReleaseArtifacts(fixtureDir),
      }),
      sectionArtifacts,
      sectionCheckbox: "[x]",
    }),
})

runScenario({
  expectedStatus: 1,
  fileName: "missing-readiness-preflight.md",
  label: "missing readiness preflight commands",
  shouldInclude: [
    "Preflight Commands must include the live readiness command.",
    "Preflight Commands must include the full readiness command.",
  ],
  body: ({ fixtureDir, sectionArtifacts }) =>
    buildEvidenceFile({
      omitReadinessPreflights: true,
      releaseSummary: buildCompleteReleaseSummary({
        artifacts: createReleaseArtifacts(fixtureDir),
      }),
      sectionCheckbox: "[x]",
      sectionArtifacts,
    }),
})

runScenario({
  expectedStatus: 1,
  fileName: "production-evidence-with-local-commands.md",
  label: "production evidence with local commands",
  shouldInclude: [
    "Preflight Commands hands-on checklist command must use the :prod variant when QA mode is production.",
    "Preflight Commands live env checklist command must use the :prod variant when QA mode is production.",
    "Preflight Commands live readiness command must use the :prod variant when QA mode is production.",
    "Preflight Commands full readiness command must use the :prod variant when QA mode is production.",
    "Release Gate Summary Google evidence must reference the production Google live run command when QA mode is production.",
    "Release Gate Summary Shared-link live evidence must reference the production shared-link live run command when QA mode is production.",
    "Release Gate Summary Public preview evidence must reference the production shared-link preview command when QA mode is production.",
    "Release Gate Summary Browser checkout evidence must reference the production browser checkout command when QA mode is production.",
  ],
  body: ({ fixtureDir, preflightArtifacts, sectionArtifacts }) =>
    buildEvidenceFile({
      preflightArtifacts,
      releaseSummary: buildCompleteReleaseSummary({
        artifacts: createReleaseArtifacts(fixtureDir),
        productionCommands: false,
      }),
      sectionArtifacts,
      sectionCheckbox: "[x]",
      useProductionPreflightCommands: false,
    }),
})

runScenario({
  expectedStatus: 1,
  fileName: "production-device-smoke-with-local-checklist-command.md",
  label: "production device smoke with local checklist command",
  shouldInclude: [
    "Release Gate Summary Device smoke evidence must reference the production hands-on smoke checklist command when QA mode is production.",
  ],
  body: ({ fixtureDir, preflightArtifacts, sectionArtifacts }) => {
    const artifacts = createReleaseArtifacts(fixtureDir)

    return buildEvidenceFile({
      preflightArtifacts,
      releaseSummary: buildCompleteReleaseSummary({
        artifacts,
        deviceSmokeEvidence: `qa:mvp-hands-on-checklist passed with device smoke proof; artifact ${artifacts.deviceSmoke}.`,
      }),
      sectionArtifacts,
      sectionCheckbox: "[x]",
    })
  },
})

runScenario({
  expectedStatus: 1,
  fileName: "local-evidence-with-production-commands.md",
  label: "local evidence with production commands",
  shouldInclude: [
    "Preflight Commands hands-on checklist command must use the default variant when QA mode is local.",
    "Preflight Commands live env checklist command must use the default variant when QA mode is local.",
    "Preflight Commands live readiness command must use the default variant when QA mode is local.",
    "Preflight Commands full readiness command must use the default variant when QA mode is local.",
    "Release Gate Summary Google evidence must reference the default Google live run command when QA mode is local.",
    "Release Gate Summary Shared-link live evidence must reference the default shared-link live run command when QA mode is local.",
    "Release Gate Summary Public preview evidence must reference the default shared-link preview command when QA mode is local.",
    "Release Gate Summary Browser checkout evidence must reference the default browser checkout command when QA mode is local.",
  ],
  body: ({ fixtureDir, preflightArtifacts, sectionArtifacts }) =>
    buildEvidenceFile({
      preflightArtifacts,
      qaMode: "local",
      releaseSummary: buildCompleteReleaseSummary({
        artifacts: createReleaseArtifacts(fixtureDir),
      }),
      sectionArtifacts,
      sectionCheckbox: "[x]",
    }),
})

runScenario({
  expectedStatus: 1,
  fileName: "local-device-smoke-with-production-checklist-command.md",
  label: "local device smoke with production checklist command",
  shouldInclude: [
    "Release Gate Summary Device smoke evidence must reference the default hands-on smoke checklist command when QA mode is local.",
  ],
  body: ({ fixtureDir, preflightArtifacts, sectionArtifacts }) => {
    const artifacts = createReleaseArtifacts(fixtureDir)

    return buildEvidenceFile({
      preflightArtifacts,
      qaMode: "local",
      releaseSummary: buildCompleteReleaseSummary({
        artifacts,
        deviceSmokeEvidence: `qa:mvp-hands-on-checklist:prod passed with device smoke proof; artifact ${artifacts.deviceSmoke}.`,
        productionCommands: false,
      }),
      sectionArtifacts,
      sectionCheckbox: "[x]",
      useProductionPreflightCommands: false,
    })
  },
})

runScenario({
  expectedStatus: 1,
  fileName: "wrong-preflight-artifact-content.md",
  label: "wrong preflight artifact content",
  shouldInclude: [
    "Preflight Commands hands-on checklist artifact must contain output from the matching command.",
  ],
  body: ({ fixtureDir, preflightArtifacts, sectionArtifacts }) => {
    writeFileSync(preflightArtifacts.handsOnChecklist, "unrelated output\n")

    return buildEvidenceFile({
      preflightArtifacts,
      releaseSummary: buildCompleteReleaseSummary({
        artifacts: createReleaseArtifacts(fixtureDir),
      }),
      sectionArtifacts,
      sectionCheckbox: "[x]",
    })
  },
})

runScenario({
  expectedStatus: 1,
  fileName: "failed-readiness-preflight-artifacts.md",
  label: "failed readiness preflight artifacts with no blockers",
  preflightOptions: {
    readinessPassed: false,
  },
  shouldInclude: [
    "Preflight Commands live readiness artifact must show the command passed when Remaining blockers is None.",
    "Preflight Commands full readiness artifact must show the command passed when Remaining blockers is None.",
  ],
  body: ({ fixtureDir, preflightArtifacts, sectionArtifacts }) =>
    buildEvidenceFile({
      preflightArtifacts,
      releaseSummary: buildCompleteReleaseSummary({
        artifacts: createReleaseArtifacts(fixtureDir),
      }),
      sectionArtifacts,
      sectionCheckbox: "[x]",
    }),
})

runScenario({
  expectedStatus: 1,
  fileName: "vague-release-evidence.md",
  label: "vague release evidence",
  shouldInclude: [
    "Release Gate Summary Google evidence must reference the Google live run command.",
    "Release Gate Summary Shared-link live evidence must reference the shared-link live run command.",
    "Release Gate Summary Public preview evidence must reference the shared-link preview command.",
    "Release Gate Summary Browser checkout evidence must reference the browser checkout command.",
    "Release Gate Summary Device smoke evidence must reference the hands-on smoke checklist command or full device smoke note.",
  ],
  body: ({ fixtureDir, sectionArtifacts }) =>
    buildEvidenceFile({
      releaseSummary: buildVagueReleaseSummary(
        createReleaseArtifacts(fixtureDir),
      ),
      sectionCheckbox: "[x]",
      sectionArtifacts,
    }),
})

runScenario({
  expectedStatus: 1,
  fileName: "missing-release-gate-checks.md",
  label: "missing release gate checks",
  shouldInclude: [
    "Release Gate Summary must include checked Live Google provider flow gate.",
    "Release Gate Summary must include checked Live shared-link write/email flow gate.",
    "Release Gate Summary must include checked Deployed public preview gate.",
    "Release Gate Summary must include checked Browser checkout gate.",
    "Release Gate Summary must include checked Full device smoke run gate.",
  ],
  body: ({ fixtureDir, sectionArtifacts }) => {
    const artifacts = createReleaseArtifacts(fixtureDir)

    return buildEvidenceFile({
      releaseSummary: [
        `- Google evidence: qa:google-oauth-live-run:prod passed against the production API host; evidence ${artifacts.google}.`,
        `- Shared-link live evidence: qa:shared-link-live-run:prod created, notified, followed up, and deactivated the disposable link; evidence ${artifacts.shared}.`,
        `- Public preview evidence: qa:shared-link-preview:prod passed for the production storefront host; evidence ${artifacts.preview}.`,
        `- Browser checkout evidence: qa:shared-link-browser-checkout:prod submitted a disposable customer order and reached the requested state; screenshot ${artifacts.browser}.`,
        `- Device smoke evidence: full device smoke evidence is captured in the section notes and screenshots; artifact ${artifacts.deviceSmoke}.`,
        "- Remaining blockers: None.",
        "- Live blocker report: None.",
      ].join("\n"),
      sectionArtifacts,
      sectionCheckbox: "[x]",
    })
  },
})

runScenario({
  expectedStatus: 1,
  fileName: "missing-release-artifacts.md",
  label: "missing release artifact paths",
  shouldInclude: [
    "Release Gate Summary Google evidence must reference the absolute Google live JSON evidence path.",
    "Release Gate Summary Shared-link live evidence must reference the absolute shared-link live JSON evidence path.",
    "Release Gate Summary Public preview evidence must reference the absolute public preview JSON evidence path.",
    "Release Gate Summary Browser checkout evidence must reference the absolute browser checkout PNG evidence path.",
    "Release Gate Summary Device smoke evidence must reference the absolute device smoke screenshot or log artifact path.",
  ],
  body: buildEvidenceFile({
    releaseSummary: [
      "- [x] Live Google provider flow has current evidence.",
      "- [x] Live shared-link write/email flow has current evidence.",
      "- [x] Deployed public preview has current evidence.",
      "- [x] Browser checkout has current evidence.",
      "- [x] Full device smoke run has current evidence.",
      "- Google evidence: qa:google-oauth-live-run:prod passed against the production API host.",
      "- Shared-link live evidence: qa:shared-link-live-run:prod created, notified, followed up, and deactivated the disposable link.",
      "- Public preview evidence: qa:shared-link-preview:prod passed for the production storefront host.",
      "- Browser checkout evidence: qa:shared-link-browser-checkout:prod submitted a disposable customer order and reached the requested state.",
      "- Device smoke evidence: full device smoke evidence is captured in the section notes and screenshots.",
      "- Remaining blockers: None.",
      "- Live blocker report: None.",
    ].join("\n"),
    sectionCheckbox: "[x]",
  }),
})

runScenario({
  expectedStatus: 1,
  fileName: "missing-section-artifact-file.md",
  label: "missing section artifact file",
  shouldInclude: [
    "Launch And Auth Screenshots or logs artifact path does not exist:",
  ],
  body: ({ fixtureDir, sectionArtifacts }) => {
    const artifacts = createReleaseArtifacts(fixtureDir)
    const sectionArtifactsWithMissingFile = {
      ...sectionArtifacts,
      "Launch And Auth": join(fixtureDir, "missing-launch-auth-log.md"),
    }

    return buildEvidenceFile({
      releaseSummary: buildCompleteReleaseSummary({ artifacts }),
      sectionArtifacts: sectionArtifactsWithMissingFile,
      sectionCheckbox: "[x]",
    })
  },
})

runScenario({
  expectedStatus: 1,
  fileName: "section-artifact-directory.md",
  label: "section artifact directory",
  shouldInclude: [
    "Launch And Auth Screenshots or logs artifact path must be a file:",
  ],
  body: ({ fixtureDir, sectionArtifacts }) => {
    const artifacts = createReleaseArtifacts(fixtureDir)
    const directoryArtifactPath = join(fixtureDir, "launch-auth-proof.md")
    const sectionArtifactsWithDirectory = {
      ...sectionArtifacts,
      "Launch And Auth": directoryArtifactPath,
    }

    mkdirSync(directoryArtifactPath, { recursive: true })

    return buildEvidenceFile({
      releaseSummary: buildCompleteReleaseSummary({ artifacts }),
      sectionArtifacts: sectionArtifactsWithDirectory,
      sectionCheckbox: "[x]",
    })
  },
})

runScenario({
  expectedStatus: 1,
  fileName: "invalid-section-jpeg-artifact.md",
  label: "invalid section JPEG artifact",
  shouldInclude: [
    "Launch And Auth Screenshots or logs JPEG artifact file must be a valid JPEG:",
  ],
  body: ({ fixtureDir, sectionArtifacts }) => {
    const artifacts = createReleaseArtifacts(fixtureDir)
    const invalidJpegPath = join(fixtureDir, "launch-auth.jpg")
    const sectionArtifactsWithInvalidJpeg = {
      ...sectionArtifacts,
      "Launch And Auth": invalidJpegPath,
    }

    writeFileSync(invalidJpegPath, "not jpeg\n")

    return buildEvidenceFile({
      releaseSummary: buildCompleteReleaseSummary({ artifacts }),
      sectionArtifacts: sectionArtifactsWithInvalidJpeg,
      sectionCheckbox: "[x]",
    })
  },
})

runScenario({
  expectedStatus: 1,
  fileName: "blockers-without-report.md",
  label: "remaining blockers without blocker report",
  shouldInclude: [
    "Release Gate Summary Live blocker report must reference qa:mvp-live-blocker-report:prod when Remaining blockers is not None.",
    "Release Gate Summary Live blocker report must reference an absolute blocker JSON report path when Remaining blockers is not None.",
  ],
  body: ({ fixtureDir, sectionArtifacts }) =>
    buildEvidenceFile({
      releaseSummary: buildCompleteReleaseSummary({
        artifacts: createReleaseArtifacts(fixtureDir),
        liveBlockerReport: "Pending report.",
        remainingBlockers:
          "Shared-link public preview still needs deployed URL metadata values.",
      }),
      sectionCheckbox: "[x]",
      sectionArtifacts,
    }),
})

runScenario({
  expectedStatus: 1,
  fileName: "blockers-without-preflight-report-command.md",
  label: "remaining blockers without blocker report preflight",
  preflightOptions: {
    readinessPassed: false,
  },
  shouldInclude: [
    "Preflight Commands must include the live blocker report command when Remaining blockers is not None.",
  ],
  body: ({ fixtureDir, preflightArtifacts, sectionArtifacts }) => {
    const artifacts = createReleaseArtifacts(fixtureDir)
    const blockerReportPath = join(fixtureDir, "live-blockers.json")

    writeFileSync(
      blockerReportPath,
      buildBlockerReportFixtureJson({
        generatedAt: "2026-07-12T10:00:00.000Z",
      }),
    )

    return buildEvidenceFile({
      preflightArtifacts,
      releaseSummary: buildCompleteReleaseSummary({
        artifacts,
        liveBlockerReport: `qa:mvp-live-blocker-report:prod wrote ${blockerReportPath}.`,
        remainingBlockers:
          "Shared-Link Public Preview still needs a deployed share URL.",
      }),
      sectionArtifacts,
      sectionCheckbox: "[x]",
    })
  },
})

runScenario({
  expectedStatus: 1,
  fileName: "blockers-with-mismatched-preflight-report-path.md",
  label: "remaining blockers with mismatched preflight report path",
  preflightOptions: {
    readinessPassed: false,
  },
  shouldInclude: [
    "Preflight Commands live blocker report artifact must show the same blocker JSON path referenced in Release Gate Summary.",
  ],
  body: ({ fixtureDir, preflightArtifacts, sectionArtifacts }) => {
    const artifacts = createReleaseArtifacts(fixtureDir)
    const blockerReportPath = join(fixtureDir, "other-live-blockers.json")

    writeFileSync(
      blockerReportPath,
      buildBlockerReportFixtureJson({
        generatedAt: "2026-07-12T10:00:00.000Z",
      }),
    )

    return buildEvidenceFile({
      includeBlockerReportPreflight: true,
      preflightArtifacts,
      releaseSummary: buildCompleteReleaseSummary({
        artifacts,
        liveBlockerReport: `qa:mvp-live-blocker-report:prod wrote ${blockerReportPath}.`,
        remainingBlockers:
          "Shared-Link Public Preview still needs a deployed share URL.",
      }),
      sectionArtifacts,
      sectionCheckbox: "[x]",
    })
  },
})

runScenario({
  expectedStatus: 1,
  fileName: "no-blockers-with-blocker-report.md",
  label: "no remaining blockers with blocker report",
  shouldInclude: [
    "Release Gate Summary Live blocker report must be None when Remaining blockers is None.",
  ],
  body: ({ fixtureDir, preflightArtifacts, sectionArtifacts }) => {
    const artifacts = createReleaseArtifacts(fixtureDir)
    const blockerReportPath = join(fixtureDir, "old-live-blockers.json")

    writeFileSync(
      blockerReportPath,
      buildBlockerReportFixtureJson({
        generatedAt: "2026-07-12T10:00:00.000Z",
      }),
    )

    return buildEvidenceFile({
      preflightArtifacts,
      releaseSummary: buildCompleteReleaseSummary({
        artifacts,
        liveBlockerReport: `qa:mvp-live-blocker-report:prod wrote ${blockerReportPath}.`,
      }),
      sectionCheckbox: "[x]",
      sectionArtifacts,
    })
  },
})

runScenario({
  expectedStatus: 1,
  fileName: "blockers-with-missing-report-file.md",
  label: "remaining blockers with missing blocker report file",
  shouldInclude: [
    "Release Gate Summary Live blocker report path does not exist:",
  ],
  body: ({ fixtureDir, sectionArtifacts }) => {
    const artifacts = createReleaseArtifacts(fixtureDir)
    const missingReportPath = join(fixtureDir, "missing-live-blockers.json")

    return buildEvidenceFile({
      releaseSummary: buildCompleteReleaseSummary({
        artifacts,
        liveBlockerReport: `qa:mvp-live-blocker-report:prod wrote ${missingReportPath}.`,
        remainingBlockers:
          "Shared-Link Public Preview still needs a deployed share URL.",
      }),
      sectionCheckbox: "[x]",
      sectionArtifacts,
    })
  },
})

runScenario({
  expectedStatus: 1,
  fileName: "blockers-with-report-directory.md",
  label: "remaining blockers with blocker report directory",
  preflightOptions: {
    readinessPassed: false,
  },
  shouldInclude: [
    "Release Gate Summary Live blocker report path must be a file:",
  ],
  body: ({ fixtureDir, preflightArtifacts, sectionArtifacts }) => {
    const artifacts = createReleaseArtifacts(fixtureDir)
    const reportDirectoryPath = join(fixtureDir, "live-blockers.json")

    mkdirSync(reportDirectoryPath, { recursive: true })

    return buildEvidenceFile({
      preflightArtifacts,
      releaseSummary: buildCompleteReleaseSummary({
        artifacts,
        liveBlockerReport: `qa:mvp-live-blocker-report:prod wrote ${reportDirectoryPath}.`,
        remainingBlockers:
          "Shared-Link Public Preview still needs a deployed share URL.",
      }),
      sectionCheckbox: "[x]",
      sectionArtifacts,
    })
  },
})

runScenario({
  expectedStatus: 1,
  fileName: "blockers-with-stale-report-file.md",
  label: "remaining blockers with stale blocker report file",
  preflightOptions: {
    readinessPassed: false,
  },
  shouldInclude: [
    "Release Gate Summary Live blocker report generatedAt date must match Run Context Date 2026-07-12.",
  ],
  body: ({ fixtureDir, preflightArtifacts, sectionArtifacts }) => {
    const artifacts = createReleaseArtifacts(fixtureDir)
    const staleReportPath = join(fixtureDir, "stale-live-blockers.json")

    writeFileSync(
      staleReportPath,
      buildBlockerReportFixtureJson({
        generatedAt: "2026-07-11T23:59:00.000Z",
      }),
    )

    return buildEvidenceFile({
      preflightArtifacts,
      releaseSummary: buildCompleteReleaseSummary({
        artifacts,
        liveBlockerReport: `qa:mvp-live-blocker-report:prod wrote ${staleReportPath}.`,
        remainingBlockers:
          "Shared-Link Public Preview still needs a deployed share URL.",
      }),
      sectionCheckbox: "[x]",
      sectionArtifacts,
    })
  },
})

runScenario({
  expectedStatus: 1,
  fileName: "blockers-with-undated-report-file.md",
  label: "remaining blockers with undated blocker report file",
  preflightOptions: {
    readinessPassed: false,
  },
  shouldInclude: [
    "Release Gate Summary Live blocker report must include generatedAt so it can be matched to the QA run date.",
  ],
  body: ({ fixtureDir, preflightArtifacts, sectionArtifacts }) => {
    const artifacts = createReleaseArtifacts(fixtureDir)
    const undatedReportPath = join(fixtureDir, "undated-live-blockers.json")

    writeFileSync(undatedReportPath, buildBlockerReportFixtureJson())

    return buildEvidenceFile({
      preflightArtifacts,
      releaseSummary: buildCompleteReleaseSummary({
        artifacts,
        liveBlockerReport: `qa:mvp-live-blocker-report:prod wrote ${undatedReportPath}.`,
        remainingBlockers:
          "Shared-Link Public Preview still needs a deployed share URL.",
      }),
      sectionCheckbox: "[x]",
      sectionArtifacts,
    })
  },
})

runScenario({
  expectedStatus: 1,
  fileName: "blockers-with-missing-count-report-file.md",
  label: "remaining blockers with missing blocker report count",
  preflightOptions: {
    readinessPassed: false,
  },
  shouldInclude: [
    "Release Gate Summary Live blocker report missingRequiredCount must match missingRequired rows.",
  ],
  body: ({ fixtureDir, preflightArtifacts, sectionArtifacts }) => {
    const artifacts = createReleaseArtifacts(fixtureDir)
    const missingCountReportPath = join(
      fixtureDir,
      "missing-count-live-blockers.json",
    )

    writeFileSync(
      missingCountReportPath,
      buildBlockerReportFixtureJson({
        generatedAt: "2026-07-12T10:00:00.000Z",
        includeMissingRequiredCount: false,
      }),
    )

    return buildEvidenceFile({
      preflightArtifacts,
      releaseSummary: buildCompleteReleaseSummary({
        artifacts,
        liveBlockerReport: `qa:mvp-live-blocker-report:prod wrote ${missingCountReportPath}.`,
        remainingBlockers:
          "Shared-Link Public Preview still needs a deployed share URL.",
      }),
      sectionCheckbox: "[x]",
      sectionArtifacts,
    })
  },
})

runScenario({
  expectedStatus: 1,
  fileName: "blockers-with-missing-section-rows.md",
  label: "remaining blockers with missing section rows",
  preflightOptions: {
    readinessPassed: false,
  },
  shouldInclude: [
    "Release Gate Summary Live blocker report must include checklist section rows.",
  ],
  body: ({ fixtureDir, preflightArtifacts, sectionArtifacts }) => {
    const artifacts = createReleaseArtifacts(fixtureDir)
    const missingSectionsReportPath = join(
      fixtureDir,
      "missing-sections-live-blockers.json",
    )

    writeFileSync(
      missingSectionsReportPath,
      buildBlockerReportFixtureJson({
        generatedAt: "2026-07-12T10:00:00.000Z",
        includeSections: false,
      }),
    )

    return buildEvidenceFile({
      includeBlockerReportPreflight: true,
      preflightArtifacts,
      releaseSummary: buildCompleteReleaseSummary({
        artifacts,
        liveBlockerReport: `qa:mvp-live-blocker-report:prod wrote ${missingSectionsReportPath}.`,
        remainingBlockers:
          "Shared-Link Public Preview still needs a deployed share URL.",
      }),
      sectionCheckbox: "[x]",
      sectionArtifacts,
    })
  },
})

runScenario({
  expectedStatus: 1,
  fileName: "blockers-with-unmatched-missing-section-item.md",
  label: "remaining blockers with missing item not represented in section rows",
  preflightOptions: {
    readinessPassed: false,
  },
  shouldInclude: [
    "Release Gate Summary Live blocker report missingRequired row must match a missing item in checklist section Shared-Link Public Preview: Deployed share URL.",
  ],
  body: ({ fixtureDir, preflightArtifacts, sectionArtifacts }) => {
    const artifacts = createReleaseArtifacts(fixtureDir)
    const mismatchedSectionsReportPath = join(
      fixtureDir,
      "mismatched-sections-live-blockers.json",
    )

    writeFileSync(
      mismatchedSectionsReportPath,
      buildBlockerReportFixtureJson({
        generatedAt: "2026-07-12T10:00:00.000Z",
        includeMissingRequiredSectionItems: false,
      }),
    )

    return buildEvidenceFile({
      includeBlockerReportPreflight: true,
      preflightArtifacts,
      releaseSummary: buildCompleteReleaseSummary({
        artifacts,
        liveBlockerReport: `qa:mvp-live-blocker-report:prod wrote ${mismatchedSectionsReportPath}.`,
        remainingBlockers:
          "Shared-Link Public Preview still needs a deployed share URL.",
      }),
      sectionCheckbox: "[x]",
      sectionArtifacts,
    })
  },
})

runScenario({
  expectedStatus: 1,
  fileName: "blockers-with-mismatched-count-report-file.md",
  label: "remaining blockers with mismatched blocker report count",
  preflightOptions: {
    readinessPassed: false,
  },
  shouldInclude: [
    "Release Gate Summary Live blocker report missingRequiredCount must match missingRequired rows.",
  ],
  body: ({ fixtureDir, preflightArtifacts, sectionArtifacts }) => {
    const artifacts = createReleaseArtifacts(fixtureDir)
    const mismatchedCountReportPath = join(
      fixtureDir,
      "mismatched-count-live-blockers.json",
    )

    writeFileSync(
      mismatchedCountReportPath,
      buildBlockerReportFixtureJson({
        generatedAt: "2026-07-12T10:00:00.000Z",
        missingRequiredCount: 99,
      }),
    )

    return buildEvidenceFile({
      preflightArtifacts,
      releaseSummary: buildCompleteReleaseSummary({
        artifacts,
        liveBlockerReport: `qa:mvp-live-blocker-report:prod wrote ${mismatchedCountReportPath}.`,
        remainingBlockers:
          "Shared-Link Public Preview still needs a deployed share URL.",
      }),
      sectionCheckbox: "[x]",
      sectionArtifacts,
    })
  },
})

runScenario({
  expectedStatus: 1,
  fileName: "blockers-with-stale-public-url-proof.md",
  label: "remaining blockers with stale public URL proof",
  preflightOptions: {
    readinessPassed: false,
  },
  shouldInclude: [
    "Release Gate Summary Live blocker report publicConfiguredValues must include API_URL=https://ewatrade.com for production QA.",
  ],
  body: ({ fixtureDir, preflightArtifacts, sectionArtifacts }) => {
    const artifacts = createReleaseArtifacts(fixtureDir)
    const stalePublicUrlReportPath = join(
      fixtureDir,
      "stale-public-url-live-blockers.json",
    )

    writeFileSync(
      stalePublicUrlReportPath,
      buildBlockerReportFixtureJson({
        generatedAt: "2026-07-12T10:00:00.000Z",
        publicConfiguredValues: {
          ...PRODUCTION_PUBLIC_CONFIGURED_VALUES,
          API_URL: "https://api.ewatrade.test",
        },
      }),
    )

    return buildEvidenceFile({
      preflightArtifacts,
      releaseSummary: buildCompleteReleaseSummary({
        artifacts,
        liveBlockerReport: `qa:mvp-live-blocker-report:prod wrote ${stalePublicUrlReportPath}.`,
        remainingBlockers:
          "Shared-Link Public Preview still needs a deployed share URL.",
      }),
      sectionCheckbox: "[x]",
      sectionArtifacts,
    })
  },
})

runScenario({
  expectedStatus: 1,
  fileName: "blockers-with-missing-production-target-proof.md",
  label: "remaining blockers with missing production target proof",
  preflightOptions: {
    readinessPassed: false,
  },
  shouldInclude: [
    "Release Gate Summary Live blocker report must be generated from the production env target.",
  ],
  body: ({ fixtureDir, preflightArtifacts, sectionArtifacts }) => {
    const artifacts = createReleaseArtifacts(fixtureDir)
    const missingProductionTargetReportPath = join(
      fixtureDir,
      "missing-production-target-live-blockers.json",
    )

    writeFileSync(
      missingProductionTargetReportPath,
      buildBlockerReportFixtureJson({
        generatedAt: "2026-07-12T10:00:00.000Z",
        includeProductionEnvTarget: false,
      }),
    )

    return buildEvidenceFile({
      preflightArtifacts,
      releaseSummary: buildCompleteReleaseSummary({
        artifacts,
        liveBlockerReport: `qa:mvp-live-blocker-report:prod wrote ${missingProductionTargetReportPath}.`,
        remainingBlockers:
          "Shared-Link Public Preview still needs a deployed share URL.",
      }),
      sectionCheckbox: "[x]",
      sectionArtifacts,
    })
  },
})

runScenario({
  expectedStatus: 1,
  fileName: "blockers-with-local-production-target-proof.md",
  label: "remaining blockers with local production target proof",
  preflightOptions: {
    readinessPassed: false,
  },
  shouldInclude: [
    "Release Gate Summary Live blocker report must be generated from the production env target.",
  ],
  body: ({ fixtureDir, preflightArtifacts, sectionArtifacts }) => {
    const artifacts = createReleaseArtifacts(fixtureDir)
    const localProductionTargetReportPath = join(
      fixtureDir,
      "local-production-target-live-blockers.json",
    )

    writeFileSync(
      localProductionTargetReportPath,
      buildBlockerReportFixtureJson({
        generatedAt: "2026-07-12T10:00:00.000Z",
        isProductionEnvTarget: false,
      }),
    )

    return buildEvidenceFile({
      preflightArtifacts,
      releaseSummary: buildCompleteReleaseSummary({
        artifacts,
        liveBlockerReport: `qa:mvp-live-blocker-report:prod wrote ${localProductionTargetReportPath}.`,
        remainingBlockers:
          "Shared-Link Public Preview still needs a deployed share URL.",
      }),
      sectionCheckbox: "[x]",
      sectionArtifacts,
    })
  },
})

runScenario({
  expectedStatus: 1,
  fileName: "blockers-with-missing-public-url-proof.md",
  label: "remaining blockers with missing public URL proof",
  preflightOptions: {
    readinessPassed: false,
  },
  shouldInclude: [
    "Release Gate Summary Live blocker report publicConfiguredValues must include API_URL=https://ewatrade.com for production QA.",
  ],
  body: ({ fixtureDir, preflightArtifacts, sectionArtifacts }) => {
    const artifacts = createReleaseArtifacts(fixtureDir)
    const missingPublicUrlReportPath = join(
      fixtureDir,
      "missing-public-url-live-blockers.json",
    )

    writeFileSync(
      missingPublicUrlReportPath,
      buildBlockerReportFixtureJson({
        generatedAt: "2026-07-12T10:00:00.000Z",
        includePublicConfiguredValues: false,
      }),
    )

    return buildEvidenceFile({
      preflightArtifacts,
      releaseSummary: buildCompleteReleaseSummary({
        artifacts,
        liveBlockerReport: `qa:mvp-live-blocker-report:prod wrote ${missingPublicUrlReportPath}.`,
        remainingBlockers:
          "Shared-Link Public Preview still needs a deployed share URL.",
      }),
      sectionCheckbox: "[x]",
      sectionArtifacts,
    })
  },
})

runScenario({
  expectedStatus: 1,
  fileName: "missing-release-artifact-files.md",
  label: "missing release artifact files",
  shouldInclude: [
    "Release Gate Summary Google evidence artifact path does not exist:",
    "Release Gate Summary Shared-link live evidence artifact path does not exist:",
    "Release Gate Summary Public preview evidence artifact path does not exist:",
    "Release Gate Summary Browser checkout evidence artifact path does not exist:",
    "Release Gate Summary Device smoke evidence artifact path does not exist:",
  ],
  body: ({ fixtureDir, sectionArtifacts }) =>
    buildEvidenceFile({
      releaseSummary: buildCompleteReleaseSummary({
        artifacts: {
          browser: join(fixtureDir, "missing-browser-checkout.png"),
          deviceSmoke: join(fixtureDir, "missing-device-smoke.xml"),
          google: join(fixtureDir, "missing-google-live.json"),
          preview: join(fixtureDir, "missing-share-preview.json"),
          shared: join(fixtureDir, "missing-shared-link-live.json"),
        },
      }),
      sectionCheckbox: "[x]",
      sectionArtifacts,
    }),
})

runScenario({
  expectedStatus: 1,
  fileName: "release-artifact-directory.md",
  label: "release artifact directory",
  shouldInclude: [
    "Release Gate Summary Google evidence artifact path must be a file:",
  ],
  body: ({ fixtureDir, sectionArtifacts }) => {
    const artifacts = createReleaseArtifacts(fixtureDir)

    rmSync(artifacts.google, { force: true })
    mkdirSync(artifacts.google, { recursive: true })

    return buildEvidenceFile({
      releaseSummary: buildCompleteReleaseSummary({ artifacts }),
      sectionCheckbox: "[x]",
      sectionArtifacts,
    })
  },
})

runScenario({
  expectedStatus: 1,
  fileName: "invalid-release-artifact-files.md",
  label: "invalid release artifact files",
  shouldInclude: [
    "Release Gate Summary Google evidence artifact file must be valid JSON:",
    "Release Gate Summary Browser checkout evidence artifact file must be a valid PNG:",
  ],
  body: ({ fixtureDir, sectionArtifacts }) => {
    const artifacts = createReleaseArtifacts(fixtureDir)

    writeFileSync(artifacts.google, "not json\n")
    writeFileSync(artifacts.browser, "not png\n")

    return buildEvidenceFile({
      releaseSummary: buildCompleteReleaseSummary({ artifacts }),
      sectionCheckbox: "[x]",
      sectionArtifacts,
    })
  },
})

runScenario({
  expectedStatus: 1,
  fileName: "wrong-release-artifact-content.md",
  label: "wrong release artifact content",
  shouldInclude: [
    "Release Gate Summary Google evidence artifact is missing required proof markers:",
    "Release Gate Summary Shared-link live evidence artifact is missing required proof markers:",
    "Release Gate Summary Public preview evidence artifact is missing required proof markers:",
  ],
  body: ({ fixtureDir, sectionArtifacts }) => {
    const artifacts = createReleaseArtifacts(fixtureDir)

    writeFileSync(artifacts.google, `${JSON.stringify({ ok: true })}\n`)
    writeFileSync(artifacts.shared, `${JSON.stringify({ ok: true })}\n`)
    writeFileSync(artifacts.preview, `${JSON.stringify({ ok: true })}\n`)

    return buildEvidenceFile({
      releaseSummary: buildCompleteReleaseSummary({ artifacts }),
      sectionCheckbox: "[x]",
      sectionArtifacts,
    })
  },
})

runScenario({
  expectedStatus: 1,
  fileName: "stale-release-artifact-content.md",
  label: "stale release artifact content",
  shouldInclude: [
    "Release Gate Summary Google evidence artifact checkedAt date must match Run Context Date 2026-07-12.",
    "Release Gate Summary Shared-link live evidence artifact checkedAt date must match Run Context Date 2026-07-12.",
    "Release Gate Summary Public preview evidence artifact checkedAt date must match Run Context Date 2026-07-12.",
  ],
  body: ({ fixtureDir, preflightArtifacts, sectionArtifacts }) => {
    const artifacts = createReleaseArtifacts(fixtureDir, {
      checkedAt: "2026-07-11T23:59:00.000Z",
    })

    return buildEvidenceFile({
      preflightArtifacts,
      releaseSummary: buildCompleteReleaseSummary({ artifacts }),
      sectionArtifacts,
      sectionCheckbox: "[x]",
    })
  },
})

runScenario({
  expectedStatus: 1,
  fileName: "missing-release-artifact-checked-at.md",
  label: "missing release artifact checkedAt",
  shouldInclude: [
    "Release Gate Summary Public preview evidence artifact must include checkedAt so it can be matched to the QA run date.",
  ],
  body: ({ fixtureDir, preflightArtifacts, sectionArtifacts }) => {
    const artifacts = createReleaseArtifacts(fixtureDir)

    writeFileSync(
      artifacts.preview,
      `${JSON.stringify({
        checkoutHtmlVerified: true,
        imageFetch: {
          openGraph: true,
          twitter: true,
        },
        metadata: {
          openGraphImageAltVerified: true,
          openGraphVerified: true,
          twitterImageAltVerified: true,
          twitterVerified: true,
        },
        userAgent: "WhatsApp/2.24 EwaTrade-Mobile-Retail-Ops-Preview-QA/1.0",
      })}\n`,
    )

    return buildEvidenceFile({
      preflightArtifacts,
      releaseSummary: buildCompleteReleaseSummary({ artifacts }),
      sectionArtifacts,
      sectionCheckbox: "[x]",
    })
  },
})

runScenario({
  expectedStatus: 1,
  fileName: "empty-device-smoke-artifact.md",
  label: "empty device smoke artifact",
  shouldInclude: [
    "Release Gate Summary Device smoke evidence artifact file must not be empty:",
  ],
  body: ({ fixtureDir, sectionArtifacts }) => {
    const artifacts = createReleaseArtifacts(fixtureDir)

    artifacts.deviceSmoke = join(fixtureDir, "empty-device-smoke.md")
    writeFileSync(artifacts.deviceSmoke, "")

    return buildEvidenceFile({
      releaseSummary: buildCompleteReleaseSummary({ artifacts }),
      sectionCheckbox: "[x]",
      sectionArtifacts,
    })
  },
})

runScenario({
  expectedStatus: 1,
  fileName: "secret-evidence.md",
  label: "secret evidence file",
  shouldInclude: [
    "Evidence file appears to contain a secret: bearer token.",
    "Evidence file appears to contain a secret: live share token in URL.",
  ],
  body: ({ fixtureDir, sectionArtifacts }) =>
    `${buildEvidenceFile({
      releaseSummary: buildCompleteReleaseSummary({
        artifacts: createReleaseArtifacts(fixtureDir),
      }),
      sectionCheckbox: "[x]",
      sectionArtifacts,
    })}\nBearer owner-token-123456\nhttps://shop.test/p/store/product?share=secret-token\n`,
})

runScenario({
  expectedStatus: 1,
  fileName: "secret-artifacts.md",
  label: "secret evidence artifacts",
  shouldInclude: [
    "Preflight Commands hands-on checklist artifact appears to contain a secret: bearer token.",
    "Release Gate Summary Google evidence artifact appears to contain a secret: Google ID token assignment.",
    "Launch And Auth Screenshots or logs artifact appears to contain a secret: live share token in URL.",
  ],
  body: ({ fixtureDir, preflightArtifacts, sectionArtifacts }) => {
    const artifacts = createReleaseArtifacts(fixtureDir)
    const secretSectionArtifact = join(fixtureDir, "secret-launch-auth.md")
    const sectionArtifactsWithSecret = {
      ...sectionArtifacts,
      "Launch And Auth": secretSectionArtifact,
    }

    writeFileSync(
      preflightArtifacts.handsOnChecklist,
      "Mobile Retail Ops MVP hands-on smoke checklist\nBearer owner-token-123456\n",
    )
    writeFileSync(
      artifacts.google,
      `${JSON.stringify({
        google_id_token: "token-123456",
        profile: {
          businessContextVerified: true,
          emailMatched: true,
        },
        session: {
          bearerTokenReturned: true,
        },
        tenant: {
          idMatchesProfile: true,
        },
        verification: "auth.verifyMobileGoogle",
      })}\n`,
    )
    writeFileSync(
      secretSectionArtifact,
      "# Launch And Auth\nhttps://shop.test/p/store/product?share=secret-token\n",
    )

    return buildEvidenceFile({
      preflightArtifacts,
      releaseSummary: buildCompleteReleaseSummary({ artifacts }),
      sectionArtifacts: sectionArtifactsWithSecret,
      sectionCheckbox: "[x]",
    })
  },
})

runScenario({
  expectedStatus: 1,
  fileName: "secret-blocker-report.md",
  label: "secret blocker report",
  preflightOptions: {
    readinessPassed: false,
  },
  shouldInclude: [
    "Release Gate Summary Live blocker report appears to contain a secret: OTP value.",
  ],
  body: ({ fixtureDir, preflightArtifacts, sectionArtifacts }) => {
    const artifacts = createReleaseArtifacts(fixtureDir)
    const blockerReportPath = join(fixtureDir, "live-blockers.json")

    writeFileSync(
      blockerReportPath,
      buildBlockerReportFixtureJson({
        generatedAt: "2026-07-12T10:00:00.000Z",
        note: "OTP: 123456",
      }),
    )

    return buildEvidenceFile({
      preflightArtifacts,
      releaseSummary: buildCompleteReleaseSummary({
        artifacts,
        liveBlockerReport: `qa:mvp-live-blocker-report:prod wrote ${blockerReportPath}.`,
        remainingBlockers:
          "Shared-Link Public Preview still needs a deployed share URL.",
      }),
      sectionArtifacts,
      sectionCheckbox: "[x]",
    })
  },
})

console.log("MVP hands-on evidence file fixture checks passed.")

function runScenario(input) {
  const fixtureDir = mkdtempSync(join(tmpdir(), "ewatrade-hands-on-evidence-"))
  const evidenceFile = join(fixtureDir, input.fileName)
  const preflightArtifacts = createPreflightArtifacts(
    fixtureDir,
    input.preflightOptions,
  )
  const sectionArtifacts = createSectionArtifacts(fixtureDir)

  try {
    const body =
      typeof input.body === "function"
        ? input.body({
            evidenceFile,
            fixtureDir,
            preflightArtifacts,
            sectionArtifacts,
          })
        : input.body
    writeFileSync(evidenceFile, body)

    const result = spawnSync(process.execPath, [SCRIPT_PATH, evidenceFile], {
      encoding: "utf8",
    })
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`

    if (result.status !== input.expectedStatus) {
      fail(
        input.label,
        `Expected status ${input.expectedStatus}, received ${result.status}.`,
        output,
      )
    }

    for (const expected of input.shouldInclude) {
      if (!output.includes(expected)) {
        fail(input.label, `Expected output to include: ${expected}`, output)
      }
    }
  } finally {
    rmSync(fixtureDir, { force: true, recursive: true })
  }
}

function createPreflightArtifacts(fixtureDir, options = {}) {
  const artifactDir = join(fixtureDir, "preflight-artifacts")
  mkdirSync(artifactDir, { recursive: true })
  const blockerReportPath = join(fixtureDir, "live-blockers.json")
  const readinessPassed = options.readinessPassed ?? true

  const artifacts = {
    blockerReport: join(artifactDir, "live-blocker-report.log"),
    fullReadiness: join(artifactDir, "full-readiness.log"),
    handsOnChecklist: join(artifactDir, "hands-on-checklist.log"),
    liveEnvChecklist: join(artifactDir, "live-env-checklist.log"),
    liveReadiness: join(artifactDir, "live-readiness.log"),
  }

  writeFileSync(
    artifacts.handsOnChecklist,
    "Mobile Retail Ops MVP hands-on smoke checklist\n== Preflight ==\n",
  )
  writeFileSync(
    artifacts.liveEnvChecklist,
    "Mobile Retail Ops MVP live environment checklist\nRequired missing values:\n- none\n",
  )
  writeFileSync(
    artifacts.blockerReport,
    `Mobile Retail Ops MVP live environment checklist\nLive checklist report written: ${blockerReportPath}\n`,
  )
  writeFileSync(
    artifacts.liveReadiness,
    readinessPassed
      ? "Mobile Retail Ops MVP live readiness\nMobile MVP live readiness check passed.\n"
      : "Mobile Retail Ops MVP live readiness\nMobile MVP live readiness check failed.\n",
  )
  writeFileSync(
    artifacts.fullReadiness,
    readinessPassed
      ? "== Source QA ==\n== MVP contract tests ==\nMobile MVP readiness check passed.\n"
      : "== Source QA ==\n== MVP contract tests ==\nMobile MVP readiness check failed.\n",
  )

  return artifacts
}

function createSectionArtifacts(fixtureDir) {
  const artifactDir = join(fixtureDir, "section-artifacts")
  mkdirSync(artifactDir, { recursive: true })

  return Object.fromEntries(
    SECTIONS.map((section) => {
      const artifactPath =
        section === "Launch And Auth"
          ? join(artifactDir, `${slugify(section)}.jpeg`)
          : join(artifactDir, `${slugify(section)}.md`)

      if (artifactPath.endsWith(".jpeg")) {
        writeFileSync(artifactPath, VALID_JPEG_BYTES)
      } else {
        writeFileSync(
          artifactPath,
          `# ${section}\n\nCompleted section smoke proof for fixture validation.\n`,
        )
      }

      return [section, artifactPath]
    }),
  )
}

function createReleaseArtifacts(fixtureDir, options = {}) {
  const artifactDir = join(fixtureDir, "release-artifacts")
  mkdirSync(artifactDir, { recursive: true })
  const checkedAt = options.checkedAt ?? "2026-07-12T10:00:00.000Z"

  const artifacts = {
    browser: join(artifactDir, "browser-checkout.png"),
    deviceSmoke: join(artifactDir, "device-smoke.xml"),
    google: join(artifactDir, "google-live.json"),
    preview: join(artifactDir, "share-preview.json"),
    shared: join(artifactDir, "shared-link-live.json"),
  }

  writeFileSync(
    artifacts.google,
    `${JSON.stringify({
      checkedAt,
      profile: {
        businessContextVerified: true,
        emailMatched: true,
      },
      session: {
        bearerTokenReturned: true,
      },
      tenant: {
        idMatchesProfile: true,
      },
      verification: "auth.verifyMobileGoogle",
    })}\n`,
  )
  writeFileSync(
    artifacts.shared,
    `${JSON.stringify({
      checkedAt,
      followUp: {
        recorded: true,
      },
      notification: {
        verified: true,
      },
      order: {
        requested: true,
      },
      publicPage: {
        fetched: true,
        metadataVerified: true,
      },
      shareLink: {
        deactivated: true,
      },
    })}\n`,
  )
  writeFileSync(
    artifacts.preview,
    `${JSON.stringify({
      checkedAt,
      checkoutHtmlVerified: true,
      imageFetch: {
        openGraph: true,
        twitter: true,
      },
      metadata: {
        openGraphImageAltVerified: true,
        openGraphVerified: true,
        twitterImageAltVerified: true,
        twitterVerified: true,
      },
      userAgent: "WhatsApp/2.24 EwaTrade-Mobile-Retail-Ops-Preview-QA/1.0",
    })}\n`,
  )
  writeFileSync(artifacts.browser, VALID_PNG_BYTES)
  writeFileSync(
    artifacts.deviceSmoke,
    '<hierarchy><node text="Mobile Retail Ops smoke passed" /></hierarchy>\n',
  )

  return artifacts
}

function buildBlockerReportFixtureJson({
  generatedAt,
  includeMissingRequiredCount = true,
  includeMissingRequiredSectionItems = true,
  includeProductionEnvTarget = true,
  includePublicConfiguredValues = true,
  includeSections = true,
  isProductionEnvTarget = true,
  missingRequiredCount = 1,
  note,
  publicConfiguredValues = PRODUCTION_PUBLIC_CONFIGURED_VALUES,
} = {}) {
  return `${JSON.stringify(
    {
      ...(generatedAt ? { generatedAt } : {}),
      missingRequired: BLOCKER_REPORT_MISSING_REQUIRED_ROWS,
      ...(includeMissingRequiredCount ? { missingRequiredCount } : {}),
      ...(includeProductionEnvTarget ? { isProductionEnvTarget } : {}),
      ...(note ? { note } : {}),
      ...(includePublicConfiguredValues ? { publicConfiguredValues } : {}),
      reportType: "mobile-retail-ops-live-env-checklist",
      ...(includeSections
        ? {
            sections: buildBlockerReportSections({
              includeMissingRequiredSectionItems,
            }),
          }
        : {}),
    },
    null,
    2,
  )}\n`
}

function buildBlockerReportSections({
  includeMissingRequiredSectionItems = true,
} = {}) {
  return LIVE_BLOCKER_REPORT_SECTIONS.map((title) => ({
    items: [
      ...BLOCKER_REPORT_MISSING_REQUIRED_ROWS.filter(
        (item) => includeMissingRequiredSectionItems && item.section === title,
      ).map((item) => ({
        keys: item.keys,
        label: item.label,
        optional: false,
        status: "missing",
      })),
      {
        keys: [
          `${title.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_FIXTURE_KEY`,
        ],
        label: `${title} fixture row`,
        optional: false,
        status:
          title === "Shared-Link Public Preview" ? "missing" : "configured",
      },
    ],
    title,
  }))
}

function buildCompleteReleaseSummary({
  artifacts,
  deviceSmokeEvidence = `full device smoke evidence is captured in the section notes and screenshots; artifact ${artifacts.deviceSmoke}.`,
  liveBlockerReport = "None.",
  productionCommands = true,
  remainingBlockers = "None.",
}) {
  const commandSuffix = productionCommands ? ":prod" : ""

  return [
    "- [x] Live Google provider flow has current evidence.",
    "- [x] Live shared-link write/email flow has current evidence.",
    "- [x] Deployed public preview has current evidence.",
    "- [x] Browser checkout has current evidence.",
    "- [x] Full device smoke run has current evidence.",
    `- Google evidence: qa:google-oauth-live-run${commandSuffix} passed against the production API host; evidence ${artifacts.google}.`,
    `- Shared-link live evidence: qa:shared-link-live-run${commandSuffix} created, notified, followed up, and deactivated the disposable link; evidence ${artifacts.shared}.`,
    `- Public preview evidence: qa:shared-link-preview${commandSuffix} passed for the production storefront host; evidence ${artifacts.preview}.`,
    `- Browser checkout evidence: qa:shared-link-browser-checkout${commandSuffix} submitted a disposable customer order and reached the requested state; screenshot ${artifacts.browser}.`,
    `- Device smoke evidence: ${deviceSmokeEvidence}`,
    `- Remaining blockers: ${remainingBlockers}`,
    `- Live blocker report: ${liveBlockerReport}`,
  ].join("\n")
}

function buildVagueReleaseSummary(artifacts) {
  return [
    "- [x] Live Google provider flow has current evidence.",
    "- [x] Live shared-link write/email flow has current evidence.",
    "- [x] Deployed public preview has current evidence.",
    "- [x] Browser checkout has current evidence.",
    "- [x] Full device smoke run has current evidence.",
    `- Google evidence: completed against production; evidence ${artifacts.google}.`,
    `- Shared-link live evidence: completed link write and email proof; evidence ${artifacts.shared}.`,
    `- Public preview evidence: completed metadata proof; evidence ${artifacts.preview}.`,
    `- Browser checkout evidence: completed browser checkout proof; screenshot ${artifacts.browser}.`,
    `- Device smoke evidence: completed on Android; artifact ${artifacts.deviceSmoke}.`,
    "- Remaining blockers: None.",
    "- Live blocker report: None.",
  ].join("\n")
}

function buildEvidenceFile({
  apiTargetHost = "api host recorded",
  blankContext = false,
  date = "2026-07-12",
  includeBlockerReportPreflight = false,
  omitReadinessPreflights = false,
  preflightArtifacts,
  qaMode = "production",
  releaseSummary,
  sectionCheckbox,
  sectionArtifacts = {},
  storefrontTargetHost = "storefront host recorded",
  useProductionPreflightCommands = true,
  withSectionFields = true,
}) {
  const commandSuffix = useProductionPreflightCommands ? ":prod" : ""
  const sectionBodies = SECTIONS.map((section) => {
    const sectionArtifact = sectionArtifacts[section] ?? "/tmp/evidence.png"

    return [
      `## ${section}`,
      `- ${sectionCheckbox} ${section} smoke item completed.`,
      `- Evidence:${withSectionFields ? ` ${section} observed on device.` : ""}`,
      `- Screenshots or logs:${withSectionFields ? ` ${sectionArtifact}` : ""}`,
      `- Notes:${withSectionFields ? " No visual overlap or unsafe copy observed." : ""}`,
      "",
    ].join("\n")
  }).join("\n")

  return [
    "# Mobile Retail Ops MVP Hands-On Evidence",
    "",
    "## Safe Evidence Rules",
    "- Do not paste OTPs, bearer tokens, Google ID tokens, customer passwords, or live share tokens.",
    "",
    "## Preflight Commands",
    `- ${sectionCheckbox} bun run --cwd apps/mobile qa:mvp-hands-on-checklist${commandSuffix}${formatPreflightArtifact(preflightArtifacts?.handsOnChecklist)}`,
    `- ${sectionCheckbox} bun run --cwd apps/mobile qa:mvp-live-env-checklist${commandSuffix}${formatPreflightArtifact(preflightArtifacts?.liveEnvChecklist)}`,
    ...(includeBlockerReportPreflight
      ? [
          `- ${sectionCheckbox} bun run --cwd apps/mobile qa:mvp-live-blocker-report:prod${formatPreflightArtifact(preflightArtifacts?.blockerReport)}`,
        ]
      : []),
    ...(omitReadinessPreflights
      ? []
      : [
          `- ${sectionCheckbox} bun run --cwd apps/mobile qa:mvp-live-readiness${commandSuffix}${formatPreflightArtifact(preflightArtifacts?.liveReadiness)}`,
          `- ${sectionCheckbox} bun run --cwd apps/mobile qa:mvp-readiness${commandSuffix}${formatPreflightArtifact(preflightArtifacts?.fullReadiness)}`,
        ]),
    "",
    "## Run Context",
    `- Date:${blankContext ? "" : ` ${date}`}`,
    `- Device or emulator:${blankContext ? "" : " Pixel_3a_API_34"}`,
    `- OS/API target:${blankContext ? "" : " Android API 34"}`,
    `- Viewport:${blankContext ? "" : " 1080x2220"}`,
    `- API target host:${blankContext ? "" : ` ${apiTargetHost}`}`,
    `- Storefront target host:${blankContext ? "" : ` ${storefrontTargetHost}`}`,
    `- QA mode:${blankContext ? "" : ` ${qaMode}`}`,
    `- Tester:${blankContext ? "" : " QA operator"}`,
    "",
    sectionBodies,
    "## Release Gate Summary",
    releaseSummary,
    "",
  ].join("\n")
}

function fail(label, message, output) {
  console.error(`MVP hands-on evidence file fixture failed: ${label}`)
  console.error(message)
  console.error(output)
  process.exit(1)
}

function formatPreflightArtifact(artifactPath) {
  return artifactPath ? ` ${artifactPath}` : ""
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}
