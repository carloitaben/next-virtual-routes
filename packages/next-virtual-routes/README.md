# next-virtual-routes

Generate Next.js route files from reusable templates.

It writes real files before Next loads your config, so you keep Next's file conventions while generating the parts that are repetitive.

## Features

- Generate App Router or Pages Router files from code.
- Reuse templates across many routes.
- Mix generated routes with hand-written files.
- Pass typed, serializable context into templates.
- Hook into generation for formatting or other tooling.

## Installation

<!-- automd:pm-install name="next-virtual-routes" dev -->

```sh
# ✨ Auto-detect
npx nypm install -D next-virtual-routes

# npm
npm install -D next-virtual-routes

# yarn
yarn add -D next-virtual-routes

# pnpm
pnpm add -D next-virtual-routes

# bun
bun install -D next-virtual-routes

# deno
deno install --dev npm:next-virtual-routes
```

<!-- /automd -->

Then wrap your Next config.

```ts
// next.config.ts

import type { NextConfig } from "next"
import { route, withRoutes } from "next-virtual-routes"

const nextConfig: NextConfig = {
  /* config options here */
}

export default withRoutes({
  routes: [route("src/app/blog/page.tsx", "src/templates/page.tsx")],
})(nextConfig)
```

## Getting started

Start with one route and one template.

```ts
// next.config.ts

import type { NextConfig } from "next"
import { route, withRoutes } from "next-virtual-routes"

const nextConfig: NextConfig = {
  /* config options here */
}

export default withRoutes({
  routes: [route("src/app/blog/page.tsx", "src/templates/page.tsx")],
})(nextConfig)
```

```tsx
// src/templates/page.tsx

import { heading } from "./shared"

export default function Page() {
  return <main>{heading("Blog")}</main>
}
```

This writes `src/app/blog/page.tsx`:

```tsx
// src/app/blog/page.tsx

import { heading } from "../../templates/shared"

export default function Page() {
  return <main>{heading("Blog")}</main>
}
```

> [!TIP]
> Relative imports are rewritten to match the generated file location.

## Template context

Pass a serializable third argument to `route(...)` when a template needs per-route data.

```ts
// next.config.ts

import type { NextConfig } from "next"
import { route, withRoutes } from "next-virtual-routes"

declare module "next-virtual-routes" {
  interface Context {
    static: boolean
  }
}

const nextConfig: NextConfig = {
  /* config options here */
}

export default withRoutes({
  routes: [
    route("src/app/page.tsx", "src/templates/page.tsx", { static: true }),
    route("src/app/blog/page.tsx", "src/templates/page.tsx", { static: false }),
  ],
})(nextConfig)
```

Use the global `context` object inside the template.

```tsx
// src/templates/page.tsx

export const dynamic = context.static ? "force-static" : "force-dynamic"

export default function Page() {
  return (
    <main>
      <p>{context.path}</p>
      <p>{context.static ? "Static" : "Dynamic"}</p>
    </main>
  )
}
```

That generates route-specific output. Statically analyzable exports are folded ahead of time.

```tsx
// src/app/page.tsx

const context = {
  static: true,
  path: "src/app/page.tsx",
}

export const dynamic = "force-static"

export default function Page() {
  return (
    <main>
      <p>{context.path}</p>
      <p>{context.static ? "Static" : "Dynamic"}</p>
    </main>
  )
}
```

> [!NOTE]
> Context must be serializable plain data.

## Organizing routes with `prefix(...)`

Use `prefix(...)` when many routes share part of the output path.

```ts
// next.config.ts

import type { NextConfig } from "next"
import { prefix, route, withRoutes } from "next-virtual-routes"

const nextConfig: NextConfig = {
  /* config options here */
}

export default withRoutes({
  routes: prefix(
    "src/app/blog",
    route("page.tsx", "src/templates/blog-index.tsx"),
    route("[slug]/page.tsx", "src/templates/blog-post.tsx"),
  ),
})(nextConfig)
```

This prepends `src/app/blog` to each route path.

## Sharing context with `context(...)`

Use `context(...)` when a group of routes shares template data.

```ts
// next.config.ts

import type { NextConfig } from "next"
import { context, prefix, route, withRoutes } from "next-virtual-routes"

declare module "next-virtual-routes" {
  interface Context {
    locale: string
    static: boolean
  }
}

const nextConfig: NextConfig = {
  /* config options here */
}

export default withRoutes({
  routes: context(
    { locale: "en" },
    prefix(
      "src/app/blog",
      route("page.tsx", "src/templates/page.tsx", { static: true }),
      route("[slug]/page.tsx", "src/templates/page.tsx", { static: false }),
    ),
  ),
})(nextConfig)
```

