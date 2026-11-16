import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { LIMITS, type Player, type PlayerGroup } from '../../../shared/types.ts';
import type { PlayerStatus } from '../games/types.ts';
import { Icon } from '../components/Icon.tsx';
import { Page, Section } from '../components/Layout.tsx';
import { PlayerEditor } from '../components/PlayerEditor.tsx';
import { AvatarStack, Button, ConfirmSheet, EmptyState } from '../components/ui.tsx';
import { haptic } from '../lib/device.ts';
import { GROUP_EMOJIS } from '../lib/util.ts';
import { useData, useGroup, useGroups } from '../store/data.ts';
import { toast } from '../store/ui.ts';

export function GroupsPage() {
  const groups = useGroups();
  const createGroup = useData((s) => s.createGroup);
  const navigate = useNavigate();

  const create = () => {
    haptic(10);
    const group = createGroup();
    navigate(`/gruppen/${group.id}?neu=1`, { viewTransition: true });
  };

  return (
    <Page
      title="Spielgruppen"
      subtitle="Wer spielt mit? Einmal anlegen, immer wieder verwenden."
      actions={
        groups.length > 0 && (
          <button type="button" className="icon-btn icon-btn--accent" aria-label="Neue Gruppe" onClick={create}>
            <Icon name="plus" />
          </button>
        )
      }
    >
      {groups.length === 0 ? (
        <EmptyState
          mascot="happy"
          emoji="👯"
          title="Noch keine Gruppe"
          text="Erstelle eine Gruppe mit allen, die mitspielen – zum Beispiel «WG», «Familie» oder «Skiweekend»."
          action={
            <Button size="lg" icon="plus" onClick={create}>
              Gruppe erstellen
            </Button>
          }
        />
      ) : (
        <div className="group-list">
          {groups.map((group, i) => (
            <Link
              key={group.id}
              to={`/gruppen/${group.id}`}
              className="group-card"
              style={{ animationDelay: `${i * 60}ms` }}
              viewTransition
            >
              <span className="group-card__emoji" aria-hidden="true">
                {group.emoji}
              </span>
              <span className="group-card__body">
                <span className="group-card__name">{group.name}</span>
                <span className="group-card__count">
                  {group.players.length} {group.players.length === 1 ? 'Person' : 'Personen'}
                </span>
              </span>
              <AvatarStack players={group.players} max={4} />
            </Link>
          ))}
        </div>
      )}
    </Page>
  );
}

export function GroupEditPage() {
  const { groupId } = useParams();
  const [params] = useSearchParams();
  const group = useGroup(groupId);
  const updateGroup = useData((s) => s.updateGroup);
  const deleteGroup = useData((s) => s.deleteGroup);
  const navigate = useNavigate();
  const [name, setName] = useState(group?.name ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isNew = params.get('neu') === '1';

  // Keep the input in sync when the group changes from another device.
  useEffect(() => {
    if (group && document.activeElement?.id !== 'group-name') setName(group.name);
  }, [group?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!group) {
    return (
      <Page title="Gruppe" back="/gruppen">
        <EmptyState emoji="🤷" title="Gruppe nicht gefunden" text="Vielleicht wurde sie gelöscht." />
      </Page>
    );
  }

  const saveName = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== group.name) updateGroup(group.id, { name: trimmed });
    else setName(group.name);
  };

  return (
    <Page title={group.name || 'Gruppe'} back="/gruppen" className="group-edit">
      <Section title="Name & Symbol">
        <div className="group-name">
          <input
            id="group-name"
            className="group-name__input"
            value={name}
            maxLength={LIMITS.groupNameMax}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            aria-label="Name der Gruppe"
          />
        </div>
        <div className="emoji-row" role="radiogroup" aria-label="Symbol der Gruppe">
          {GROUP_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              role="radio"
              aria-checked={group.emoji === emoji}
              className={`emoji-btn ${group.emoji === emoji ? 'is-active' : ''}`}
              onClick={() => {
                haptic(6);
                updateGroup(group.id, { emoji });
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Mitspielende">
        <PlayerEditor group={group} autoFocus={isNew} />
      </Section>

      <div className="danger-zone">
        <Button variant="ghost" icon="trash" onClick={() => setConfirmDelete(true)}>
          Gruppe löschen
        </Button>
      </div>

      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Gruppe löschen?"
        message={
          <>
            «{group.name}» mit {group.players.length} {group.players.length === 1 ? 'Person' : 'Personen'} wird
            gelöscht.
          </>
        }
        confirmLabel="Löschen"
        danger
        onConfirm={() => {
          deleteGroup(group.id);
          toast(`«${group.name}» gelöscht.`);
          navigate('/gruppen', { replace: true, viewTransition: true });
        }}
      />
    </Page>
  );
}

/** Horizontal group picker used on the game setup screen. */
export function GroupPicker({
  selectedId,
  onSelect,
  status,
}: {
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  /** With a status (e.g. cards due in «Spickzettel»), each group shows the sum of its people. */
  status?: (player: Player) => PlayerStatus | undefined;
}) {
  const groups = useGroups();
  const createGroup = useData((s) => s.createGroup);
  const dueOf = (group: PlayerGroup) => (status ? group.players.reduce((sum, p) => sum + (status(p)?.due ?? 0), 0) : 0);
  const anyDue = groups.some((group) => dueOf(group) > 0);
  return (
    <div className={`group-picker ${anyDue ? 'has-badges' : ''}`} role="radiogroup" aria-label="Spielgruppe wählen">
      {groups.map((group) => {
        const due = dueOf(group);
        return (
        <button
          key={group.id}
          type="button"
          role="radio"
          aria-checked={group.id === selectedId}
          className={`group-pill ${group.id === selectedId ? 'is-active' : ''}`}
          style={{ '--c': group.players[0]?.color ?? '#8b5cf6' } as CSSProperties}
          onClick={() => {
            haptic(6);
            onSelect(group.id);
          }}
        >
          <span aria-hidden="true">{group.emoji}</span>
          <span className="group-pill__name">{group.name}</span>
          <span className="group-pill__count">{group.players.length}</span>
          {due > 0 && (
            <>
              <span className="due-badge due-badge--corner" aria-hidden="true">
                {due}
              </span>
              <span className="sr-only">, {due} {due === 1 ? 'Karte' : 'Karten'} fällig</span>
            </>
          )}
        </button>
        );
      })}
      <button
        type="button"
        className="group-pill group-pill--new"
        onClick={() => {
          haptic(10);
          onSelect(createGroup().id);
        }}
      >
        <Icon name="plus" size={18} /> Neue Gruppe
      </button>
    </div>
  );
}
