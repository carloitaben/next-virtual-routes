import createDebug from "debug"

export const debug = createDebug("next-virtual-routes")

// Copied from: https://github.com/TanStack/query/blob/main/packages/query-core/src/utils.ts#L352
function hasObjectPrototype(o: any): boolean {
  return Object.prototype.toString.call(o) === "[object Object]"
}

// Copied from: https://github.com/TanStack/query/blob/main/packages/query-core/src/utils.ts#L321
export function isPlainObject(o: any): o is Object {
  if (!hasObjectPrototype(o)) {
    return false
  }

  // If has no constructor
  const ctor = o.constructor
  if (ctor === undefined) {
    return true
  }

  // If has modified prototype
  const prot = ctor.prototype
  if (!hasObjectPrototype(prot)) {
    return false
  }

  // If constructor does not have an Object-specific method
  if (!prot.hasOwnProperty("isPrototypeOf")) {
    return false
  }

  // Handles Objects created by Object.create(<arbitrary prototype>)
  if (Object.getPrototypeOf(o) !== Object.prototype) {
    return false
  }

  // Most likely a plain Object
  return true
}

// Copied from: https://github.com/TanStack/query/blob/main/packages/query-core/src/utils.ts#L217
export function hash(queryKey: unknown): string {
  return JSON.stringify(queryKey, (_, val) =>
    isPlainObject(val)
      ? Object.keys(val)
          .sort()
          .reduce((result, key) => {
            result[key] = val[key]
            return result
          }, {} as any)
      : val
  )
}