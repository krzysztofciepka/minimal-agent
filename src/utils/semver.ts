import { gte as semverGte, lt as semverLt, gt as semverGt, lte as semverLte } from 'semver'

export function gte(a: string, b: string): boolean {
  try {
    return semverGte(a, b)
  } catch {
    return false
  }
}

export function gt(a: string, b: string): boolean {
  try {
    return semverGt(a, b)
  } catch {
    return false
  }
}

export function lt(a: string, b: string): boolean {
  try {
    return semverLt(a, b)
  } catch {
    return false
  }
}

export function lte(a: string, b: string): boolean {
  try {
    return semverLte(a, b)
  } catch {
    return false
  }
}
