export function formatDocNumber(id: string): string {
  return String(id).substring(0, 6).toUpperCase();
}

export function buildPdfFileName(type: 'estimate' | 'invoice', idOrNumber: string): string {
  const num = formatDocNumber(idOrNumber);
  const label = type === 'invoice' ? 'Invoice' : 'Estimate';
  return `${label} #${num}.pdf`;
}

