import { Context, Data, Effect, Layer } from "effect"
import { PluginConfig } from "./config"
import { dynamicImport } from "./lib"

export class FormatterError extends Data.TaggedError(
  "FormatterError",
)<ErrorOptions> {}

export class Formatter extends Context.Tag("Formatter")<
  Formatter,
  {
    readonly format: (
      code: string,
    ) => Effect.Effect<string, FormatterError, PluginConfig>
  }
>() {}

const defaultFormatter = {
  format: Effect.fn((code: string) => Effect.succeed(code)),
}

const prettierFormatter = Effect.gen(function* () {
  const prettier = yield* dynamicImport(
    "prettier",
    () => import("prettier"),
  ).pipe(Effect.catchTag("DynamicImportError", Effect.die))

  return {
    format: Effect.fn((code: string) =>
      Effect.tryPromise({
        try: () =>
          prettier.format(code, {
            parser: "typescript",
          }),
        catch: (cause) => new FormatterError({ cause }),
      }),
    ),
  }
})

export const FormatterMock = Layer.succeed(Formatter, defaultFormatter)

export const FormatterLive = Layer.effect(
  Formatter,
  Effect.gen(function* () {
    const config = yield* PluginConfig
    switch (config.formatter) {
      case "prettier":
        return yield* prettierFormatter
      case "biome":
      case "deno":
        throw Error(`Formatter ${config.formatter} not implemented`)
      default:
        return defaultFormatter
    }
  }),
)
