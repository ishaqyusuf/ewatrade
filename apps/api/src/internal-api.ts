import { app } from "./index"

export function handleTrpcRequest(request: Request) {
  return app.fetch(request)
}

export function GET(request: Request) {
  return handleTrpcRequest(request)
}

export function POST(request: Request) {
  return handleTrpcRequest(request)
}
