import { Schema } from "effect"
import type { RoutesHooks } from "../hooks"
import { RouteSchema, type Route } from "../lib"
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
  hooks?: RoutesHooks
  lockFile?: string
  remove?: ReadonlyArray<string>
  watch?: boolean
}>

export type RoutesInput = RoutesConfig

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

type ResolvedRoutesConfigFields = typeof ResolvedRoutesConfigSchema.Type

export type ResolvedRoutesConfig = Readonly<
  ResolvedRoutesConfigFields & {
    hooks: RoutesHooks | undefined
  }
>

function defaultWatch(): boolean {
  return process.env.NODE_ENV === "development" && process.env.CI !== "true"
}

function assertHook(
  value: unknown,
  name: keyof RoutesHooks,
): asserts value is NonNullable<RoutesHooks[typeof name]> {
  if (value !== undefined && typeof value !== "function") {
    throw new InvalidRoutesConfigError({
      message: `Invalid next-virtual-routes config: hooks.${name} must be a function`,
    })
  }
}

function resolveHooks(input: RoutesHooks | undefined): RoutesHooks | undefined {
  if (!input) {
    return undefined
  }

  assertHook(input.onGenerationStart, "onGenerationStart")
  assertHook(input.onRouteGenerated, "onRouteGenerated")
  assertHook(input.onGenerationEnd, "onGenerationEnd")
  assertHook(input.onError, "onError")

  if (
    input.onGenerationStart === undefined &&
    input.onRouteGenerated === undefined &&
    input.onGenerationEnd === undefined &&
    input.onError === undefined
  ) {
    return undefined
  }

  return input
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
    Schema.decodeUnknownSync(ResolvedRoutesConfigSchema)({
      banner: input.banner,
      cwd: input.cwd,
      footer: input.footer,
      lockFile: input.lockFile,
      logEnabled: input.logEnabled,
      remove: input.remove,
      routes: input.routes,
      watch: input.watch,
    })
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
  const hooks = resolveHooks(input.hooks)

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
    logEnabled: isDebugEnabled(),
    lockFile: input.lockFile ?? ".next/next-virtual-routes/lock",
    remove: input.remove ?? [],
    routes,
    watch: input.watch ?? defaultWatch(),
    hooks,
  })
}
