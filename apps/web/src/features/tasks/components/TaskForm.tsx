import { zodResolver } from '@hookform/resolvers/zod';
import { createTaskSchema, MESSAGES_UK, type CreateTaskInput } from '@ctoc/shared';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { ApiClientError } from '../../../lib/api';
import { createTask } from '../queries/createTask';
import { StarHint } from '../../../ui/StarHint';

type FormValues = CreateTaskInput;
const FIELDS: (keyof FormValues)[] = ['title', 'description', 'priceKopecks', 'deadlineAt'];

/** Message for a validation code coming from the shared schema (its zod messages are error codes). */
const messageFor = (code: string | undefined): string | undefined =>
  code ? ((MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.VALIDATION_FAILED) : undefined;

/** The form shows UAH; the API takes integer kopecks. Not a number gives NaN, which the schema rejects. */
const uahToKopecks = (uah: string): number => (uah.trim() === '' ? Number.NaN : Math.round(Number(uah.replace(',', '.')) * 100));
/** `datetime-local` gives local time without a zone; the API wants an ISO instant. Unparseable gives '', which the schema rejects. */
const localToIso = (local: string): string => {
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};

/** `datetime-local` text for a moment `days` from now at 18:00 local time. */
const localInDays = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(18, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/** Quick deadlines under the date field. */
const DEADLINE_PRESETS = [
  { days: 3, label: 'Через 3 дні' },
  { days: 7, label: 'Через тиждень' },
  { days: 14, label: 'Через 2 тижні' },
];

/**
 * US-16: the four required fields and nothing else. react-hook-form validates with the shared schema, so an
 * invalid field is marked at once (aria-invalid, red by CSS) and no request leaves. Server answers are mapped
 * to the same fields through `details`. The price and the deadline are converted when the value is read.
 */
export function TaskForm() {
  const navigate = useNavigate();
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: { title: '', description: '' },
  });

  const clearSent = { onChange: () => setSent(false) };
  const deadlineRef = useRef<HTMLInputElement | null>(null);
  const deadlineField = register('deadlineAt', { ...clearSent, setValueAs: localToIso });

  /** A preset fills the field: the form keeps the ISO instant, the input shows the local date and time. */
  const pickDeadline = (days: number) => {
    const local = localInDays(days);
    setValue('deadlineAt', localToIso(local), { shouldValidate: true });
    if (deadlineRef.current) deadlineRef.current.value = local;
    setSent(false);
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setNeedsConfirm(false);
    setSent(false);
    try {
      await createTask(values);
      reset();
      setSent(true);
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'AUTH_REQUIRED') {
        navigate('/login', { replace: true });
        return;
      }
      if (!(error instanceof ApiClientError)) {
        setFormError(MESSAGES_UK.INTERNAL_ERROR);
        return;
      }
      let mapped = 0;
      for (const detail of error.details) {
        const field = FIELDS.find((name) => name === detail.field);
        if (field) {
          setError(field, { type: 'server', message: messageFor(detail.code) });
          mapped += 1;
        }
      }
      if (mapped === 0) {
        setFormError(error.code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : (messageFor(error.code) ?? MESSAGES_UK.INTERNAL_ERROR));
      }
      setNeedsConfirm(error.code === 'EMAIL_NOT_CONFIRMED');
    }
  });

  const fieldMessage = (name: keyof FormValues) => {
    const error = errors[name];
    return error?.type === 'server' ? error.message : messageFor(error?.message);
  };

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Нове завдання">
      <p>
        <label htmlFor="title">Назва</label>
        <input id="title" type="text" aria-invalid={!!errors.title} aria-describedby="title-error" {...register('title', clearSent)} />
        <span id="title-error" role="alert">
          {fieldMessage('title')}
        </span>
      </p>
      <StarHint label="Приклад назви">
        <p>«Telegram-бот для запису клієнтів у барбершоп»</p>
        <p>Коротко й конкретно: що зробити і для кого. Без «терміново» та знаків оклику.</p>
      </StarHint>
      <p>
        <label htmlFor="description">Опис</label>
        <textarea id="description" rows={6} aria-invalid={!!errors.description} aria-describedby="description-error" {...register('description', clearSent)} />
        <span id="description-error" role="alert">
          {fieldMessage('description')}
        </span>
      </p>
      <StarHint label="Приклад опису">
        <p>
          Потрібен бот у Telegram, через який клієнти записуються на стрижку. Клієнт обирає майстра, день і вільний час; адміністратор отримує повідомлення про
          новий запис.
        </p>
        <p>Що віддати: код на GitHub, коротку інструкцію запуску. Стек: Python (aiogram), дані можна тримати в SQLite.</p>
        <p>Що вже є: список майстрів і робочі години, дамо в таблиці.</p>
      </StarHint>
      <p>
        <label htmlFor="price">Ціна, грн</label>
        <span className="input-suffix" data-suffix="грн">
          <input
            id="price"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            aria-invalid={!!errors.priceKopecks}
            aria-describedby="price-error"
            {...register('priceKopecks', { ...clearSent, setValueAs: uahToKopecks })}
          />
        </span>
        <span id="price-error" role="alert">
          {fieldMessage('priceKopecks')}
        </span>
      </p>
      <p>
        <label htmlFor="deadline">Строк виконання</label>
        <input
          id="deadline"
          type="datetime-local"
          aria-invalid={!!errors.deadlineAt}
          aria-describedby="deadline-error"
          {...deadlineField}
          ref={(element) => {
            deadlineField.ref(element);
            deadlineRef.current = element;
          }}
        />
        <span className="date-presets" role="group" aria-label="Швидкий вибір строку">
          {DEADLINE_PRESETS.map((preset) => (
            <button key={preset.days} type="button" className="button-quiet" onClick={() => pickDeadline(preset.days)}>
              {preset.label}
            </button>
          ))}
        </span>
        <span id="deadline-error" role="alert">
          {fieldMessage('deadlineAt')}
        </span>
      </p>

      {formError && (
        <p role="alert">
          {formError} {needsConfirm && <Link to="/confirm-email">Підтвердити пошту</Link>}
        </p>
      )}
      <button type="submit" disabled={isSubmitting}>
        Опублікувати на перевірку
      </button>
      {sent && <p role="status">Завдання надіслано на модерацію.</p>}
    </form>
  );
}
