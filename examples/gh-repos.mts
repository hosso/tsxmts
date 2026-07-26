#!/usr/bin/env -S npx tsxmts
// Run: ./gh-repos.mts sindresorhus --limit 5
//
// A little "look up someone's most-starred GitHub repos" tool — the kind of
// thing you'd write once, chmod +x, and keep around. Two npm packages, one
// GitHub API call, zero setup.
import path from 'node:path';
import columnify from 'npm:columnify@^1.6.0';
import minimist from 'npm:minimist@^1.2.8';

interface Repo {
  name: string;
  description: string | null;
  stargazers_count: number;
}

const argv = minimist(process.argv.slice(2), {
  alias: { h: 'help', n: 'limit' },
  default: { limit: 10 },
});

const [username] = argv._;
if (!username || argv.help) {
  const command = path.basename(process.argv[1]);
  console.log(`Usage: ${command} <github-username> [--limit N]`);
  process.exit(argv.help ? 0 : 1);
}

const res = await fetch(
  `https://api.github.com/users/${username}/repos?per_page=100`,
);
if (!res.ok) {
  console.error(`GitHub API error: ${res.status} ${res.statusText}`);
  process.exit(1);
}

const repos = (await res.json()) as Repo[];

const top = repos
  .sort((a, b) => b.stargazers_count - a.stargazers_count)
  .slice(0, argv.limit)
  .map((r) => ({
    name: r.name,
    stars: r.stargazers_count,
    description: r.description ?? '',
  }));

console.log(columnify(top, { columns: ['name', 'stars', 'description'] }));
