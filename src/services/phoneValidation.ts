/**
 * Global phone number validation
 * Accepts international formats including:
 * - Egypt: +20, 01xxxxxxxxx
 * - KSA: +966, 05xxxxxxxx
 * - Turkey: +90, 05xx xxx xxxx
 * - France: +33, 06 xx xx xx xx
 * - And other international formats
 */

// International phone regex: optional + or 00 prefix, followed by 7-15 digits
const GLOBAL_PHONE_REGEX = /^(\+|00)?[0-9][\d\s\-\(\)]{6,18}[0-9]$/;

// Clean phone number (remove spaces, dashes, parentheses)
export function cleanPhoneNumber(phone: string): string {
  return phone.replace(/[\s\-\(\)]/g, '');
}

// Validate global phone number
export function isValidGlobalPhone(phone: string): { valid: boolean; error?: string } {
  const cleaned = cleanPhoneNumber(phone);

  if (cleaned.length < 7) {
    return { valid: false, error: 'رقم الهاتف قصير جداً' };
  }

  if (cleaned.length > 15) {
    return { valid: false, error: 'رقم الهاتف طويل جداً' };
  }

  // Check if it contains only digits and optional + prefix
  if (!/^\+?[0-9]+$/.test(cleaned)) {
    return { valid: false, error: 'رقم الهاتف يجب أن يحتوي على أرقام فقط' };
  }

  return { valid: true };
}

// Format phone for display
export function formatPhoneDisplay(phone: string): string {
  const cleaned = cleanPhoneNumber(phone);
  if (cleaned.length <= 4) return cleaned;
  if (cleaned.startsWith('+')) {
    // +20 123 456 7890
    return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6, 9)} ${cleaned.slice(9)}`.trim();
  }
  // 0123 456 7890
  return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`.trim();
}
