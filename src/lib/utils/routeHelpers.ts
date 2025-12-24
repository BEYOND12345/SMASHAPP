/**
 * Route parsing utilities for handling public share links
 */

export interface PublicRoute {
  type: 'quote' | 'invoice';
  shortCode: string;
}

/**
 * Parse a URL pathname to check if it's a public route and extract the short code
 * @param pathname - The URL pathname (e.g., "/q/ABC123" or "/quote/ABC123")
 * @returns PublicRoute object if valid, null otherwise
 */
export function parsePublicRoute(pathname: string): PublicRoute | null {
  // Match patterns: /q/CODE, /quote/CODE, /i/CODE, /invoice/CODE
  const quoteMatch = pathname.match(/^\/(?:q|quote)\/([A-Z0-9]+)$/i);
  const invoiceMatch = pathname.match(/^\/(?:i|invoice)\/([A-Z0-9]+)$/i);

  if (quoteMatch) {
    return {
      type: 'quote',
      shortCode: quoteMatch[1].toUpperCase()
    };
  }

  if (invoiceMatch) {
    return {
      type: 'invoice',
      shortCode: invoiceMatch[1].toUpperCase()
    };
  }

  return null;
}

/**
 * Check if a pathname is a public route
 * @param pathname - The URL pathname to check
 * @returns true if the pathname matches a public route pattern
 */
export function isPublicRoute(pathname: string): boolean {
  return parsePublicRoute(pathname) !== null;
}
