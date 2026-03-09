// app/lib/validators.ts

/**
 * Validate Norwegian organisation number (9 digits) using MOD11.
 * Returns true if valid.
 */
export function validateOrgNr(orgNr: string): boolean {
  if (!/^\d{9}$/.test(orgNr)) return false;

  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  const digits = orgNr.split("").map(Number);

  const sum = weights.reduce((acc, w, i) => acc + w * digits[i], 0);
  const remainder = sum % 11;

  let checkDigit: number;
  if (remainder === 0) {
    checkDigit = 0;
  } else if (remainder === 1) {
    return false; // invalid
  } else {
    checkDigit = 11 - remainder;
  }

  return digits[8] === checkDigit;
}

/**
 * Generate EHF Peppol Participant ID from orgNr.
 * Default scheme: 0192 (Norwegian org number)
 */
export function generatePeppolId(orgNr: string, scheme = "0192"): string {
  return `${scheme}:${orgNr}`;
}

/**
 * Generate KID number with MOD10 checksum.
 * @param invoiceNumber numeric invoice reference
 * @param length target length (10 or 15)
 */
export function generateKid(invoiceNumber: number, length: 10 | 15): string {
  // Pad invoice number, leaving 1 digit for checksum
  const numStr = String(invoiceNumber).padStart(length - 1, "0").slice(-(length - 1));

  // MOD10 (Luhn) checksum
  let sum = 0;
  let toggle = true;
  for (let i = numStr.length - 1; i >= 0; i--) {
    let n = parseInt(numStr[i], 10);
    if (toggle) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    toggle = !toggle;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return numStr + String(checkDigit);
}

/**
 * Mask an email address for logging.
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 2)}***@${domain}`;
}

/**
 * Convert amount from NOK (decimal) to øre (integer).
 */
export function nokToOre(nok: number | string): number {
  return Math.round(parseFloat(String(nok)) * 100);
}

/**
 * Convert øre to NOK string with 2 decimals.
 */
export function oreToNok(ore: number): string {
  return (ore / 100).toFixed(2);
}

/**
 * Get current billing month key e.g. "2025-01"
 */
export function getCurrentMonthKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}
