import { spawn, spawnSync } from "node:child_process"
import {
  existsSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"

const READY_SCRIPT_PATH = new URL(
  "./check-shared-link-browser-checkout-ready.mjs",
  import.meta.url,
).pathname
const CHECKOUT_SCRIPT_PATH = new URL(
  "./run-shared-link-browser-checkout.mjs",
  import.meta.url,
).pathname
const EXAMPLE_ENV_CONTENT = [
  "SHARED_LINK_PREVIEW_URL=",
  "SHARED_LINK_BROWSER_CONFIRM_ORDER=",
  "SHARED_LINK_BROWSER_CUSTOMER_EMAIL=",
  "SHARED_LINK_BROWSER_CUSTOMER_NAME=",
  "SHARED_LINK_BROWSER_CUSTOMER_PASSWORD=",
  "SHARED_LINK_BROWSER_AUTH_MODE=",
  "SHARED_LINK_BROWSER_QUANTITY=",
  "SHARED_LINK_BROWSER_CUSTOMER_PHONE=",
  "SHARED_LINK_BROWSER_NOTES=",
  "SHARED_LINK_BROWSER_SCREENSHOT_PATH=",
  "SHARED_LINK_BROWSER_HEADFUL=",
  "SHARED_LINK_BROWSER_ALLOW_LOCALHOST=",
].join("\n")
const VALID_ENV_CONTENT = [
  "SHARED_LINK_PREVIEW_URL=http://127.0.0.1:3000/p/business/main/rice?share=token_123",
  "SHARED_LINK_BROWSER_CONFIRM_ORDER=1",
  "SHARED_LINK_BROWSER_CUSTOMER_EMAIL=buyer@qa-mail.test",
  "SHARED_LINK_BROWSER_CUSTOMER_NAME=Buyer Name",
  "SHARED_LINK_BROWSER_CUSTOMER_PASSWORD=customer-password",
  "SHARED_LINK_BROWSER_AUTH_MODE=register",
  "SHARED_LINK_BROWSER_ALLOW_LOCALHOST=1",
  "SHARED_LINK_BROWSER_QUANTITY=2",
  "SHARED_LINK_BROWSER_SCREENSHOT_PATH=/tmp/ewatrade-browser-checkout-fixture.png",
].join("\n")

runScenario({
  envContent: VALID_ENV_CONTENT,
  expectedStatus: 0,
  label: "valid browser checkout setup",
  requiredOutput: "Shared-link browser checkout readiness check passed.",
})

runScenario({
  envContent: VALID_ENV_CONTENT.replace(
    "SHARED_LINK_BROWSER_SCREENSHOT_PATH=/tmp/ewatrade-browser-checkout-fixture.png",
    "SHARED_LINK_BROWSER_SCREENSHOT_PATH=",
  ),
  expectedStatus: 1,
  label: "missing screenshot evidence path",
  requiredOutput: "SHARED_LINK_BROWSER_SCREENSHOT_PATH is required",
})

runScenario({
  envContent: VALID_ENV_CONTENT.replace(
    "SHARED_LINK_BROWSER_SCREENSHOT_PATH=/tmp/ewatrade-browser-checkout-fixture.png",
    "SHARED_LINK_BROWSER_SCREENSHOT_PATH=relative/browser-checkout.jpg",
  ),
  expectedStatus: 1,
  label: "invalid screenshot evidence path",
  requiredOutput:
    "SHARED_LINK_BROWSER_SCREENSHOT_PATH must be an absolute path",
})

runScenario({
  envContent: VALID_ENV_CONTENT.replace(
    "SHARED_LINK_BROWSER_CONFIRM_ORDER=1",
    "SHARED_LINK_BROWSER_CONFIRM_ORDER=",
  ),
  expectedStatus: 1,
  label: "missing explicit order confirmation",
  requiredOutput: "SHARED_LINK_BROWSER_CONFIRM_ORDER must be set to 1",
})

runScenario({
  envContent: VALID_ENV_CONTENT.replace(
    "SHARED_LINK_BROWSER_ALLOW_LOCALHOST=1",
    "SHARED_LINK_BROWSER_ALLOW_LOCALHOST=",
  ),
  expectedStatus: 1,
  label: "localhost without explicit allowance",
  requiredOutput: "points to localhost",
})

runScenario({
  envContent: VALID_ENV_CONTENT.replace(
    "SHARED_LINK_BROWSER_AUTH_MODE=register",
    "SHARED_LINK_BROWSER_AUTH_MODE=password",
  ),
  expectedStatus: 1,
  label: "invalid auth mode",
  requiredOutput:
    "SHARED_LINK_BROWSER_AUTH_MODE must be either register or login",
})

runScenario({
  envContent: VALID_ENV_CONTENT,
  exampleEnvContent: EXAMPLE_ENV_CONTENT.replace(
    "SHARED_LINK_PREVIEW_URL=\n",
    "",
  ),
  expectedStatus: 1,
  label: "missing documented deployed share URL key",
  requiredOutput:
    ".env.example is missing documented shared-link browser checkout keys: SHARED_LINK_PREVIEW_URL.",
})

await runBrowserCheckoutScenario()

console.log("Shared-link browser checkout fixture checks passed.")

function runScenario(input) {
  const fixtureDir = mkdtempSync(join(tmpdir(), "ewatrade-browser-checkout-"))
  const envFile = join(fixtureDir, ".env")
  const exampleEnvFile = join(fixtureDir, ".env.example")

  try {
    writeFileSync(envFile, `${input.envContent}\n`)
    writeFileSync(
      exampleEnvFile,
      `${input.exampleEnvContent ?? EXAMPLE_ENV_CONTENT}\n`,
    )

    const result = spawnSync(process.execPath, [READY_SCRIPT_PATH], {
      encoding: "utf8",
      env: {
        ...process.env,
        SHARED_LINK_BROWSER_READY_ENV_FILE: envFile,
        SHARED_LINK_BROWSER_READY_EXAMPLE_ENV_FILE: exampleEnvFile,
      },
    })
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`

    if (result.status !== input.expectedStatus) {
      fail(
        input.label,
        `Expected status ${input.expectedStatus}, received ${result.status}.`,
        output,
      )
    }

    if (!output.includes(input.requiredOutput)) {
      fail(
        input.label,
        `Expected output to include: ${input.requiredOutput}`,
        output,
      )
    }
  } finally {
    rmSync(fixtureDir, { force: true, recursive: true })
  }
}

async function runBrowserCheckoutScenario() {
  const expected = {
    authMode: "register",
    customerEmail: "browser-buyer@qa-mail.test",
    customerName: "Browser Buyer",
    customerPassword: "browser-password",
    notes: "Fixture checkout note",
    productVariantId: "variant_bag",
    quantity: "3",
  }
  const submissions = []
  const server = createServer(async (request, response) => {
    const host = request.headers.host
    const pageUrl = `http://${host}/p/business/main/rice?share=token_123`

    if (request.method === "POST" && request.url === "/checkout") {
      const body = await readBody(request)
      const submitted = Object.fromEntries(new URLSearchParams(body))
      submissions.push(submitted)

      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
      })
      response.end(renderSubmittedHtml({ pageUrl, submitted }))
      return
    }

    if (request.url === "/p/business/main/rice?share=token_123") {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
      })
      response.end(renderCheckoutHtml({ pageUrl }))
      return
    }

    response.writeHead(404, {
      "content-type": "text/plain",
    })
    response.end("Not found")
  })

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))

  try {
    const address = server.address()
    const shareUrl = `http://127.0.0.1:${address.port}/p/business/main/rice?share=token_123`
    const fixtureDir = mkdtempSync(join(tmpdir(), "ewatrade-browser-runner-"))
    const envFile = join(fixtureDir, ".env")
    const screenshotPath = join(fixtureDir, "browser-checkout.png")

    try {
      writeFileSync(
        envFile,
        [
          `SHARED_LINK_PREVIEW_URL=${shareUrl}`,
          "SHARED_LINK_BROWSER_CONFIRM_ORDER=1",
          `SHARED_LINK_BROWSER_CUSTOMER_EMAIL=${expected.customerEmail}`,
          `SHARED_LINK_BROWSER_CUSTOMER_NAME=${expected.customerName}`,
          `SHARED_LINK_BROWSER_CUSTOMER_PASSWORD=${expected.customerPassword}`,
          `SHARED_LINK_BROWSER_AUTH_MODE=${expected.authMode}`,
          `SHARED_LINK_BROWSER_QUANTITY=${expected.quantity}`,
          `SHARED_LINK_BROWSER_NOTES=${expected.notes}`,
          `SHARED_LINK_BROWSER_SCREENSHOT_PATH=${screenshotPath}`,
          "SHARED_LINK_BROWSER_ALLOW_LOCALHOST=1",
        ].join("\n"),
      )

      const result = await runCommand(
        process.execPath,
        [CHECKOUT_SCRIPT_PATH],
        {
          env: {
            ...process.env,
            SHARED_LINK_BROWSER_CHECKOUT_ENV_FILE: envFile,
          },
        },
      )
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`

      if (result.status !== 0) {
        fail(
          "local browser checkout runner",
          `Expected status 0, received ${result.status}.`,
          output,
        )
      }

      if (!output.includes("Shared-link browser checkout QA passed.")) {
        fail(
          "local browser checkout runner",
          "Expected checkout runner success output.",
          output,
        )
      }

      if (!existsSync(screenshotPath) || statSync(screenshotPath).size === 0) {
        fail(
          "local browser checkout runner",
          "Expected checkout runner to save a non-empty screenshot.",
          output,
        )
      }

      if (submissions.length !== 1) {
        fail(
          "local browser checkout runner",
          `Expected one checkout submission, received ${submissions.length}.`,
          output,
        )
      }

      const submitted = submissions[0]
      for (const [key, value] of Object.entries(expected)) {
        if (submitted[key] !== value) {
          fail(
            "local browser checkout runner",
            `Expected submitted ${key} to equal ${value}, received ${String(
              submitted[key],
            )}.`,
            output,
          )
        }
      }
    } finally {
      rmSync(fixtureDir, { force: true, recursive: true })
    }
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []

    request.on("data", (chunk) => chunks.push(chunk))
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    request.on("error", reject)
  })
}

function runCommand(command, args, options) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    })
    const stdout = []
    const stderr = []

    child.stdout.on("data", (chunk) => stdout.push(chunk))
    child.stderr.on("data", (chunk) => stderr.push(chunk))
    child.on("error", (error) => {
      stderr.push(Buffer.from(error.message))
    })
    child.on("close", (status) => {
      resolve({
        status,
        stderr: Buffer.concat(stderr).toString("utf8"),
        stdout: Buffer.concat(stdout).toString("utf8"),
      })
    })
  })
}

function renderCheckoutHtml(input) {
  return `<!doctype html>
<html>
  <head>
    <title>Rice | Main store</title>
    <link rel="canonical" href="${input.pageUrl}">
  </head>
  <body>
    <main>
      <h1>Rice</h1>
      <form action="/checkout" data-testid="shared-product-order-form" method="post">
        <label>
          <input checked data-testid="shared-product-variant-radio" name="productVariantId" type="radio" value="variant_bag">
          Bag
        </label>
        <label>
          <input data-testid="shared-product-variant-radio" disabled name="productVariantId" type="radio" value="variant_empty">
          Empty unit
        </label>
        <input data-testid="shared-product-quantity-input" name="quantity" type="number" value="1">
        <p data-testid="shared-product-total">NGN 10</p>
        <label>
          <input checked data-testid="shared-product-register-radio" name="authMode" type="radio" value="register">
          Register
        </label>
        <label>
          <input data-testid="shared-product-login-radio" name="authMode" type="radio" value="login">
          Log in
        </label>
        <input data-testid="shared-product-customer-name" name="customerName">
        <input data-testid="shared-product-customer-email" name="customerEmail" type="email">
        <input data-testid="shared-product-customer-password" name="customerPassword" type="password">
        <input data-testid="shared-product-customer-phone" name="customerPhone">
        <textarea data-testid="shared-product-notes" name="notes"></textarea>
        <button data-testid="shared-product-submit" type="submit">Submit order request</button>
      </form>
    </main>
  </body>
</html>`
}

function renderSubmittedHtml(input) {
  return `<!doctype html>
<html>
  <head>
    <title>Request received</title>
    <link rel="canonical" href="${input.pageUrl}">
  </head>
  <body>
    <main>
      <div data-testid="shared-product-order-requested">
        Request received for ${input.submitted.customerEmail}.
      </div>
    </main>
  </body>
</html>`
}

function fail(label, message, output) {
  console.error(`Shared-link browser checkout fixture failed: ${label}`)
  console.error(message)
  console.error(output)
  process.exit(1)
}
