import type { TeamLoginAccount } from '@ctoc/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, apiPost, ApiClientError } from '../../../lib/api';
import { markLoggedIn } from '../../../lib/queryClient';
import type { SessionUser } from '../queries/login';
import { ME_KEY } from '../queries/session';
import './TeamLogin.css';

const HOME_BY_ROLE: Record<SessionUser['user']['role'], string> = { student: '/feed', customer: '/c/tasks', moderator: '/mod/verifications' };

const ACCOUNTS: { id: TeamLoginAccount; label: string; hint: string }[] = [
  { id: 'student', label: 'Студент', hint: 'стрічка, відгуки, робота' },
  { id: 'customer', label: 'Замовник', hint: 'завдання, кандидати, баланс' },
  { id: 'moderator', label: 'Модератор', hint: 'черги, документи, виплати' },
];

const errorText = (error: unknown): string => {
  if (!(error instanceof ApiClientError)) return 'Щось пішло не так. Спробуйте ще раз.';
  if (error.code === 'INVALID_CREDENTIALS') return 'Код не підходить.';
  if (error.code === 'RATE_LIMITED') return 'Забагато спроб. Зачекайте 15 хвилин.';
  if (error.code === 'NOT_FOUND') return 'Цього демо-акаунта немає на сервері.';
  if (error.code === 'NETWORK_ERROR') return 'Немає зв’язку із сервером.';
  return 'Щось пішло не так. Спробуйте ще раз.';
};

/**
 * ADR-0010: «Для команди». A «?» under the login form, shown only when the server has a team code. The code is checked by the
 * server (it is never in this code); after a right code the three demo accounts open with one tap.
 */
export function TeamLogin() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: ['team-login'],
    queryFn: () => apiFetch<{ enabled?: boolean }>('/auth/team-login'),
    meta: { silent: true },
    retry: false,
  });
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status.data?.enabled !== true) return null;

  const check = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiPost<void>('/auth/team-login/check', { code });
      setAccepted(true);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  const enter = async (account: TeamLoginAccount) => {
    setError(null);
    setBusy(true);
    try {
      const { user } = await apiPost<SessionUser>('/auth/team-login', { code, account });
      markLoggedIn(queryClient);
      await queryClient.invalidateQueries({ queryKey: ME_KEY });
      navigate(HOME_BY_ROLE[user.role]);
    } catch (failure) {
      setError(errorText(failure));
      setBusy(false);
    }
  };

  return (
    <section className="team-login" aria-labelledby="team-login-title">
      <button type="button" className="team-login__toggle" aria-expanded={open} aria-controls="team-login-body" onClick={() => setOpen((value) => !value)}>
        <span className="team-login__q" aria-hidden="true">
          ?
        </span>
        <span id="team-login-title">Для команди</span>
      </button>
      {open && (
        <div id="team-login-body" className="team-login__body">
          {!accepted ? (
            <form onSubmit={check} aria-label="Код команди" className="team-login__form">
              <label htmlFor="team-code">Код команди</label>
              <span className="team-login__row">
                <input id="team-code" type="password" inputMode="numeric" autoComplete="off" value={code} onChange={(event) => setCode(event.target.value)} />
                <button type="submit" disabled={busy || code.trim() === ''}>
                  Відкрити
                </button>
              </span>
            </form>
          ) : (
            <div className="team-login__accounts" role="group" aria-label="Демо-акаунти">
              {ACCOUNTS.map((account) => (
                <button key={account.id} type="button" disabled={busy} onClick={() => enter(account.id)}>
                  <strong>{account.label}</strong>
                  <span>{account.hint}</span>
                </button>
              ))}
            </div>
          )}
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </section>
  );
}
