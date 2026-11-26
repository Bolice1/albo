/**
 * Guards synthetic seeds, test helpers, and offline JWT signers so they can
 * NEVER execute when `NODE_ENV === 'production'` (AGENTS.md Rule 8 & 9, CODING_STANDARDS.md §7.4).
 */
export function assertNonProduction(
  operationName: string,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): void {
  const normalized = (nodeEnv ?? '').trim().toLowerCase();
  if (normalized === 'production') {
    throw new Error(
      `Operation "${operationName}" is strictly prohibited when NODE_ENV is "production".`,
    );
  }
}
