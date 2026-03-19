import { merge } from "ts-deepmerge"

export interface Context extends Record<PropertyKey, unknown> {}

declare global {
  const context: Context
}

export type RouteFilePath = string
export type RouteTemplatePath = string

export type Route = Readonly<{
  path: string
  template: string
  context?: Context
}>

type RouteGroup = Route | ReadonlyArray<Route>

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

export function route(
  path: string,
  template: string,
  context?: Context,
): Route {
  return {
    context,
    path,
    template,
  }
}

export function prefix(
  pathPrefix: string,
  ...children: ReadonlyArray<RouteGroup>
): Array<Route> {
  return flattenRoutes(children).map((child) => ({
    ...child,
    path: joinRoutePath(pathPrefix, child.path),
  }))
}

export function context(
  value: Context,
  ...children: ReadonlyArray<RouteGroup>
): Array<Route> {
  return flattenRoutes(children).map((child) => ({
    ...child,
    context: child.context ? merge(value, child.context) : value,
  }))
}
