import { MESSAGES_UK, TASK_STATUS_UK } from '@ctoc/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiClientError } from '../../../lib/api';
import { formatDeadline, formatUah } from '../../../lib/money';
import type { PageConfig } from '../../../routes.config';
import { useDeleteTask, useMyTasks, type MyTask } from '../queries/myTasks';

const messageFor = (code: string): string =>
  code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : ((MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.INTERNAL_ERROR);

/** The owner may delete a task only before an executor is chosen (INV-13, A-08): while it is on moderation or published. */
const DELETABLE = ['pending_moderation', 'published'];

/** One task of the list: its terms, its status, the number of applications of a published task, the way to manage it and the delete. */
function TaskItem({ task }: { task: MyTask }) {
  const [confirming, setConfirming] = useState(false);
  const remove = useDeleteTask();
  const deleteError = remove.error instanceof ApiClientError ? remove.error.code : remove.isError ? 'UNKNOWN_ERROR' : null;

  return (
    <li>
      <article aria-labelledby={`my-task-${task.id}`}>
        <h2 id={`my-task-${task.id}`}>{task.title}</h2>
        <p>
          Статус: <strong>{TASK_STATUS_UK[task.status]}</strong>
        </p>
        <p>Фіксована ціна: {formatUah(task.priceKopecks)}</p>
        <p>
          Виконати до: <time dateTime={task.deadlineAt}>{formatDeadline(task.deadlineAt)}</time>
        </p>
        {task.status === 'published' && <p>Відгуків: {task.applicationsCount}</p>}
        <p>
          <Link to={`/c/tasks/${task.id}`}>Керувати</Link>
        </p>

        {DELETABLE.includes(task.status) && !confirming && (
          <button type="button" onClick={() => setConfirming(true)}>
            Видалити
          </button>
        )}
        {DELETABLE.includes(task.status) && confirming && (
          <p role="group" aria-label={`Підтвердження видалення «${task.title}»`}>
            Видалити завдання? Відгуки студентів буде відхилено.{' '}
            <button type="button" onClick={() => remove.mutate(task.id, { onSettled: () => setConfirming(false) })} disabled={remove.isPending}>
              Підтвердити видалення
            </button>{' '}
            <button type="button" onClick={() => setConfirming(false)} disabled={remove.isPending}>
              Не видаляти
            </button>
          </p>
        )}
        {deleteError && deleteError !== 'AUTH_REQUIRED' && <p role="alert">{messageFor(deleteError)}</p>}
      </article>
    </li>
  );
}

/** /c/tasks: US-50. «Мої завдання»: all tasks of the customer with status, price, deadline, the applications of a published one, delete, and the empty state. */
export function MyTasksPage({ page }: { page: PageConfig }) {
  const navigate = useNavigate();
  const tasks = useMyTasks();

  const errorCode = tasks.isError ? (tasks.error instanceof ApiClientError ? tasks.error.code : 'UNKNOWN_ERROR') : null;

  useEffect(() => {
    if (errorCode === 'AUTH_REQUIRED') navigate('/login', { replace: true });
  }, [errorCode, navigate]);

  return (
    <article aria-labelledby="page-title">
      <h1 id="page-title">{page.title}</h1>

      {errorCode && errorCode !== 'AUTH_REQUIRED' && (
        <p role="alert">
          {messageFor(errorCode)} {errorCode === 'EMAIL_NOT_CONFIRMED' && <Link to="/confirm-email">Підтвердити пошту</Link>}
        </p>
      )}

      {tasks.isPending && <p role="status">Завантаження…</p>}

      {tasks.isSuccess && tasks.data.length === 0 && (
        <p role="status">
          У вас ще немає завдань. <Link to="/c/tasks/new">Створити завдання</Link>
        </p>
      )}

      {tasks.isSuccess && tasks.data.length > 0 && (
        <>
          <p>
            <Link to="/c/tasks/new">Нове завдання</Link>
          </p>
          <ul aria-label="Список завдань">
            {tasks.data.map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
          </ul>
        </>
      )}
    </article>
  );
}
