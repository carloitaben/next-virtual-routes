import { Config, Context, Effect, Layer, pipe, Schema } from "effect"

// export const VirtualRoutesConfig = v.object({
//   banner: v.optional(v.array(v.string()), []),
//   footer: v.optional(v.array(v.string()), []),
//   cwd: v.optional(v.string(), process.cwd()),
//   log: v.optional(v.boolean(), false),
//   formatter: v.optional(v.picklist(["prettier"])),
//   formatterConfigFile: v.optional(v.string()),
// })

// export type VirtualRoutesConfig = v.InferInput<typeof VirtualRoutesConfig>

// export type ParsedVirtualRoutesConfig = v.InferOutput<
//   typeof VirtualRoutesConfig
// >

export interface Context extends Record<PropertyKey, unknown> {}

declare global {
  const context: Context
}

const RouteFilePath = Schema.TemplateLiteral(Schema.String, ".", Schema.String)

export type RouteFilePath = typeof RouteFilePath.Type

export class Route extends Schema.Class<Route>("Route")({
  path: RouteFilePath,
  template: RouteFilePath,
  context: Schema.optional(Schema.Unknown),
}) {}

export const VirtualRoutesPluginConfig = Schema.Struct({
  banner: Schema.optional(Schema.Array(Schema.String)),
  cwd: Schema.optionalWith(Schema.String, {
    default: () => process.cwd(),
  }),
  watch: Schema.optionalWith(Schema.Boolean, {
    default: () =>
      process.env.NODE_ENV === "development" &&
      !process.env.CI &&
      process.argv[2] === "dev",
  }),
  cache: Schema.optionalWith(Schema.Boolean, {
    default: () => true,
  }),
  cacheFile: Schema.optionalWith(Schema.String, {
    default: () => "./node_modules/next-virtual-routes/cache",
  }),
  footer: Schema.optional(Schema.Array(Schema.String)),
  formatter: Schema.optional(Schema.Literal("biome", "deno", "prettier")),
  formatterConfigFile: Schema.optional(Schema.String),
  log: Schema.optional(Schema.String),
  routes: Schema.Array(Route), // TODO: should be a function
  remove: Schema.Array(Schema.String), // TODO: should be a function
})

export type VirtualRoutesPluginConfig = typeof VirtualRoutesPluginConfig.Type

export type VirtualRoutesPluginConfigEncoded =
  typeof VirtualRoutesPluginConfig.Encoded

export class PluginConfig extends Context.Tag("PluginConfig")<
  PluginConfig,
  VirtualRoutesPluginConfig
>() {
  static layerFromUnknown(config: unknown) {
    return Layer.succeed(
      PluginConfig,
      Schema.decodeUnknownSync(VirtualRoutesPluginConfig)(config),
    )
  }

  static layerWith(config: VirtualRoutesPluginConfigEncoded) {
    return this.layerFromUnknown(config)
  }

  static encodeFromUnknown(config: unknown) {
    return Schema.encodeUnknownSync(VirtualRoutesPluginConfig)(config)
  }
}
