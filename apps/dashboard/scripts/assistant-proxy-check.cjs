const http = require("node:http")
const {
  proxyRequest,
} = require("next/dist/server/lib/router-utils/proxy-request.js")
;(async () => {
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/event-stream" })
    res.write("data: started\n\n")
    const timer = setTimeout(
      () => res.end("data: completed\n\n"),
      Number(process.argv[3] ?? 31000),
    )
    res.on("close", () => clearTimeout(timer))
  })
  await new Promise((r) => upstream.listen(0, "127.0.0.1", r))
  const proxy = http.createServer((req, res) => {
    const target = {
      protocol: "http:",
      hostname: "127.0.0.1",
      port: String(upstream.address().port),
      pathname: "/stream",
      query: {},
    }
    proxyRequest(
      req,
      res,
      target,
      undefined,
      undefined,
      process.argv[2] ? Number(process.argv[2]) : undefined,
    ).catch(() => {
      if (!res.destroyed) res.end()
    })
  })
  await new Promise((r) => proxy.listen(0, "127.0.0.1", r))
  const start = Date.now()
  let passed = false
  try {
    const response = await fetch(
      `http://127.0.0.1:${proxy.address().port}/stream`,
    )
    const text = await response.text()
    passed = text.includes("data: completed")
  } catch (error) {
    console.log("Stream did not complete:", error.name)
  } finally {
    proxy.closeAllConnections()
    upstream.closeAllConnections()
    proxy.close()
    upstream.close()
  }
  const result = {
    proxyTimeout: process.argv[2] ?? "Next default",
    completed: passed,
    elapsedMs: Date.now() - start,
  }
  if (process.argv[4])
    require("node:fs").writeFileSync(process.argv[4], JSON.stringify(result))
  console.log(JSON.stringify(result))
  process.exitCode = passed ? 0 : 1
})()
