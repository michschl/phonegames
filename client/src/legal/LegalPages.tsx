import { useState, type ComponentType } from 'react';
import { Link } from 'react-router';
import { Page } from '../components/Layout.tsx';
import { Sheet } from '../components/ui.tsx';
import { useAuth } from '../store/auth.ts';
import { ImprintText, PrivacyText, TermsText } from './LegalTexts.tsx';

export type LegalDoc = 'impressum' | 'agb' | 'datenschutz';

export const LEGAL: Record<LegalDoc, { title: string; short: string; Text: ComponentType }> = {
  impressum: { title: 'Impressum', short: 'Impressum', Text: ImprintText },
  agb: { title: 'Nutzungsbedingungen (AGB)', short: 'AGB', Text: TermsText },
  datenschutz: { title: 'Datenschutzerklärung', short: 'Datenschutz', Text: PrivacyText },
};

/** /impressum, /agb, /datenschutz – public, with or without an account (also for Stripe and TWINT). */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  const user = useAuth((s) => s.user);
  const { title, Text } = LEGAL[doc];
  return (
    <Page title={title} back={window.history.length > 1 ? true : user ? '/konto' : '/willkommen'} className="legal-page">
      <Text />
      <LegalLinks current={doc} />
    </Page>
  );
}

/** «Impressum · AGB · Datenschutz» – links to the pages (or sheets, where leaving would lose a form). */
export function LegalLinks({ current, inSheet = false }: { current?: LegalDoc; inSheet?: boolean }) {
  const [open, setOpen] = useState<LegalDoc | null>(null);
  const docs = (Object.keys(LEGAL) as LegalDoc[]).filter((doc) => doc !== current);
  return (
    <nav className="legal-links" aria-label="Rechtliches">
      {docs.map((doc, i) => (
        <span key={doc}>
          {i > 0 && <span aria-hidden="true"> · </span>}
          {inSheet ? (
            <button type="button" className="legal-links__btn" onClick={() => setOpen(doc)}>
              {LEGAL[doc].short}
            </button>
          ) : (
            <Link to={`/${doc}`} viewTransition>
              {LEGAL[doc].short}
            </Link>
          )}
        </span>
      ))}
      {inSheet && <LegalSheet doc={open} onClose={() => setOpen(null)} />}
    </nav>
  );
}

/** A legal text over the current page – the form behind it stays as it is. */
export function LegalSheet({ doc, onClose }: { doc: LegalDoc | null; onClose: () => void }) {
  const [last, setLast] = useState<LegalDoc | null>(doc);
  if (doc && doc !== last) setLast(doc);
  const shown = doc ?? last;
  const Text = shown ? LEGAL[shown].Text : null;
  return (
    <Sheet open={!!doc} onClose={onClose} title={shown ? LEGAL[shown].title : undefined}>
      <div className="legal-sheet">{Text && <Text />}</div>
    </Sheet>
  );
}
