/**
 * Cached `Intl.NumberFormat` for locale-aware integers (Web Interface Guidelines).
 */
const integerFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});

export function formatInteger(n: number): string {
  return integerFormatter.format(n);
}
