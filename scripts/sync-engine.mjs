// Copia il motore della Scopa dove la Edge Function può importarlo.
// La sorgente resta src/games/scopa/: _shared/ è un artefatto generato.

import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'src', 'games', 'scopa');
const to = join(root, 'supabase', 'functions', '_shared');

const FILES = ['ScopaCards.js', 'ScopaEngine.js', 'ScopaAI.js', 'ScopaMatch.js'];

await mkdir(to, { recursive: true });

for (const file of FILES) {
  await copyFile(join(from, file), join(to, file));
  console.log(`copiato ${file}`);
}

console.log(`\n${FILES.length} file sincronizzati in supabase/functions/_shared/`);
