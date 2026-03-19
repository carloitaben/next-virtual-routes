import { describe, expect, it } from "vitest"
import { transform } from "./pipeline"

const context = {
  boolean: true,
  name: "Jai Dixit",
  nested: {
    title: "Dhoom",
  },
} as const

function runTransform(code: string) {
  return transform(code, {
    banner: "",
    footer: "",
    outputFile: "/repo/src/app/blog/page.tsx",
    routeContext: {
      ...context,
      path: "src/app/blog/page.tsx",
    },
    routePath: "src/app/blog/page.tsx",
    templateFile: "/repo/src/templates/page.tsx",
  })
}

describe(transform.name, () => {
  it("skips context injection when unused", () => {
    expect(runTransform('export const dynamic = "force-static"')).not.toContain(
      "const context =",
    )
  })

  it("evaluates static exports and skips injection when fully resolved", () => {
    expect(
      runTransform('export const dynamic = context.boolean ? "a" : "b"'),
    ).toBe('export const dynamic = "a"')
    expect(runTransform("export const title = `hello ${context.name}`")).toBe(
      'export const title = "hello Jai Dixit"',
    )
  })

  it("injects context", () => {
    const output = runTransform(
      "export default function Page() { return context.name }",
    )
    expect(output).toContain("const context =")
    expect(output).toContain('"path": "src/app/blog/page.tsx"')
  })

  it("rewrites relative imports", () => {
    expect(runTransform('import { foo } from "./foo"')).toContain(
      'from "../../templates/foo"',
    )
    expect(runTransform('import { foo } from "../foo"')).toContain(
      'from "../../foo"',
    )
  })

  it("keeps directives before banner and context injection", () => {
    expect(
      transform('"use client"\nexport default function Page() { return context.name }', {
        banner: "/* banner */",
        footer: "",
        outputFile: "/repo/src/app/page.tsx",
        routeContext: {
          ...context,
          path: "src/app/page.tsx",
        },
        routePath: "src/app/page.tsx",
        templateFile: "/repo/src/templates/page.tsx",
      }),
    ).toMatch(/^"use client"\n\n\/\* banner \*\/\n\nconst context =/)
  })

  it("appends banner and footer", () => {
    const banner = "/* banner */"
    const footer = "/* footer */"
    expect(
      transform("export default function Page() {}", {
        banner,
        footer,
        outputFile: "/repo/src/app/page.tsx",
        routeContext: {
          ...context,
          path: "src/app/page.tsx",
        },
        routePath: "src/app/page.tsx",
        templateFile: "/repo/src/templates/page.tsx",
      }),
    ).toBe(`${banner}\n\nexport default function Page() {}\n\n${footer}`)
  })
})
