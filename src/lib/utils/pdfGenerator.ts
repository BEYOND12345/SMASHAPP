import jsPDF from 'jspdf';
import { Estimate, UserProfile } from '../../types';
import { calculateEstimateTotals, formatCurrency } from './calculations';

const safe = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value);
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
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const leftMargin = 15;
    const rightMargin = pageWidth - 15;
    let yPos = 15;

    // Colors
    const primaryColor = [15, 23, 42]; // slate-900
    const secondaryColor = [71, 85, 105]; // slate-600
    const lightGrey = [241, 245, 249]; // slate-100
    const borderGrey = [226, 232, 240]; // slate-200

    const tertiaryColor = [148, 163, 184]; // slate-400

    // 1. TOP HEADER - Brand / Logo & Document Type
    const isInvoice = type === 'invoice';
    
    // Logo (if exists)
    if (userProfile?.logoUrl) {
      const logoData = await loadImageAsBase64(userProfile.logoUrl);
      if (logoData) {
        pdf.addImage(logoData, 'PNG', leftMargin, yPos, 20, 20);
      }
    }

    // Document Title
    pdf.setFontSize(28);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    const docTitle = isInvoice ? 'TAX INVOICE' : 'ESTIMATE';
    pdf.text(docTitle, rightMargin, yPos + 8, { align: 'right' });

    yPos += 25;

    // 2. SENDER & RECEIVER INFO
    const colWidth = (pageWidth - 30) / 2;

    // From (Left)
    pdf.setFontSize(10);
    pdf.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    pdf.setFont('helvetica', 'bold');
    pdf.text('FROM', leftMargin, yPos);
    
    yPos += 5;
    pdf.setFontSize(11);
    pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    pdf.setFont('helvetica', 'bold');
    pdf.text(safe(userProfile?.businessName || 'Business Name'), leftMargin, yPos);
    
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    yPos += 5;
    if (userProfile?.abn) {
      pdf.text(`ABN: ${userProfile.abn}`, leftMargin, yPos);
      yPos += 4;
    }
    if (userProfile?.businessAddress) {
      const addrLines = pdf.splitTextToSize(userProfile.businessAddress, colWidth);
      pdf.text(addrLines, leftMargin, yPos);
      yPos += (addrLines.length * 4);
    }
    if (userProfile?.phone) {
      pdf.text(userProfile.phone, leftMargin, yPos);
      yPos += 4;
    }
    if (userProfile?.email) {
      pdf.text(userProfile.email, leftMargin, yPos);
    }

    // Bill To & Meta (Right)
    let rightY = 40;

    // Meta Box on the right
    pdf.setFillColor(lightGrey[0], lightGrey[1], lightGrey[2]);
    pdf.rect(rightMargin - 70, rightY, 70, 25, 'F');
    
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    pdf.text(isInvoice ? 'INVOICE #' : 'QUOTE #', rightMargin - 65, rightY + 7);
    pdf.text('DATE', rightMargin - 65, rightY + 14);
    if (isInvoice) pdf.text('DUE DATE', rightMargin - 65, rightY + 21);

    pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    pdf.setFont('helvetica', 'normal');
    const displayNumber = quoteNumber || estimate.id.substring(0, 8).toUpperCase();
    const dateStr = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
    const dueDateStr = estimate.timeline || 'On Receipt';

    pdf.text(displayNumber, rightMargin - 5, rightY + 7, { align: 'right' });
    pdf.text(dateStr, rightMargin - 5, rightY + 14, { align: 'right' });
    if (isInvoice) pdf.text(dueDateStr, rightMargin - 5, rightY + 21, { align: 'right' });

    // Customer Info below Meta
    rightY += 35;
    pdf.setFontSize(10);
    pdf.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    pdf.setFont('helvetica', 'bold');
    pdf.text('BILL TO', rightMargin - 70, rightY);
    
    rightY += 5;
    pdf.setFontSize(11);
    pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    pdf.text(safe(estimate.clientName), rightMargin - 70, rightY);
    
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    rightY += 5;
    if (estimate.clientAddress) {
      const custAddrLines = pdf.splitTextToSize(estimate.clientAddress, 70);
      pdf.text(custAddrLines, rightMargin - 70, rightY);
      rightY += (custAddrLines.length * 4);
    }
    if (estimate.clientEmail) {
      pdf.text(estimate.clientEmail, rightMargin - 70, rightY);
      rightY += 4;
    }
    if (estimate.clientPhone) {
      pdf.text(estimate.clientPhone, rightMargin - 70, rightY);
    }

    yPos = Math.max(yPos + 15, rightY + 15);

    // 3. JOB OVERVIEW / SCOPE
    if (estimate.jobTitle) {
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      pdf.text('PROJECT:', leftMargin, yPos);
      pdf.setFont('helvetica', 'normal');
      pdf.text(safe(estimate.jobTitle), leftMargin + 25, yPos);
      yPos += 10;
    }

    if (estimate.scopeOfWork && estimate.scopeOfWork.length > 0) {
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
      pdf.text('SCOPE OF WORK', leftMargin, yPos);
      yPos += 5;
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      
      estimate.scopeOfWork.forEach(item => {
        const lines = pdf.splitTextToSize(`• ${item}`, pageWidth - 30);
        if (yPos + (lines.length * 5) > pageHeight - 20) {
          pdf.addPage();
          yPos = 20;
        }
        pdf.text(lines, leftMargin, yPos);
        yPos += (lines.length * 5);
      });
      yPos += 5;
    }

    // 4. LINE ITEMS TABLE
    yPos += 5;
    pdf.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    pdf.rect(leftMargin, yPos, pageWidth - 30, 10, 'F');
    
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(255, 255, 255);
    pdf.text('DESCRIPTION', leftMargin + 5, yPos + 6.5);
    pdf.text('QTY', rightMargin - 55, yPos + 6.5, { align: 'right' });
    pdf.text('RATE', rightMargin - 30, yPos + 6.5, { align: 'right' });
    pdf.text('AMOUNT', rightMargin - 5, yPos + 6.5, { align: 'right' });
    
    yPos += 10;
    pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);

    const renderLine = (desc: string, qty: string, rate: string, amount: string) => {
      const descLines = pdf.splitTextToSize(desc, pageWidth - 100);
      const rowHeight = Math.max(descLines.length * 5, 8);
      
      if (yPos + rowHeight > pageHeight - 60) {
        pdf.addPage();
        yPos = 20;
      }

      pdf.text(descLines, leftMargin + 5, yPos + 5);
      pdf.text(qty, rightMargin - 55, yPos + 5, { align: 'right' });
      pdf.text(rate, rightMargin - 30, yPos + 5, { align: 'right' });
      pdf.text(amount, rightMargin - 5, yPos + 5, { align: 'right' });
      
      yPos += rowHeight;
      pdf.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
      pdf.line(leftMargin, yPos, rightMargin, yPos);
    };

    // Materials
    if (estimate.materials && estimate.materials.length > 0) {
      estimate.materials.forEach(m => {
        renderLine(
          m.name,
          `${m.quantity} ${m.unit}`,
          formatCurrency(m.rate),
          formatCurrency(m.quantity * m.rate)
        );
      });
    }

    // Labour
    if (estimate.labour && estimate.labour.hours > 0) {
      renderLine(
        'Labour',
        `${estimate.labour.hours} hrs`,
        formatCurrency(estimate.labour.rate),
        formatCurrency(estimate.labour.hours * estimate.labour.rate)
      );
    }

    // Additional Fees
    if (estimate.additionalFees && estimate.additionalFees.length > 0) {
      estimate.additionalFees.forEach(f => {
        renderLine(
          f.description,
          '1',
          formatCurrency(f.amount),
          formatCurrency(f.amount)
        );
      });
    }

    // 5. TOTALS
    const totals = calculateEstimateTotals(estimate);
    const taxLabel = estimate.currency === 'GBP' ? 'VAT' : estimate.currency === 'USD' ? 'Sales Tax' : 'GST';
    yPos += 10;

    const totalsX = rightMargin - 70;
    pdf.setFontSize(10);
    pdf.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    pdf.setFont('helvetica', 'normal');
    
    pdf.text('Subtotal:', totalsX, yPos);
    pdf.text(formatCurrency(totals.subtotal), rightMargin - 5, yPos, { align: 'right' });
    yPos += 6;

    pdf.text(`${taxLabel} (${(estimate.gstRate * 100).toFixed(0)}%):`, totalsX, yPos);
    pdf.text(formatCurrency(totals.gst), rightMargin - 5, yPos, { align: 'right' });
    yPos += 8;

    pdf.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    pdf.rect(totalsX - 5, yPos - 5, 75, 12, 'F');
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(255, 255, 255);
    pdf.text('TOTAL DUE', totalsX, yPos + 3);
    pdf.text(formatCurrency(totals.total), rightMargin - 5, yPos + 3, { align: 'right' });
    yPos += 20;

    // 6. PAYMENT DETAILS
    if (isInvoice && userProfile && (userProfile.bankName || userProfile.accountNumber || userProfile.bsbRouting)) {
      if (yPos > pageHeight - 60) {
        pdf.addPage();
        yPos = 20;
      }

      pdf.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
      pdf.line(leftMargin, yPos, rightMargin, yPos);
      yPos += 10;

      pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.text('HOW TO PAY', leftMargin, yPos);
      yPos += 8;
      
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
      
      const paymentInfo = [
        userProfile.bankName ? `Bank: ${userProfile.bankName}` : null,
        userProfile.accountName ? `Account Name: ${userProfile.accountName}` : null,
        userProfile.bsbRouting ? `BSB: ${userProfile.bsbRouting}` : null,
        userProfile.accountNumber ? `Account Number: ${userProfile.accountNumber}` : null,
      ].filter(Boolean);

      // Render in two columns for payment info
      paymentInfo.forEach((line, index) => {
        const xOffset = (index % 2 === 0) ? leftMargin : leftMargin + 80;
        pdf.text(line!, xOffset, yPos);
        if (index % 2 !== 0 || index === paymentInfo.length - 1) {
          yPos += 6;
        }
      });

      if (userProfile.paymentInstructions) {
        yPos += 4;
        pdf.setFont('helvetica', 'bold');
        pdf.text('Notes:', leftMargin, yPos);
        yPos += 5;
        pdf.setFont('helvetica', 'italic');
        const instLines = pdf.splitTextToSize(userProfile.paymentInstructions, pageWidth - 30);
        pdf.text(instLines, leftMargin, yPos);
        yPos += (instLines.length * 5);
      }
    }

    // 7. FOOTER
    pdf.setFontSize(9);
    pdf.setTextColor(tertiaryColor[0] || 148, tertiaryColor[1] || 163, tertiaryColor[2] || 184);
    pdf.text('Thank you for your business.', pageWidth / 2, pageHeight - 15, { align: 'center' });

    return pdf.output('blob');
  } catch (err) {
    console.error('[PDFGenerator] Failed:', err);
    throw err;
  }
}
