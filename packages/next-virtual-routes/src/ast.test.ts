import { describe, expect, it } from "vitest"
import { transform } from "./ast"

describe("Context injection", () => {
  it("Skips code without `route` global references", () => {
    const code = `const route = "foo"`

    expect(
      transform(code, {
        filename: "test.ts",
      })
    ).toBe(code)
  })

  it.skip("Injects context", () => {
    const code = `const route = context.filename`

    expect(
      transform(code, {
        filename: "test.ts",
      })
    ).toBe(`const route = "test.ts"`)
  })
})

describe("Transformations", () => {
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

  it("Skips transforming non-statically analyzable code", () => {
    expect(
      transform("route.context.foo.bar.baz === Math.random()", context)
    ).toBe("route.context.foo.bar.baz === Math.random()")
  })

  it("transforms primitives", () => {
    expect(transform(`route.context.string`, context)).toBe(
      `${JSON.stringify(context.context.string)}`
    )

    expect(transform(`route.context.boolean`, context)).toBe(
      `${JSON.stringify(context.context.boolean)}`
    )

    expect(transform(`route.context.number`, context)).toBe(
      `${JSON.stringify(context.context.number)}`
    )

    expect(transform(`route.context.null`, context)).toBe(
      `${JSON.stringify(context.context.null)}`
    )

    expect(transform(`route.context.array[0]`, context)).toBe(
      `${JSON.stringify(context.context.array[0])}`
    )

    expect(transform(`route.context.nested.foo.bar[0].baz`, context)).toBe(
      `${JSON.stringify(context.context.nested.foo.bar[0].baz)}`
    )
  })

  it("Skips transforming non-primitive context values", () => {
    expect(transform("route.context.array", context)).toBe(
      "route.context.array"
    )
  })

  it("transforms statically analyzable expressions", () => {
    expect(transform("route.context.boolean === false", context)).toBe(
      "true === false"
    )
  })
})
