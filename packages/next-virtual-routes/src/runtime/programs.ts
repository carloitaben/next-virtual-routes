import { dirname, resolve } from "node:path"
import { Console, Effect, Exit, FileSystem, Path, Ref, Semaphore, Stream } from "effect"
import type { ResolvedRoutesConfig } from "../domain/config"
import type { PlannedRoute, RoutePlan } from "../domain/plan"
import { MissingTemplateError, RoutesLockError } from "../domain/errors"
import { shouldTransformTemplate } from "../transform/file-kind"
import { transform } from "../transform/pipeline"
import { GlobService } from "./services"

type LockMetadata = Readonly<{
  cwd: string
  pid: number
  startedAt: string
  version: string
}>

export type GenerationResult = Readonly<{
  generatedPaths: ReadonlyArray<string>
}>

export type RuntimeEnvironment = FileSystem.FileSystem | Path.Path | GlobService

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function parseLockMetadata(contents: string): LockMetadata | undefined {
  try {
    const value = JSON.parse(contents)
    if (
      typeof value === "object" &&
      value !== null &&
      "pid" in value &&
      typeof value.pid === "number" &&
      "cwd" in value &&
      typeof value.cwd === "string" &&
      "startedAt" in value &&
      typeof value.startedAt === "string" &&
      "version" in value &&
      typeof value.version === "string"
    ) {
      return value
    }
  } catch {
    return undefined
  }

  return undefined
}

function lockContents(config: ResolvedRoutesConfig): string {
  const metadata: LockMetadata = {
    cwd: config.cwd,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    version: "0.0.0",
  }

  return JSON.stringify(metadata, null, 2)
}

function logInfo(enabled: boolean, ...parts: ReadonlyArray<unknown>) {
  return enabled ? Console.log(...parts) : Effect.void
}

function logWarn(enabled: boolean, ...parts: ReadonlyArray<unknown>) {
  return enabled ? Console.warn(...parts) : Effect.void
}

function acquireLock(config: ResolvedRoutesConfig) {
  return Effect.acquireRelease(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const absoluteLockPath = path.resolve(config.cwd, config.lockFile)

      yield* fs.makeDirectory(dirname(absoluteLockPath), { recursive: true })

      const attempt = yield* Effect.exit(
        fs.writeFileString(absoluteLockPath, lockContents(config), { flag: "wx" }),
      )

      if (Exit.isSuccess(attempt)) {
        return absoluteLockPath
      }

      const existing = yield* Effect.exit(fs.readFileString(absoluteLockPath))
      const metadata = Exit.isSuccess(existing)
        ? parseLockMetadata(existing.value)
        : undefined

      if (metadata && !isProcessRunning(metadata.pid)) {
        yield* fs.remove(absoluteLockPath, { force: true })
        yield* fs.writeFileString(absoluteLockPath, lockContents(config), { flag: "wx" })
        return absoluteLockPath
      }

      const owner = metadata
        ? `pid ${metadata.pid} since ${metadata.startedAt}`
        : "another process"

        return yield* Effect.fail(
        new RoutesLockError({
          lockFile: absoluteLockPath,
          message: `next-virtual-routes is locked by ${owner}. Remove ${absoluteLockPath} if this is stale.`,
        }),
      )
    }),
    (absoluteLockPath) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        yield* fs.remove(absoluteLockPath, { force: true }).pipe(
          Effect.catch(() => Effect.void),
        )
      }),
  )
}

function runCleanup(config: ResolvedRoutesConfig) {
  return Effect.gen(function* () {
    if (config.remove.length === 0) {
      return
    }

    const fs = yield* FileSystem.FileSystem
    const glob = yield* GlobService
    const matches = yield* glob.match(config.remove, config.cwd)

    yield* Effect.forEach(matches, (match) =>
      fs.remove(match, {
        force: true,
        recursive: true,
      }),
    )
  })
}

function ensureTemplateExists(route: PlannedRoute) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const exists = yield* fs.exists(route.absoluteTemplatePath)

    if (!exists) {
      return yield* Effect.fail(
        new MissingTemplateError({
          routePath: route.outputPath,
          templatePath: route.templatePath,
        }),
      )
    }
  })
}

