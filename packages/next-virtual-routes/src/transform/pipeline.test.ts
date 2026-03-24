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
    expect(runTransform("export const title = context?.nested.title")).toBe(
      'export const title = "Dhoom"',
    )
    expect(runTransform("export const title = context[\"name\"]")).toBe(
      'export const title = "Jai Dixit"',
    )
  })

  it("does not treat shadowed context bindings as global", () => {
    expect(
      runTransform("export default function Page(context: { name: string }) { return context.name }"),
    ).not.toContain("const context =")
    expect(
      runTransform("const context = { name: 'local' }; export default function Page() { return context.name }"),
    ).toBe("const context = { name: 'local' }; export default function Page() { return context.name }")
    expect(
      runTransform("import { context } from './context'; export default function Page() { return context.name }"),
    ).not.toContain("const context =")
    expect(
      runTransform("export default function Page({ context }: { context: { name: string } }) { return context.name }"),
    ).not.toContain("const context =")
  })

  it("injects context when runtime access remains", () => {
    const output = runTransform(
      "export default function Page() { return context.name }",
    )
    expect(output).toContain("const context =")
    expect(output).toContain('"path": "src/app/blog/page.tsx"')
  })

  it("rewrites relative imports and exports", () => {
    expect(runTransform('import { foo } from "./foo"')).toContain(
      'from "../../templates/foo"',
    )
    expect(runTransform('import { foo } from "../foo"')).toContain(
      'from "../../foo"',
    )
    expect(runTransform('export { foo } from "./foo"')).toContain(
      'from "../../templates/foo"',
    )
    expect(runTransform('export * from "./foo"')).toContain(
      'from "../../templates/foo"',
    )
    expect(runTransform('const loader = () => import("./foo")')).toContain(
      'import("../../templates/foo")',
    )
  })

  it("rewrites imports in non-ASCII files and still injects context", () => {
    const output = runTransform(
      'const title = "olá"\nimport { foo } from "./foo"\nexport default function Page() { return context.name }',
    )

    expect(output).toContain('from "../../templates/foo"')
    expect(output).toContain("const context =")
  })

  it("keeps directives before banner and context injection", () => {
    expect(
      transform(
        '"use client"\n"use server"\nexport default function Page() { return context.name }',
        {
          banner: "/* banner */",
          footer: "",
          outputFile: "/repo/src/app/page.tsx",
          routeContext: {
            ...context,
            path: "src/app/page.tsx",
          },
          routePath: "src/app/page.tsx",
          templateFile: "/repo/src/templates/page.tsx",
        },
      ),
    ).toMatch(/^"use client"\n"use server"\n\n\/\* banner \*\/\n\nconst context =/)
  })

  it("allows non-ASCII code when no source edits are needed", () => {
    expect(runTransform('export default function Page() { return "olá" }')).toBe(
      'export default function Page() { return "olá" }',
    )
  })

  it("supports non-ASCII code when a source edit is needed", () => {
    expect(runTransform('export const title = context.name + "olá"')).toBe(
      'export const title = "Jai Dixitolá"',
    )
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
