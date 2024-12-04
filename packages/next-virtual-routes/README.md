# next-virtual-routes

React Router v7 [virtual file routes](https://www.youtube.com/watch?v=fjTX8hQTlEc&t=730s) on Next.js.

## Features

- Programatically generate any [Next.js App Router file](https://nextjs.org/docs/app/building-your-application/routing#file-conventions).
- Mix and match with file-based routing for incremental adoption.
- Reusable file templates.
- Fully typesafe.

## Installation

```sh
npm install plugin
```

Then, add the following to your `next.config.ts` file:

```ts
// next.config.ts

import { withRoutes } from "next-virtual-routes"

export default withRoutes({
  routes: [
    /* Routes config */
  ],
  /* Next.js config */
})
```

The `routes` property accepts the following values:

- An array of `route()` calls.
- A function that returns an array of `route()` calls.
- An async function that returns an array of `route()` calls.

For advanced configuration, you can also pass an object:

```ts
// next.config.ts

import { withRoutes } from "next-virtual-routes"

export default withRoutes({
  routes: {
    formatter: "prettier",
    strict: true,
    config: [
      /* Routes config */
    ],
  },
  /* Next.js config */
})
```

A lower level function is also exposed for cases where you need more control.

```ts
// next.config.ts

import { generateRoutes } from "next-virtual-routes"

export default async () => {
  await generateRoutes([
    /* Routes config */
  ])

  return {
    /* Next.js config */
  }
}
```

## Usage

Call `route` in your routes configuration to programatically create a route file.
Pass the file and a path template relative to your `next.config.ts`.

```ts
// next.config.ts

import { route, withRoutes } from "next-virtual-routes"

export default withRoutes({
  routes: [route("blog/page.tsx", "src/templates/page.tsx")],
})
```

Then, create the template.

```ts
// src/templates/page.tsx

export function Page() {
  return "Hello world"
}
```

This generates the `/src/app/blog/page.tsx` file with the following content:

```ts
// src/app/blog/page.tsx

const route = {
  filename: "src/app/blog/page.tsx",
  context: {},
}

export function Page() {
  return "Hello world"
}
```

> [!WARNING]
> Always import files inside templates using [path aliases](https://www.typescriptlang.org/tsconfig/#paths) to prevent errors.

### Passing context to templates

You can optionally pass a serializable `context` object as a third parameter.

```ts
// next.config.ts

export default withRoutes({
  routes: [
    route("home/page.tsx", "src/templates/page.tsx", {
      static: true,
    }),
    route("blog/page.tsx", "src/templates/page.tsx", {
      static: false,
    }),
  ],
})
```

If you are using TypeScript, you can use declaration merging to add a type
to the `context` object.

```ts
// next.config.ts

declare module "next-virtual-routes" {
  interface Context {
    static: boolean
  }
}

export default withRoutes({
  routes: [
    route("home/page.tsx", "src/templates/page.tsx", {
      static: true,
    }),
    route("blog/page.tsx", "src/templates/page.tsx", {
      static: false,
    }),
  ],
})
```

You can then access this data in your templates
using the `context` property of `route` global object.

```ts
// src/templates/page.tsx

export const dynamic = route.context.static ? "force-static" : "force-dynamic"

export function Page() {
  return route.context.static ? "Static rendering" : "Dynamic rendering"
}
```

Named exports with statically analyzable expressions are evaluated when applying the template.
The previous template generates the following content:

```ts
// src/app/home/page.tsx

const route = {
  filename: "src/app/home/page.tsx",
  context: {
    static: true,
  },
}

export const dynamic = "force-static"

export function Page() {
  return route.context.static ? "Static rendering" : "Dynamic rendering"
}

// src/app/about/page.tsx

const route = {
  filename: "src/app/about/page.tsx",
  context: {
    static: false,
  },
}

export const dynamic = "force-dynamic"

export function Page() {
  return route.context.static ? "Static rendering" : "Dynamic rendering"
}
```

## Advanced usage

Check the `[examples](/examples/)` directory to learn more about advanced features and use cases.

## API

<!-- TSDOC_START -->

### Functions

- [route](#route)
- [prefix](#prefix)
- [context](#context)
- [generateRoutes](#generateroutes)
- [withRoutes](#withroutes)

#### route

Programatically generates a route.

| Function | Type |
| ---------- | ---------- |
| `route` | `(path: RouteFilePath, template: string, context?: Context or undefined) => Route` |

Examples:

```ts
export default withRoutes({
  routes: [route("blog/page.tsx", "src/templates/page.tsx")],
})
```
Use declaration merging to add a type to the `context` object.

```ts
declare module "next-virtual-routes" {
  interface Context {
    static: boolean
  }
}

export default withRoutes({
  routes: [
    route("home/page.tsx", "src/templates/page.tsx", {
      static: true,
    }),
    route("blog/page.tsx", "src/templates/page.tsx", {
      static: false,
    }),
  ],
})
```


#### prefix

Adds a path prefix to a set of routes.

| Function | Type |
| ---------- | ---------- |
| `prefix` | `(prefix: string, children: Route[]) => Route[]` |

Examples:

```ts
const routes = [
  ...prefix("blog", [
    route("page.tsx", "src/templates/page.tsx"),
    route("[...slug]/page.tsx", "src/templates/page.tsx"),
  ])
]
```


#### context

Adds context to a set of routes. Nested context are [deeply merged](https://www.npmjs.com/package/ts-deepmerge).

| Function | Type |
| ---------- | ---------- |
| `context` | `(context: Context, children: Route[]) => Route[]` |

Examples:

declare module "next-virtual-routes" {
  interface Context {
    render: "static" | "dynamic"
  }
}

```ts
const routes = [
  ...context({ render: "static" }, [
    route("page.tsx", "src/templates/page.tsx"),
    route("page.tsx", "src/templates/page.tsx"),
  ])
]
```


#### generateRoutes

| Function | Type |
| ---------- | ---------- |
| `generateRoutes` | `(config: PluginRoutesConfig) => Promise<void>` |

#### withRoutes

| Function | Type |
| ---------- | ---------- |
| `withRoutes` | `({ routes, ...nextConfig }: PluginRoutesConfig and NextConfig) => Promise<NextConfig>` |



### Interfaces

- [Context](#context)

#### Context



| Property | Type | Description |
| ---------- | ---------- | ---------- |


### Types

- [RouteContext](#routecontext)
- [Route](#route)

#### RouteContext

TODO: document

| Type | Type |
| ---------- | ---------- |
| `RouteContext` | `{ filename: string context?: Context }` |

#### Route

TODO: document

| Type | Type |
| ---------- | ---------- |
| `Route` | `{ path: string template: string context?: Context }` |


<!-- TSDOC_END -->

## LICENSE

MIT
