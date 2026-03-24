import { describe, expect, it } from "vitest"
import { context, prefix, route } from "./lib"

describe(route.name, () => {
  it("creates routes", () => {
    expect(route("src/pages/index.tsx", "src/templates/page.tsx")).toEqual({
      path: "src/pages/index.tsx",
      template: "src/templates/page.tsx",
    })
  })

  it("rejects invalid route inputs early", () => {
    expect(() => Reflect.apply(route, undefined, ["", "src/templates/page.tsx"])).toThrow(
      /route path and template must be non-empty strings/,
    )
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

  it("rejects invalid prefix inputs early", () => {
    expect(() => Reflect.apply(prefix, undefined, [123, route("page.tsx", "src/templates/page.tsx")])).toThrow(
      /prefix path must be a string/,
    )
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

  it("rejects non-serializable shared context early", () => {
    expect(() =>
      Reflect.apply(context, undefined, [
        { callback: () => "nope" },
        route("src/app/page.tsx", "src/templates/page.tsx"),
      ]),
    ).toThrow(/route context must be serializable/)
  })
})
