import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Mascot, type Mood } from '../components/Brand.tsx';
import { Button, TextField } from '../components/ui.tsx';
import { GAMES } from '../games/registry.ts';
import { api, ApiError, errorMessage } from '../lib/api.ts';
import { confetti } from '../lib/confetti.ts';
import { haptic } from '../lib/device.ts';
import { login, register } from '../lib/session.ts';
import { toast, useUi } from '../store/ui.ts';
import { LIMITS } from '../../../shared/types.ts';

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
          {GAMES.length} Partyspiele – laut, lustig und auch offline.
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
      </div>
    </main>
  );
}

function AuthShell({ title, subtitle, mood, children }: { title: string; subtitle: string; mood: Mood; children: ReactNode }) {
  const online = useUi((s) => s.online);
  return (
    <main className="auth">
      <Link to="/willkommen" className="icon-btn auth__back" viewTransition aria-label="Zurück">
        ←
      </Link>
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
      </div>
    </main>
  );
}

/** Whether the server currently requires an invitation code (null = not known yet). */
function useInviteRequired(): boolean | null {
  const [required, setRequired] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    api
      .authOptions()
      .then((options) => active && setRequired(options.inviteRequired))
      .catch(() => {
        // Offline or server unreachable: keep showing the field, registering needs the server anyway.
      });
    return () => {
      active = false;
    };
  }, []);
  return required;
}

export function RegisterPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const linkCode = (params.get('code') ?? '').trim().toUpperCase().slice(0, 64);
  const inviteRequired = useInviteRequired();
  const showInvite = inviteRequired !== false;
  const [inviteCode, setInviteCode] = useState(linkCode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setInviteError(null);
    setLoading(true);
    try {
      const user = await register({
        name: name.trim(),
        email: email.trim(),
        password,
        ...(showInvite ? { inviteCode: inviteCode.trim() } : {}),
      });
      confetti({ count: 180 });
      toast(`Willkommen bei Phonegames, ${user.name}! 🎉`, { tone: 'success' });
      navigate('/', { replace: true, viewTransition: true });
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
      subtitle={showInvite ? 'Noch geheim – nur mit Einladung.' : 'Dauert keine 30 Sekunden. Versprochen.'}
      mood={error || inviteError ? 'oops' : 'happy'}
    >
      <form className="form" onSubmit={submit} noValidate>
        {showInvite && (
          <TextField
            label="Einladungscode"
            icon="ticket"
            value={inviteCode}
            onChange={(e) => {
              setInviteCode(e.target.value.toUpperCase());
              setInviteError(null);
            }}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={64}
            error={inviteError}
            hint={linkCode ? 'Aus deiner Einladung übernommen 🎟️' : 'Den Code bekommst du von der Person, die dich eingeladen hat.'}
            required
          />
        )}
        <TextField
          label="Dein Name"
          icon="user"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="nickname"
          maxLength={LIMITS.nameMax}
          required
        />
        <TextField
          label="E-Mail"
          icon="mail"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <TextField
          label="Passwort"
          icon="lock"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={`Mindestens ${LIMITS.passwordMin} Zeichen`}
          required
        />
        {error && <p className="notice notice--error">{error}</p>}
        <Button
          type="submit"
          size="lg"
          block
          loading={loading}
          disabled={!name || !email || !password || (showInvite && !inviteCode.trim())}
        >
          Los geht’s
        </Button>
      </form>
      <p className="auth__switch">
        Schon dabei? <Link to="/anmelden">Anmelden</Link>
      </p>
    </AuthShell>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await login({ email: email.trim(), password });
      toast(`Schön, dass du da bist, ${user.name}!`, { tone: 'success' });
      navigate('/', { replace: true, viewTransition: true });
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
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <TextField
          label="Passwort"
          icon="lock"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="notice notice--error">{error}</p>}
        <Button type="submit" size="lg" block loading={loading} disabled={!email || !password}>
          Anmelden
        </Button>
      </form>
      <p className="auth__switch">
        Neu hier? <Link to="/registrieren">Konto erstellen</Link>
      </p>
    </AuthShell>
  );
}
