import { join } from "path"
import { merge } from "ts-deepmerge"

export interface Context {}

declare global {
  const route: {
    context: Context
  }
}

type RouteFileConvention =
  | "apple-icon"
  | "default"
  | "error"
  | "icon"
  | "instrumentation"
  | "layout"
  | "loading"
  | "manifest"
  | "mdx-components"
  | "middleware"
  | "not-found"
  | "opengraph-image"
  | "page"
  | "robots"
  | "route"
  | "sitemap"
  | "sitemap"
  | "template"
  | "twitter-image"

type RouteFileExtensions = "ts" | "tsx" | "js" | "jsx"

type RouteFilePath =
  | `${RouteFileConvention}.${RouteFileExtensions}`
  | `${string}/${RouteFileConvention}.${RouteFileExtensions}`

export type Route = {
  path: string
  template: string
  context?: Context
}

/**
 * Programatically generates a route.
 *
 * @example
 * ```ts
 * export default withRoutes({
 *   routes: [route("blog/page.tsx", "src/templates/page.tsx")],
 * })
 * ```
 *
 * @example
 * Use declaration merging to add a type to the `context` object.
 *
 * ```ts
 * declare module "next-virtual-routes" {
 *   interface Context {
 *     static: boolean
 *   }
 * }
 *
 * export default withRoutes({
 *   routes: [
 *     route("home/page.tsx", "src/templates/page.tsx", {
 *       static: true,
 *     }),
 *     route("blog/page.tsx", "src/templates/page.tsx", {
 *       static: false,
 *     }),
 *   ],
 * })
 * ```
 */
export function route(
  path: RouteFilePath,
  template: string,
  context?: Context
): Route {
  return {
    path,
    template,
    context,
  }
}

/**
 * Adds a path prefix to a set of routes.
 *
 * @example
 * ```ts
 * const routes = [
 *   ...prefix("blog", [
 *     route("page.tsx", "src/templates/page.tsx"),
 *     route("[...slug]/page.tsx", "src/templates/page.tsx"),
 *   ])
 * ]
 * ```
 */
export function prefix(prefix: string, children: Route[]): Route[] {
  return children.map((child) => ({
    ...child,
    path: join(prefix, child.path),
  }))
}

/**
 * Adds context to a set of routes. Nested context are [deeply merged](https://www.npmjs.com/package/ts-deepmerge).
 *
 * @example
 * declare module "next-virtual-routes" {
 *   interface Context {
 *     render: "static" | "dynamic"
 *   }
 * }
 *
 * ```ts
 * const routes = [
 *   ...context({ render: "static" }, [
 *     route("page.tsx", "src/templates/page.tsx"),
 *     route("page.tsx", "src/templates/page.tsx"),
 *   ])
 * ]
 * ```
 */
export function context(context: Context, children: Route[]): Route[] {
  return children.map((child) => ({
    ...child,
    context: child.context ? merge(child.context, context) : context,
  }))
}
