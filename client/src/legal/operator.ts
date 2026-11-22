/**
 * Who runs phonegames – shown in the imprint, the terms of use and the privacy notice.
 * TWINT (via Stripe) requires: company name with legal form (sole proprietorship: full first and last
 * name), full address (no PO box) and an e-mail address – the same as in the Stripe account.
 *
 * Values in square brackets are placeholders: they are highlighted on the pages until filled in.
 */
export const OPERATOR = {
  /** Company name with legal form, or the full name of the owner of a sole proprietorship. */
  name: '[Firmenname mit Rechtsform oder Vor- und Nachname]',
  street: '[Strasse und Hausnummer]',
  city: '[PLZ und Ort]',
  country: 'Schweiz',
  email: '[E-Mail-Adresse]',
  /** UID / MWST number, empty if there is none. */
  uid: '',
} as const;

/** A value still to be filled in (see OPERATOR). */
export function isPlaceholder(value: string): boolean {
  return value.startsWith('[') && value.endsWith(']');
}

/**
 * Are the details of the operator filled in? Until they are, nobody is asked to agree to the terms –
 * neither when registering nor afterwards (a consent to placeholder texts would mean little). As soon as
 * they are filled in, new accounts tick the box and existing ones agree once (see needsTerms).
 */
export function legalReady(): boolean {
  return ![OPERATOR.name, OPERATOR.street, OPERATOR.city, OPERATOR.email].some(isPlaceholder);
}
