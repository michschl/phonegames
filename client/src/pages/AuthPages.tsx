import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { BombArt } from '../games/bombe/BombGraphic.tsx';
import { Button, TextField } from '../components/ui.tsx';
import { errorMessage } from '../lib/api.ts';
import { confetti } from '../lib/confetti.ts';
import { login, register } from '../lib/session.ts';
import { toast, useUi } from '../store/ui.ts';
import { LIMITS } from '../../../shared/types.ts';

const FLOATERS = ['🎲', '🎉', '🃏', '🎯', '🍕', '🎤', '🧩', '🥳'];

export function WelcomePage() {
  return (
    <main className="welcome">
      <div className="welcome__floaters" aria-hidden="true">
        {FLOATERS.map((emoji, i) => (
          <span key={emoji} className={`floater floater--${i}`}>
            {emoji}
          </span>
        ))}
      </div>
      <div className="welcome__hero">
        <div className="welcome__bomb">
          <BombArt size={170} />
        </div>
        <h1 className="welcome__title">
          Plausch<span className="welcome__dot">.</span>
        </h1>
        <p className="welcome__tagline">Partyspiele für dein Handy – laut, schnell und auch offline.</p>
      </div>
      <ul className="welcome__features">
        <li>
          <span aria-hidden="true">💣</span> Bombe & bald mehr
        </li>
        <li>
          <span aria-hidden="true">👯</span> Spielgruppen speichern
        </li>
        <li>
          <span aria-hidden="true">✈️</span> Funktioniert offline
        </li>
      </ul>
      <div className="welcome__actions">
        <Link to="/registrieren" className="btn btn--primary btn--lg btn--block" viewTransition>
          <span>Konto erstellen</span>
        </Link>
        <Link to="/anmelden" className="btn btn--ghost btn--lg btn--block" viewTransition>
          <span>Ich habe schon ein Konto</span>
        </Link>
      </div>
    </main>
  );
}

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const online = useUi((s) => s.online);
  return (
    <main className="auth">
      <Link to="/willkommen" className="auth__back" viewTransition aria-label="Zurück">
        ←
      </Link>
      <div className="auth__card">
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

export function RegisterPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await register({ name: name.trim(), email: email.trim(), password });
      confetti({ count: 160 });
      toast(`Willkommen bei Plausch, ${user.name}! 🎉`, { tone: 'success' });
      navigate('/', { replace: true, viewTransition: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Konto erstellen" subtitle="Dauert keine 30 Sekunden. Versprochen.">
      <form className="form" onSubmit={submit} noValidate>
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
        <Button type="submit" size="lg" block loading={loading} disabled={!name || !email || !password}>
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
    <AuthShell title="Willkommen zurück" subtitle="Melde dich an und leg los.">
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
