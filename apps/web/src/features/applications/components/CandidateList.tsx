import { APPLICATION_STATUS_UK } from '@ctoc/shared';
import { Link } from 'react-router-dom';
import type { Candidate } from '../queries/candidates';

/**
 * US-24. The applicants of a task. Each name is a plain link to the public profile /u/:userId (sc.1): it opens as a page,
 * not a dialog or a new window, so on a phone it fills the screen (sc.3). The badge shows only when the student is
 * verified now (sc.2, INV-03).
 */
export function CandidateList({ candidates }: { candidates: Candidate[] }) {
  if (candidates.length === 0) return <p role="status">Відгуків поки немає.</p>;

  return (
    <ul aria-label="Відгуки студентів">
      {candidates.map((candidate) => (
        <li key={candidate.id}>
          <article aria-labelledby={`candidate-${candidate.id}`}>
            <h3 id={`candidate-${candidate.id}`}>
              <Link to={`/u/${candidate.student.id}`}>{candidate.student.displayName}</Link>
            </h3>
            {candidate.student.verified && <p className="badge badge-verified">Верифікований студент</p>}
            {candidate.student.skills.length > 0 && (
              <ul aria-label="Навички" className="skills">
                {candidate.student.skills.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            )}
            <p>
              Статус відгуку: <strong>{APPLICATION_STATUS_UK[candidate.status]}</strong>
            </p>
            {candidate.note && <p>Записка: {candidate.note}</p>}
          </article>
        </li>
      ))}
    </ul>
  );
}
