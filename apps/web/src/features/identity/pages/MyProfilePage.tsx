import { LIMITS, MESSAGES_UK, skillSchema } from '@ctoc/shared';
import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiClientError } from '../../../lib/api';
import type { PageConfig } from '../../../routes.config';
import { BioForm } from '../components/BioForm';
import { getMyProfile, saveSkills, suggestSkills } from '../queries/skills';

const messageFor = (code: string): string =>
  code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : ((MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.INTERNAL_ERROR);

const codeOf = (error: unknown): string => (error instanceof ApiClientError ? error.code : 'UNKNOWN_ERROR');

/** /me/profile: US-10. A student edits the skills of the public profile. Bio comes with US-11. */
export function MyProfilePage({ page }: { page: PageConfig }) {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [userId, setUserId] = useState('');
  const [verified, setVerified] = useState(false);
  const [skills, setSkills] = useState<string[]>([]);
  const [bio, setBio] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    getMyProfile().then(
      (mine) => {
        if (!active) return;
        setUserId(mine.userId);
        setVerified(mine.verified);
        setSkills(mine.skills);
        setBio(mine.bio);
        setLoaded(true);
        suggestSkills().then(
          (result) => active && setSuggestions(result.skills),
          () => undefined, // suggestions are optional
        );
      },
      (error: unknown) => {
        if (!active) return;
        setLoadError(messageFor(codeOf(error)));
        setLoaded(true);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const changed = (next: string[]) => {
    setSkills(next);
    setSaved(false);
    setFormError(null);
  };

  /** The same rules as the server (shared): not empty, at most 40 characters, at most 20 skills, no duplicates. */
  const addSkill = () => {
    setFieldError(null);
    const parsed = skillSchema.safeParse(input);
    if (!parsed.success) {
      setFieldError(messageFor(parsed.error.issues[0]?.message ?? 'VALIDATION_FAILED'));
      return;
    }
    const name = parsed.data;
    if (skills.some((skill) => skill.toLowerCase() === name.toLowerCase())) {
      setInput('');
      return;
    }
    if (skills.length >= LIMITS.skillsMax) {
      setFieldError(messageFor('SKILLS_LIMIT'));
      return;
    }
    changed([...skills, name]);
    setInput('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault(); // Enter adds the skill, it does not save the form
      addSkill();
    }
  };

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const result = await saveSkills(skills);
      setSkills(result.skills);
      setSaved(true);
    } catch (error) {
      setFormError(messageFor(codeOf(error)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <article aria-labelledby="page-title">
      <h1 id="page-title">{page.title}</h1>
      {/* INV-03: the badge follows studentVerifiedAt only (the profile body's `verified`), never the role. */}
      {verified && <p className="badge badge-verified">Верифікований студент</p>}

      {loadError && (
        <p role="alert">
          {loadError} <Link to="/login">Увійти</Link>
        </p>
      )}

      {loaded && !loadError && (
        <>
        <form onSubmit={onSave} noValidate aria-label="Навички профілю">
          <p className="field-row">
            <label htmlFor="skill">Навичка</label>
            <input
              id="skill"
              list="skill-suggestions"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onKeyDown}
              aria-describedby="skill-error"
              aria-invalid={fieldError !== null}
            />
            <datalist id="skill-suggestions">
              {suggestions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <button type="button" onClick={addSkill}>
              Додати
            </button>
          </p>
          <p id="skill-error" role="alert">
            {fieldError}
          </p>

          <ul className="chips" aria-label="Ваші навички">
            {skills.map((name) => (
              <li key={name.toLowerCase()}>
                {name}{' '}
                <button type="button" onClick={() => changed(skills.filter((skill) => skill !== name))} aria-label={`Видалити навичку ${name}`}>
                  Видалити
                </button>
              </li>
            ))}
          </ul>
          <p>
            {skills.length} з {LIMITS.skillsMax}
          </p>

          {formError && <p role="alert">{formError}</p>}
          <button type="submit" disabled={saving}>
            Зберегти зміни
          </button>
          {saved && (
            <p role="status">
              Зміни збережено. <Link to={`/u/${userId}`}>Мій публічний профіль</Link>
            </p>
          )}
        </form>
        <BioForm initialBio={bio} />
        </>
      )}

      <p>
        <Link to="/">All pages</Link>
      </p>
    </article>
  );
}
