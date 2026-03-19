import { Console, Data, Effect } from "effect"
import { PluginConfig } from "./config"
import { FileSystem, Path } from "@effect/platform"
import * as Crypto from "crypto"

export class HashError extends Data.TaggedError("HashError")<ErrorOptions> {}

const hash = (data: Crypto.BinaryLike) =>
  Effect.try({
    try: () => Crypto.hash("sha1", data),
    catch: (cause) => new HashError({ cause }),
  })

export const isCached = Effect.gen(function* () {
  const config = yield* PluginConfig

  if (!config.cache) {
    yield* Console.log("Skipping cache")
    return false
  }

  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const cacheFilePath = path.resolve(config.cacheFile)
  const previousCache = yield* fs.readFileString(cacheFilePath).pipe(
    Effect.tapErrorTag("SystemError", (error) => Console.error(error)),
    Effect.catchTags({
      SystemError: () => Effect.succeed(undefined),
    }),
  )

  const configHash = yield* hash(JSON.stringify(config))

  if (previousCache === configHash) {
    console.log("Cache HIT")
    return true
  }

  console.log("cache MISS")

  yield* fs.writeFileString(cacheFilePath, configHash)
  return false
})
