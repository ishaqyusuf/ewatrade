import { Hono } from "hono"
import service from "./bundle.js"
const app = new Hono()
app.route("/", service)
export default app
