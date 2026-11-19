import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { Mascot, type Mood } from '../components/Brand.tsx';
import { TrustNote } from '../components/TrustNote.tsx';
import { LegalLinks, LegalSheet, type LegalDoc } from '../legal/LegalPages.tsx';
import { TERMS_VERSION } from '../../../shared/legal.ts';
import { Button, TextField } from '../components/ui.tsx';
import { GAMES } from '../games/registry.ts';
import { api, ApiError, errorMessage } from '../lib/api.ts';
import { useAuthOptions } from '../lib/authOptions.ts';
import { PasskeyCancelled, passkeysSupported, preparePasskeySignIn, signInWithPasskey } from '../lib/passkeys.ts';
import { confetti } from '../lib/confetti.ts';
import { haptic } from '../lib/device.ts';
import { hasAccess, login, logout, needsTerms, register } from '../lib/session.ts';
import { afterSignIn, formatPrice, takeAfterSubscribe } from '../lib/subscription.ts';
import { useAuth } from '../store/auth.ts';
import { toast, useUi } from '../store/ui.ts';
import { LIMITS, type LearnSharePreview } from '../../../shared/types.ts';

type FieldErrors = Partial<Record<'invite' | 'name' | 'email' | 'password' | 'terms', string>>;

const TERMS_MISSING = 'Bitte stimme den Nutzungsbedingungen zu.';

/**
 * «Ich akzeptiere die Nutzungsbedingungen und habe die Datenschutzerklärung gelesen.» – the texts open
 * in a sheet, so the form behind stays filled in.
 */
