import { Layer } from "effect"
import { NodeServices } from "@effect/platform-node"
import { GlobLive } from "./services"

export const RuntimeLive = Layer.mergeAll(NodeServices.layer, GlobLive)
