import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { LIMITS, type Player } from '../../../shared/types.ts';
import { isSoloMode } from '../games/spickzettel/modes.ts';
import { modeFits } from '../lib/learn.ts';
import { learnerColor, learnerId, sameName } from '../lib/learners.ts';
import { useStack } from '../store/data.ts';
import { useLearners } from '../store/learners.ts';
import { useSettings } from '../store/settings.ts';
import { PlayLoading, usePlayScreen } from './GamePages.tsx';

const SoloLearn = lazy(() => import('../games/spickzettel/SoloLearn.tsx'));

/** Where a stack is learned from when the direct link does not work (e.g. the stack was deleted). */
export function stackHome(stackId: string | undefined): string {
  return stackId ? `/spiel/spickzettel?stapel=${stackId}` : '/spiel/spickzettel';
}

/**
 * /lernen/:stackId/:mode?person=Lina – one person learns a stack right away: the Kartenkasten
 * starts with the first due card, the Lückentext with the first page. No group, no setup screen.
 */
export function LearnPlayPage() {
  const { stackId, mode } = useParams();
  const [params] = useSearchParams();
  const person = (params.get('person') ?? '').trim().slice(0, LIMITS.nameMax);
  const stack = useStack(stackId);
  const learners = useLearners(stackId);
  const setLastLearner = useSettings((s) => s.setLastLearner);
  const navigate = useNavigate();
  const location = useLocation();
  // Frozen for the round: the list of learners changes as soon as the first answer is recorded.
  const [learner] = useState<Player | null>(
    () => learners.find((p) => sameName(p.name, person)) ?? (person ? { id: learnerId(person), name: person, color: learnerColor(person) } : null),
  );
  usePlayScreen();

  useEffect(() => {
    if (stack && learner) setLastLearner(stack.id, learner.name);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fallback = stackHome(stack?.id);
  if (!stack || !learner || !isSoloMode(mode) || !modeFits(mode, stack)) return <Navigate to={fallback} replace />;

  // Back to where the round was started from (start page, stack page, …).
  const exit = () => {
    if (location.key !== 'default') navigate(-1);
    else navigate(fallback, { replace: true });
  };

  return (
    <div className="play-screen">
      <Suspense fallback={<PlayLoading />}>
        <SoloLearn stack={stack} mode={mode} learner={learner} onExit={exit} />
      </Suspense>
    </div>
  );
}
