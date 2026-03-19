import { afterEach, describe, expect, it } from "vitest"
import { route } from "../lib"
import { resolveConfig } from "./config"

const originalDebug = process.env.DEBUG

afterEach(() => {
  process.env.DEBUG = originalDebug
})

describe(resolveConfig.name, () => {
  it("enables logging from DEBUG=true", async () => {
    process.env.DEBUG = "true"

    await expect(
      resolveConfig({
        routes: [route("src/app/page.tsx", "src/templates/page.tsx")],
        watch: false,
      }),
    ).resolves.toMatchObject({ logEnabled: true })
  })

  it("enables logging from DEBUG=next-virtual-routes", async () => {
    process.env.DEBUG = "next-virtual-routes"

    await expect(
      resolveConfig({
        routes: [route("src/app/page.tsx", "src/templates/page.tsx")],
        watch: false,
      }),
    ).resolves.toMatchObject({ logEnabled: true })
  })

  it("rejects non-serializable context", async () => {
    await expect(
      resolveConfig({
        routes: [
          route("src/app/page.tsx", "src/templates/page.tsx", {
            callback: () => "nope",
          }),
        ],
        watch: false,
      }),
    ).rejects.toThrow(/Invalid next-virtual-routes config/)
  })
})
