import { countCharacters, LIMITS, MESSAGES_UK, updateProfileSchema } from '@ctoc/shared';
import { useState, type FormEvent } from 'react';
import { ApiClientError } from '../../../lib/api';
import { saveBio } from '../queries/bio';

const messageFor = (code: string): string =>
  code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : ((MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.INTERNAL_ERROR);

/**
 * US-11: the «Про мене» text. A live counter counts Unicode code points like the server and the database
 * do. Over the limit the error shows at once and saving is blocked; the text itself is never cut off.
 */
export function BioForm({ initialBio }: { initialBio: string }) {
  const [bio, setBio] = useState(initialBio);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const length = countCharacters(bio);
  const tooLong = length > LIMITS.bioMax;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setServerError(null);
    // The same rule as the server (shared schema).
    if (!updateProfileSchema.safeParse({ bio }).success) return;
    setSaving(true);
    try {
      const result = await saveBio(bio);
      setBio(result.bio);
      setSaved(true);
    } catch (error) {
      setServerError(messageFor(error instanceof ApiClientError ? error.code : 'UNKNOWN_ERROR'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Біографія профілю">
      <p>
        <label htmlFor="bio">Про мене</label>
        <textarea
          id="bio"
          rows={6}
          value={bio}
          onChange={(event) => {
            setBio(event.target.value);
            setSaved(false);
            setServerError(null);
          }}
          aria-invalid={tooLong}
          aria-describedby="bio-counter bio-error"
        />
      </p>
      <p id="bio-counter">
        {length} / {LIMITS.bioMax}
      </p>
      <p id="bio-error" role="alert">
        {tooLong ? MESSAGES_UK.BIO_TOO_LONG : serverError}
      </p>
      <button type="submit" disabled={saving}>
        Зберегти
      </button>
      {saved && <p role="status">Зміни збережено.</p>}
    </form>
  );
}
