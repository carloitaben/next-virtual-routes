import fg from "fast-glob"
import { Effect, Layer, ServiceMap } from "effect"

export class GlobService extends ServiceMap.Service<GlobService, {
  readonly match: (patterns: ReadonlyArray<string>, cwd: string) => Effect.Effect<Array<string>, Error>
}>()("next-virtual-routes/GlobService") {}

export const GlobLive = Layer.effect(GlobService)(
  Effect.succeed({
    match: (patterns, cwd) =>
      Effect.tryPromise({
        catch: (error) => new Error(`Failed to expand cleanup globs: ${String(error)}`),
        try: () =>
          fg([...patterns], {
            absolute: true,
            cwd,
            dot: true,
            onlyFiles: false,
          }),
      }),
  }),
)
