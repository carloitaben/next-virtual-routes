import { Schema } from "effect"
import type { Route } from "../lib"
import { isDebugEnabled } from "../runtime/debug"
import { InvalidRoutesConfigError } from "./errors"
import { assertContextSerializable } from "./serializable"

export type RoutesDefinition =
  | ReadonlyArray<Route>
  | (() => ReadonlyArray<Route> | Promise<ReadonlyArray<Route>>)

export type RoutesConfig = Readonly<{
  routes: RoutesDefinition
  banner?: string
  footer?: string
  cwd?: string
  lockFile?: string
  remove?: ReadonlyArray<string>
  watch?: boolean
}>

export type RoutesInput = RoutesConfig

export type ResolvedRoutesConfig = Readonly<{
  banner: string
  cwd: string
  footer: string
  lockFile: string
  logEnabled: boolean
  remove: ReadonlyArray<string>
  routes: ReadonlyArray<Route>
  watch: boolean
}>

const routePathSchema = Schema.NonEmptyString

const RouteSchema = Schema.Struct({
  context: Schema.optional(Schema.Unknown),
  path: routePathSchema,
  template: routePathSchema,
})

const ResolvedRoutesConfigSchema = Schema.Struct({
  banner: Schema.String,
  cwd: Schema.String,
  footer: Schema.String,
  lockFile: Schema.String,
  logEnabled: Schema.Boolean,
  remove: Schema.Array(Schema.String),
  routes: Schema.Array(RouteSchema),
  watch: Schema.Boolean,
})

function defaultWatch(): boolean {
  return process.env.NODE_ENV === "development" && process.env.CI !== "true"
}

async function resolveRoutesDefinition(
  definition: RoutesDefinition,
): Promise<ReadonlyArray<Route>> {
  return typeof definition === "function" ? definition() : definition
}

function assertRoutesSerializable(routes: ReadonlyArray<Route>): void {
  for (const route of routes) {
    if (route.context !== undefined) {
      assertContextSerializable(route.context)
    }
  }
}

function decodeResolvedConfig(input: ResolvedRoutesConfig): ResolvedRoutesConfig {
  try {
    Schema.decodeUnknownSync(ResolvedRoutesConfigSchema)(input)
    return input
  } catch (error) {
    throw new InvalidRoutesConfigError({
      cause: error,
      message: `Invalid next-virtual-routes config: ${String(error)}`,
    })
  }
}

export async function resolveConfig(
  input: RoutesInput,
): Promise<ResolvedRoutesConfig> {
  const routes = await resolveRoutesDefinition(input.routes)

  try {
    assertRoutesSerializable(routes)
  } catch (error) {
    throw new InvalidRoutesConfigError({
      cause: error,
      message: `Invalid next-virtual-routes config: ${String(error)}`,
    })
  }

  return decodeResolvedConfig({
    banner: input.banner ?? "",
    cwd: input.cwd ?? process.cwd(),
    footer: input.footer ?? "",
    lockFile: input.lockFile ?? ".next/next-virtual-routes/lock",
    logEnabled: isDebugEnabled(),
    remove: input.remove ?? [],
    routes,
    watch: input.watch ?? defaultWatch(),
  })
}
