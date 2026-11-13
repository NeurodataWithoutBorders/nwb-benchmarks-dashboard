// Version comparison for the dotted versions the results carry (database and machine file
// versions, package versions): enough of `packaging.version` to order them, which is all the
// analysis needs.

function releaseParts(version: string): number[] {
  const release = /^\s*v?(\d+(?:\.\d+)*)/.exec(version);
  return release ? release[1].split(".").map(Number) : [];
}

/** Negative, zero or positive as `a` sorts before, with or after `b`, by release number. */
export function compareVersions(a: string, b: string): number {
  const left = releaseParts(a);
  const right = releaseParts(b);
  if (left.length === 0 || right.length === 0) {
    if (left.length !== right.length) return left.length === 0 ? 1 : -1;
    return a.localeCompare(b);
  }
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** True when `version` is at least `minimum`; false for a missing or unreadable version. */
export function isAtLeast(version: string | null | undefined, minimum: string): boolean {
  if (version === null || version === undefined) return false;
  if (releaseParts(version).length === 0) return false;
  return compareVersions(version, minimum) >= 0;
}

/** The leading `1.2.3` of a package version string, as the analysis extracts it (`^([\d.]+)`). */
export function numericVersion(version: string | null | undefined): string | null {
  if (version === null || version === undefined) return null;
  const match = /^([\d.]+)/.exec(version);
  return match ? match[1] : null;
}
