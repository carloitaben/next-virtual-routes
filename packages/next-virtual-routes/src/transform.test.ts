import { describe, expect, it } from "vitest"
import { transform } from "./transform"

const context = {
  filename: "test.ts",
  context: {
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
} as const

describe("Context injection", () => {
  it("Skips injection on code without `route` global references", () => {
    expect(
      transform(`export const dynamic = "foo"`, context).includes(
        "const route = {"
      )
    ).toBe(false)
  })

  it("Skips injection on code without `route` global references after transformation", () => {
    expect(
      transform(`export const dynamic = route.filename`, context).includes(
        "const route = {"
      )
    ).toBe(false)
  })

  it("Injects context", () => {
    expect(
      transform(`route.context.filename`, context).includes("const route")
    ).toBe(true)

    expect(
      transform(
        `export const dynamic = route.context.filename.length()`,
        context
      ).includes("const route")
    ).toBe(true)
  })
})

describe("Transformations", () => {
  it("Skips transforming non-statically analyzable code", () => {
    expect(
      transform(
        `export const dynamic = route.context.length()`,
        context
      ).includes("route.context.length()")
    ).toBe(true)
  })

  it("transforms primitives", () => {
    expect(transform(`export const foo = route.context.string`, context)).toBe(
      `export const foo = ${JSON.stringify(context.context.string)}`
    )

    expect(transform(`export const foo = route.context.boolean`, context)).toBe(
      `export const foo = ${JSON.stringify(context.context.boolean)}`
    )

    expect(transform(`export const foo = route.context.number`, context)).toBe(
      `export const foo = ${JSON.stringify(context.context.number)}`
    )

    expect(transform(`export const foo = route.context.null`, context)).toBe(
      `export const foo = ${JSON.stringify(context.context.null)}`
    )

    expect(transform(`export const foo = route.context.array`, context)).toBe(
      `export const foo = ${JSON.stringify(context.context.array)}`
    )

    expect(
      transform(`export const foo = route.context.array[0]`, context)
    ).toBe(`export const foo = ${JSON.stringify(context.context.array[0])}`)

    expect(transform(`export const foo = route.context.nested`, context)).toBe(
      `export const foo = ${JSON.stringify(context.context.nested, null, 2)}`
    )

    expect(
      transform(
        `export const foo = route.context.nested.foo.bar[0].baz`,
        context
      )
    ).toBe(
      `export const foo = ${JSON.stringify(context.context.nested.foo.bar[0].baz)}`
    )
  })

  it("transforms statically analyzable expressions", () => {
    expect(transform("export const foo = route.context.boolean", context)).toBe(
      "export const foo = true"
    )
  })
})
