import * as acorn from "acorn"
import type { Node } from "estree"
import { describe, expect, it } from "vitest"
import { evaluate } from "./eval"

function parse(code: string) {
  return acorn.parse(code, {
    sourceType: "module",
    ecmaVersion: "latest",
  }) as Node
}

describe("Evaluate", () => {
  it("Works", () => {
    expect(
      evaluate(parse(`foo ? "yay" : "nay"`), {
        foo: false,
      })
    ).toBe("nay")
  })
})
