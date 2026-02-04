// import * as acorn from "acorn"
// import type { Node } from "estree"
// import { describe, expect, it } from "vitest"
// import { evaluate } from "./eval"

// function parse(code: string) {
//   return acorn.parse(code, {
//     sourceType: "module",
//     ecmaVersion: "latest",
//   }) as Node
// }

// describe("Evaluate", () => {
//   it("Works", () => {
//     expect(
//       evaluate(parse(`foo ? "yay" : "nay"`), {
//         foo: false,
//       })
//     ).toBe("nay")
//   })
// })
//
import { it, expect } from "@effect/vitest"
import { Effect } from "effect"
import { parse } from "./eval"

// A simple divide function that returns an Effect, failing when dividing by zero

// Testing a successful division
it.effect("test success", () =>
  Effect.gen(function* () {
    const result = yield* parse({
      code: [
        `"use client"`,
        `export const dynamic = context.dynamic`,
        `export async function foo() { if (context) {} }`,
      ].join("\n"),
    })

    // expect(result).toBe(
    //   [
    //     `"use client"`,
    //     `const context = {}`,
    //     `export const dynamic = context.dynamic`,
    //   ].join("\n"),
    // )
  }),
)
