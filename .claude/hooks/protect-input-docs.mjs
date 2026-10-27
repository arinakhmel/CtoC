#!/usr/bin/env node
// PreToolUse hook for Edit|MultiEdit|Write. Blocks changes to the input documents (exit code 2).
// No dependencies. Reads the tool call as JSON from stdin.
import { relative, resolve, sep } from 'node:path';

// Input documents, as paths relative to the project root (glob: * matches inside one folder level).
const PROTECTED = [/^docs\/project_context\.md$/, /^docs\/US-[^/]*\.md$/];

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  let filePath;
  try {
    filePath = JSON.parse(raw)?.tool_input?.file_path;
  } catch {
    process.exit(0); // not our input: never block on a parse problem
  }
  if (typeof filePath !== 'string' || filePath === '') process.exit(0);

  const root = resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
  const relativePath = relative(root, resolve(root, filePath)).split(sep).join('/');

  if (PROTECTED.some((pattern) => pattern.test(relativePath))) {
    process.stderr.write(
      `Blocked: ${relativePath} is an input document and read-only; record problems under "Open questions" in docs/architecture/overview.md instead.\n`,
    );
    process.exit(2);
  }
  process.exit(0);
});
