import { NextConfig } from "next"
import { prefix, route, withRoutes } from "next-virtual-routes"

const nextConfig: NextConfig = {
  /* config options here */
}

export default withRoutes({
  banner: [
    "/* eslint-disable */",
    "",
    "// @ts-nocheck",
    "",
    "// noinspection JSUnusedGlobalSymbols",
    "",
    "// This file was automatically generated.",
    "// You should NOT make any changes in this file as it will be overwritten.",
    "// Additionally, you should also exclude this file from your linter and/or formatter to prevent it from being checked or modified.",
    "",
  ],
  routes: prefix(
    "src/app/(generated)/",
    route("shop/page.tsx", "src/templates/page.tsx"),
    route("blog/page.tsx", "src/templates/page.tsx"),
    route("blog/[...slug]/page.tsx", "src/templates/page.tsx"),
    route("about/page.tsx", "src/templates/page.tsx"),
  ),
  remove: ["src/app/(generated)/**"],
})(nextConfig)
