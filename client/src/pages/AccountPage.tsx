import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '../components/Icon.tsx';
import { Page, Section } from '../components/Layout.tsx';
import { Avatar, Button, ConfirmSheet, Sheet, TextField, Toggle } from '../components/ui.tsx';
import { api, errorMessage } from '../lib/api.ts';
import { isIos, isStandalone, setHapticsEnabled } from '../lib/device.ts';
import { speechAvailable, stopSpeaking } from '../lib/speech.ts';
import { VoicePicker } from '../components/VoicePicker.tsx';
import { promptInstall, usePwa } from '../lib/pwa.ts';
import { deleteAccount, logout, updateProfile } from '../lib/session.ts';
import { syncNow } from '../lib/sync.ts';
import { AVATAR_EMOJIS, formatRelative, PLAYER_COLORS } from '../lib/util.ts';
import { useAuth } from '../store/auth.ts';
import { useData, useHasPendingChanges } from '../store/data.ts';
import { useSettings } from '../store/settings.ts';
import { toast, useUi } from '../store/ui.ts';
import { LIMITS } from '../../../shared/types.ts';

export function AccountPage() {
  const user = useAuth((s) => s.user)!;
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<null | 'avatar' | 'profile' | 'password' | 'delete' | 'logout' | 'ios' | 'voice'>(null);
  const close = () => setSheet(null);

  const online = useUi((s) => s.online);
  const syncStatus = useUi((s) => s.syncStatus);
  const lastSyncAt = useData((s) => s.lastSyncAt);
  const pending = useHasPendingChanges();
  const installEvent = usePwa((s) => s.installEvent);
  const { sound, haptics, setSound, setHaptics } = useSettings();

  const syncLabel = !online
    ? 'Offline – Änderungen werden später übertragen'
    : syncStatus === 'syncing'
      ? 'Wird synchronisiert …'
      : syncStatus === 'error'
        ? 'Synchronisierung fehlgeschlagen'
        : pending
          ? 'Änderungen warten auf Übertragung'
          : `Alles synchron · ${formatRelative(lastSyncAt)}`;

  const exportData = async () => {
    try {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'phonegames-export.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    }
  };

  const doLogout = async () => {
    close();
    await logout();
    navigate('/willkommen', { replace: true });
  };

  return (
    <Page title="Konto" subtitle="Profil, Sicherheit und App">
      <div className="profile-card" style={{ '--c': user.color } as CSSProperties}>
        <button type="button" className="profile-card__avatar" onClick={() => setSheet('avatar')} aria-label="Avatar ändern">
          <Avatar name={user.name} color={user.color} emoji={user.avatar} size={84} />
          <span className="profile-card__edit">
            <Icon name="edit" size={14} />
          </span>
        </button>
        <h2 className="profile-card__name">{user.name}</h2>
        <p className="profile-card__email">{user.email}</p>
        <p className="profile-card__since">Dabei seit {new Date(user.createdAt).toLocaleDateString('de-CH')}</p>
      </div>

      <Section title="Profil">
        <div className="list">
          <ListButton icon="user" label="Name & E-Mail ändern" onClick={() => setSheet('profile')} />
          <ListButton icon="lock" label="Passwort ändern" onClick={() => setSheet('password')} />
        </div>
      </Section>

      <Section title="App">
        <div className="list">
          <div className={`list__item sync-row sync-row--${!online ? 'offline' : syncStatus}`}>
            <Icon name={online ? 'cloud' : 'offline'} />
            <span className="list__label">{syncLabel}</span>
            <button
              type="button"
              className="icon-btn icon-btn--small"
              aria-label="Jetzt synchronisieren"
              disabled={!online || syncStatus === 'syncing'}
              onClick={() => void syncNow()}
            >
              <Icon name="refresh" size={18} />
            </button>
          </div>
          {!isStandalone() && (installEvent || isIos()) && (
            <ListButton
              icon="phone"
              label="App auf dem Startbildschirm installieren"
              onClick={() => (installEvent ? void promptInstall() : setSheet('ios'))}
            />
          )}
          <div className="list__item list__item--toggle">
            <Toggle label="Töne" checked={sound} onChange={setSound} />
          </div>
          {speechAvailable() && <ListButton icon="volume" label="Erzählstimme" onClick={() => setSheet('voice')} />}
          <div className="list__item list__item--toggle">
            <Toggle
              label="Vibration"
              description="Nur auf Android-Geräten verfügbar."
              checked={haptics}
              onChange={(on) => {
                setHaptics(on);
                setHapticsEnabled(on);
              }}
            />
          </div>
        </div>
      </Section>

      <Section title="Daten">
        <div className="list">
          <ListButton icon="download" label="Meine Daten exportieren" onClick={() => void exportData()} />
          <ListButton icon="logout" label="Abmelden" onClick={() => setSheet('logout')} />
        </div>
      </Section>

      <div className="danger-zone">
        <Button variant="ghost" icon="trash" onClick={() => setSheet('delete')}>
          Konto löschen
        </Button>
        <p className="app-version">Phonegames v{__APP_VERSION__} · Mit ❤️ in der Schweiz gehostet</p>
      </div>

      <AvatarSheet open={sheet === 'avatar'} onClose={close} />
      <ProfileSheet open={sheet === 'profile'} onClose={close} />
      <PasswordSheet open={sheet === 'password'} onClose={close} />
      <DeleteSheet open={sheet === 'delete'} onClose={close} />
      <ConfirmSheet
        open={sheet === 'logout'}
        onClose={close}
        title="Abmelden?"
        message={
          pending && !online
            ? 'Achtung: Du bist offline und hast Änderungen, die noch nicht übertragen wurden. Sie gehen beim Abmelden verloren.'
            : 'Deine Spiele und Gruppen bleiben in deinem Konto gespeichert.'
        }
        confirmLabel="Abmelden"
        danger={pending && !online}
        onConfirm={() => void doLogout()}
      />
      <Sheet
        open={sheet === 'voice'}
        onClose={() => {
          stopSpeaking();
          close();
        }}
        title="Erzählstimme"
      >
        <p className="sheet__text">Diese Stimme führt in «Nachts im Dorf» durch die Nacht. Tippe auf eine Stimme, um sie anzuhören.</p>
        <VoicePicker />
        <div className="sheet__actions">
          <Button
            block
            onClick={() => {
              stopSpeaking();
              close();
            }}
          >
            Fertig
          </Button>
        </div>
      </Sheet>
      <Sheet open={sheet === 'ios'} onClose={close} title="Zum Home-Bildschirm">
        <ol className="ios-steps">
          <li>
            Tippe in Safari unten auf <Icon name="share" size={18} /> <strong>Teilen</strong>.
          </li>
          <li>
            Wähle <strong>«Zum Home-Bildschirm»</strong>.
          </li>
          <li>
            Tippe auf <strong>Hinzufügen</strong> – fertig! 🎉
          </li>
        </ol>
        <div className="sheet__actions">
          <Button block onClick={close}>
            Verstanden
          </Button>
        </div>
      </Sheet>
    </Page>
  );
}

function ListButton({ icon, label, onClick }: { icon: Parameters<typeof Icon>[0]['name']; label: string; onClick: () => void }) {
  return (
    <button type="button" className="list__item" onClick={onClick}>
      <Icon name={icon} />
      <span className="list__label">{label}</span>
      <Icon name="next" size={18} />
    </button>
  );
}

function AvatarSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useAuth((s) => s.user)!;
  const online = useUi((s) => s.online);
  const save = async (patch: { avatar?: string; color?: string }) => {
    try {
      await updateProfile(patch);
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Dein Avatar">
      <div className="avatar-preview">
        <Avatar name={user.name} color={user.color} emoji={user.avatar} size={96} />
      </div>
      {!online && <p className="notice notice--warn">Änderungen am Profil brauchen eine Internetverbindung.</p>}
      <div className="emoji-grid">
        {AVATAR_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className={`emoji-btn ${user.avatar === emoji ? 'is-active' : ''}`}
            onClick={() => void save({ avatar: emoji })}
            disabled={!online}
          >
            {emoji}
          </button>
        ))}
      </div>
      <div className="color-row">
        {PLAYER_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className={`color-dot ${user.color === color ? 'is-active' : ''}`}
            style={{ '--c': color } as CSSProperties}
            aria-label={`Farbe ${color}`}
            onClick={() => void save({ color })}
            disabled={!online}
          />
        ))}
      </div>
      <div className="sheet__actions">
        <Button block onClick={onClose}>
          Fertig
        </Button>
      </div>
    </Sheet>
  );
}

function ProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useAuth((s) => s.user)!;
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const emailChanged = email.trim().toLowerCase() !== user.email.toLowerCase();

  useEffect(() => {
    if (!open) return;
    setName(user.name);
    setEmail(user.email);
    setPassword('');
    setError(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await updateProfile({
        name: name.trim(),
        ...(emailChanged ? { email: email.trim(), password } : {}),
      });
      toast('Profil gespeichert ✓', { tone: 'success' });
      setPassword('');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Name & E-Mail">
      <form className="form" onSubmit={submit}>
        <TextField label="Name" icon="user" value={name} maxLength={LIMITS.nameMax} onChange={(e) => setName(e.target.value)} />
        <TextField
          label="E-Mail"
          icon="mail"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {emailChanged && (
          <TextField
            label="Aktuelles Passwort zur Bestätigung"
            icon="lock"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
        {error && <p className="notice notice--error">{error}</p>}
        <Button type="submit" size="lg" block loading={loading} disabled={!name.trim() || (emailChanged && !password)}>
          Speichern
        </Button>
      </form>
    </Sheet>
  );
}

function PasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.changePassword({ currentPassword, newPassword });
      toast('Passwort geändert. Andere Geräte wurden abgemeldet.', { tone: 'success' });
      setCurrent('');
      setNew('');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Passwort ändern">
      <form className="form" onSubmit={submit}>
        <TextField
          label="Aktuelles Passwort"
          icon="lock"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <TextField
          label="Neues Passwort"
          icon="lock"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          hint={`Mindestens ${LIMITS.passwordMin} Zeichen`}
          onChange={(e) => setNew(e.target.value)}
        />
        {error && <p className="notice notice--error">{error}</p>}
        <Button type="submit" size="lg" block loading={loading} disabled={!currentPassword || !newPassword}>
          Passwort ändern
        </Button>
      </form>
    </Sheet>
  );
}

function DeleteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await deleteAccount(password);
      toast('Dein Konto wurde gelöscht. Machs gut! 👋');
      navigate('/willkommen', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Konto löschen?">
      <p className="sheet__text">
        Dein Konto, deine Spieleliste und alle Gruppen werden endgültig gelöscht. Das kann nicht rückgängig gemacht
        werden.
      </p>
      <form className="form" onSubmit={submit}>
        <TextField
          label="Passwort zur Bestätigung"
          icon="lock"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="notice notice--error">{error}</p>}
        <Button type="submit" variant="danger" size="lg" block loading={loading} disabled={!password}>
          Endgültig löschen
        </Button>
      </form>
    </Sheet>
  );
}