function TermsConsent({ checked, onChange, error }: { checked: boolean; onChange: (checked: boolean) => void; error?: string }) {
  const [doc, setDoc] = useState<LegalDoc | null>(null);
  return (
    <div className={`consent ${error ? 'has-error' : ''}`}>
      <label className="consent__label">
        <input
          type="checkbox"
          className="consent__box"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={!!error}
          aria-describedby={error ? 'consent-error' : undefined}
        />
        <span>
          Ich akzeptiere die{' '}
          <button type="button" className="consent__link" onClick={() => setDoc('agb')}>
            Nutzungsbedingungen
          </button>{' '}
          und habe die{' '}
          <button type="button" className="consent__link" onClick={() => setDoc('datenschutz')}>
            Datenschutzerklärung
          </button>{' '}
          zur Kenntnis genommen.
        </span>
      </label>
      {error && (
        <p className="field__error" id="consent-error">
          {error}
        </p>
      )}
      <LegalSheet doc={doc} onClose={() => setDoc(null)} />
    </div>
  );
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailProblem(email: string): string | undefined {
  if (!email.trim()) return 'Bitte gib deine E-Mail-Adresse ein.';
  if (!EMAIL_PATTERN.test(email.trim())) return 'Das sieht nicht nach einer E-Mail-Adresse aus.';
  return undefined;
}

/**
 * Put the cursor into the first field with a problem, so the person sees right away what is missing
 * (instead of a grey button that does not say why).
 */
function focusFirstInvalid(form: HTMLFormElement | null): void {
  requestAnimationFrame(() => form?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus());
}

/** Endless band of game stickers. */
function Marquee({ reverse }: { reverse?: boolean }) {
  const games = reverse ? [...GAMES].reverse() : GAMES;
  const items = [...games, ...games];
  return (
    <div className={`marquee ${reverse ? 'marquee--reverse' : ''}`} aria-hidden="true">
      <div className="marquee__track">
        {items.map((game, i) => (
          <span key={`${game.id}-${i}`} className="sticker" style={{ '--g1': game.colors[0] } as CSSProperties}>
            <span className="sticker__emoji">{game.emoji}</span>
            {game.name}
          </span>
        ))}
      </div>
    </div>
  );
}

export function WelcomePage() {
  const [mood, setMood] = useState<Mood>('party');
  const billing = useAuthOptions()?.billing;
  return (
    <main className="welcome">
      <div className="welcome__hero">
        <button
          type="button"
          className="welcome__mascot"
          aria-label="Phoni antippen"
          onClick={(event) => {
            haptic([10, 30, 10]);
            setMood((m) => (m === 'party' ? 'wink' : m === 'wink' ? 'wow' : 'party'));
            const r = event.currentTarget.getBoundingClientRect();
            confetti({ x: r.left + r.width / 2, y: r.top + r.height / 3, count: 60 });
          }}
        >
          <Mascot size={150} mood={mood} />
        </button>
        <h1 className="welcome__title" aria-label="Phonegames">
          {'phone'.split('').map((c, i) => (
            <span key={`p${i}`} className="welcome__letter" style={{ animationDelay: `${0.25 + i * 0.05}s` }}>
              {c}
            </span>
          ))}
          <br />
          {'games'.split('').map((c, i) => (
            <span
              key={`g${i}`}
              className="welcome__letter welcome__letter--pop"
              style={{ animationDelay: `${0.5 + i * 0.06}s`, '--rot': `${(i % 2 ? 1 : -1) * (3 + i)}deg` } as CSSProperties}
            >
              {c}
            </span>
          ))}
        </h1>
        <p className="welcome__tagline">
          <strong>Ein Handy. Die ganze Runde.</strong>
          <br />
          {GAMES.length} Spiele – laut, lustig und auch offline.
        </p>
      </div>

      <div className="welcome__bands">
        <Marquee />
        <Marquee reverse />
      </div>

      <div className="welcome__actions">
        <Link to="/registrieren" className="btn btn--primary btn--lg btn--block" viewTransition>
          <span>Los geht’s – Konto erstellen</span>
        </Link>
        <Link to="/anmelden" className="btn btn--secondary btn--lg btn--block" viewTransition>
          <span>Ich habe schon ein Konto</span>
        </Link>
        {billing && (
          <p className="welcome__price">
            {billing.trialDays} Tage gratis, danach {formatPrice(billing.pricePerYear)} pro Jahr. Abo abgelaufen? Melde dich an und erneuere es.
          </p>
        )}
      </div>
      <TrustNote className="welcome__trust" />
      <LegalLinks />
    </main>
  );
}

function AuthShell({
  title,
  subtitle,
  mood,
  back = '/willkommen',
  children,
}: {
  title: string;
  subtitle: string;
  mood: Mood;
  /** Where «Zurück» leads – null for none. */
  back?: string | null;
  children: ReactNode;
}) {
  const online = useUi((s) => s.online);
  return (
    <main className="auth">
      {back && (
        <Link to={back} className="icon-btn auth__back" viewTransition aria-label="Zurück">
          ←
        </Link>
      )}
      <div className="auth__card">
        <span className="auth__mascot">
          <Mascot size={96} mood={mood} />
        </span>
        <h1 className="auth__title">{title}</h1>
        <p className="auth__subtitle">{subtitle}</p>
        {!online && (
          <p className="notice notice--warn">Du bist offline. Für die Anmeldung brauchst du eine Internetverbindung.</p>
        )}
        {children}
        <LegalLinks inSheet />
      </div>
    </main>
  );
}

export function RegisterPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const linkCode = (params.get('code') ?? '').trim().toUpperCase().slice(0, 64);
  const shareId = params.get('teilen') ?? '';
  // Coming from a shared stack link: the stack is taken over after registering (and subscribing).
  const [share, setShare] = useState<LearnSharePreview | null>(null);
  useEffect(() => {
    if (!shareId) return;
    api
      .sharePreview(shareId)
      .then(setShare)
      .catch(() => setShare(null));
  }, [shareId]);
  const options = useAuthOptions();
  const billing = options?.billing ?? null;
  // Without payments a code is needed. Unknown (offline, loading): keep showing the field.
  const codeRequired = options?.inviteRequired !== false && !billing;
  // With the subscription, a code is optional – it makes the account free.
  const [codeOpen, setCodeOpen] = useState(!!linkCode);
  const showInvite = codeRequired || codeOpen;
  const [inviteCode, setInviteCode] = useState(linkCode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [termsChecked, setTermsChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const clearFieldError = (field: keyof FieldErrors) =>
    setFieldErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setInviteError(null);
    const problems: FieldErrors = {
      invite: codeRequired && !inviteCode.trim() ? 'Bitte gib deinen Einladungscode ein.' : undefined,
      name: name.trim() ? undefined : 'Wie sollen wir dich nennen?',
      email: emailProblem(email),
      password:
        password.length < LIMITS.passwordMin ? `Dein Passwort braucht mindestens ${LIMITS.passwordMin} Zeichen.` : undefined,
      terms: termsChecked ? undefined : TERMS_MISSING,
    };
    setFieldErrors(problems);
    if (Object.values(problems).some(Boolean)) {
      haptic([30, 40, 30]);
      focusFirstInvalid(event.currentTarget);
      return;
    }
    setLoading(true);
    try {
      const user = await register({
        termsVersion: TERMS_VERSION,
        name: name.trim(),
        email: email.trim(),
        password,
        ...(showInvite && inviteCode.trim() ? { inviteCode: inviteCode.trim() } : {}),
        ...(share ? { shareId: share.id } : {}),
      });
      if (hasAccess(user)) {
        confetti({ count: 180 });
        toast(`Willkommen bei Phonegames, ${user.name}! 🎉`, { tone: 'success' });
      }
      // Through a shared link: take the stack over right away – after the subscription, if one is needed.
      navigate(afterSignIn(user, share ? `/s/${share.id}?uebernehmen=1` : '/'), { replace: true, viewTransition: true });
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'invalid_invite' || err.code === 'invite_required')) {
        setInviteError(err.message);
        haptic([30, 40, 30]);
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Konto erstellen"
      subtitle={
        billing
          ? `${billing.trialDays} Tage gratis, danach ${formatPrice(billing.pricePerYear)} pro Jahr.`
          : codeRequired
            ? 'Noch geheim – nur mit Einladung.'
            : 'Dauert keine 30 Sekunden. Versprochen.'
      }
      mood={error || inviteError || Object.values(fieldErrors).some(Boolean) ? 'oops' : 'happy'}
    >
      {share && (
        <p className="notice notice--info auth__share">
          📝 Danach übernimmst du den Lernstapel «{share.title}».
        </p>
      )}
      <form className="form" onSubmit={submit} noValidate>
        {showInvite && (
          <TextField
            label="Einladungscode"
            icon="ticket"
            value={inviteCode}
            onChange={(e) => {
              setInviteCode(e.target.value.toUpperCase());
              // Typed before the server settings arrived: keep the field, the code makes the account free.
              setCodeOpen(true);
              setInviteError(null);
              clearFieldError('invite');
            }}
            autoFocus={codeOpen && !linkCode && !inviteCode}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={64}
            error={inviteError ?? fieldErrors.invite}
            hint={
              linkCode
                ? 'Aus deiner Einladung übernommen 🎟️'
                : billing
                  ? 'Mit Einladungscode ist dein Konto kostenlos.'
                  : 'Den Code bekommst du von der Person, die dich eingeladen hat.'
            }
            required={codeRequired}
          />
        )}
        <TextField
          label="Dein Name"
          icon="user"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            clearFieldError('name');
          }}
          autoComplete="nickname"
          maxLength={LIMITS.nameMax}
          error={fieldErrors.name}
          required
        />
        <TextField
          label="E-Mail"
          icon="mail"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            clearFieldError('email');
          }}
          error={fieldErrors.email}
          required
        />
        <TextField
          label="Passwort"
          icon="lock"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            clearFieldError('password');
          }}
          error={fieldErrors.password}
          hint={`Mindestens ${LIMITS.passwordMin} Zeichen`}
          required
        />
        <TermsConsent
          checked={termsChecked}
          onChange={(checked) => {
            setTermsChecked(checked);
            clearFieldError('terms');
          }}
          error={fieldErrors.terms}
        />
        {error && <p className="notice notice--error">{error}</p>}
        <Button type="submit" size="lg" block loading={loading}>
          {billing && !inviteCode.trim() ? 'Weiter zum Abo' : 'Los geht’s'}
        </Button>
        {billing && !showInvite && (
          <button type="button" className="auth__link-btn" onClick={() => setCodeOpen(true)}>
            Ich habe einen Einladungscode
          </button>
        )}
      </form>
      <p className="auth__switch">
        Schon dabei? <Link to={shareId ? `/anmelden?teilen=${encodeURIComponent(shareId)}` : '/anmelden'}>Anmelden</Link>
      </p>
      <TrustNote className="auth__trust" />
    </AuthShell>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const shareId = params.get('teilen');
  /** Back to the shared stack after signing in through its link. */
  const next = shareId ? `/s/${encodeURIComponent(shareId)}?uebernehmen=1` : '/';
  const options = useAuthOptions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const canUsePasskey = !!options?.passkeys && passkeysSupported();

  useEffect(() => {
    if (canUsePasskey) preparePasskeySignIn();
  }, [canUsePasskey]);

  const withPasskey = async () => {
    setError(null);
    setPasskeyLoading(true);
    try {
      const user = await signInWithPasskey();
      confetti({ count: 90 });
      toast(`Schön, dass du da bist, ${user.name}!`, { tone: 'success' });
      navigate(afterSignIn(user, next), { replace: true, viewTransition: true });
    } catch (err) {
      if (!(err instanceof PasskeyCancelled)) setError(err instanceof Error ? err.message : errorMessage(err));
    } finally {
      setPasskeyLoading(false);
      preparePasskeySignIn();
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const problems: FieldErrors = {
      email: emailProblem(email),
      password: password ? undefined : 'Bitte gib dein Passwort ein.',
    };
    setFieldErrors(problems);
    if (Object.values(problems).some(Boolean)) {
      haptic([30, 40, 30]);
      focusFirstInvalid(event.currentTarget);
      return;
    }
    setLoading(true);
    try {
      const user = await login({ email: email.trim(), password });
      toast(`Schön, dass du da bist, ${user.name}!`, { tone: 'success' });
      navigate(afterSignIn(user, next), { replace: true, viewTransition: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Willkommen zurück" subtitle="Melde dich an und leg los." mood={error ? 'oops' : 'wink'}>
      <form className="form" onSubmit={submit} noValidate>
        <TextField
          label="E-Mail"
          icon="mail"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setFieldErrors((current) => ({ ...current, email: undefined }));
          }}
          error={fieldErrors.email}
          required
        />
        <TextField
          label="Passwort"
          icon="lock"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setFieldErrors((current) => ({ ...current, password: undefined }));
          }}
          error={fieldErrors.password}
          required
        />
        {error && <p className="notice notice--error">{error}</p>}
        <Button type="submit" size="lg" block loading={loading}>
          Anmelden
        </Button>
      </form>
      {canUsePasskey && (
        <>
          <p className="auth__divider">
            <span>oder</span>
          </p>
          <Button variant="secondary" size="lg" block icon="key" loading={passkeyLoading} onClick={() => void withPasskey()}>
            Mit Passkey anmelden
          </Button>
        </>
      )}
      <p className="auth__switch">
        Neu hier? <Link to={shareId ? `/registrieren?teilen=${encodeURIComponent(shareId)}` : '/registrieren'}>Konto erstellen</Link>
      </p>
    </AuthShell>
  );
}

