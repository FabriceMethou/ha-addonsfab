/**
 * Utility function to merge Tailwind CSS class names
 * Similar to the `cn` function used in shadcn/ui examples
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ").trim();
}

// Use the browser's own locale for number/currency formatting.
// This means a French user sees "1 234,56 €" and an American sees "$1,234.56"
// without any hardcoded locale in the app.
const USER_LOCALE =
  typeof navigator !== "undefined" ? navigator.language : "en-US";

/**
 * Format a number as currency with consistent 2 decimal places
 * @param amount - The amount to format
 * @param currency - The currency code (default: 'EUR')
 * @returns Formatted currency string using the browser's locale
 */
export function formatCurrency(
  amount: number,
  currency: string = "EUR",
): string {
  return new Intl.NumberFormat(USER_LOCALE, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format a number with consistent 2 decimal places (without currency symbol)
 * @param amount - The amount to format
 * @returns Formatted number string using the browser's locale
 */
export function formatNumber(amount: number): string {
  return new Intl.NumberFormat(USER_LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
