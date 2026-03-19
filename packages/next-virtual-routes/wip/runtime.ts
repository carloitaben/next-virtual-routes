import { Console, Effect, Layer } from "effect"
import { NodeContext } from "@effect/platform-node"
import { BunContext } from "@effect/platform-bun"

export const RuntimeLayer = Layer.unwrapEffect(
  Effect.gen(function* () {
    if (Boolean(process.versions.bun)) {
      yield* Console.debug("Using Bun runtime")
      return BunContext.layer
    }
    yield* Console.debug("Using Node runtime")
    return NodeContext.layer
  }),
)