const PAYMENT_METHODS = 'Bezahlen mit TWINT, Apple Pay, Google Pay oder Karte – sicher über Stripe.';

/**
 * «Abo» (/abo): the yearly subscription of a paid account – after registering (with the free
 * trial), when it has ended, or when a payment failed. Stripe hosts the payment page and comes
 * back here with `?checkout=…`, which is confirmed right away.
 */
export function SubscribePage() {
  const user = useAuth((s) => s.user)!;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const sessionId = params.get('checkout');
  const billing = useAuthOptions()?.billing ?? null;
  const [busy, setBusy] = useState<'confirm' | 'checkout' | 'portal' | null>(sessionId ? 'confirm' : null);
  const [error, setError] = useState<string | null>(null);
  const confirmed = useRef(false);

  // Back from Stripe's payment page.
  useEffect(() => {
    if (!sessionId || confirmed.current) return;
    confirmed.current = true;
    api
      .billingConfirm(sessionId)
      .then(({ user: updated }) => {
        useAuth.setState({ user: updated });
        if (hasAccess(updated)) {
          confetti({ count: 180 });
          toast(
            updated.subscription?.status === 'trialing' ? `Willkommen, ${updated.name}! Deine Gratis-Tage laufen 🎉` : 'Danke! Dein Abo läuft 🎉',
            { tone: 'success' },
          );
          navigate(takeAfterSubscribe(), { replace: true, viewTransition: true });
        } else {
          setError('Die Zahlung ist noch nicht abgeschlossen. Versuche es nochmals.');
          setParams({}, { replace: true });
        }
      })
      .catch((err) => {
        setError(errorMessage(err));
        setParams({}, { replace: true });
      })
      .finally(() => setBusy(null));
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (hasAccess(user) && !sessionId) return <Navigate to="/" replace />;

  const subscription = user.subscription;
  const failed = subscription?.status === 'past_due';
  const trial = subscription?.trialAvailable !== false;
  const price = billing ? formatPrice(billing.pricePerYear) : 'CHF 5';
  const days = billing?.trialDays ?? 7;

  const open = async (kind: 'checkout' | 'portal') => {
    setError(null);
    setBusy(kind);
    try {
      const { url } = kind === 'checkout' ? await api.billingCheckout() : await api.billingPortal();
      window.location.assign(url);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  };

  const signOut = async () => {
    await logout();
    navigate('/willkommen', { replace: true });
  };

  if (busy === 'confirm') {
    return (
      <AuthShell title="Einen Moment …" subtitle="Dein Abo wird bestätigt." mood="happy" back={null}>
        <p className="subscribe__status" role="status">
          Gleich geht’s los.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={failed ? 'Zahlung fehlgeschlagen' : trial ? `Hallo ${user.name}!` : 'Willkommen zurück'}
      subtitle={
        failed
          ? 'Die letzte Zahlung hat nicht geklappt.'
          : trial
            ? `Teste phonegames ${days} Tage gratis.`
            : 'Dein Abo ist abgelaufen.'
      }
      mood={error || failed ? 'oops' : 'party'}
      back={null}
    >
      {failed ? (
        <p className="subscribe__text">Ändere die Zahlungsart – dann geht’s gleich weiter. Deine Daten sind alle noch da.</p>
      ) : (
        <ul className="subscribe__list">
          <li>Alle Spiele und Lernen – für die ganze Familie</li>
          <li>Auf allen Geräten, auch offline</li>
          {trial ? (
            <li>
              {days} Tage gratis, danach {price} pro Jahr. Kündigst du vorher, kostet es nichts.
            </li>
          ) : (
            <li>{price} pro Jahr – deine Spielgruppen und Lernstapel sind noch da</li>
          )}
          <li>Jederzeit kündbar unter «Konto»</li>
        </ul>
      )}
      {error && <p className="notice notice--error">{error}</p>}
      <div className="subscribe__actions">
        {failed ? (
          <Button size="lg" block icon="key" loading={busy === 'portal'} disabled={!!busy} onClick={() => void open('portal')}>
            Zahlungsart ändern
          </Button>
        ) : (
          <Button size="lg" block loading={busy === 'checkout'} disabled={!!busy} onClick={() => void open('checkout')}>
            {trial ? `${days} Tage gratis testen` : `Abo erneuern – ${price} pro Jahr`}
          </Button>
        )}
        <p className="subscribe__methods">{PAYMENT_METHODS}</p>
      </div>
      <p className="auth__switch">
        Falsches Konto?{' '}
        <button type="button" className="auth__link-btn" onClick={() => void signOut()}>
          Abmelden
        </button>
      </p>
    </AuthShell>
  );
}

/**
 * «/bedingungen»: agree to the terms of use and the privacy notice before using the app – for accounts
 * from before these texts, and again whenever they change (shared/legal.ts).
 */
export function TermsPage() {
  const user = useAuth((s) => s.user)!;
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [termsError, setTermsError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  if (!needsTerms(user)) return <Navigate to="/" replace />;
  const changed = user.termsAcceptedAt !== null;

  const agree = async () => {
    if (!checked) {
      setTermsError(TERMS_MISSING);
      haptic([30, 40, 30]);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const { user: updated } = await api.acceptTerms(TERMS_VERSION);
      useAuth.setState({ user: updated });
      navigate('/', { replace: true, viewTransition: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title={changed ? 'Neue Bedingungen' : 'Kurz zustimmen'}
      subtitle={
        changed
          ? 'Die Nutzungsbedingungen oder die Datenschutzerklärung haben sich geändert.'
          : 'phonegames hat jetzt Nutzungsbedingungen und eine Datenschutzerklärung.'
      }
      mood="happy"
      back={null}
    >
      <p className="subscribe__text">
        Bitte lies sie und stimme zu, damit du weiterspielen und -lernen kannst.
        {user.plan === 'free' && ' Dein Konto bleibt kostenlos.'}
      </p>
      <TermsConsent
        checked={checked}
        onChange={(value) => {
          setChecked(value);
          setTermsError(undefined);
        }}
        error={termsError}
      />
      {error && <p className="notice notice--error">{error}</p>}
      <div className="subscribe__actions">
        <Button size="lg" block icon="check" loading={busy} onClick={() => void agree()}>
          Zustimmen und weiter
        </Button>
      </div>
      <p className="auth__switch">
        <button
          type="button"
          className="auth__link-btn"
          onClick={() => {
            void logout().then(() => navigate('/willkommen', { replace: true }));
          }}
        >
          Abmelden
        </button>
      </p>
    </AuthShell>
  );
}
