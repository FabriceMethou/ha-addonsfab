/**
 * Money Utility Module
 *
 * Provides precise decimal arithmetic for financial calculations to avoid
 * JavaScript floating-point precision errors (e.g., 0.1 + 0.2 !== 0.3).
 *
 * Uses decimal.js for arbitrary-precision decimal arithmetic with proper
 * rounding modes suitable for financial applications.
 *
 * @example
 * import { money, sumMoney, percentOf } from '../lib/money';
 *
 * // Safe addition
 * const total = money(0.1).plus(0.2).toNumber(); // 0.3 (not 0.30000000000000004)
 *
 * // Sum an array of amounts
 * const transactions = [{ amount: 19.99 }, { amount: 5.01 }];
 * const sum = sumMoney(transactions, t => t.amount); // 25.00
 *
 * // Calculate percentage
 * const spent = 750;
 * const budget = 1000;
 * const progress = percentOf(spent, budget); // 75
 */

import Decimal from 'decimal.js';

// Configure Decimal for financial calculations
// ROUND_HALF_EVEN (banker's rounding) is the standard for financial calculations
// It minimizes cumulative rounding errors by rounding 0.5 to the nearest even number
Decimal.set({
  precision: 20,         // High precision for intermediate calculations
  rounding: Decimal.ROUND_HALF_EVEN,  // Banker's rounding
});

/**
 * Creates a Decimal instance from a number, string, or existing Decimal.
 * Use this for all money calculations to avoid floating-point errors.
 *
 * @param value - The monetary value (number, string, or Decimal)
 * @returns Decimal instance
 *
 * @example
 * const price = money(19.99);
 * const total = price.plus(5.01).toNumber(); // 25.00
 */
export function money(value: number | string | Decimal): Decimal {
  if (value === null || value === undefined || value === '') {
    return new Decimal(0);
  }
  return new Decimal(value);
}

/**
 * Safely adds two or more monetary values.
 *
 * @param values - Values to add together
 * @returns Sum as a number rounded to 2 decimal places
 *
 * @example
 * addMoney(0.1, 0.2) // 0.3
 * addMoney(10.50, 5.25, 3.25) // 19.00
 */
export function addMoney(...values: (number | string | Decimal)[]): number {
  const result = values.reduce<Decimal>(
    (sum, val) => sum.plus(money(val)),
    new Decimal(0)
  );
  return result.toDecimalPlaces(2).toNumber();
}

/**
 * Safely subtracts monetary values.
 *
 * @param minuend - The value to subtract from
 * @param subtrahends - Values to subtract
 * @returns Difference as a number rounded to 2 decimal places
 *
 * @example
 * subtractMoney(100, 19.99) // 80.01
 * subtractMoney(100, 25.50, 10.25) // 64.25
 */
export function subtractMoney(
  minuend: number | string | Decimal,
  ...subtrahends: (number | string | Decimal)[]
): number {
  let result = money(minuend);
  for (const val of subtrahends) {
    result = result.minus(money(val));
  }
  return result.toDecimalPlaces(2).toNumber();
}

/**
 * Safely multiplies monetary values (e.g., for exchange rates, tax calculations).
 *
 * @param value - The base value
 * @param multiplier - The multiplier
 * @returns Product as a number rounded to 2 decimal places
 *
 * @example
 * multiplyMoney(100, 0.08) // 8.00 (8% tax)
 * multiplyMoney(50, 1.25) // 62.50 (exchange rate)
 */
export function multiplyMoney(
  value: number | string | Decimal,
  multiplier: number | string | Decimal
): number {
  return money(value).times(money(multiplier)).toDecimalPlaces(2).toNumber();
}

/**
 * Safely divides monetary values.
 *
 * @param dividend - The value to divide
 * @param divisor - The divisor
 * @returns Quotient as a number rounded to 2 decimal places
 * @throws Error if divisor is zero
 *
 * @example
 * divideMoney(100, 3) // 33.33
 * divideMoney(50, 4) // 12.50
 */
export function divideMoney(
  dividend: number | string | Decimal,
  divisor: number | string | Decimal
): number {
  const divisorDecimal = money(divisor);
  if (divisorDecimal.isZero()) {
    throw new Error('Division by zero');
  }
  return money(dividend).dividedBy(divisorDecimal).toDecimalPlaces(2).toNumber();
}

/**
 * Sums an array of objects by extracting a monetary value from each.
 * Replaces error-prone reduce patterns like: arr.reduce((sum, x) => sum + x.amount, 0)
 *
 * @param items - Array of items to sum
 * @param extractor - Function to extract the monetary value from each item
 * @returns Sum as a number rounded to 2 decimal places
 *
 * @example
 * const transactions = [
 *   { amount: 19.99 },
 *   { amount: 5.01 },
 *   { amount: 25.00 }
 * ];
 * sumMoney(transactions, t => t.amount); // 50.00
 *
 * // With filter
 * sumMoney(
 *   transactions.filter(t => t.amount > 0),
 *   t => t.amount
 * ); // sum of positive amounts only
 */
export function sumMoney<T>(
  items: T[],
  extractor: (item: T) => number | string | Decimal
): number {
  const result = items.reduce(
    (sum, item) => sum.plus(money(extractor(item))),
    new Decimal(0)
  );
  return result.toDecimalPlaces(2).toNumber();
}

/**
 * Sums an array of numbers directly.
 *
 * @param values - Array of numbers to sum
 * @returns Sum as a number rounded to 2 decimal places
 *
 * @example
 * sumMoneyArray([0.1, 0.2, 0.3]) // 0.60 (not 0.6000000000000001)
 */