function generateRoute(
  route: PlannedRoute,
  config: ResolvedRoutesConfig,
  generatedPaths: Ref.Ref<Set<string>>,
) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const alreadyGenerated = yield* Ref.get(generatedPaths).pipe(Effect.map((paths) => paths.has(route.absoluteOutputPath)))

    if (!alreadyGenerated && (yield* fs.exists(route.absoluteOutputPath))) {
      yield* logWarn(
        config.logEnabled,
        `Skipping route collision at ${route.outputPath}`,
      )
      return false
    }

    yield* ensureTemplateExists(route)

    yield* fs.makeDirectory(dirname(route.absoluteOutputPath), { recursive: true })

    if (shouldTransformTemplate(route.templatePath, route.outputPath)) {
      const templateCode = yield* fs.readFileString(route.absoluteTemplatePath)
      const transformed = transform(templateCode, {
        banner: config.banner,
        footer: config.footer,
        outputFile: route.absoluteOutputPath,
        routeContext: route.routeContext,
        routePath: route.outputPath,
        templateFile: route.absoluteTemplatePath,
      })

      yield* fs.writeFileString(route.absoluteOutputPath, transformed)
    } else {
      const templateBytes = yield* fs.readFile(route.absoluteTemplatePath)
      yield* fs.writeFile(route.absoluteOutputPath, templateBytes)
    }

    yield* Ref.update(generatedPaths, (paths) => new Set(paths).add(route.absoluteOutputPath))

    return true
  })
}

export function generateRoutesProgram(
  config: ResolvedRoutesConfig,
  plan: RoutePlan,
): Effect.Effect<GenerationResult, unknown, RuntimeEnvironment> {
  return Effect.scoped(
    Effect.gen(function* () {
      yield* acquireLock(config)
      yield* runCleanup(config)
      const generatedPaths = yield* Ref.make(new Set<string>())
      const results = yield* Effect.forEach(
        plan.routes,
        (route) => generateRoute(route, config, generatedPaths),
        { concurrency: "unbounded" },
      )

      const generated = plan.routes
        .filter((_, index) => results[index])
        .map((route) => route.absoluteOutputPath)

      yield* logInfo(config.logEnabled, `Generated ${generated.length} virtual routes`)

      return {
        generatedPaths: generated,
      }
    }),
  )
}

function buildTemplateIndex(config: ResolvedRoutesConfig, plan: RoutePlan) {
  const index = new Map<string, Array<PlannedRoute>>()

  for (const route of plan.routes) {
    const absoluteKey = route.absoluteTemplatePath
    const relativeKey = resolve(config.cwd, route.templatePath)
    const absoluteRoutes = index.get(absoluteKey) ?? []
    absoluteRoutes.push(route)
    index.set(absoluteKey, absoluteRoutes)

    const relativeRoutes = index.get(relativeKey) ?? []
    relativeRoutes.push(route)
    index.set(relativeKey, relativeRoutes)

    const rawRoutes = index.get(route.templatePath) ?? []
    rawRoutes.push(route)
    index.set(route.templatePath, rawRoutes)
  }

  return index
}

export function watchRoutesProgram(
  config: ResolvedRoutesConfig,
  plan: RoutePlan,
  initialGeneratedPaths: ReadonlyArray<string>,
): Effect.Effect<void, unknown, RuntimeEnvironment> {
  return Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const semaphore = yield* Semaphore.make(1)
      const generatedPaths = yield* Ref.make(new Set(initialGeneratedPaths))
      const templateIndex = buildTemplateIndex(config, plan)

      yield* acquireLock(config)
      yield* logInfo(config.logEnabled, "Watching virtual route templates")

      yield* Stream.runForEach(fs.watch(config.cwd), (event) => {
        const routes = [event.path, resolve(config.cwd, event.path)].flatMap(
          (candidate) => templateIndex.get(candidate) ?? [],
        )

        if (routes.length === 0) {
          return Effect.void
        }

        return semaphore.withPermits(1)(
          Effect.forEach(routes, (route) =>
            generateRoute(route, config, generatedPaths),
          ).pipe(Effect.asVoid),
        )
      })
    }),
  )
}
