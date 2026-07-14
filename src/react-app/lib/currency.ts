// Supported reporting currencies. Kept intentionally short — extend as needed.
export const CURRENCIES: { code: string; label: string }[] = [
  { code: "USD", label: "USD — US Dollar" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "GBP", label: "GBP — British Pound" },
  { code: "CAD", label: "CAD — Canadian Dollar" },
  { code: "AUD", label: "AUD — Australian Dollar" },
  { code: "JPY", label: "JPY — Japanese Yen" },
  { code: "CHF", label: "CHF — Swiss Franc" },
  { code: "CNY", label: "CNY — Chinese Yuan" },
  { code: "INR", label: "INR — Indian Rupee" },
  { code: "BRL", label: "BRL — Brazilian Real" },
  { code: "MXN", label: "MXN — Mexican Peso" },
  { code: "SEK", label: "SEK — Swedish Krona" },
  { code: "NOK", label: "NOK — Norwegian Krone" },
  { code: "NZD", label: "NZD — New Zealand Dollar" },
  { code: "SGD", label: "SGD — Singapore Dollar" },
  { code: "ZAR", label: "ZAR — South African Rand" },
];

export const DEFAULT_CURRENCY = "USD";

// Formatters are relatively expensive to construct, so cache one per code.
const cache = new Map<string, Intl.NumberFormat>();

function formatter(currency: string): Intl.NumberFormat {
  let fmt = cache.get(currency);
  if (!fmt) {
    try {
      fmt = new Intl.NumberFormat(undefined, { style: "currency", currency });
    } catch {
      // Unknown/invalid code → fall back so we never throw at render time.
      fmt = new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: DEFAULT_CURRENCY,
      });
    }
    cache.set(currency, fmt);
  }
  return fmt;
}

/** Format a monetary amount in the given ISO 4217 currency, e.g. 1234.5 → "$1,234.50". */
export function formatCurrency(
  amount: number,
  currency: string = DEFAULT_CURRENCY
): string {
  return formatter(currency).format(amount || 0);
}
