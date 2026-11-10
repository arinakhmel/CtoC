import { MESSAGES_UK } from '@ctoc/shared';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiClientError } from '../../../lib/api';
import type { PageConfig } from '../../../routes.config';
import { getProfile, type PublicProfile } from '../queries/profile';

type State = { kind: 'loading' } | { kind: 'ready'; profile: PublicProfile['profile'] } | { kind: 'failed'; message: string };

/** /u/:userId: the public student profile (US-09). Skills, bio and experience come with US-10, 11, 37, 38. */
export function ProfilePage({ page }: { page: PageConfig }) {
  const { userId = '' } = useParams();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let active = true;
    setState({ kind: 'loading' });
    getProfile(userId).then(
      (result) => active && setState({ kind: 'ready', profile: result.profile }),
      (error: unknown) => {
        if (!active) return;
        const notFound = error instanceof ApiClientError && error.code === 'NOT_FOUND';
        setState({
          kind: 'failed',
          message: notFound ? 'Профіль не знайдено' : error instanceof ApiClientError && error.code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : MESSAGES_UK.INTERNAL_ERROR,
        });
      },
    );
    return () => {
      active = false;
    };
  }, [userId]);

  if (state.kind === 'ready') {
    return (
      <article aria-labelledby="profile-name">
        <header>
          <h1 id="profile-name">{state.profile.displayName}</h1>
          {state.profile.verified && <p className="badge badge-verified">Верифікований студент</p>}
        </header>
        <p>
          <Link to="/">All pages</Link>
        </p>
      </article>
    );
  }

  return (
    <article aria-labelledby="page-title">
      <h1 id="page-title">{state.kind === 'failed' ? state.message : page.title}</h1>
      {state.kind === 'loading' && <p role="status">Завантаження…</p>}
      <p>
        <Link to="/">All pages</Link>
      </p>
    </article>
  );
}
