import { spawnSync } from "node:child_process"
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const SCRIPT_PATH = new URL("./check-expo-env-attachment.mjs", import.meta.url)
  .pathname
const PROJECT_ID = "532f9a55-f4f6-4d4e-b60b-ea6fa8807a3b"
const DEVELOPMENT_KEYS = [
  "APP_VARIANT",
  "EXPO_PUBLIC_APP_VARIANT",
  "EXPO_PUBLIC_BASE_URL",
  "EXPO_PUBLIC_API_URL",
  "EXPO_PUBLIC_API_PORT",
  "EXPO_PUBLIC_WEB_URL",
  "EXPO_PUBLIC_WEB_PORT",
  "EXPO_PUBLIC_CHAT_URL",
  "EXPO_PUBLIC_CHAT_PORT",
  "EXPO_PUBLIC_GOOGLE_CLIENT_ID",
  "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID",
  "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID",
  "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_WEB_CLIENT_ID",
  "GOOGLE_ANDROID_CLIENT_ID",
  "GOOGLE_IOS_CLIENT_ID",
  "EXPO_PORT",
]
const PRODUCTION_KEYS = DEVELOPMENT_KEYS.filter(
  (key) =>
    ![
      "EXPO_PUBLIC_API_PORT",
      "EXPO_PUBLIC_WEB_PORT",
      "EXPO_PUBLIC_CHAT_PORT",
      "EXPO_PORT",
    ].includes(key),
).concat("EXPO_PUBLIC_LEGAL_ORIGIN", "EXPO_PUBLIC_LOGLY_ENABLED")
const PREVIEW_KEYS = [
  "EXPO_PUBLIC_BASE_URL",
  "EXPO_PUBLIC_API_URL",
  "EXPO_PUBLIC_WEB_URL",
  "EXPO_PUBLIC_LEGAL_ORIGIN",
  "EXPO_PUBLIC_CHAT_URL",
  "EXPO_PUBLIC_CUSTOMER_CHAT_HOST",
]

runScenario({
  expectedStatus: 0,
  label: "Preview-only attachment matches the isolated local origins",
  selectedEnvironment: "preview",
  shouldInclude: ["Expo env attachment check passed."],
})

runScenario({
  expectedStatus: 1,
  label: "Preview remote API cannot point to Production",
  selectedEnvironment: "preview",
  mutate: (fixture) => {
    writeFileSync(
      fixture.previewList,
      easList("preview", PREVIEW_KEYS, {
        ...envValues("preview", false),
        EXPO_PUBLIC_API_URL: "https://api.production.example.test",
      }),
    )
  },
  shouldInclude: [
    "Expo preview env EXPO_PUBLIC_API_URL does not match the local release configuration.",
  ],
})

runScenario({
  expectedStatus: 1,
  label: "Preview analytics cannot start before age entry",
  selectedEnvironment: "preview",
  mutate: (fixture) => {
    writeFileSync(
      fixture.previewList,
      easList("preview", [...PREVIEW_KEYS, "EXPO_PUBLIC_LOGLY_ENABLED"], {
        ...envValues("preview", false),
        EXPO_PUBLIC_LOGLY_ENABLED: "true",
      }),
    )
  },
  shouldInclude: [
    "Expo preview env EXPO_PUBLIC_LOGLY_ENABLED must be absent or explicitly false.",
  ],
})

runScenario({
  expectedStatus: 0,
  label: "valid static and Expo list evidence",
  shouldInclude: ["Expo env attachment check passed."],
})

runScenario({
  expectedStatus: 1,
  label: "remote production Sentry enabled",
  mutate: (fixture) => {
    writeFileSync(
      fixture.productionList,
      easList(
        "production",
        [...PRODUCTION_KEYS, "EXPO_PUBLIC_SENTRY_ENABLED"],
        { EXPO_PUBLIC_SENTRY_ENABLED: "true" },
      ),
    )
  },
  shouldInclude: [
    "Expo production env EXPO_PUBLIC_SENTRY_ENABLED must be absent or explicitly false.",
  ],
})

runScenario({
  expectedStatus: 1,
  label: "missing production attachment",
  mutate: (fixture) => {
    writeFileSync(
      fixture.productionList,
      easList(
        "production",
        PRODUCTION_KEYS.filter((key) => key !== "APP_VARIANT"),
      ),
    )
  },
  shouldInclude: [
    "Expo production env is missing project-scoped keys: APP_VARIANT.",
  ],
})

