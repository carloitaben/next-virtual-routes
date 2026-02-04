import { describe, expect, it } from "vitest"
import { context, prefix, route } from "./helpers"
import { Route } from "./config"
import { Schema } from "effect"

describe(context.name, () => {
  const ctx = { foo: "bar" }

  it("provides context", () => {
    const routes = context(ctx, route("page.tsx", "template.tsx"))
    expect(routes.at(0)?.context).toStrictEqual(ctx)
  })

  it("merges with other context", () => {
    const routeCtx = { baz: "qux" }
    const routes = context(ctx, route("page.tsx", "template.tsx", routeCtx))
    expect(routes.at(0)?.context).toStrictEqual({
      ...ctx,
      ...routeCtx,
    })
  })

  it("gets overriden by route context", () => {
    const routeCtx = { foo: "baz" }
    const routes = context(ctx, route("page.tsx", "template.tsx", routeCtx))
    expect(routes.at(0)?.context).toStrictEqual(routeCtx)
  })
})

describe(prefix.name, () => {
  it("prefixes route paths", () => {
    const routes = prefix("foo/", route("page.tsx", "template.tsx"))
    expect(routes.at(0)?.path).toBe("foo/page.tsx")
  })
})

describe(route.name, () => {
  it("defines valid routes", () => {
    expect(() =>
      Schema.decodeUnknownSync(Route)(route("page.tsx", "template.tsx")),
    ).not.toThrow()
  })
})
