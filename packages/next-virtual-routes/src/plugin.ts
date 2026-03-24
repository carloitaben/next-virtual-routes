import type { NextConfig } from "next"
import { Console, Effect, Fiber, Layer, ManagedRuntime } from "effect"
import type { RoutesConfig, RoutesInput } from "./domain/config"
import type { RoutesHooks } from "./hooks"
import { resolveConfig } from "./domain/config"
import { formatBuildError } from "./domain/errors"
import { buildRoutePlan } from "./domain/plan"
import { RuntimeLive } from "./runtime/layers"
import {
  generateRoutesProgram,
  type GenerationResult,
  type RuntimeEnvironment,
  watchRoutesProgram,
} from "./runtime/programs"

export type {
  GenerationEndEvent,
  GenerationErrorEvent,
  GenerationKind,
  GenerationStartEvent,
  RouteGeneratedEvent,
  RoutesHooks,
} from "./hooks"
export type { RoutesConfig, RoutesDefinition } from "./domain/config"

type NextConfigFactory = (
  ...args: ReadonlyArray<unknown>
) => NextConfig | Promise<NextConfig>

type NextConfigInput = NextConfig | NextConfigFactory

type ActiveWatcher = Readonly<{
  fingerprint: string
  hooks: RoutesHooks | undefined
  runtime: ManagedRuntime.ManagedRuntime<RuntimeEnvironment, never>
  fiber: Fiber.Fiber<void, never>
}>

type InternalRuntime = Readonly<{
  layer: Layer.Layer<RuntimeEnvironment>
  managedRuntime: () => ManagedRuntime.ManagedRuntime<RuntimeEnvironment, never>
}>

let activeWatcher: ActiveWatcher | undefined

const RuntimeDefault: InternalRuntime = {
  layer: RuntimeLive,
  managedRuntime: () => ManagedRuntime.make(RuntimeLive),
}

function isNextConfigFactory(
  value: NextConfigInput,
): value is NextConfigFactory {
  return typeof value === "function"
}

function watcherFingerprint(
  input: Awaited<ReturnType<typeof resolveConfig>>,
): string {
  return JSON.stringify({
    cwd: input.cwd,
    remove: input.remove,
    routes: input.routes,
    watch: input.watch,
  })
}

function sameHooks(
  left: RoutesHooks | undefined,
  right: RoutesHooks | undefined,
): boolean {
  return (
    left?.onGenerationStart === right?.onGenerationStart &&
    left?.onRouteGenerated === right?.onRouteGenerated &&
    left?.onGenerationEnd === right?.onGenerationEnd &&
    left?.onError === right?.onError
  )
}

async function stopWatcher(): Promise<void> {
  if (!activeWatcher) {
    return
  }

  await activeWatcher.runtime.runPromise(Fiber.interrupt(activeWatcher.fiber))
  await activeWatcher.runtime.dispose()
  activeWatcher = undefined
}

async function ensureWatcher(
  config: Awaited<ReturnType<typeof resolveConfig>>,
  generatedPaths: ReadonlyArray<string>,
  runtimeConfig: InternalRuntime,
): Promise<void> {
  if (!config.watch) {
    await stopWatcher()
    return
  }

  const fingerprint = watcherFingerprint(config)
  if (
    activeWatcher?.fingerprint === fingerprint &&
    sameHooks(activeWatcher.hooks, config.hooks)
  ) {
    return
  }

  await stopWatcher()

  const runtime = runtimeConfig.managedRuntime()
  const plan = buildRoutePlan(config)
  const watcherReady = new Promise<void>((resolve) => {
    const fiber = runtime.runFork(
      watchRoutesProgram(config, plan, generatedPaths, resolve).pipe(
        Effect.catch((error) => Console.error(formatBuildError(error).message)),
      ),
    )

    activeWatcher = {
      fiber,
      fingerprint,
      hooks: config.hooks,
      runtime,
    }
  })
  await watcherReady
}

function shouldReuseActiveWatcher(
  config: Awaited<ReturnType<typeof resolveConfig>>,
): boolean {
  return (
    config.watch &&
    activeWatcher?.fingerprint === watcherFingerprint(config) &&
    sameHooks(activeWatcher.hooks, config.hooks)
  )
}

function reuseGenerationResult(): GenerationResult {
  return {
    generatedPaths: [],
  }
}

function shouldSkipGenerationForProcess(): boolean {
  return process.argv.some((argument) => argument.includes("next/dist/telemetry/detached-flush"))
}

async function runGeneration(
  input: RoutesInput,
  runtimeConfig: InternalRuntime,
) {
  if (shouldSkipGenerationForProcess()) {
    return reuseGenerationResult()
  }

  const config = await resolveConfig(input)

  if (shouldReuseActiveWatcher(config)) {
    return reuseGenerationResult()
  }

  if (activeWatcher) {
    await stopWatcher()
  }

  const plan = buildRoutePlan(config)

  try {
    const result = await Effect.runPromise(
      generateRoutesProgram(config, plan).pipe(
        Effect.provide(runtimeConfig.layer),
      ),
    )

    await ensureWatcher(config, result.generatedPaths, runtimeConfig)
    return result
  } catch (error) {
    throw formatBuildError(error)
  }
}

/**
 * Generates route files immediately.
 *
 * Use this when you need to control route generation outside `withRoutes`.
 *
 * @group api
 *
 * @example
 * ```ts
 * await generateRoutes({
 *   routes: [route("blog/page.tsx", "src/templates/page.tsx")],
 * })
 * ```
 */
export async function generateRoutes(input: RoutesConfig): Promise<void> {
  await runGeneration(input, RuntimeDefault)
}

/**
 * @internal
 */
export async function resetRoutesWatcherForTesting(): Promise<void> {
  await stopWatcher()
}

/**
 * Wraps a Next.js config and generates routes before Next loads it.
 *
 * @group api
 *
 * @example
 * ```ts
 * export default withRoutes({
 *   routes: [route("blog/page.tsx", "src/templates/page.tsx")],
 * })({})
 * ```
 */
export function withRoutes(routes: RoutesConfig) {
  return function applyRoutes(nextConfig: NextConfigInput = {}) {
    return async (...args: ReadonlyArray<unknown>): Promise<NextConfig> => {
      await runGeneration(routes, RuntimeDefault)
      return isNextConfigFactory(nextConfig) ? nextConfig(...args) : nextConfig
    }
  }
}