runScenario({
  expectedStatus: 1,
  label: "wrong project id",
  mutate: (fixture) => {
    writeFileSync(
      join(fixture.mobileDir, "app.config.ts"),
      appConfig("00000000-0000-0000-0000-000000000000"),
    )
  },
  shouldInclude: [
    "app.config.ts must keep the Expo project id mapped to the published ẸwáTrade project.",
  ],
})

runScenario({
  expectedStatus: 1,
  label: "wrong production API URL value",
  mutate: (fixture) => {
    writeFileSync(
      fixture.productionList,
      easList("production", PRODUCTION_KEYS, {
        EXPO_PUBLIC_API_URL: "https://api.ewatrade.test",
      }),
    )
  },
  shouldInclude: [
    "Expo production env EXPO_PUBLIC_API_URL does not match the local release configuration.",
  ],
})

runScenario({
  expectedStatus: 1,
  label: "empty remote production legal origin",
  mutate: (fixture) => {
    writeFileSync(
      fixture.productionList,
      easList("production", PRODUCTION_KEYS, {
        EXPO_PUBLIC_LEGAL_ORIGIN: "",
      }),
    )
  },
  shouldInclude: [
    "Expo production env EXPO_PUBLIC_LEGAL_ORIGIN does not match the local release configuration.",
  ],
})

runScenario({
  expectedStatus: 1,
  label: "analytics cannot be re-enabled in Expo Production",
  mutate: (fixture) => {
    writeFileSync(
      fixture.productionList,
      easList("production", PRODUCTION_KEYS, {
        EXPO_PUBLIC_LOGLY_ENABLED: "true",
      }),
    )
  },
  shouldInclude: [
    "Expo production env EXPO_PUBLIC_LOGLY_ENABLED does not match the local release configuration.",
  ],
})

runScenario({
  expectedStatus: 0,
  label: "production-only verification ignores development configuration",
  selectedEnvironment: "production",
  mutate: (fixture) => {
    writeFileSync(
      join(fixture.mobileDir, ".env.local"),
      "APP_VARIANT=invalid\n",
    )
  },
  shouldInclude: ["Expo env attachment check passed."],
})

runScenario({
  expectedStatus: 0,
  label: "static check without external list evidence",
  omitListFiles: true,
  shouldInclude: [
    "External Expo env list verification skipped.",
    "Expo env attachment check passed.",
  ],
})

runScenario({
  expectedStatus: 1,
  label: "failed live list does not invent missing remote variables",
  failLiveList: true,
  omitListFiles: true,
  selectedEnvironment: "production",
  shouldInclude: ["EAS env:list failed for production."],
  shouldNotInclude: ["Expo production env is missing project-scoped keys:"],
})

console.log("Expo env attachment fixture checks passed.")

function runScenario(input) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "ewatrade-expo-env-"))
  const mobileDir = join(fixtureRoot, "apps/mobile")
  const developmentList = join(fixtureRoot, "development-eas-list.txt")
  const previewList = join(fixtureRoot, "preview-eas-list.txt")
  const productionList = join(fixtureRoot, "production-eas-list.txt")

  try {
    writeFileSync(join(fixtureRoot, ".keep"), "")
    mkdirSync(mobileDir, { recursive: true })
    writeFileSync(join(mobileDir, "app.config.ts"), appConfig(PROJECT_ID))
    writeFileSync(join(mobileDir, "eas.json"), easJson())
    const developmentEnv = envValues("development", true)
    const previewEnv = envValues("preview", false)
    const productionEnv = envValues("production", false)
    writeFileSync(join(mobileDir, ".env.local"), envFile(developmentEnv))
    writeFileSync(join(mobileDir, ".env.preview"), envFile(previewEnv))
    writeFileSync(join(mobileDir, ".env.production"), envFile(productionEnv))
    writeFileSync(
      developmentList,
      easList("development", DEVELOPMENT_KEYS, developmentEnv),
    )
    writeFileSync(previewList, easList("preview", PREVIEW_KEYS, previewEnv))
    writeFileSync(
      productionList,
      easList("production", PRODUCTION_KEYS, productionEnv),
    )

    input.mutate?.({
      developmentList,
      fixtureRoot,
      mobileDir,
      previewList,
      productionList,
    })

    const env = {
      ...process.env,
      EXPO_ENV_ATTACHMENT_REPO_ROOT: fixtureRoot,
      EXPO_ENV_ATTACHMENT_MOBILE_DIR: mobileDir,
      ...(input.selectedEnvironment
        ? { EXPO_ENV_ATTACHMENT_ONLY: input.selectedEnvironment }
        : {}),
    }

    if (input.failLiveList) {
      const fakeBin = join(fixtureRoot, "bin")
      mkdirSync(fakeBin)
      const fakeBunx = join(fakeBin, "bunx")
      writeFileSync(fakeBunx, "#!/bin/sh\nexit 1\n")
      chmodSync(fakeBunx, 0o755)
      env.PATH = `${fakeBin}:${process.env.PATH ?? ""}`
      env.EXPO_ENV_VERIFY_LIVE = "1"
    }

    if (!input.omitListFiles) {
      env.EXPO_ENV_LIST_DEVELOPMENT_FILE = developmentList
      env.EXPO_ENV_LIST_PREVIEW_FILE = previewList
      env.EXPO_ENV_LIST_PRODUCTION_FILE = productionList
    }

    const result = spawnSync(process.execPath, [SCRIPT_PATH], {
      encoding: "utf8",
      env,
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
    for (const unexpected of input.shouldNotInclude ?? []) {
      if (output.includes(unexpected)) {
        fail(input.label, `Unexpected output: ${unexpected}`, output)
      }
    }
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true })
  }
}

