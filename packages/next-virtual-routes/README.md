# next-virtual-routes

React Router v7 [virtual* file routes](https://www.youtube.com/watch?v=fjTX8hQTlEc&t=730s) on Next.js.

<sup><sub>*Not really 🤪</sub></sup>

## Features

- Programatically generate [Next.js App Router files](https://nextjs.org/docs/app/building-your-application/routing#file-conventions).
- Mix and match with file-based routing.
- Reusable file templates.
- Fully typesafe.

## Installation

```sh
npm install next-virtual-routes
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

You can then access this data in your templates using the `context` global object.

```ts
// src/templates/page.tsx

export const dynamic = context.static ? "force-static" : "force-dynamic"

export function Page() {
  return context.static ? "Static rendering" : "Dynamic rendering"
}
```

Named exports with statically analyzable expressions are evaluated when applying the template.
The previous template generates the following content:

```ts
// src/app/home/page.tsx

const context = {
  static: true,
}

export const dynamic = "force-static"

export function Page() {
  return context.static ? "Static rendering" : "Dynamic rendering"
}

// src/app/about/page.tsx

const context = {
  static: false,
}

export const dynamic = "force-dynamic"

export function Page() {
  return context.static ? "Static rendering" : "Dynamic rendering"
}
```

This enables programmatic control of [Route Segment configuration](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config), [Middleware matchers](https://nextjs.org/docs/app/building-your-application/routing/middleware#matcher) and more.

## API

<!-- TSDOC_START -->

### Functions

- [route](#route)
- [prefix](#prefix)
- [context](#context)
- [generateRoutes](#generateroutes)
- [withRoutes](#withroutes)

#### route

| Function | Type |
| ---------- | ---------- |
| `route` | `(path: string, template: string, context?: Context or undefined) => Readonly<{ path: string; template: string; context?: Context or undefined; }>` |

#### prefix

| Function | Type |
| ---------- | ---------- |
| `prefix` | `(pathPrefix: string, ...children: readonly RouteGroup[]) => Readonly<{ path: string; template: string; context?: Context or undefined; }>[]` |

#### context

| Function | Type |
| ---------- | ---------- |
| `context` | `(value: Context, ...children: readonly RouteGroup[]) => Readonly<{ path: string; template: string; context?: Context or undefined; }>[]` |

#### generateRoutes

| Function | Type |
| ---------- | ---------- |
| `generateRoutes` | `(input: Readonly<{ routes: RoutesDefinition; banner?: string or undefined; footer?: string or undefined; cwd?: string or undefined; lockFile?: string or undefined; remove?: readonly string[] or undefined; watch?: boolean or undefined; }>) => Promise<...>` |

#### withRoutes

| Function | Type |
| ---------- | ---------- |
| `withRoutes` | `(routes: Readonly<{ routes: RoutesDefinition; banner?: string or undefined; footer?: string or undefined; cwd?: string or undefined; lockFile?: string or undefined; remove?: readonly string[] or undefined; watch?: boolean or undefined; }>) => (nextConfig?: NextConfigInput) => (...args: readonly unknown[]) => Promise<...>` |



### Interfaces

- [Context](#context)

#### Context



| Property | Type | Description |
| ---------- | ---------- | ---------- |


### Types

- [RouteFilePath](#routefilepath)
- [RouteTemplatePath](#routetemplatepath)
- [Route](#route)

#### RouteFilePath

| Type | Type |
| ---------- | ---------- |
| `RouteFilePath` |  |

#### RouteTemplatePath

| Type | Type |
| ---------- | ---------- |
| `RouteTemplatePath` |  |

#### Route

| Type | Type |
| ---------- | ---------- |
| `Route` | `Readonly<{ path: string template: string context?: Context }>` |


<!-- TSDOC_END -->

## LICENSE

[MIT](/LICENSE)
