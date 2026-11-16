import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { LIMITS, type PlayerGroup } from '../../../shared/types.ts';
import { Icon } from '../components/Icon.tsx';
import { Page, Section } from '../components/Layout.tsx';
import { PlayerEditor } from '../components/PlayerEditor.tsx';
import { ActionSheet, AvatarStack, Button, ConfirmSheet, EmptyState, IconButton } from '../components/ui.tsx';
import { haptic } from '../lib/device.ts';
import { GROUP_EMOJIS } from '../lib/util.ts';
import { useData, useGroup, useGroups } from '../store/data.ts';
import { deleteGroupWithUndo } from '../store/undo.ts';

export function GroupsPage() {
  const groups = useGroups();
  const createGroup = useData((s) => s.createGroup);
  const navigate = useNavigate();
  const [menu, setMenu] = useState<PlayerGroup | null>(null);

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
            <div key={group.id} className="list-row" style={{ animationDelay: `${i * 60}ms` }}>
              <Link to={`/gruppen/${group.id}`} className="group-card" viewTransition>
                <span className="group-card__emoji" aria-hidden="true">
                  {group.emoji}
                </span>
                <span className="group-card__body">
                  <span className="group-card__name">{group.name}</span>
                  <span className="group-card__count">
                    {group.players.length} {group.players.length === 1 ? 'Person' : 'Personen'}
                  </span>
                </span>
                <AvatarStack players={group.players} max={3} />
              </Link>
              <IconButton icon="more" label={`Aktionen für «${group.name}»`} className="list-row__more" onClick={() => setMenu(group)} />
            </div>
          ))}
        </div>
      )}
      <ActionSheet
        open={menu !== null}
        onClose={() => setMenu(null)}
        title={menu?.name ?? ''}
        actions={
          menu
            ? [
                { label: 'Bearbeiten', icon: 'edit', onClick: () => navigate(`/gruppen/${menu.id}`, { viewTransition: true }) },
                { label: 'Gruppe löschen', icon: 'trash', danger: true, onClick: () => deleteGroupWithUndo(menu) },
              ]
            : []
        }
      />
    </Page>
  );
}

export function GroupEditPage() {
  const { groupId } = useParams();
  const [params] = useSearchParams();
  const group = useGroup(groupId);
  const updateGroup = useData((s) => s.updateGroup);
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
    <Page
      title={group.name || 'Gruppe'}
      back="/gruppen"
      className="group-edit"
      actions={<IconButton icon="trash" label="Gruppe löschen" onClick={() => setConfirmDelete(true)} />}
    >
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
          setConfirmDelete(false);
          deleteGroupWithUndo(group);
          navigate('/gruppen', { replace: true, viewTransition: true });
        }}
      />
    </Page>
  );
}

/** Horizontal group picker used on the game setup screen. */
export function GroupPicker({ selectedId, onSelect }: { selectedId: string | undefined; onSelect: (id: string) => void }) {
  const groups = useGroups();
  const createGroup = useData((s) => s.createGroup);
  return (
    <div className="group-picker" role="radiogroup" aria-label="Spielgruppe wählen">
      {groups.map((group) => (
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
        </button>
      ))}
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
