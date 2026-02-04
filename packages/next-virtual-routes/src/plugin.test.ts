import { generateRoutesEffect } from "./plugin"
import { it, expect } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { RuntimeLayer } from "./runtime"
import { FormatterLive, FormatterMock } from "./formatter"
import * as Memfs from "./memfs"
import { PluginConfig } from "./config"
import { route } from "./helpers"

const ma = Layer.mergeAll(
  RuntimeLayer,
  FormatterMock,
  PluginConfig.layerWith({
    routes: [route("src/app/page.tsx", "src/templates/page.tsx")],
    remove: ["src/app/**"],
  }),
  Memfs.layerWith({}),
)

it.layer(ma)("Che", (it) => {
  it.effect("test success", () =>
    Effect.gen(function* () {
      const result = yield* generateRoutesEffect
    }),
  )
})
