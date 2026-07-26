#!/usr/bin/env -S npx tsxmts
// Run: ./qr.mts "https://example.com"
//
// Prints a scannable QR code for any string, right in the terminal. The
// simplest possible shape for a `tsxmts` script: one npm dependency, argument
// parsing, and a usage message — chmod +x and it behaves like any other CLI.
import path from 'node:path';
import minimist from 'npm:minimist@^1.2.8';
import qrcode from 'npm:qrcode-terminal@^0.12.0';

function usage() {
  const command = path.basename(process.argv[1]);
  console.log(
    [
      `Usage: ${command} <text>`,
      '',
      'Print a QR code for <text> to the terminal.',
      '',
      'Options:',
      '  -h, --help   Show this help message',
    ].join('\n'),
  );
}

const argv = minimist(process.argv.slice(2), {
  alias: { h: 'help' },
});

const [text] = argv._;
if (!text || argv.help) {
  usage();
  process.exit(argv.help ? 0 : 1);
}

qrcode.generate(text, { small: true });
