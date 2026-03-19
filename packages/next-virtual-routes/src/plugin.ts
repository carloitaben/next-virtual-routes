import type { NextConfig } from "next"
import { Console, Effect, Fiber, Layer, ManagedRuntime } from "effect"
import type { RoutesInput } from "./domain/config"
import { resolveConfig } from "./domain/config"
import { formatBuildError } from "./domain/errors"
import { buildRoutePlan } from "./domain/plan"
import { RuntimeLive } from "./runtime/layers"
import {
  generateRoutesProgram,
  type RuntimeEnvironment,
  watchRoutesProgram,
} from "./runtime/programs"

type NextConfigFactory = (
  ...args: ReadonlyArray<unknown>
) => NextConfig | Promise<NextConfig>

type NextConfigInput = NextConfig | NextConfigFactory

type ActiveWatcher = Readonly<{
  fingerprint: string
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
  if (activeWatcher?.fingerprint === fingerprint) {
    return
  }

  await stopWatcher()

  const runtime = runtimeConfig.managedRuntime()
  const plan = buildRoutePlan(config)
  const fiber = runtime.runFork(
    watchRoutesProgram(config, plan, generatedPaths).pipe(
      Effect.catch((error) => Console.error(formatBuildError(error).message)),
    ),
  )

  activeWatcher = {
    fiber,
    fingerprint,
    runtime,
  }
}

async function runGeneration(input: RoutesInput, runtimeConfig: InternalRuntime) {
  const config = await resolveConfig(input)
  const plan = buildRoutePlan(config)

  try {
    const result = await Effect.runPromise(
      generateRoutesProgram(config, plan).pipe(Effect.provide(runtimeConfig.layer)),
    )

    await ensureWatcher(config, result.generatedPaths, runtimeConfig)
    return result
  } catch (error) {
    throw formatBuildError(error)
  }
}

export async function generateRoutes(input: RoutesInput): Promise<void> {
  await runGeneration(input, RuntimeDefault)
}

export function withRoutes(routes: RoutesInput) {
  return function applyRoutes(nextConfig: NextConfigInput = {}) {
    return async (...args: ReadonlyArray<unknown>): Promise<NextConfig> => {
      await runGeneration(routes, RuntimeDefault)
      return isNextConfigFactory(nextConfig) ? nextConfig(...args) : nextConfig
    }
  }
}
