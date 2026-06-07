/** Sanitize strings to prevent XSS when rendering user content in React */
export function sanitize(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] || c)
  );
}

/** Sanitize for use in SQL LIKE patterns — prevent wildcard injection */
export function sanitizeLike(s: string): string {
  return s.replace(/[%_\\]/g, (c) => '\\' + c);
}
