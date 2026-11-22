import type { CSSProperties } from 'react';
import type { DocTask } from '../../../shared/types.ts';
import { TYPE_LABEL } from '../lib/taskDocs.ts';

/** One task of a document as on paper – with the sample solution when `solution` is on. */
export function DocTaskView({ task, index, solution }: { task: DocTask; index: number; solution: boolean }) {
  return (
    <li className="doc-task">
      <div className="doc-task__head">
        <span className="doc-task__num" aria-hidden="true">
          {index + 1}
        </span>
        <span className="doc-task__type">{TYPE_LABEL[task.type]}</span>
        <span className="doc-task__points">
          {task.points} {task.points === 1 ? 'Punkt' : 'Punkte'}
        </span>
      </div>
      <p className="doc-task__prompt">
        <span className="sr-only">Aufgabe {index + 1}: </span>
        {task.prompt}
      </p>
      {task.type === 'choice' && (
        <ol className="doc-task__options">
          {task.options.map((option) => (
            <li key={option} className={solution && option === task.answer ? 'is-right' : ''}>
              {option}
            </li>
          ))}
        </ol>
      )}
      {task.type === 'truefalse' && !solution && <p className="doc-task__tf">richtig · falsch</p>}
      {(task.type === 'short' || task.type === 'open') && !solution && (
        <div className="doc-task__lines" style={{ '--lines': Math.max(1, task.lines) } as CSSProperties} aria-hidden="true" />
      )}
      {solution && (
        <div className="doc-task__solution">
          <p>
            <strong>Lösung:</strong> {task.answer}
            {task.accepted.length > 0 && <span className="doc-task__accepted"> (auch: {task.accepted.join(', ')})</span>}
          </p>
          {task.solution && task.solution !== task.answer && <p className="doc-task__explain">{task.solution}</p>}
          {task.doubt && <p className="card-row__warn">Bitte prüfen: {task.doubt}</p>}
        </div>
      )}
    </li>
  );
}
