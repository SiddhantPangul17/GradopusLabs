/*
 * The certificate template's fonts (src/lib/certificates/fonts) are used only for
 * the Windows-1252 (WinAnsi) character set: English letters and Western European accents.
 * Names in other scripts (e.g. Devanagari) cannot be printed correctly yet, so
 * issuance is refused with a clear reason instead of printing a broken name.
 */

const EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";

export function isPrintableOnCertificate(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0)!;
    const ok = (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || EXTRA.includes(char);
    if (!ok) return false;
  }
  return true;
}
