import { createTaskSchema, MESSAGES_UK } from '@ctoc/shared';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiClientError } from '../../../lib/api';
import { createTask } from '../queries/createTask';

type Field = 'title' | 'description' | 'priceKopecks' | 'deadlineAt';
type Errors = Partial<Record<Field, string>>;

const FIELDS: Field[] = ['title', 'description', 'priceKopecks', 'deadlineAt'];
const messageOf = (code: string): string => (MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.VALIDATION_FAILED;
const generalMessage = (code: string): string =>
  code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : ((MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.INTERNAL_ERROR);

/** The form shows UAH; the API takes integer kopecks. Not a number gives NaN, which the schema rejects. */
const toKopecks = (uah: string): number => (uah.trim() === '' ? Number.NaN : Math.round(Number(uah.replace(',', '.')) * 100));
const toIso = (local: string): string => {
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};

/**
 * US-16: the four required fields and nothing else. The shared schema validates before sending, so an invalid
 * field is marked at once (aria-invalid, red by CSS) and no request leaves. The server answers are mapped to the
 * same fields through `details`.
 */
export function TaskForm() {
  const navigate = useNavigate();
  const [values, setValues] = useState({ title: '', description: '', price: '', deadline: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const set = (key: keyof typeof values) => (event: { target: { value: string } }) => {
    setValues((current) => ({ ...current, [key]: event.target.value }));
    setSent(false);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setGeneral(null);
    setNeedsConfirm(false);
    setSent(false);
    const payload = {
      title: values.title,
      description: values.description,
      priceKopecks: toKopecks(values.price),
      deadlineAt: toIso(values.deadline),
    };
    const parsed = createTaskSchema.safeParse(payload);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as Field;
        if (!next[field]) next[field] = messageOf(issue.message);
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setSending(true);
    try {
      await createTask(parsed.data);
      setValues({ title: '', description: '', price: '', deadline: '' });
      setSent(true);
    } catch (error) {
      const code = error instanceof ApiClientError ? error.code : 'UNKNOWN_ERROR';
      if (code === 'AUTH_REQUIRED') {
        navigate('/login', { replace: true });
        return;
      }
      const next: Errors = {};
      if (error instanceof ApiClientError) {
        for (const detail of error.details) {
          if ((FIELDS as string[]).includes(detail.field)) next[detail.field as Field] = messageOf(detail.code);
        }
      }
      setErrors(next);
      if (Object.keys(next).length === 0) setGeneral(generalMessage(code));
      setNeedsConfirm(code === 'EMAIL_NOT_CONFIRMED');
    } finally {
      setSending(false);
    }
  };

  const fieldProps = (field: Field) => ({
    'aria-invalid': Boolean(errors[field]),
    'aria-describedby': `${field}-error`,
  });

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Нове завдання">
      <p>
        <label htmlFor="title">Назва</label>
        <input id="title" type="text" value={values.title} onChange={set('title')} {...fieldProps('title')} />
      </p>
      <p id="title-error" role="alert">{errors.title}</p>

      <p>
        <label htmlFor="description">Опис</label>
        <textarea id="description" rows={6} value={values.description} onChange={set('description')} {...fieldProps('description')} />
      </p>
      <p id="description-error" role="alert">{errors.description}</p>

      <p>
        <label htmlFor="price">Ціна, грн</label>
        <input id="price" type="number" min={0} step="0.01" inputMode="decimal" value={values.price} onChange={set('price')} {...fieldProps('priceKopecks')} aria-describedby="priceKopecks-error" />
      </p>
      <p id="priceKopecks-error" role="alert">{errors.priceKopecks}</p>

      <p>
        <label htmlFor="deadline">Строк виконання</label>
        <input id="deadline" type="datetime-local" value={values.deadline} onChange={set('deadline')} {...fieldProps('deadlineAt')} aria-describedby="deadlineAt-error" />
      </p>
      <p id="deadlineAt-error" role="alert">{errors.deadlineAt}</p>

      <p role="alert">
        {general}{' '}
        {needsConfirm && <Link to="/confirm-email">Підтвердити пошту</Link>}
      </p>
      <button type="submit" disabled={sending}>
        Опублікувати на перевірку
      </button>
      {sent && <p role="status">Завдання надіслано на модерацію.</p>}
    </form>
  );
}
