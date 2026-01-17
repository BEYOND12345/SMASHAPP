import React from 'react';
import { Estimate, UserProfile } from '../../types';
import { calculateEstimateTotals, formatCurrency } from '../../lib/utils/calculations';

interface DocumentTemplateProps {
  estimate: Estimate;
  userProfile?: UserProfile;
  type?: 'estimate' | 'invoice';
}

export const DocumentTemplate: React.FC<DocumentTemplateProps> = ({
  estimate,
  userProfile,
  type = 'estimate'
}) => {
  const { labourTotal, subtotal, gst, total } = calculateEstimateTotals(estimate);
  const isInvoice = type === 'invoice';
  const taxLabel = estimate.currency === 'GBP' ? 'VAT' : estimate.currency === 'USD' ? 'Sales Tax' : 'GST';
  const docNumber = estimate.id.substring(0, 8).toUpperCase();

  return (
    <div className="bg-white p-5 sm:p-12 w-full max-w-full mx-auto shadow-sm min-h-[600px] sm:min-h-[1123px] flex flex-col font-sans">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-6 mb-8 sm:mb-12">
        <div className="flex flex-row sm:flex-col items-center sm:items-start gap-4 min-w-0">
          {userProfile?.logoUrl ? (
            <img src={userProfile.logoUrl} alt="Logo" className="w-16 h-16 sm:w-24 sm:h-24 object-cover rounded-xl sm:rounded-2xl border border-slate-100" />
          ) : (
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-slate-900 rounded-xl sm:rounded-2xl flex items-center justify-center text-white font-black text-lg sm:text-xl">
              {userProfile?.businessName?.substring(0, 2).toUpperCase() || 'SM'}
            </div>
          )}
          <div className="flex flex-col min-w-0">
            <h1 className="text-lg sm:text-2xl font-black text-slate-900 uppercase tracking-tighter leading-tight mb-1 break-words">
              {userProfile?.businessName || 'Business Name'}
            </h1>
            {userProfile?.tradeType && (
              <p className="text-[10px] sm:text-[12px] font-bold text-slate-400 uppercase tracking-widest">{userProfile.tradeType}</p>
            )}
          </div>
        </div>

        <div className="text-left sm:text-right w-full sm:w-auto">
          <h2 className="text-2xl sm:text-4xl font-black text-slate-900 uppercase tracking-tighter mb-2 sm:mb-4 break-words leading-tight">
            {isInvoice ? 'Invoice' : 'Estimate'}
          </h2>
          <div className="flex flex-col gap-1">
            <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-widest flex justify-between sm:justify-end">
              <span>{isInvoice ? 'Invoice #' : 'Estimate #'}</span>
              <span className="text-slate-900 ml-2">{docNumber}</span>
            </p>
            <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-widest flex justify-between sm:justify-end">
              <span>Date</span>
              <span className="text-slate-900 ml-2">{estimate.date || new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </p>
            {isInvoice && (
              <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-widest flex justify-between sm:justify-end">
                <span>Due Date</span>
                <span className="text-slate-900 ml-2">{userProfile?.paymentTerms || 'On Receipt'}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-12 mb-8 sm:mb-12">
        <div className="flex flex-col gap-2 sm:gap-3">
          <h3 className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1.5 sm:pb-2">From</h3>
          <div className="text-[12px] sm:text-[13px] text-slate-600 space-y-0.5 sm:space-y-1">
            {userProfile?.abn && <p className="font-bold text-slate-900">ABN: {userProfile.abn}</p>}
            {userProfile?.businessAddress && <p>{userProfile.businessAddress}</p>}
            {userProfile?.phone && <p>{userProfile.phone}</p>}
            {userProfile?.email && <p className="break-all">{userProfile.email}</p>}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:gap-3">
          <h3 className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1.5 sm:pb-2">Bill To</h3>
          <div className="text-[12px] sm:text-[13px] text-slate-600 space-y-0.5 sm:space-y-1">
            <p className="font-bold text-slate-900 uppercase tracking-tight text-[14px] sm:text-[15px]">{estimate.clientName}</p>
            {estimate.clientAddress && <p>{estimate.clientAddress}</p>}
            {estimate.clientEmail && <p className="break-all">{estimate.clientEmail}</p>}
            {estimate.clientPhone && <p>{estimate.clientPhone}</p>}
          </div>
        </div>
      </div>

      {/* Project Details */}
      <div className="mb-8 sm:mb-12">
        <h3 className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1.5 sm:pb-2 mb-3 sm:mb-4">Project Overview</h3>
        <h4 className="text-lg sm:text-xl font-black text-slate-900 uppercase tracking-tighter mb-3 sm:mb-4">{estimate.jobTitle}</h4>
        {estimate.scopeOfWork && estimate.scopeOfWork.length > 0 && (
          <div className="bg-slate-50/50 rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-slate-100">
            <ul className="space-y-2 sm:space-y-3">
              {estimate.scopeOfWork.map((item, idx) => (
                <li key={idx} className="flex gap-2 sm:gap-3 text-[12px] sm:text-[13px] text-slate-700 leading-relaxed font-bold uppercase tracking-tight">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-900 mt-1.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Line Items Table */}
      {/* Mobile: stacked list so nothing is “off-screen” */}
      <div className="sm:hidden mb-6 space-y-3">
        {estimate.materials.map((m) => (
          <div key={m.id} className="border border-slate-100 rounded-xl p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Item</p>
                <p className="text-[14px] font-black text-slate-900 uppercase tracking-tight break-words">{m.name}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Amount</p>
                <p className="text-[16px] font-black text-slate-900 tabular-nums">{formatCurrency(m.quantity * m.rate)}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[12px] font-bold text-slate-600">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Qty</p>
                <p className="tabular-nums">{m.quantity} {m.unit}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rate</p>
                <p className="tabular-nums">{formatCurrency(m.rate)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Line</p>
                <p className="tabular-nums">{formatCurrency(m.quantity * m.rate)}</p>
              </div>
            </div>
          </div>
        ))}

        {estimate.labour.hours > 0 && (
          <div className="border border-slate-100 rounded-xl p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Item</p>
                <p className="text-[14px] font-black text-slate-900 uppercase tracking-tight">Labour Charges</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Amount</p>
                <p className="text-[16px] font-black text-slate-900 tabular-nums">{formatCurrency(labourTotal)}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[12px] font-bold text-slate-600">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hours</p>
                <p className="tabular-nums">{estimate.labour.hours} hrs</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rate</p>
                <p className="tabular-nums">{formatCurrency(estimate.labour.rate)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Line</p>
                <p className="tabular-nums">{formatCurrency(labourTotal)}</p>
              </div>
            </div>
          </div>
        )}

        {estimate.additionalFees?.map((f) => (
          <div key={f.id} className="border border-slate-100 rounded-xl p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Fee</p>
                <p className="text-[14px] font-black text-slate-900 uppercase tracking-tight break-words">{f.description}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Amount</p>
                <p className="text-[16px] font-black text-slate-900 tabular-nums">{formatCurrency(f.amount)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop/PDF-style: full table */}
      <div className="hidden sm:block mb-6 sm:mb-8 overflow-x-auto max-w-full">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-900 text-[9px] sm:text-[11px] font-black text-white uppercase tracking-widest">
              <th className="px-3 sm:px-4 py-3 rounded-l-lg sm:rounded-l-xl">Description</th>
              <th className="px-2 sm:px-4 py-3 text-right">Qty</th>
              <th className="px-2 sm:px-4 py-3 text-right">Rate</th>
              <th className="px-3 sm:px-4 py-3 text-right rounded-r-lg sm:rounded-r-xl">Amount</th>
            </tr>
          </thead>
          <tbody className="text-[11px] sm:text-[13px] text-slate-700">
            {estimate.materials.map((m) => (
              <tr key={m.id} className="border-b border-slate-50">
                <td className="px-3 sm:px-4 py-4 sm:py-5 font-bold uppercase tracking-tight">{m.name}</td>
                <td className="px-2 sm:px-4 py-4 sm:py-5 text-right tabular-nums whitespace-nowrap">{m.quantity} {m.unit}</td>
                <td className="px-2 sm:px-4 py-4 sm:py-5 text-right tabular-nums whitespace-nowrap">{formatCurrency(m.rate)}</td>
                <td className="px-3 sm:px-4 py-4 sm:py-5 text-right font-black text-slate-900 tabular-nums whitespace-nowrap">{formatCurrency(m.quantity * m.rate)}</td>
              </tr>
            ))}
            {estimate.labour.hours > 0 && (
              <tr className="border-b border-slate-50">
                <td className="px-3 sm:px-4 py-4 sm:py-5 font-bold uppercase tracking-tight">Labour Charges</td>
                <td className="px-2 sm:px-4 py-4 sm:py-5 text-right tabular-nums whitespace-nowrap">{estimate.labour.hours} hrs</td>
                <td className="px-2 sm:px-4 py-4 sm:py-5 text-right tabular-nums whitespace-nowrap">{formatCurrency(estimate.labour.rate)}</td>
                <td className="px-3 sm:px-4 py-4 sm:py-5 text-right font-black text-slate-900 tabular-nums whitespace-nowrap">{formatCurrency(labourTotal)}</td>
              </tr>
            )}
            {estimate.additionalFees?.map((f) => (
              <tr key={f.id} className="border-b border-slate-50">
                <td className="px-3 sm:px-4 py-4 sm:py-5 font-bold uppercase tracking-tight">{f.description}</td>
                <td className="px-2 sm:px-4 py-4 sm:py-5 text-right tabular-nums">1 ea</td>
                <td className="px-2 sm:px-4 py-4 sm:py-5 text-right tabular-nums whitespace-nowrap">{formatCurrency(f.amount)}</td>
                <td className="px-3 sm:px-4 py-4 sm:py-5 text-right font-black text-slate-900 tabular-nums whitespace-nowrap">{formatCurrency(f.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals Section */}
      <div className="flex justify-end mb-8 sm:mb-12">
        <div className="w-full sm:max-w-[280px] space-y-2 sm:space-y-3">
          <div className="flex justify-between items-center text-[10px] sm:text-[12px] font-black uppercase tracking-widest text-slate-400">
            <span>Subtotal</span>
            <span className="text-slate-900 tabular-nums">{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between items-center text-[10px] sm:text-[12px] font-black uppercase tracking-widest text-slate-400">
            <span>{taxLabel} ({(estimate.gstRate * 100).toFixed(0)}%)</span>
            <span className="text-slate-900 tabular-nums">{formatCurrency(gst)}</span>
          </div>
          <div className="h-px bg-slate-100"></div>
          <div className="flex justify-between items-center bg-slate-900 text-white p-3 sm:p-4 rounded-xl sm:rounded-2xl shadow-xl shadow-slate-900/10">
            <span className="text-[10px] sm:text-[12px] font-black uppercase tracking-widest">Total Amount</span>
            <span className="text-xl sm:text-2xl font-black tabular-nums tracking-tighter">{formatCurrency(total)}</span>
          </div>
        </div>
      </div>

      {/* Payment Details (Only for Invoices) */}
      {isInvoice && (
        <div className="mt-auto pt-8 sm:pt-12 border-t border-slate-100">
          <div className="flex flex-col sm:flex-row justify-between gap-6 sm:gap-12">
            <div className="flex flex-col gap-3 sm:gap-4">
              <h3 className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-widest">How To Pay</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-2 text-[11px] sm:text-[12px] font-bold text-slate-700 uppercase tracking-tight">
                {userProfile?.bankName && (
                  <div className="flex justify-between sm:block">
                    <span className="text-slate-400 mr-2">Bank</span>
                    {userProfile.bankName}
                  </div>
                )}
                {userProfile?.accountName && (
                  <div className="flex justify-between sm:block">
                    <span className="text-slate-400 mr-2">Account</span>
                    {userProfile.accountName}
                  </div>
                )}
                {userProfile?.bsbRouting && (
                  <div className="flex justify-between sm:block">
                    <span className="text-slate-400 mr-2">BSB</span>
                    {userProfile.bsbRouting}
                  </div>
                )}
                {userProfile?.accountNumber && (
                  <div className="flex justify-between sm:block">
                    <span className="text-slate-400 mr-2">No.</span>
                    {userProfile.accountNumber}
                  </div>
                )}
              </div>
            </div>
            {userProfile?.paymentInstructions && (
              <div className="flex-1">
                 <h3 className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 sm:mb-4">Notes</h3>
                 <p className="text-[11px] sm:text-[12px] text-slate-500 leading-relaxed italic">{userProfile.paymentInstructions}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      {!isInvoice && (
        <div className="mt-auto pt-8 sm:pt-12 text-center">
          <p className="text-[10px] sm:text-[11px] font-bold text-slate-300 uppercase tracking-[0.3em]">
            Thank you for choosing {userProfile?.businessName || 'SMASH'}
          </p>
        </div>
      )}
    </div>
  );
};