function appConfig(projectId) {
  return `const PROJECT_ID = "${projectId}"

const config = {
  slug: "ewatrade",
  owner: "cipron-startups",
  updates: {
    url: \`https://u.expo.dev/${"${PROJECT_ID}"}\`,
  },
}

export default config
`
}

function easJson() {
  return `${JSON.stringify(
    {
      build: {
        development: {
          env: {
            APP_VARIANT: "development",
          },
        },
        preview: {
          channel: "preview",
          environment: "preview",
          env: { APP_VARIANT: "preview" },
        },
        production: {},
      },
    },
    null,
    2,
  )}\n`
}

function envValues(environment, includePorts) {
  const values = {
    APP_VARIANT: environment,
    EXPO_PUBLIC_API_URL: "https://ewatrade.test",
    EXPO_PUBLIC_APP_VARIANT: environment,
    EXPO_PUBLIC_BASE_URL: "https://ewatrade.test",
    EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: "android.apps.googleusercontent.com",
    EXPO_PUBLIC_GOOGLE_CLIENT_ID: "web.apps.googleusercontent.com",
    EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: "ios.apps.googleusercontent.com",
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: "web.apps.googleusercontent.com",
    EXPO_PUBLIC_WEB_URL: "https://ewatrade.test",
    ...(environment === "production" || environment === "preview"
      ? {
          EXPO_PUBLIC_LEGAL_ORIGIN: "https://ewatrade.test",
          ...(environment === "production"
            ? { EXPO_PUBLIC_LOGLY_ENABLED: "false" }
            : { EXPO_PUBLIC_CUSTOMER_CHAT_HOST: "chat.ewatrade.test" }),
        }
      : {}),
    EXPO_PUBLIC_CHAT_URL: "https://chat.ewatrade.test",
    GOOGLE_ANDROID_CLIENT_ID: "android.apps.googleusercontent.com",
    GOOGLE_CLIENT_ID: "web.apps.googleusercontent.com",
    GOOGLE_IOS_CLIENT_ID: "ios.apps.googleusercontent.com",
    GOOGLE_WEB_CLIENT_ID: "web.apps.googleusercontent.com",
  }

  if (includePorts) {
    values.EXPO_PORT = "3096"
    values.EXPO_PUBLIC_API_PORT = "3095"
    values.EXPO_PUBLIC_WEB_PORT = "3092"
    values.EXPO_PUBLIC_CHAT_PORT = "3091"
  }

  return values
}

function envFile(values) {
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`)

  return `${lines.join("\n")}\n`
}

function easList(environment, keys, values = {}) {
  return `Environment: ${environment}
Variables for this project:
${keys.map((key) => easListBlock(key, environment, values[key] ?? "configured")).join("\n———\n")}
`
}

function easListBlock(key, environment, value) {
  return `ID            fixture-${key}
Name          ${key}
Value         ${value}
Scope         PROJECT
Visibility    PUBLIC
Environments  ${environment}
type          string`
}

function fail(label, message, output) {
  console.error(`Expo env attachment fixture failed: ${label}`)
  console.error(message)
  console.error(output)
  process.exit(1)
}
