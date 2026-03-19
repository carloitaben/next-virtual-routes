import { describe, expect, it } from "vitest"
import { context, prefix, route } from "./lib"

describe(route.name, () => {
  it("creates routes", () => {
    expect(route("src/pages/index.tsx", "src/templates/page.tsx")).toEqual({
      path: "src/pages/index.tsx",
      template: "src/templates/page.tsx",
    })
  })
})

describe(prefix.name, () => {
  it("prefixes variadic routes", () => {
    expect(
      prefix(
        "src/app",
        route("page.tsx", "src/templates/page.tsx"),
        route("blog/page.tsx", "src/templates/page.tsx"),
      ),
    ).toEqual([
      {
        path: "src/app/page.tsx",
        template: "src/templates/page.tsx",
      },
      {
        path: "src/app/blog/page.tsx",
        template: "src/templates/page.tsx",
      },
    ])
  })

  it("prefixes array routes", () => {
    expect(
      prefix("src/pages", [route("index.tsx", "src/templates/page.tsx")]),
    ).toEqual([
      {
        path: "src/pages/index.tsx",
        template: "src/templates/page.tsx",
      },
    ])
  })
})

describe(context.name, () => {
  it("deep merges nested contexts", () => {
    expect(
      context(
        { locale: { default: "en", fallback: "en" } },
        route("src/app/page.tsx", "src/templates/page.tsx", {
          locale: { fallback: "es" },
        }),
      ),
    ).toEqual([
      {
        context: {
          locale: {
            default: "en",
            fallback: "es",
          },
        },
        path: "src/app/page.tsx",
        template: "src/templates/page.tsx",
      },
    ])
  })
})
