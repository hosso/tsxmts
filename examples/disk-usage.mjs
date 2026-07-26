#!/usr/bin/env -S npx -y tsxmts
// Run: ./disk-usage.mjs ~/Downloads
//
// A colored bar chart of the biggest subdirectories under a path, built on
// `du` + two npm packages. Plain .mjs — no TypeScript needed, same pipeline.
import { execa } from 'npm:execa@^9.3.0';
import pc from 'npm:picocolors@^1.1.1';

const target = process.argv[2] ?? '.';

const { stdout } = await execa('du', ['-k', '-d', '1', target]);

const rows = stdout
  .trim()
  .split('\n')
  .map((line) => {
    const [kb, ...pathParts] = line.split('\t');
    return { kb: Number(kb), path: pathParts.join('\t') };
  })
  .sort((a, b) => b.kb - a.kb)
  .slice(0, 10);

const maxKb = rows[0]?.kb ?? 1;
const bar = (kb) => '█'.repeat(Math.max(1, Math.round((kb / maxKb) * 30)));

for (const { kb, path } of rows) {
  const mb = (kb / 1024).toFixed(1).padStart(8);
  console.log(`${pc.cyan(bar(kb).padEnd(30))} ${pc.bold(`${mb} MB`)}  ${path}`);
}
