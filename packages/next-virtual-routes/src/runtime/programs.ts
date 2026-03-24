import { dirname, relative, resolve } from "node:path"
import { Cause, Console, Effect, Exit, FileSystem, Path, Ref, Schema, Semaphore, Stream } from "effect"
import type { ResolvedRoutesConfig } from "../domain/config"
import { formatBuildError } from "../domain/errors"
import type { PlannedRoute, RoutePlan, RoutePlanWarning } from "../domain/plan"
import { MissingTemplateError, RoutesLockError } from "../domain/errors"
import type { GenerationKind } from "../hooks"
import { shouldTransformTemplate } from "../transform/file-kind"
import { transform } from "../transform/pipeline"
import {
  notifyGenerationEnd,
  notifyGenerationError,
  notifyGenerationStart,
  notifyRouteGenerated,
  RoutesHookError,
} from "./hooks"
import { GlobService } from "./services"

const LockMetadataSchema = Schema.Struct({
  cwd: Schema.String,
  pid: Schema.Number,
  startedAt: Schema.String,
})

type LockMetadata = Schema.Schema.Type<typeof LockMetadataSchema>

const decodeLockMetadata = Schema.decodeUnknownSync(
  Schema.fromJsonString(LockMetadataSchema),
)

export type GenerationResult = Readonly<{
  generatedPaths: ReadonlyArray<string>
}>

export type RuntimeEnvironment = FileSystem.FileSystem | Path.Path | GlobService

type GenerationRun = Readonly<{
  kind: GenerationKind
  routes: ReadonlyArray<PlannedRoute>
}>

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
    return decodeLockMetadata(contents)
  } catch {
    return undefined
  }
}

function lockContents(config: ResolvedRoutesConfig): string {
  const metadata: LockMetadata = {
    cwd: config.cwd,
    pid: process.pid,
    startedAt: new Date().toISOString(),
  }

  return JSON.stringify(metadata, null, 2)
}

function logInfo(enabled: boolean, ...parts: ReadonlyArray<unknown>) {
  return enabled ? Console.log(...parts) : Effect.void
}

function logWarn(enabled: boolean, ...parts: ReadonlyArray<unknown>) {
  return enabled ? Console.warn(...parts) : Effect.void
}

function formatPlanWarning(warning: RoutePlanWarning): string {
  switch (warning._tag) {
    case "DuplicateRoutePathWarning":
      return `Skipping duplicate configured route at ${warning.path}; keeping ${warning.keptTemplatePath} and ignoring ${warning.skippedTemplatePath}`
  }
}

function logPlanWarnings(plan: RoutePlan) {
  return Effect.forEach(plan.warnings, (warning) => Console.warn(formatPlanWarning(warning)), {
    concurrency: "unbounded",
    discard: true,
  })
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
  kind: GenerationKind,
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
    yield* notifyRouteGenerated(config.hooks, {
      kind,
      path: route.outputPath,
      templatePath: route.templatePath,
    })

    return true
  })
}

function runGenerationBatch(
  config: ResolvedRoutesConfig,
  run: GenerationRun,
  generatedPaths: Ref.Ref<Set<string>>,
): Effect.Effect<GenerationResult, unknown, RuntimeEnvironment> {
  return Effect.gen(function* () {
    yield* notifyGenerationStart(config.hooks, {
      cwd: config.cwd,
      kind: run.kind,
      routeCount: run.routes.length,
    })

    const attempt = yield* Effect.exit(
      Effect.forEach(
        run.routes,
        (route) => generateRoute(route, config, run.kind, generatedPaths),
        { concurrency: "unbounded" },
      ),
    )

    if (Exit.isFailure(attempt)) {
      const error = Cause.squash(attempt.cause)

      if (error instanceof RoutesHookError) {
        return yield* Effect.fail(error.cause)
      }

      const formattedError = formatBuildError(error)
      yield* notifyGenerationError(config.hooks, {
        error: formattedError,
        kind: run.kind,
      })
      return yield* Effect.fail(error)
    }

    const generated = run.routes
      .filter((_, index) => attempt.value[index])
      .map((route) => route.absoluteOutputPath)

    yield* notifyGenerationEnd(config.hooks, {
      generatedPaths: generated.map((path) => relative(config.cwd, path)),
      kind: run.kind,
    })

    return {
      generatedPaths: generated,
    }
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
      yield* logPlanWarnings(plan)
      const generatedPaths = yield* Ref.make(new Set<string>())
      const result = yield* runGenerationBatch(
        config,
        {
          kind: "initial",
          routes: plan.routes,
        },
        generatedPaths,
      )

      yield* logInfo(config.logEnabled, `Generated ${result.generatedPaths.length} virtual routes`)

      return result
    }),
  )
}

function buildTemplateIndex(plan: RoutePlan) {
  const index = new Map<string, Array<PlannedRoute>>()

  for (const route of plan.routes) {
    const keys = new Set([route.absoluteTemplatePath, route.templatePath])

    for (const key of keys) {
      const routes = index.get(key) ?? []
      routes.push(route)
      index.set(key, routes)
    }
  }

  return index
}

export function watchRoutesProgram(
  config: ResolvedRoutesConfig,
  plan: RoutePlan,
  initialGeneratedPaths: ReadonlyArray<string>,
  onReady: () => void,
): Effect.Effect<void, unknown, RuntimeEnvironment> {
  return Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const semaphore = yield* Semaphore.make(1)
      const generatedPaths = yield* Ref.make(new Set(initialGeneratedPaths))
      const templateIndex = buildTemplateIndex(plan)

      yield* acquireLock(config)
      yield* logPlanWarnings(plan)
      yield* logInfo(config.logEnabled, "Watching virtual route templates")
      yield* Effect.sync(onReady)

      yield* Stream.runForEach(fs.watch(config.cwd), (event) => {
        const routes = [event.path, resolve(config.cwd, event.path)].flatMap(
          (candidate) => templateIndex.get(candidate) ?? [],
        )

        if (routes.length === 0) {
          return Effect.void
        }

        return semaphore.withPermits(1)(
          runGenerationBatch(
            config,
            {
              kind: "watch",
              routes,
            },
            generatedPaths,
          ).pipe(
            Effect.tap((result) =>
              logInfo(config.logEnabled, `Generated ${result.generatedPaths.length} virtual routes`),
            ),
            Effect.asVoid,
            Effect.catch((error) =>
              Console.error(formatBuildError(error).message),
            ),
          ),
        )
      })
    }),
  )
}
