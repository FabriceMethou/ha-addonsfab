/**
 * Utility function to merge Tailwind CSS class names
 * Similar to the `cn` function used in shadcn/ui examples
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes
    .filter(Boolean)
    .join(' ')
    .trim()
}

/**
 * Format a number as currency with consistent 2 decimal places
 * @param amount - The amount to format
 * @param currency - The currency code (default: 'EUR')
 * @returns Formatted currency string (e.g., "1.234,56 €")
 */
export function formatCurrency(amount: number, currency: string = 'EUR'): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * Format a number with consistent 2 decimal places (without currency symbol)
 * @param amount - The amount to format
 * @returns Formatted number string (e.g., "1.234,56")
 */
export function formatNumber(amount: number): string {
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}
