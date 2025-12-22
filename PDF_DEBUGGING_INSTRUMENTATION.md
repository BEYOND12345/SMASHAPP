# PDF Debugging Instrumentation - Complete Evidence Gathering

**Date**: 2025-12-22
**Status**: Instrumentation Applied - Ready for Testing
**Build**: ✅ Passing

---

## What Was Instrumented

I've added comprehensive logging to ALL PDF code paths to capture exact failure points with no guessing.

---

## Three PDF Entry Points Identified

### Entry Point 1: Send/Share PDF Button (Authenticated)
**File**: `src/screens/sendestimate.tsx:269`
**Function**: `handleSharePDF()`
**Trigger**: "Share as PDF" button click in SendEstimate screen
**Usage**: Authenticated users sharing quote/invoice as PDF

**Handler Code**:
```typescript
const handleSharePDF = async () => {
  console.log('[SendEstimate.handleSharePDF] === ENTRY POINT 1: Share PDF Button ===');
  console.log('[SendEstimate.handleSharePDF] Browser:', navigator.userAgent);
  console.log('[SendEstimate.handleSharePDF] Platform:', navigator.platform);
  console.log('[SendEstimate.handleSharePDF] navigator.share exists:', !!navigator.share);
  console.log('[SendEstimate.handleSharePDF] navigator.canShare exists:', !!navigator.canShare);

  // ... logs estimate data, calls generator, logs blob output, download/share
```

**Logs Captured**:
- Browser/platform info
- navigator.share availability
- Estimate data structure (keys, counts)
- PDF blob characteristics (type, size, constructor)
- Share capability check
- Download fallback trigger

**Download Implementation**:
```typescript
// If share not available:
const url = URL.createObjectURL(pdfBlob);
const a = document.createElement('a');
a.href = url;
a.download = fileName;
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
URL.revokeObjectURL(url);
```

---

### Entry Point 2: Public Quote PDF Button (NOT IMPLEMENTED)
**File**: `src/screens/estimatepreview.tsx:47`
**Function**: Empty `onClick={() => {}}`
**Trigger**: "PDF" button on public quote view
**Status**: ❌ KNOWN NON-FUNCTIONAL

**Handler Code**:
```typescript
<Button variant="outline" className="flex-1" onClick={() => {
  console.log('[EstimatePreview] === ENTRY POINT 2: Public PDF Button (NOT IMPLEMENTED) ===');
  console.log('[EstimatePreview] This button does nothing (empty handler)');
  alert('PDF download not implemented for public quote view');
}}>PDF</Button>
```

**Expected Behavior**: Shows alert, logs to console
**Not a bug**: Feature never implemented

---

### Entry Point 3: Public Invoice PDF Button
**File**: `src/screens/publicinvoiceview.tsx:44`
**Function**: `handleDownloadPdf()`
**Trigger**: "PDF" button on public invoice view
**Usage**: Anonymous users downloading invoice PDF

**Handler Code**:
```typescript
const handleDownloadPdf = async () => {
  console.log('[PublicInvoiceView.handleDownloadPdf] === ENTRY POINT 3: Public Invoice PDF Button ===');
  console.log('[PublicInvoiceView.handleDownloadPdf] Browser:', navigator.userAgent);
  console.log('[PublicInvoiceView.handleDownloadPdf] Platform:', navigator.platform);

  // ... builds userProfile, calls generator, logs blob output, window.open or download
```

**Logs Captured**:
- Browser/platform info
- UserProfile construction
- PDF blob characteristics
- window.open attempt
- Download fallback trigger

**Download Implementation**:
```typescript
const url = URL.createObjectURL(pdfBlob);
const newWindow = window.open(url, '_blank');  // Try popup first

if (!newWindow) {  // Fallback to download
  const link = document.createElement('a');
  link.href = url;
  link.download = `invoice-${invoiceNumber}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

