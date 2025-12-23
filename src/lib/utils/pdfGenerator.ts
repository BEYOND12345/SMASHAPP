import jsPDF from 'jspdf';
import { Estimate, UserProfile } from '../../types';
import { calculateEstimateTotals, formatCurrency } from './calculations';

const safe = (value: unknown): string => {
  if (value === null || value === undefined) {
    console.log('[PDFGenerator] safe() coerced null/undefined to empty string');
    return '';
  }
  const strValue = String(value);
  if (strValue !== value) {
    console.log('[PDFGenerator] safe() coerced non-string:', typeof value, '→', strValue);
  }
  return strValue;
};

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateEstimatePDF(
  estimate: Estimate,
  userProfile?: UserProfile,
  type: 'estimate' | 'invoice' = 'estimate',
  quoteNumber?: string
): Promise<Blob> {
  try {
    console.log('[PDFGenerator] Starting PDF generation', {
      type,
      estimateId: estimate.id,
      hasUserProfile: !!userProfile,
      materialsCount: estimate.materials?.length || 0,
      scopeOfWorkCount: estimate.scopeOfWork?.length || 0,
      quoteNumber
    });

    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    let yPos = 20;
    const leftMargin = 20;
    const rightMargin = pageWidth - 20;

    // HEADER SECTION - Logo and Business Info in a professional layout
    const headerStartY = yPos;

    // Left side: Logo and Business Name
    if (userProfile?.logoUrl) {
      try {
        console.log('[PDFGenerator] Loading logo from:', userProfile.logoUrl);
        const logoData = await loadImageAsBase64(userProfile.logoUrl);
        if (logoData) {
          const logoSize = 25;
          pdf.addImage(logoData, 'PNG', leftMargin, yPos, logoSize, logoSize);
          console.log('[PDFGenerator] Logo loaded successfully');
        }
      } catch (logoErr) {
        console.error('[PDFGenerator] Logo error:', logoErr);
      }
    }

    // Business Name and details next to logo
    const textStartX = leftMargin + (userProfile?.logoUrl ? 30 : 0);
    if (userProfile && userProfile.businessName) {
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0, 0, 0);
      pdf.text(safe(userProfile.businessName), textStartX, yPos + 5);

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(80, 80, 80);
      let detailY = yPos + 10;

      if (userProfile.tradeType) {
        pdf.text(safe(userProfile.tradeType), textStartX, detailY);
        detailY += 4;
      }
      if (userProfile.phone) {
        pdf.text(safe(userProfile.phone), textStartX, detailY);
        detailY += 4;
      }
      if (userProfile.email) {
        pdf.text(safe(userProfile.email), textStartX, detailY);
      }
    }

    // Right side: Document number and date
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 0, 0);

    const numberLabel = type === 'invoice' ? 'Invoice #' : 'Quote #';
    const displayNumber = quoteNumber || estimate.id?.substring(0, 8) || 'DRAFT';
    const currentDate = estimate.createdAt
      ? new Date(estimate.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
      : new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

    pdf.text(numberLabel, rightMargin - 35, yPos + 5, { align: 'right' });
    pdf.setFont('helvetica', 'normal');
    pdf.text(displayNumber, rightMargin, yPos + 5, { align: 'right' });

    pdf.setFont('helvetica', 'bold');
    pdf.text('Date:', rightMargin - 35, yPos + 10, { align: 'right' });
    pdf.setFont('helvetica', 'normal');
    pdf.text(currentDate, rightMargin, yPos + 10, { align: 'right' });

    // For invoices, add due date
    if (type === 'invoice' && estimate.timeline) {
      pdf.setFont('helvetica', 'bold');
      pdf.text('Due:', rightMargin - 35, yPos + 15, { align: 'right' });
      pdf.setFont('helvetica', 'normal');
      pdf.text(estimate.timeline, rightMargin, yPos + 15, { align: 'right' });
    }

    yPos += 35;

    pdf.setDrawColor(220, 220, 220);
    pdf.line(leftMargin, yPos, rightMargin, yPos);
    yPos += 12;

    // DOCUMENT TYPE HEADER
    pdf.setFontSize(22);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 0, 0);
    pdf.text(type === 'invoice' ? 'INVOICE' : 'ESTIMATE', leftMargin, yPos);
    yPos += 10;

    // JOB TITLE
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text(safe(estimate.jobTitle), leftMargin, yPos);
    yPos += 10;

    // CUSTOMER DETAILS (if available)
    if (estimate.clientName || estimate.clientEmail || estimate.clientPhone || estimate.clientAddress) {
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(100, 100, 100);
      pdf.text('BILLED TO', leftMargin, yPos);
      yPos += 6;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(0, 0, 0);

      if (estimate.clientName) {
        pdf.setFont('helvetica', 'bold');
        pdf.text(safe(estimate.clientName), leftMargin, yPos);
        pdf.setFont('helvetica', 'normal');
        yPos += 5;
      }

      if (estimate.clientAddress) {
        pdf.text(safe(estimate.clientAddress), leftMargin, yPos);
        yPos += 5;
      }

      if (estimate.clientEmail) {
        pdf.text(safe(estimate.clientEmail), leftMargin, yPos);
        yPos += 5;
      }

      if (estimate.clientPhone) {
        pdf.text(safe(estimate.clientPhone), leftMargin, yPos);
        yPos += 5;
      }

      yPos += 8;
    }

    // TIMELINE (for estimates) or DUE DATE (for invoices)
    if (estimate.timeline && type === 'estimate') {
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(100, 100, 100);
      pdf.text('TIMELINE', leftMargin, yPos);
      yPos += 6;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(0, 0, 0);
      pdf.text(safe(estimate.timeline), leftMargin, yPos);
      yPos += 12;
    }

    // SCOPE OF WORK
    if (estimate.scopeOfWork && estimate.scopeOfWork.length > 0) {
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(100, 100, 100);
      pdf.text('SCOPE OF WORK', leftMargin, yPos);
      yPos += 6;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(0, 0, 0);

      estimate.scopeOfWork.forEach((item) => {
        const lines = pdf.splitTextToSize(item, pageWidth - 50);
        lines.forEach((line: string) => {
          if (yPos > 265) {
            pdf.addPage();
            yPos = 20;
          }
          pdf.setDrawColor(0, 0, 0);
          pdf.circle(leftMargin + 2, yPos - 1.5, 0.8, 'F');
          pdf.text(line, leftMargin + 6, yPos);
          yPos += 5.5;
        });
      });
      yPos += 10;
    }

    // BREAKDOWN - Add a clean separator line
    pdf.setDrawColor(220, 220, 220);
    pdf.line(leftMargin, yPos, rightMargin, yPos);
    yPos += 10;

    // MATERIALS SECTION
    if (estimate.materials && estimate.materials.length > 0) {
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(100, 100, 100);
      pdf.text('DESCRIPTION', leftMargin, yPos);
      pdf.text('AMOUNT', rightMargin, yPos, { align: 'right' });
      yPos += 8;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(0, 0, 0);

      estimate.materials.forEach((item) => {
        if (yPos > 260) {
          pdf.addPage();
          yPos = 20;
        }
        const amount = formatCurrency(item.quantity * item.rate);
        pdf.setFont('helvetica', 'normal');
        pdf.text(safe(item.name), leftMargin, yPos);
        pdf.text(safe(amount), rightMargin, yPos, { align: 'right' });
        yPos += 4;
        pdf.setFontSize(9);
        pdf.setTextColor(120, 120, 120);
        pdf.text(`${safe(item.quantity)} ${safe(item.unit)} × ${safe(formatCurrency(item.rate))}`, leftMargin, yPos);
        pdf.setTextColor(0, 0, 0);
        pdf.setFontSize(10);
        yPos += 7;
      });

      const { materialsTotal, labourTotal, subtotal, gst, total } = calculateEstimateTotals(estimate);

      // LABOUR SECTION
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text('Labour', leftMargin, yPos);
      pdf.text(formatCurrency(labourTotal), rightMargin, yPos, { align: 'right' });
      yPos += 4;
      pdf.setFontSize(9);
      pdf.setTextColor(120, 120, 120);
      pdf.text(`${estimate.labour.hours} hrs × ${formatCurrency(estimate.labour.rate)}/hr`, leftMargin, yPos);
      pdf.setTextColor(0, 0, 0);
      pdf.setFontSize(10);
      yPos += 10;

      // TOTALS SECTION
      pdf.setDrawColor(220, 220, 220);
      pdf.line(leftMargin, yPos, rightMargin, yPos);
      yPos += 8;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(0, 0, 0);
      pdf.text('Subtotal', leftMargin, yPos);
      pdf.text(formatCurrency(subtotal), rightMargin, yPos, { align: 'right' });
      yPos += 6;

      pdf.text('GST (10%)', leftMargin, yPos);
      pdf.text(formatCurrency(gst), rightMargin, yPos, { align: 'right' });
      yPos += 10;

      // Total with emphasis
      pdf.setDrawColor(220, 220, 220);
      pdf.line(leftMargin, yPos, rightMargin, yPos);
      yPos += 8;

      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0, 0, 0);
      pdf.text('Total', leftMargin, yPos);
      pdf.text(formatCurrency(total), rightMargin, yPos, { align: 'right' });
      yPos += 15;

      // PAYMENT DETAILS (if available)
      if (userProfile && (userProfile.bankName || userProfile.accountNumber || userProfile.bsbRouting || userProfile.paymentTerms)) {
        // Check if we need a new page
        if (yPos > pageHeight - 60) {
          pdf.addPage();
          yPos = 20;
        }

        pdf.setDrawColor(220, 220, 220);
        pdf.line(leftMargin, yPos, rightMargin, yPos);
        yPos += 10;

        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(100, 100, 100);
        pdf.text('PAYMENT DETAILS', leftMargin, yPos);
        yPos += 8;

        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(0, 0, 0);

        const labelWidth = 35;

        if (userProfile.bankName) {
          pdf.setFont('helvetica', 'bold');
          pdf.text('Bank Name:', leftMargin, yPos);
          pdf.setFont('helvetica', 'normal');
          pdf.text(safe(userProfile.bankName), leftMargin + labelWidth, yPos);
          yPos += 5;
        }

        if (userProfile.accountName) {
          pdf.setFont('helvetica', 'bold');
          pdf.text('Account Name:', leftMargin, yPos);
          pdf.setFont('helvetica', 'normal');
          pdf.text(safe(userProfile.accountName), leftMargin + labelWidth, yPos);
          yPos += 5;
        }

        if (userProfile.bsbRouting) {
          pdf.setFont('helvetica', 'bold');
          pdf.text('BSB:', leftMargin, yPos);
          pdf.setFont('helvetica', 'normal');
          pdf.text(safe(userProfile.bsbRouting), leftMargin + labelWidth, yPos);
          yPos += 5;
        }

        if (userProfile.accountNumber) {
          pdf.setFont('helvetica', 'bold');
          pdf.text('Account Number:', leftMargin, yPos);
          pdf.setFont('helvetica', 'normal');
          pdf.text(safe(userProfile.accountNumber), leftMargin + labelWidth, yPos);
          yPos += 5;
        }

        if (userProfile.paymentTerms) {
          yPos += 3;
          pdf.setFont('helvetica', 'bold');
          pdf.text('Payment Terms:', leftMargin, yPos);
          yPos += 5;
          pdf.setFont('helvetica', 'normal');
          const terms = pdf.splitTextToSize(userProfile.paymentTerms, pageWidth - 40);
          terms.forEach((line: string) => {
            pdf.text(line, leftMargin, yPos);
            yPos += 4;
          });
        }

        if (userProfile.paymentInstructions) {
          yPos += 3;
          pdf.setFont('helvetica', 'bold');
          pdf.text('Payment Instructions:', leftMargin, yPos);
          yPos += 5;
          pdf.setFont('helvetica', 'normal');
          const instructions = pdf.splitTextToSize(userProfile.paymentInstructions, pageWidth - 40);
          instructions.forEach((line: string) => {
            pdf.text(line, leftMargin, yPos);
            yPos += 4;
          });
        }
      }
    }

    console.log('[PDFGenerator] PDF generation complete, outputting blob...');
    const blob = pdf.output('blob');
    console.log('[PDFGenerator] Blob output successful:', {
      type: typeof blob,
      constructor: blob.constructor.name,
      blobType: blob.type,
      size: blob.size
    });
    return blob;
  } catch (err) {
    console.error('[PDFGenerator] PDF generation failed:', err);
    console.error('[PDFGenerator] Error name:', (err as Error).name);
    console.error('[PDFGenerator] Error message:', (err as Error).message);
    console.error('[PDFGenerator] Error stack:', (err as Error).stack);
    console.error('[PDFGenerator] Full error object:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
    throw new Error(`PDF generation failed: ${(err as Error).message}`);
  }
}
