import { Hono } from "hono"

const app = new Hono()

app.all("*", async (c) => {
  try {
    const { app: apiApp } = await import("./dist/api.js")

    return apiApp.fetch(c.req.raw)
  } catch (error) {
    console.error("[api:entrypoint]", error)

    return c.text("Internal Server Error", 500)
  }
})

export default app
