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
