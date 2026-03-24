import { Schema } from "effect"
import { merge } from "ts-deepmerge"
import { InvalidRoutesConfigError } from "./domain/errors"
import { assertContextSerializable } from "./domain/serializable"

/**
 * Serializable data exposed to route templates through the global `context`.
 */
export interface Context extends Record<PropertyKey, unknown> {}

declare global {
  const context: Context
}

/**
 * Output file path relative to the generated `app` directory.
 */
export type RouteFilePath = string

/**
 * Template file path relative to the project root.
 */
export type RouteTemplatePath = string

const ContextSchema = Schema.Unknown.pipe(
  Schema.refine((value): value is Context => {
    try {
      assertContextSerializable(value)
      return true
    } catch {
      return false
    }
  }),
)

/**
 * @internal
 */
export const RouteSchema = Schema.Struct({
  context: Schema.optional(ContextSchema),
  path: Schema.NonEmptyString,
  template: Schema.NonEmptyString,
})

export type Route = typeof RouteSchema.Type

const RouteGroupSchema = Schema.Union([RouteSchema, Schema.Array(RouteSchema)])

type RouteGroup = typeof RouteGroupSchema.Type

const decodeRoute = Schema.decodeUnknownSync(RouteSchema)
const decodeRouteGroups = Schema.decodeUnknownSync(Schema.Array(RouteGroupSchema))
const decodeString = Schema.decodeUnknownSync(Schema.String)

function invalidInput(message: string, cause?: unknown): never {
  throw new InvalidRoutesConfigError({
    cause,
    message: `Invalid next-virtual-routes config: ${message}`,
  })
}

function decodePath(path: unknown, label: string): string {
  try {
    return decodeString(path)
  } catch (cause) {
    return invalidInput(`${label} must be a string`, cause)
  }
}

function decodeRouteDefinition(input: unknown): Route {
  try {
    return decodeRoute(input)
  } catch (cause) {
    return invalidInput("route path and template must be non-empty strings", cause)
  }
}

/**
 * @internal
 */
export function resolveContext(value: unknown): Context {
  try {
    return Schema.decodeUnknownSync(ContextSchema)(value)
  } catch (cause) {
    return invalidInput("route context must be serializable", cause)
  }
}

function decodeChildren(children: ReadonlyArray<RouteGroup>): Array<Route> {
  try {
    return flattenRoutes(decodeRouteGroups(children))
  } catch (cause) {
    return invalidInput("prefix/context children must be valid routes", cause)
  }
}

function flattenRoutes(children: ReadonlyArray<RouteGroup>): Array<Route> {
  return children.flatMap((child) => (Array.isArray(child) ? child : [child]))
}

function joinRoutePath(prefix: string, path: string): string {
  const normalizedPrefix = prefix.replace(/\/+$/, "")
  const normalizedPath = path.replace(/^\/+/, "")
  return normalizedPrefix.length === 0
    ? normalizedPath
    : `${normalizedPrefix}/${normalizedPath}`
}

/**
 * Creates a virtual route from an output path and a template file.
 *
 * @group api
 *
 * @example
 * ```ts
 * route("blog/page.tsx", "src/templates/page.tsx")
 * ```
 */
export function route(
  path: RouteFilePath,
  template: RouteTemplatePath,
  context?: Context,
): Route {
  return decodeRouteDefinition({
    context,
    path,
    template,
  })
}

/**
 * Applies a path prefix to one or more routes.
 *
 * @group api
 *
 * @example
 * ```ts
 * prefix("blog", route("page.tsx", "src/templates/page.tsx"))
 * ```
 */
export function prefix(
  pathPrefix: string,
  ...children: ReadonlyArray<RouteGroup>
): Array<Route> {
  const decodedPrefix = decodePath(pathPrefix, "prefix path")
  return decodeChildren(children).map((child) => ({
    ...child,
    path: joinRoutePath(decodedPrefix, child.path),
  }))
}

/**
 * Merges shared context into one or more routes.
 *
 * Child route context overrides the same keys from the shared context.
 *
 * @group api
 *
 * @example
 * ```ts
 * context({ locale: "en" }, route("page.tsx", "src/templates/page.tsx"))
 * ```
 */
export function context(
  value: Context,
  ...children: ReadonlyArray<RouteGroup>
): Array<Route> {
  const decodedValue = resolveContext(value)

  return decodeChildren(children).map((child) => ({
    ...child,
    context: resolveContext(
      child.context ? merge(decodedValue, child.context) : decodedValue,
    ),
  }))
}