export function sumMoneyArray(values: (number | string | Decimal)[]): number {
  return sumMoney(values, v => v);
}

/**
 * Calculates what percentage one value is of another.
 *
 * @param part - The part value
 * @param whole - The whole value
 * @param decimalPlaces - Decimal places for the result (default: 1)
 * @returns Percentage as a number (0-100 scale)
 *
 * @example
 * percentOf(25, 100) // 25.0
 * percentOf(1, 3) // 33.3
 * percentOf(750, 1000) // 75.0
 */
export function percentOf(
  part: number | string | Decimal,
  whole: number | string | Decimal,
  decimalPlaces: number = 1
): number {
  const wholeDecimal = money(whole);
  if (wholeDecimal.isZero()) {
    return 0;
  }
  return money(part)
    .dividedBy(wholeDecimal)
    .times(100)
    .toDecimalPlaces(decimalPlaces)
    .toNumber();
}

/**
 * Calculates percentage change between two values.
 *
 * @param current - Current value
 * @param previous - Previous value
 * @param decimalPlaces - Decimal places for the result (default: 1)
 * @returns Percentage change (positive = increase, negative = decrease)
 *
 * @example
 * percentChange(110, 100) // 10.0 (10% increase)
 * percentChange(90, 100) // -10.0 (10% decrease)
 * percentChange(100, 0) // 0 (no previous value)
 */
export function percentChange(
  current: number | string | Decimal,
  previous: number | string | Decimal,
  decimalPlaces: number = 1
): number {
  const previousDecimal = money(previous);
  if (previousDecimal.isZero()) {
    return 0;
  }
  return money(current)
    .minus(previousDecimal)
    .dividedBy(previousDecimal.abs())
    .times(100)
    .toDecimalPlaces(decimalPlaces)
    .toNumber();
}

/**
 * Rounds a monetary value to 2 decimal places using banker's rounding.
 *
 * @param value - The value to round
 * @returns Rounded value as a number
 *
 * @example
 * roundMoney(10.555) // 10.56 (rounds to even)
 * roundMoney(10.545) // 10.54 (rounds to even)
 * roundMoney(10.125) // 10.12 (rounds to even)
 */
export function roundMoney(value: number | string | Decimal): number {
  return money(value).toDecimalPlaces(2).toNumber();
}

/**
 * Converts a value to absolute (always positive).
 * Useful for expense/income display where amounts are stored with sign.
 *
 * @param value - The value to make absolute
 * @returns Absolute value as a number rounded to 2 decimal places
 *
 * @example
 * absMoney(-50.25) // 50.25
 * absMoney(50.25) // 50.25
 */
export function absMoney(value: number | string | Decimal): number {
  return money(value).abs().toDecimalPlaces(2).toNumber();
}

/**
 * Negates a monetary value.
 *
 * @param value - The value to negate
 * @returns Negated value as a number rounded to 2 decimal places
 *
 * @example
 * negateMoney(50.25) // -50.25
 * negateMoney(-50.25) // 50.25
 */
export function negateMoney(value: number | string | Decimal): number {
  return money(value).negated().toDecimalPlaces(2).toNumber();
}

/**
 * Compares two monetary values for equality (within 2 decimal places).
 *
 * @param a - First value
 * @param b - Second value
 * @returns True if values are equal when rounded to 2 decimal places
 *
 * @example
 * equalMoney(10.005, 10.00) // true (both round to 10.00)
 * equalMoney(10.01, 10.02) // false
 */
export function equalMoney(
  a: number | string | Decimal,
  b: number | string | Decimal
): boolean {
  return money(a).toDecimalPlaces(2).equals(money(b).toDecimalPlaces(2));
}

/**
 * Checks if a monetary value is zero.
 *
 * @param value - The value to check
 * @returns True if value is zero
 */
export function isZero(value: number | string | Decimal): boolean {
  return money(value).isZero();
}

/**
 * Checks if a monetary value is positive.
 *
 * @param value - The value to check
 * @returns True if value is greater than zero
 */
export function isPositive(value: number | string | Decimal): boolean {
  return money(value).isPositive() && !money(value).isZero();
}

/**
 * Checks if a monetary value is negative.
 *
 * @param value - The value to check
 * @returns True if value is less than zero
 */
export function isNegative(value: number | string | Decimal): boolean {
  return money(value).isNegative();
}

/**
 * Converts exchange rate with proper precision (4 decimal places).
 *
 * @param amount - Amount to convert
 * @param rate - Exchange rate
 * @returns Converted amount rounded to 2 decimal places
 *
 * @example
 * convertCurrency(100, 1.1234) // 112.34
 */
export function convertCurrency(
  amount: number | string | Decimal,
  rate: number | string | Decimal
): number {
  return money(amount).times(money(rate)).toDecimalPlaces(2).toNumber();
}

/**
 * Calculates the reciprocal of an exchange rate with proper precision.
 * Useful for displaying "1 USD = X EUR" style rates.
 *
 * @param rate - The exchange rate
 * @param decimalPlaces - Decimal places for the result (default: 4)
 * @returns Reciprocal rate
 *
 * @example
 * reciprocalRate(0.85) // 1.1765 (1/0.85)
 */
export function reciprocalRate(
  rate: number | string | Decimal,
  decimalPlaces: number = 4
): number {
  const rateDecimal = money(rate);
  if (rateDecimal.isZero()) {
    return 0;
  }
  return new Decimal(1).dividedBy(rateDecimal).toDecimalPlaces(decimalPlaces).toNumber();
}

// Re-export Decimal type for advanced usage
export { Decimal };
