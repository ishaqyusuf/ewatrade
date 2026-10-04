import {Hono} from "hono"
import {secureHeaders} from "hono/secure-headers"
import {oversightRoutes} from "@ewatrade/oversight"
const app=new Hono()
app.use(secureHeaders())
app.route("/api/oversight/v1",oversightRoutes)
app.get("/health",c=>c.json({service:"ewatrade-oversight",version:1,status:"ok"}))
app.onError((_error,c)=>c.json({error:"Project data is unavailable"},503))
export default app
