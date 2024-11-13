# next-virtual-routes

React Router v7 [virtual file routes](https://www.youtube.com/watch?v=fjTX8hQTlEc&t=730s) on Next.js.

## Features

- Programatically generate [App Router files](https://nextjs.org/docs/app/building-your-application/routing#file-conventions).
- Reusable file templates.
- Mix and match with file-based routing for incremental adoption.
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

> [!TIP]
> You can optionally add `(virtual)/` to your `.gitignore` file if your virtual routes depend on frequently changing data.

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

> [!TIP]
> Templates can be either a file or a directory with an `index.ts` file inside.

This generates the `/src/app/(generated)/blog/page.tsx` file with the following content:

```ts
// src/app/(generated)/blog/page.tsx

const route = {
  filename: "src/app/(generated)/blog/page.tsx",
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

Statically analyzable expressions are evaluated when applying the template.
The previous template generates the following content:

```ts
// src/app/(generated)/home/page.tsx

const route = {
  filename: "src/app/(generated)/home/page.tsx",
  context: {
    static: true,
  },
}

export const dynamic = "force-static"

export function Page() {
  return "Static rendering"
}

// src/app/(generated)/about/page.tsx

const route = {
  filename: "src/app/(generated)/about/page.tsx",
  context: {
    static: false,
  },
}

export const dynamic = "force-dynamic"

export function Page() {
  return "Dynamic rendering"
}
```

## LICENSE

MIT
