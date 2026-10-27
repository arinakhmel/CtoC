import type { ApiErrorBody, ErrorCode } from '@ctoc/shared';

/** Base URL of the API as the browser sees it. In development Vite proxies `/api` to the API. */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '/api';

/** A failed API call. The UI keys its behaviour and text on `code`, not on `message` (api.md §2). */
export class ApiClientError extends Error {
  readonly status: number;
  readonly code: ErrorCode | 'NETWORK_ERROR' | 'UNKNOWN_ERROR';
  readonly details: NonNullable<ApiErrorBody['error']['details']>;

  constructor(
    status: number,
    code: ApiClientError['code'],
    message: string,
    details: ApiClientError['details'] = [],
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const isErrorBody = (value: unknown): value is ApiErrorBody =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as ApiErrorBody).error === 'object' &&
  typeof (value as ApiErrorBody).error?.code === 'string';

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    });
  } catch {
    throw new ApiClientError(0, 'NETWORK_ERROR', 'Network error');
  }

  const text = await response.text();
  const body: unknown = text ? safeJson(text) : undefined;

  if (!response.ok) {
    if (isErrorBody(body)) {
      throw new ApiClientError(response.status, body.error.code, body.error.message, body.error.details);
    }
    throw new ApiClientError(response.status, 'UNKNOWN_ERROR', response.statusText);
  }
  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export const apiPost = <T>(path: string, data: unknown) =>
  apiFetch<T>(path, { method: 'POST', body: JSON.stringify(data) });
