import { describe, expect, it } from "vitest"
import { GLOBAL_IDENTIFIER, transform } from "./transform"

const context = {
  banner: [],
  footer: [],
  routeContext: {
    string: "string",
    boolean: true,
    number: 123,
    null: null,
    array: [1, 2, 3],
    nested: {
      foo: {
        bar: [
          {
            baz: "qux",
          },
        ],
      },
    },
  },
} as const satisfies Parameters<typeof transform>[1]

const CONTEXT_INJECTION = `const ${GLOBAL_IDENTIFIER} = {`

describe("Context injection", () => {
  it("Skips injection on code without `context` global references", () => {
    expect(
      transform(`export const dynamic = "foo"`, context).includes(
        CONTEXT_INJECTION
      )
    ).toBe(false)
  })

  it("Skips injection on code without `context` global references after transformation", () => {
    expect(
      transform(`export const dynamic = context.string`, context).includes(
        CONTEXT_INJECTION
      )
    ).toBe(false)
  })

  it("Injects context", () => {
    expect(
      transform(`Object.keys(context)`, context).includes(CONTEXT_INJECTION)
    ).toBe(true)

    expect(
      transform(
        `export const dynamic = Object.keys(context)`,
        context
      ).includes(CONTEXT_INJECTION)
    ).toBe(true)
  })
})

describe("Transformations", () => {
  it("Skips transforming non-statically analyzable code", () => {
    expect(
      transform(
        `export const dynamic = Object.keys(context)`,
        context
      ).includes("Object.keys(context)")
    ).toBe(true)
  })

  it("transforms primitives", () => {
    expect(transform(`export const foo = context.string`, context)).toBe(
      `export const foo = ${JSON.stringify(context.routeContext.string)}`
    )

    expect(transform(`export const foo = context.boolean`, context)).toBe(
      `export const foo = ${JSON.stringify(context.routeContext.boolean)}`
    )

    expect(transform(`export const foo = context.number`, context)).toBe(
      `export const foo = ${JSON.stringify(context.routeContext.number)}`
    )

    expect(transform(`export const foo = context.null`, context)).toBe(
      `export const foo = ${JSON.stringify(context.routeContext.null)}`
    )

    expect(transform(`export const foo = context.array`, context)).toBe(
      `export const foo = ${JSON.stringify(context.routeContext.array)}`
    )

    expect(transform(`export const foo = context.array[0]`, context)).toBe(
      `export const foo = ${JSON.stringify(context.routeContext.array[0])}`
    )

    expect(transform(`export const foo = context.nested`, context)).toBe(
      `export const foo = ${JSON.stringify(context.routeContext.nested, null, 2)}`
    )

    expect(
      transform(`export const foo = context.nested.foo.bar[0].baz`, context)
    ).toBe(
      `export const foo = ${JSON.stringify(context.routeContext.nested.foo.bar[0].baz)}`
    )
  })

  it("transforms statically analyzable expressions", () => {
    expect(transform("export const foo = context.boolean", context)).toBe(
      "export const foo = true"
    )
  })

  it("appends banner and footer", () => {
    const withBannerAndFooter = {
      ...context,
      banner: ["foo", "bar"],
      footer: ["baz", "qux"],
    }

    expect(transform("hello", withBannerAndFooter)).toBe(
      ["foo", "bar", "hello", "baz", "qux"].join("\n")
    )
  })
})
