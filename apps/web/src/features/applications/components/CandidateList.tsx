import { APPLICATION_STATUS_UK, MESSAGES_UK } from '@ctoc/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiClientError } from '../../../lib/api';
import { formatUah } from '../../../lib/money';
import { newIdempotencyKey, useAssign } from '../queries/assign';
import type { Candidate } from '../queries/candidates';

const messageFor = (code: string): string =>
  code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : ((MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.INTERNAL_ERROR);

/**
 * US-24. The applicants of a task. Each name is a plain link to the public profile /u/:userId (sc.1): it opens as a page,
 * not a dialog or a new window, so on a phone it fills the screen (sc.3). The badge shows only when the student is
 * verified now (sc.2, INV-03). The bio («Про мене») shows as plain text when the student wrote one (sc.1).
 *
 * US-25. Each candidate has «Обрати виконавцем». A click opens an inline confirmation (the key of the attempt is made
 * there), then the select runs. The buttons are off once the task is not open to selection (an executor is chosen), and for an
 * application that is not `sent` (sc.2). A 422 INSUFFICIENT_FUNDS links to the balance page (US-26).
 */
export function CandidateList({ taskId, candidates, canSelect, priceKopecks }: { taskId: string; candidates: Candidate[]; canSelect: boolean; priceKopecks: number }) {
  const assign = useAssign(taskId);
  const [confirming, setConfirming] = useState<{ applicationId: string; key: string } | null>(null);

  if (candidates.length === 0) return <p role="status">Відгуків поки немає.</p>;

  const errorCode = assign.isError ? (assign.error instanceof ApiClientError ? assign.error.code : 'UNKNOWN_ERROR') : null;
  const confirmSelect = () => {
    if (!confirming) return;
    assign.mutate(confirming, {
      onSuccess: () => setConfirming(null),
      // The same attempt may be retried after a lost connection, with the same key. Any other answer ends it.
      onError: (error) => {
        if (!(error instanceof ApiClientError && error.code === 'NETWORK_ERROR')) setConfirming(null);
      },
    });
  };

  return (
    <>
    <ul aria-label="Відгуки студентів">
      {candidates.map((candidate) => (
        <li key={candidate.id}>
          <article aria-labelledby={`candidate-${candidate.id}`}>
            <h3 id={`candidate-${candidate.id}`}>
              <Link to={`/u/${candidate.student.id}`}>{candidate.student.displayName}</Link>
            </h3>
            {candidate.student.verified && <p className="badge badge-verified">Верифікований студент</p>}
            {candidate.student.bio !== '' && <p className="bio">Про мене: {candidate.student.bio}</p>}
            {candidate.student.skills.length > 0 && (
              <ul aria-label="Навички" className="skills">
                {candidate.student.skills.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            )}
            <p>
              Статус відгуку: <strong className="status-pill" data-status={candidate.status}>{APPLICATION_STATUS_UK[candidate.status]}</strong>
            </p>
            {candidate.note && <p>Записка: {candidate.note}</p>}
            {candidate.status === 'accepted' ? (
              <p>
                <strong>Обрано виконавцем</strong>
              </p>
            ) : confirming?.applicationId === candidate.id ? (
              <div role="group" aria-label={`Підтвердження вибору: ${candidate.student.displayName}`}>
                <p>
                  Обрати {candidate.student.displayName} виконавцем і зарезервувати {formatUah(priceKopecks)}?
                </p>
                <button type="button" disabled={assign.isPending} onClick={confirmSelect}>
                  Підтвердити вибір
                </button>{' '}
                <button type="button" disabled={assign.isPending} onClick={() => setConfirming(null)}>
                  Скасувати
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={!canSelect || candidate.status !== 'sent' || assign.isPending}
                onClick={() => setConfirming({ applicationId: candidate.id, key: newIdempotencyKey() })}
              >
                Обрати виконавцем
              </button>
            )}
          </article>
        </li>
      ))}
    </ul>
      {errorCode && (
        <p role="alert">
          {messageFor(errorCode)} {errorCode === 'INSUFFICIENT_FUNDS' && <Link to="/c/balance">Поповнити баланс</Link>}
        </p>
      )}
    </>
  );
}
