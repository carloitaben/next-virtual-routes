import { FileSystem, Path } from "@effect/platform"
import { Console, Data, Effect, pipe, STM, TReentrantLock } from "effect"
import { PluginConfig, type Route } from "./config"
import { Formatter } from "./formatter"

export class RouteGenerationError extends Data.TaggedError(
  "RouteGenerationError",
)<{
  route: Route
  error: "missingTemplate" | "cannotReadFile"
}> {}

const transformTemplate = Effect.fn((template: string) =>
  Effect.gen(function* () {
    const formatter = yield* Formatter
    // Eval etc
    return yield* pipe(template, formatter.format)
  }),
)

const createWriter = Effect.gen(function* (file: string) {
  const lock = yield* STM.commit(TReentrantLock.make)

  // Read operation - multiple concurrent readers allowed
  const readOperation = TReentrantLock.withReadLock(
    Effect.gen(function* () {
      yield* Console.log("Reading data")
      yield* Effect.sleep("500 milli")
      return "data-value"
    }),
    lock,
  )

  // Write operation - exclusive access required
  const writeOperation = TReentrantLock.withWriteLock(
    Effect.gen(function* () {
      yield* Console.log(`Writing data to ${file}`)
      yield* Effect.sleep("1000 milli")
      return "write-complete"
    }),
    lock,
  )

  return { readOperation, writeOperation }
})

export const generateRoute = Effect.fn((route: Route) =>
  Effect.gen(function* () {
    yield* Console.log("Processing template", route.template)
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const config = yield* PluginConfig

    const templatePath = path.resolve(config.cwd, route.template) // TODO: move this to the validation step
    const templateExists = yield* fs.exists(templatePath)

    if (!templateExists) {
      yield* Console.log("Template not found", route.template)
      return yield* Effect.fail(
        new RouteGenerationError({
          error: "missingTemplate",
          route,
        }),
      )
    }

    yield* Console.log("Template found", route.template)

    const lock = yield* STM.commit(TReentrantLock.make)

    const writeCount = yield* TReentrantLock.writeLock(lock)

    yield* Effect.logInfo(`Acquired write lock (count: ${writeCount})`)
    yield* Effect.sleep("200 milli")

    const template = yield* fs.readFileString(templatePath)
    const transformedTemplate = yield* transformTemplate(template)
    const routePath = path.resolve(config.cwd, route.path) // TODO: move this to the validation step
    const routePathDir = path.dirname(routePath)

    yield* fs.makeDirectory(routePathDir, { recursive: true })
    yield* fs.writeFileString(routePath, transformedTemplate, { flag: "w+" })
    yield* Console.log("Wrote template", templatePath, "to", routePath)
  }),
)
