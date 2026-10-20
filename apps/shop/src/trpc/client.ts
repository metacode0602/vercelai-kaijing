import type { AppRouter } from "@/lib/server/routers"
import { createTRPCReact, type CreateTRPCReact } from "@trpc/react-query"

export const trpc: CreateTRPCReact<AppRouter, unknown> = createTRPCReact<AppRouter>()
