// Copia il motore della Scopa dove la Edge Function può importarlo.
// La sorgente resta src/games/scopa/: _shared/ è un artefatto generato.

import { copyFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'src', 'games', 'scopa');
const to = join(root, 'supabase', 'functions', '_shared');

// Whitelist esplicito dei moduli da copiare, non una scansione della cartella.
// src/games/scopa/ contiene anche ScopaView.js (pesante, con accesso al DOM)
// e future task aggiungono moduli controller. Copiare tutto porterebbe roba non voluta
// nel bundle Deno. Questo whitelist è deliberato.
const FILES = ['ScopaCards.js', 'ScopaEngine.js', 'ScopaAI.js', 'ScopaMatch.js'];

await mkdir(to, { recursive: true });

// Rimuovi i file .js stantii prima di copiare la versione fresca.
// Questo previene che una rinomina di modulo lasci il vecchio nome su disco.
try {
  const existing = await readdir(to);
  for (const file of existing) {
    if (file.endsWith('.js')) {
      await unlink(join(to, file));
      console.log(`rimosso ${file}`);
    }
  }
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}

for (const file of FILES) {
  await copyFile(join(from, file), join(to, file));
  console.log(`copiato ${file}`);
}

console.log(`\n${FILES.length} file sincronizzati in supabase/functions/_shared/`);
