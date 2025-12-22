import jsPDF from 'jspdf';
import { Estimate, UserProfile } from '../../types';
import { calculateEstimateTotals, formatCurrency } from './calculations';

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
  type: 'estimate' | 'invoice' = 'estimate'
): Promise<Blob> {
  try {
    console.log('[PDFGenerator] Starting PDF generation', {
      type,
      estimateId: estimate.id,
      hasUserProfile: !!userProfile,
      materialsCount: estimate.materials?.length || 0,
      scopeOfWorkCount: estimate.scopeOfWork?.length || 0
    });

    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    let yPos = 20;

    // HEADER SECTION - Logo and Business Info
    if (userProfile?.logoUrl) {
      try {
        console.log('[PDFGenerator] Loading logo from:', userProfile.logoUrl);
        const logoData = await loadImageAsBase64(userProfile.logoUrl);
        if (logoData) {
          const logoSize = 18;
          pdf.addImage(logoData, 'PNG', 20, yPos, logoSize, logoSize);
          yPos += logoSize + 2;
          console.log('[PDFGenerator] Logo loaded successfully');
        } else {
          console.warn('[PDFGenerator] Logo failed to load');
        }
      } catch (logoErr) {
        console.error('[PDFGenerator] Logo error:', logoErr);
      }
    }

    // Business Name
    if (userProfile) {
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.text(userProfile.businessName, 20, yPos);
      yPos += 6;

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(80, 80, 80);

      if (userProfile.tradeType) {
        pdf.text(userProfile.tradeType, 20, yPos);
        yPos += 4;
      }

      if (userProfile.businessAddress) {
        pdf.text(userProfile.businessAddress, 20, yPos);
        yPos += 4;
      }

      if (userProfile.phone) {
        pdf.text(`Phone: ${userProfile.phone}`, 20, yPos);
        yPos += 4;
      }

      if (userProfile.email) {
        pdf.text(`Email: ${userProfile.email}`, 20, yPos);
        yPos += 4;
      }

      if (userProfile.abn) {
        pdf.text(`ABN: ${userProfile.abn}`, 20, yPos);
        yPos += 4;
      }

      if (userProfile.website) {
        pdf.text(`Website: ${userProfile.website}`, 20, yPos);
        yPos += 4;
      }

      pdf.setTextColor(0, 0, 0);
      yPos += 8;
    }

    pdf.setDrawColor(200, 200, 200);
    pdf.line(20, yPos, pageWidth - 20, yPos);
    yPos += 12;

  // DOCUMENT TYPE HEADER
  pdf.setFontSize(20);
  pdf.setFont('helvetica', 'bold');
  pdf.text(type === 'invoice' ? 'INVOICE' : 'ESTIMATE', 20, yPos);
  yPos += 12;

  // JOB TITLE
  pdf.setFontSize(13);
  pdf.setFont('helvetica', 'bold');
  pdf.text(estimate.jobTitle, 20, yPos);
  yPos += 8;

  // CUSTOMER DETAILS SECTION
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(60, 60, 60);
  pdf.text('CUSTOMER DETAILS', 20, yPos);
  yPos += 5;

  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(0, 0, 0);

  if (estimate.clientName) {
    pdf.text(estimate.clientName, 20, yPos);
    yPos += 5;
  }

  if (estimate.clientAddress) {
    pdf.text(estimate.clientAddress, 20, yPos);
    yPos += 5;
  }

  if (estimate.clientEmail) {
    pdf.text(estimate.clientEmail, 20, yPos);
    yPos += 5;
  }

  if (estimate.clientPhone) {
    pdf.text(estimate.clientPhone, 20, yPos);
    yPos += 5;
  }

  yPos += 5;

  // TIMELINE
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(60, 60, 60);
  pdf.text('TIMELINE', 20, yPos);
  yPos += 5;
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(0, 0, 0);
  pdf.text(estimate.timeline, 20, yPos);
  yPos += 12;

  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('SCOPE OF WORK', 20, yPos);
  yPos += 8;

  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  estimate.scopeOfWork.forEach((item) => {
    const lines = pdf.splitTextToSize(item, pageWidth - 50);
    lines.forEach((line: string) => {
      if (yPos > 270) {
        pdf.addPage();
        yPos = 20;
      }
      pdf.text(`• ${line}`, 25, yPos);
      yPos += 5;
    });
  });
  yPos += 10;

  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('BREAKDOWN', 20, yPos);
  yPos += 8;

  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.text('MATERIALS', 20, yPos);
  yPos += 6;

  pdf.setFont('helvetica', 'normal');
  estimate.materials.forEach((item) => {
    if (yPos > 270) {
      pdf.addPage();
      yPos = 20;
    }
    const amount = formatCurrency(item.quantity * item.rate);
    pdf.text(item.name, 25, yPos);
    pdf.text(amount, pageWidth - 20, yPos, { align: 'right' });
    yPos += 5;
    pdf.setFontSize(9);
    pdf.setTextColor(100, 100, 100);
    pdf.text(`${item.quantity} ${item.unit} × ${formatCurrency(item.rate)}`, 25, yPos);
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(10);
    yPos += 6;
  });

  const { materialsTotal, labourTotal, subtotal, gst, total } = calculateEstimateTotals(estimate);

  pdf.setFont('helvetica', 'bold');
  pdf.text('Materials Subtotal:', 25, yPos);
  pdf.text(formatCurrency(materialsTotal), pageWidth - 20, yPos, { align: 'right' });
  yPos += 10;

  pdf.setFont('helvetica', 'bold');
  pdf.text('LABOUR', 20, yPos);
  yPos += 6;

  pdf.setFont('helvetica', 'normal');
  pdf.text('Labour Charges', 25, yPos);
  pdf.text(formatCurrency(labourTotal), pageWidth - 20, yPos, { align: 'right' });
  yPos += 5;
  pdf.setFontSize(9);
  pdf.setTextColor(100, 100, 100);
  pdf.text(`${estimate.labour.hours} hrs × ${formatCurrency(estimate.labour.rate)}/hr`, 25, yPos);
  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(10);
  yPos += 6;

  pdf.setFont('helvetica', 'bold');
  pdf.text('Labour Subtotal:', 25, yPos);
  pdf.text(formatCurrency(labourTotal), pageWidth - 20, yPos, { align: 'right' });
  yPos += 15;

  pdf.line(20, yPos, pageWidth - 20, yPos);
  yPos += 8;

  pdf.setFontSize(12);
  pdf.text('Subtotal:', 25, yPos);
  pdf.text(formatCurrency(subtotal), pageWidth - 20, yPos, { align: 'right' });
  yPos += 7;

  pdf.text('GST (10%):', 25, yPos);
  pdf.text(formatCurrency(gst), pageWidth - 20, yPos, { align: 'right' });
  yPos += 10;

  pdf.setFontSize(16);
  pdf.text('TOTAL:', 25, yPos);
  pdf.text(formatCurrency(total), pageWidth - 20, yPos, { align: 'right' });
  yPos += 20;

  // PAYMENT DETAILS SECTION (if type is invoice or if bank details exist)
  if (userProfile && (userProfile.bankName || userProfile.accountNumber || userProfile.bsbRouting)) {
    // Check if we need a new page
    if (yPos > pageHeight - 60) {
      pdf.addPage();
      yPos = 20;
    }

    pdf.setDrawColor(200, 200, 200);
    pdf.line(20, yPos, pageWidth - 20, yPos);
    yPos += 10;

    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 0, 0);
    pdf.text('PAYMENT DETAILS', 20, yPos);
    yPos += 8;

    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(60, 60, 60);

    if (userProfile.bankName) {
      pdf.setFont('helvetica', 'bold');
      pdf.text('Bank Name:', 20, yPos);
      pdf.setFont('helvetica', 'normal');
      pdf.text(userProfile.bankName, 55, yPos);
      yPos += 5;
    }

    if (userProfile.accountName) {
      pdf.setFont('helvetica', 'bold');
      pdf.text('Account Name:', 20, yPos);
      pdf.setFont('helvetica', 'normal');
      pdf.text(userProfile.accountName, 55, yPos);
      yPos += 5;
    }

    if (userProfile.bsbRouting) {
      pdf.setFont('helvetica', 'bold');
      pdf.text('BSB:', 20, yPos);
      pdf.setFont('helvetica', 'normal');
      pdf.text(userProfile.bsbRouting, 55, yPos);
      yPos += 5;
    }

    if (userProfile.accountNumber) {
      pdf.setFont('helvetica', 'bold');
      pdf.text('Account Number:', 20, yPos);
      pdf.setFont('helvetica', 'normal');
      pdf.text(userProfile.accountNumber, 55, yPos);
      yPos += 5;
    }

    if (userProfile.paymentTerms) {
      yPos += 3;
      pdf.setFont('helvetica', 'bold');
      pdf.text('Payment Terms:', 20, yPos);
      yPos += 5;
      pdf.setFont('helvetica', 'normal');
      const terms = pdf.splitTextToSize(userProfile.paymentTerms, pageWidth - 40);
      terms.forEach((line: string) => {
        pdf.text(line, 20, yPos);
        yPos += 4;
      });
    }

    if (userProfile.paymentInstructions) {
      yPos += 3;
      pdf.setFont('helvetica', 'bold');
      pdf.text('Payment Instructions:', 20, yPos);
      yPos += 5;
      pdf.setFont('helvetica', 'normal');
      const instructions = pdf.splitTextToSize(userProfile.paymentInstructions, pageWidth - 40);
      instructions.forEach((line: string) => {
        pdf.text(line, 20, yPos);
        yPos += 4;
      });
    }
  }

    console.log('[PDFGenerator] PDF generation complete');
    return pdf.output('blob');
  } catch (err) {
    console.error('[PDFGenerator] PDF generation failed:', err);
    console.error('[PDFGenerator] Error stack:', (err as Error).stack);
    throw new Error(`PDF generation failed: ${(err as Error).message}`);
  }
}
