export type DocType = 'estimate' | 'invoice';
export type DeliveryKind = 'pdf' | 'link';
export type DeliveryMethod = 'email' | 'sms' | 'copy' | 'share';

function key(docType: DocType, kind: DeliveryKind) {
  return `smash:delivery_method:v2:${docType}:${kind}`;
}

export function getDeliveryMethod(docType: DocType, kind: DeliveryKind): DeliveryMethod | null {
  try {
    const v = window.localStorage.getItem(key(docType, kind));
    if (v === 'email' || v === 'sms' || v === 'copy' || v === 'share') return v;
    return null;
  } catch {
    return null;
  }
}

export function setDeliveryMethod(docType: DocType, kind: DeliveryKind, method: DeliveryMethod) {
  try {
    window.localStorage.setItem(key(docType, kind), method);
  } catch {
    // ignore
  }
}

export function getDefaultDeliveryMethod(docType: DocType, kind: DeliveryKind): DeliveryMethod {
  // Final decision: default to email for both PDF + links.
  return 'email';
}

