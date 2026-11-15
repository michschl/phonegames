/**
 * Human friendly names for passkeys. The authenticator's AAGUID tells which
 * password manager stores the passkey; otherwise the device is taken from the
 * user agent of the browser that created it.
 */
const PROVIDERS: Record<string, string> = {
  'fbfc3007-154e-4ecc-8c0b-6e020557d7bd': 'iCloud-Schlüsselbund',
  'dd4ec289-e01d-41c9-bb89-70fa845d4bf2': 'iCloud-Schlüsselbund',
  'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4': 'Google Passwortmanager',
  'adce0002-35bc-c60a-648b-0b25f1f05503': 'Chrome auf dem Mac',
  '08987058-cadc-4b81-b6e1-30de50dcbe96': 'Windows Hello',
  '9ddd1817-af5a-4672-a2b9-3e3dd95000a9': 'Windows Hello',
  '6028b017-b1d4-4c02-b4b3-afcdafc96bb2': 'Windows Hello',
  '53414d53-554e-4700-0000-000000000000': 'Samsung Pass',
  'bada5566-a7aa-401f-bd96-45619a55120d': '1Password',
  'd548826e-79b4-db40-a3d8-11116f7e8349': 'Bitwarden',
  '531126d6-e717-415c-9320-3d9aa6981239': 'Dashlane',
};

function device(userAgent: string): string | null {
  if (/iPhone/i.test(userAgent)) return 'iPhone';
  if (/iPad/i.test(userAgent)) return 'iPad';
  if (/Android/i.test(userAgent)) return 'Android';
  if (/CrOS/i.test(userAgent)) return 'Chromebook';
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'Mac';
  if (/Windows/i.test(userAgent)) return 'Windows';
  if (/Linux/i.test(userAgent)) return 'Linux';
  return null;
}

export function passkeyName(aaguid: string | undefined, userAgent: string | undefined): string {
  const provider = aaguid ? PROVIDERS[aaguid.toLowerCase()] : undefined;
  if (provider) return provider;
  const on = device(userAgent ?? '');
  return on ? `Passkey auf ${on}` : 'Passkey';
}
