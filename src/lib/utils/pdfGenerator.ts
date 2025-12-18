import jsPDF from 'jspdf';
import { Estimate, UserProfile } from '../../types';
import { calculateEstimateTotals, formatCurrency } from './calculations';

export async function generateEstimatePDF(
  estimate: Estimate,
  userProfile?: UserProfile,
  type: 'estimate' | 'invoice' = 'estimate'
): Promise<Blob> {
  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.getWidth();
  let yPos = 20;

  pdf.setFontSize(22);
  pdf.setFont('helvetica', 'bold');
  pdf.text('SMASH', 20, yPos);
  yPos += 15;

  if (userProfile) {
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text(userProfile.businessName, 20, yPos);
    yPos += 6;

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(userProfile.tradeType, 20, yPos);
    yPos += 12;
  }

  pdf.setDrawColor(230, 230, 230);
  pdf.line(20, yPos, pageWidth - 20, yPos);
  yPos += 15;

  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.text(type === 'invoice' ? 'INVOICE' : 'ESTIMATE', 20, yPos);
  yPos += 10;

  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text(estimate.jobTitle, 20, yPos);
  yPos += 7;

  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text(estimate.clientName, 20, yPos);
  yPos += 5;

  if (estimate.clientAddress) {
    pdf.text(estimate.clientAddress, 20, yPos);
    yPos += 5;
  }

  pdf.setFont('helvetica', 'bold');
  pdf.text(`Timeline: ${estimate.timeline}`, 20, yPos);
  yPos += 15;

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

  return pdf.output('blob');
}
