/** Where story links point to. Override with VITE_DOCS_BASE_URL in .env. */
export const DOCS_BASE_URL: string =
  import.meta.env.VITE_DOCS_BASE_URL ?? 'https://github.com/arinakhmel/CtoC/blob/main/docs';

/** All stories live in one file; the story id is the link text. */
export const storiesUrl = (): string => `${DOCS_BASE_URL}/requirements.md`;
