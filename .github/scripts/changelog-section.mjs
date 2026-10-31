/*
  Prints the section of CHANGELOG.md for one version, without its heading.
  Fails if there is no section, or if the section is empty.

    node .github/scripts/changelog-section.mjs 0.1.0
*/
import { readFileSync } from 'node:fs';

const version = (process.argv[2] ?? '').replace(/^v/, '');
const lines = readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8').split('\n');
const start = lines.findIndex((l) => l.trim() === `## ${version}`);
if (!version || start < 0) {
  console.error(`CHANGELOG.md has no "## ${version}" section`);
  process.exit(1);
}
const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
const body = lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
if (!body) {
  console.error(`the "## ${version}" section of CHANGELOG.md is empty`);
  process.exit(1);
}
console.log(body);
