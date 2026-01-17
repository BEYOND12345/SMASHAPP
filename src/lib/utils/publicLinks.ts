export function getPublicBaseUrl(): string {
  const raw =
    (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim() ||
    window.location.origin;
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

export function buildPublicQuoteUrl(shortCode: string, type: 'estimate' | 'invoice' = 'estimate'): string {
  const prefix = type === 'invoice' ? 'i' : 'q';
  return `${getPublicBaseUrl()}/${prefix}/${String(shortCode).trim()}`;
}

export function buildPublicInvoiceUrl(shortCode: string): string {
  return `${getPublicBaseUrl()}/i/${String(shortCode).trim()}`;
}

