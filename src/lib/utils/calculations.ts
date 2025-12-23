import type { Estimate, Invoice } from '../../types';

/**
 * Safe number conversion that returns 0 for null/undefined/NaN values
 */
export function safeNumber(value: number | null | undefined): number {
  if (value === null || value === undefined || isNaN(value)) {
    return 0;
  }
  return value;
}

/**
 * Format cents to currency string (Australian dollars)
 */
export function formatCents(cents: number | null | undefined): string {
  const safeCents = safeNumber(cents);
  const dollars = safeCents / 100;
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
  }).format(dollars);
}

/**
 * Format currency (already in dollars)
 */
export function formatCurrency(amount: number | null | undefined, options?: { minimumFractionDigits?: number }): string {
  const safeAmount = safeNumber(amount);
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: options?.minimumFractionDigits ?? 0,
  }).format(safeAmount);
}

/**
 * Safely calculate estimate totals with defensive checks for missing data
 */
export function calculateEstimateTotals(estimate: Estimate | null | undefined) {
  // Return zeros if estimate is null/undefined
  if (!estimate) {
    return {
      materialsTotal: 0,
      labourTotal: 0,
      subtotal: 0,
      gst: 0,
      total: 0,
    };
  }

  // Safely calculate materials total
  const materialsTotal = Array.isArray(estimate.materials)
    ? estimate.materials.reduce((sum, item) => {
        const quantity = safeNumber(item?.quantity);
        const rate = safeNumber(item?.rate);
        return sum + quantity * rate;
      }, 0)
    : 0;

  // Safely calculate labour total
  const labourHours = safeNumber(estimate.labour?.hours);
  const labourRate = safeNumber(estimate.labour?.rate);
  const labourTotal = labourHours * labourRate;

  // Calculate subtotal
  const subtotal = materialsTotal + labourTotal;

  // Calculate GST
  const gstRate = safeNumber(estimate.gstRate);
  const gst = subtotal * gstRate;

  // Calculate total
  const total = subtotal + gst;

  return {
    materialsTotal,
    labourTotal,
    subtotal,
    gst,
    total,
  };
}

/**
 * Safely calculate invoice totals with defensive checks for missing data
 */
export function calculateInvoiceTotals(invoice: Invoice | null | undefined) {
  if (!invoice) {
    return {
      materialsTotal: 0,
      labourTotal: 0,
      subtotal: 0,
      gst: 0,
      total: 0,
    };
  }

  const materialsTotal = Array.isArray(invoice.materials)
    ? invoice.materials.reduce((sum, item) => {
        const quantity = safeNumber(item?.quantity);
        const rate = safeNumber(item?.rate);
        return sum + quantity * rate;
      }, 0)
    : 0;

  const labourHours = safeNumber(invoice.labour?.hours);
  const labourRate = safeNumber(invoice.labour?.rate);
  const labourTotal = labourHours * labourRate;

  const subtotal = materialsTotal + labourTotal;
  const gstRate = safeNumber(invoice.gstRate);
  const gst = subtotal * gstRate;
  const total = subtotal + gst;

  return {
    materialsTotal,
    labourTotal,
    subtotal,
    gst,
    total,
  };
}

/**
 * Get initials from a name, safely handling null/undefined/empty strings
 */
export function getInitials(name: string | null | undefined): string {
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return '??';
  }

  return name
    .trim()
    .split(' ')
    .map(n => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || '??';
}