Shared context is deep-merged into each route. Route-level keys win.

Inside `prefix(...)`, paths stay relative to the prefix, so `page.tsx` becomes `src/app/blog/page.tsx`.

## Template transforms

If the template is code, the library does a few helpful transforms:

- rewrites relative imports and re-exports
- injects `context` only when the template needs it
- precomputes some statically analyzable exports

Non-code files are copied as-is.

## Safety and cleanup

Generated routes are meant to coexist with real files.

- Existing files at a target path are skipped instead of overwritten.
- Duplicate configured routes keep the first definition.

Use `remove` to clear generated globs or directories before writing new files.

```ts
// next.config.ts

import type { NextConfig } from "next"
import { route, withRoutes } from "next-virtual-routes"

const nextConfig: NextConfig = {
  /* config options here */
}

export default withRoutes({
  routes: [route("src/app/generated/page.tsx", "src/templates/page.tsx")],
  remove: ["src/app/generated/**"],
})(nextConfig)
```

## Lower-level API

Use `generateRoutes(...)` when you need manual control outside `withRoutes(...)`.

```ts
// next.config.ts

import type { NextConfig } from "next"
import { generateRoutes, route } from "next-virtual-routes"

const nextConfig: NextConfig = {
  /* config options here */
}

export default async () => {
  await generateRoutes({
    routes: [route("src/app/blog/page.tsx", "src/templates/page.tsx")],
  })

  return nextConfig
}
```

## Advanced operations

### Async route factories

Build routes from the filesystem, a CMS, or another async source.

```ts
// next.config.ts

import type { NextConfig } from "next"
import { route, withRoutes } from "next-virtual-routes"
import { fetchRoutes } from "@/lib"

type RouteDefinition = {
  readonly pathname: string
  readonly static: boolean
}

const nextConfig: NextConfig = {
  /* config options here */
}

export default withRoutes({
  routes: async () => {
    const routes: RouteDefinition[] = await fetchRoutes()

    return routes.map((routeDefinition) =>
      route(
        `src/app${routeDefinition.pathname}/page.tsx`,
        "src/templates/page.tsx",
        { static: routeDefinition.static },
      ),
    )
  },
})(nextConfig)
```

This works well when an external system decides which paths exist and whether each route should be treated as static or dynamic.

### Hooks

Hooks let you react to generation lifecycle events.

```ts
// next.config.ts

import type { NextConfig } from "next"
import { execa } from "execa"
import { route, withRoutes } from "next-virtual-routes"

const nextConfig: NextConfig = {
  /* config options here */
}

export default withRoutes({
  hooks: {
    onRouteGenerated: async ({ path }) => {
      await execa("prettier", ["--write", path])
    },
  },
  routes: [route("src/app/blog/page.tsx", "src/templates/page.tsx")],
})(nextConfig)
```

Available hooks:

- `onGenerationStart`
- `onGenerationEnd`
- `onRouteGenerated`
- `onError`

<!-- automd:jsdocs src="./src/index.ts" headingLevel=2 group=api -->

## Api

### `context(value)`

Merges shared context into one or more routes.

Child route context overrides the same keys from the shared context.

**Example:**

```ts
context({ locale: "en" }, route("page.tsx", "src/templates/page.tsx"))
```

### `generateRoutes(input)`

Generates route files immediately.

Use this when you need to control route generation outside `withRoutes`.

**Example:**

```ts
await generateRoutes({
  routes: [route("blog/page.tsx", "src/templates/page.tsx")],
})
```

### `prefix(pathPrefix)`

Applies a path prefix to one or more routes.

**Example:**

```ts
prefix("blog", route("page.tsx", "src/templates/page.tsx"))
```

### `route(path, template, context?)`

Creates a virtual route from an output path and a template file.

**Example:**

```ts
route("blog/page.tsx", "src/templates/page.tsx")
```

### `withRoutes(routes)`

Wraps a Next.js config and generates routes before Next loads it.

**Example:**

```ts
export default withRoutes({
  routes: [route("blog/page.tsx", "src/templates/page.tsx")],
})({})
```

<!-- /automd -->

## License

[MIT](/LICENSE)
