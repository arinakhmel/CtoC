import type { PageConfig } from '../../../routes.config';
import { TaskForm } from '../components/TaskForm';

/** /c/tasks/new: US-16 (and US-17, the price field). A customer posts a task for moderation. */
export function NewTaskPage({ page }: { page: PageConfig }) {
  return (
    <article aria-labelledby="page-title">
      <h1 id="page-title">{page.title}</h1>
      <TaskForm />
    </article>
  );
}
