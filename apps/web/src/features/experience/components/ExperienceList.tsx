import { EXPERIENCE_CONFIRMED_LABEL_UK } from '@ctoc/shared';
import { formatDate } from '../../../lib/money';

export interface ExperienceRecord {
  id: string;
  title: string;
  description: string;
  completedAt: string;
  confirmedBy: 'platform';
}

/**
 * US-37, US-38. The section «Досвід / Резюме» of a student profile: every finished task with its title, its description (the
 * «обсяг» of US-37, W-15) and the completion date, newest first as the API sends them, each marked «Підтверджено платформою CtoC».
 * Read only on every page: a record is created by the platform when a customer accepts the result, and there is nothing here
 * to add, edit or delete one (US-38 sc.2).
 */
export function ExperienceList({ records, emptyText }: { records: ExperienceRecord[]; emptyText: string }) {
  return (
    <section aria-labelledby="experience-title">
      <h2 id="experience-title">Досвід / Резюме</h2>
      {records.length === 0 ? (
        <p>{emptyText}</p>
      ) : (
        <ul aria-label="Досвід / Резюме" className="experience-list">
          {records.map((record) => (
            <li key={record.id}>
              <article aria-labelledby={`experience-${record.id}`}>
                <h3 id={`experience-${record.id}`}>{record.title}</h3>
                <p className="badge badge-verified">{EXPERIENCE_CONFIRMED_LABEL_UK}</p>
                <p className="bio">{record.description}</p>
                <p>
                  Виконано: <time dateTime={record.completedAt}>{formatDate(record.completedAt)}</time>
                </p>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