setTimeout(() => URL.revokeObjectURL(url), 1000);
```

---

## PDF Generator Instrumentation

**File**: `src/lib/utils/pdfGenerator.ts`
**Function**: `generateEstimatePDF()`

### Data Model Logging (lines 45-53)
```typescript
console.log('[PDFGenerator] Estimate data keys:', Object.keys(estimate));
console.log('[PDFGenerator] Data model validation:', {
  jobTitle: typeof estimate.jobTitle,
  clientName: typeof estimate.clientName,
  timeline: typeof estimate.timeline,
  materials: Array.isArray(estimate.materials),
  labour: typeof estimate.labour,
  scopeOfWork: Array.isArray(estimate.scopeOfWork)
});
```

**Purpose**: Prove data shape matches expectations before generation

---

### String Coercion Logging (lines 5-15)
```typescript
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
```

**Purpose**: Catch any non-string values passed to pdf.text() calls
**Logs**: Every time null, undefined, or non-string is coerced

---

### Blob Output Logging (lines 355-363)
```typescript
console.log('[PDFGenerator] PDF generation complete, outputting blob...');
const blob = pdf.output('blob');
console.log('[PDFGenerator] Blob output successful:', {
  type: typeof blob,
  constructor: blob.constructor.name,
  blobType: blob.type,
  size: blob.size
});
return blob;
```

**Purpose**: Prove jsPDF returns valid Blob
**Expected Output**:
```javascript
{
  type: 'object',
  constructor: 'Blob',
  blobType: 'application/pdf',
  size: <number>  // Should be > 0
}
```

---

### Error Logging (lines 364-370)
```typescript
catch (err) {
  console.error('[PDFGenerator] PDF generation failed:', err);
  console.error('[PDFGenerator] Error name:', (err as Error).name);
  console.error('[PDFGenerator] Error message:', (err as Error).message);
  console.error('[PDFGenerator] Error stack:', (err as Error).stack);
  console.error('[PDFGenerator] Full error object:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
  throw new Error(`PDF generation failed: ${(err as Error).message}`);
}
```

**Purpose**: Capture complete error context if jsPDF fails

---

## Testing Instructions

### Test 1: Authenticated User PDF Share

**Steps**:
1. Open browser DevTools (F12) and go to Console tab
2. Log in as authenticated user
3. Navigate to any quote or invoice
4. Click "Send Estimate" or "Send Invoice"
5. Click "Share as PDF" button
6. **IMMEDIATELY CAPTURE CONSOLE OUTPUT**

**Expected Logs** (in order):
```
[SendEstimate.handleSharePDF] === ENTRY POINT 1: Share PDF Button ===
[SendEstimate.handleSharePDF] Browser: <user agent>
[SendEstimate.handleSharePDF] Platform: <platform>
[SendEstimate.handleSharePDF] navigator.share exists: true/false
[SendEstimate.handleSharePDF] navigator.canShare exists: true/false
[SendEstimate.handleSharePDF] Calling generateEstimatePDF with: {...}
[PDFGenerator] Starting PDF generation {...}
[PDFGenerator] Estimate data keys: [...]
[PDFGenerator] Data model validation: {...}
[PDFGenerator] PDF generation complete, outputting blob...
[PDFGenerator] Blob output successful: {...}
[SendEstimate.handleSharePDF] PDF returned from generator: {...}
[SendEstimate.handleSharePDF] Generated filename: <filename>
[SendEstimate.handleSharePDF] Can share files: true/false
[SendEstimate.handleSharePDF] Using download fallback
[SendEstimate.handleSharePDF] Created object URL: blob:http...
[SendEstimate.handleSharePDF] Triggering download...
[SendEstimate.handleSharePDF] Download complete
```

**If Error Occurs**:
```
[SendEstimate.handleSharePDF] === ERROR CAUGHT ===
[SendEstimate.handleSharePDF] Error type: ...
[SendEstimate.handleSharePDF] Error name: ...
[SendEstimate.handleSharePDF] Error message: ...
[SendEstimate.handleSharePDF] Error stack: ...
```

---

### Test 2: Public Quote PDF Button

**Steps**:
1. Open public quote URL: `/quote/{token}`
2. Click "PDF" button

**Expected Result**:
- Alert: "PDF download not implemented for public quote view"
- Console log: `[EstimatePreview] === ENTRY POINT 2: Public PDF Button (NOT IMPLEMENTED) ===`

**This is NOT a bug** - feature was never implemented

---

### Test 3: Public Invoice PDF Download

**Steps**:
1. Open browser DevTools (F12) and go to Console tab
2. Open public invoice URL: `/invoice/{token}` in incognito/private window
3. Click "PDF" button
4. **IMMEDIATELY CAPTURE CONSOLE OUTPUT**

**Expected Logs** (in order):
```
[PublicInvoiceView.handleDownloadPdf] === ENTRY POINT 3: Public Invoice PDF Button ===
[PublicInvoiceView.handleDownloadPdf] Browser: <user agent>
[PublicInvoiceView.handleDownloadPdf] Platform: <platform>
[PublicInvoiceView.handleDownloadPdf] Calling generateEstimatePDF with: {...}
[PDFGenerator] Starting PDF generation {...}
[PDFGenerator] Estimate data keys: [...]
[PDFGenerator] Data model validation: {...}
[PDFGenerator] PDF generation complete, outputting blob...
[PDFGenerator] Blob output successful: {...}
[PublicInvoiceView.handleDownloadPdf] PDF returned from generator: {...}
[PublicInvoiceView.handleDownloadPdf] Created object URL: blob:http...
[PublicInvoiceView.handleDownloadPdf] Attempting window.open...
[PublicInvoiceView.handleDownloadPdf] PDF opened in new window
```

**OR (if popup blocked)**:
```
[PublicInvoiceView.handleDownloadPdf] Popup blocked, using download fallback
[PublicInvoiceView.handleDownloadPdf] Triggering download...
[PublicInvoiceView.handleDownloadPdf] Download triggered
[PublicInvoiceView.handleDownloadPdf] Object URL revoked
```

**If Error Occurs**:
```
[PublicInvoiceView.handleDownloadPdf] === ERROR CAUGHT ===
[PublicInvoiceView.handleDownloadPdf] Error type: ...
[PublicInvoiceView.handleDownloadPdf] Error name: ...
[PublicInvoiceView.handleDownloadPdf] Error message: ...
[PublicInvoiceView.handleDownloadPdf] Error stack: ...
```

---

## What to Report Back

### Required Information

**1. Exact Test Performed**:
- Which entry point (1, 2, or 3)
- Browser name and version
- Device type (desktop, mobile, tablet)
- Operating system

**2. Complete Console Output**:
- Copy/paste ALL logs from click through to completion/error
- Include timestamps if available
- Include ALL lines starting with `[SendEstimate]`, `[PublicInvoiceView]`, or `[PDFGenerator]`

**3. Observed Behavior**:
- Did PDF download?
- Did PDF open in new window?
- Was there a browser alert/error?
- Did share sheet appear (mobile)?

**4. Any Errors**:
- Full error message shown to user
- Full error stack from console
- Any red text in console

---

## Likely Outcomes (Predictions)

Based on instrumentation, we'll fall into one of these buckets:

### Bucket 1: Generation Fails Inside jsPDF
**Symptoms**: Error before "Blob output successful" log
**Likely Causes**:
- Non-string value passed to pdf.text()
- NaN or undefined coordinates
- Invalid font/size value

**Evidence Needed**:
- `[PDFGenerator] safe() coerced...` logs
- Error stack pointing to jsPDF line

**Fix**: Add guards, improve safe() function

---

### Bucket 2: Generation Succeeds, Download Fails
**Symptoms**: "Blob output successful" logged, then download doesn't trigger
**Likely Causes**:
- URL.createObjectURL fails
- Anchor click blocked
- Blob not readable

**Evidence Needed**:
- "Created object URL" log
- "Triggering download" log
- Browser security warnings

**Fix**: Different download strategy

---

### Bucket 3: Share API Fails (Mobile Only)
**Symptoms**: "Can share files: false" or share throws error
**Likely Causes**:
- navigator.canShare returns false
- Browser doesn't support file sharing
- User cancels share

**Evidence Needed**:
- "navigator.share exists" log
- "Can share files" log
- Error name: 'AbortError' (user cancelled)

**Fix**: Fallback to download (already implemented)

---

### Bucket 4: Not Running At All
**Symptoms**: No console logs appear after button click
**Likely Causes**:
- Button handler not attached
- State prevents handler execution
- Early return in code path

**Evidence Needed**:
- No "[SendEstimate]" or "[PublicInvoiceView]" logs
- Check if button is disabled

**Fix**: Wiring issue, not jsPDF issue

---

## Build Status

**Build Command**: `npm run build`
**Status**: ✅ Passing
**Bundle Size**: 846.29 kB (no significant change)
**TypeScript Errors**: 0
**Compilation**: Success

---

## Files Modified

1. `src/lib/utils/pdfGenerator.ts` (comprehensive logging)
2. `src/screens/sendestimate.tsx` (entry point 1 logging)
3. `src/screens/estimatepreview.tsx` (entry point 2 - make explicit)
4. `src/screens/publicinvoiceview.tsx` (entry point 3 logging)

---

## Next Steps

1. **User**: Test one or more entry points
2. **User**: Capture complete console output
3. **User**: Report back with all information listed above
4. **We**: Analyze logs to identify exact failure point
5. **We**: Apply targeted fix based on evidence

---

**No More Guessing**

This instrumentation will prove exactly where and why PDF fails. The logs will show:
- ✅ If PDF generation starts
- ✅ If data model is correct
- ✅ If jsPDF returns valid Blob
- ✅ If download is triggered
- ✅ Where error occurs if any

Every code path is logged. Every assumption is validated. The evidence will be conclusive.
