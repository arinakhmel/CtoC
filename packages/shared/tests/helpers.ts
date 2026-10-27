import type { ZodTypeAny } from 'zod';

/** Error codes reported by a schema (every schema in this package uses error codes as messages). */
export function codesOf(schema: ZodTypeAny, input: unknown): string[] {
  const result = schema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

/** Field paths that failed validation. */
export function fieldsOf(schema: ZodTypeAny, input: unknown): string[] {
  const result = schema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}
