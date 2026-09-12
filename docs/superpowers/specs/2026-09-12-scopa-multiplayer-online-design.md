# Scopa — Multiplayer online fra amici

Data: 2026-09-12
Stato: approvato in chat, pronto per il piano di implementazione

## Problema

La sezione "Amici" permette di inviare una sfida, ma la sfida non esiste come
partita. `LobbyView` accetta l'invito, scrive `accepted` sulla riga di
`game_invites` e poi chiama `gameManager.setView('scopa')`, che apre la normale
partita locale contro il computer. I due giocatori finiscono in due partite
separate contro `ScopaAI`, senza alcuno stato condiviso. Nel progetto non esiste
oggi nessuna traccia di multiplayer: nessun canale Realtime di gioco, nessuna
tabella di sessione.

## Obiettivo

Due amici giocano la stessa partita di Scopa, ciascuno dal proprio dispositivo,
con le regole già implementate in `ScopaEngine`. Nessuno dei due deve poter
vedere le carte dell'altro. La partita contro il computer resta invariata.

## Non obiettivi

- Partite a 4 giocatori o a squadre.
- Matchmaking con sconosciuti, classifiche, chat in partita.
- Spettatori.
- Giochi diversi dalla Scopa (`game_type` resta nel modello ma solo `'scopa'`
  è supportato).

## Modello di autorità

Lo stato completo della partita vive esclusivamente nella Edge Function e nel
database. Il browser non riceve mai la mano dell'avversario.

Conseguenza architetturale: **in modalità online il client non esegue il
motore**. Riceve uno snapshot già normalizzato dal punto di vista di chi guarda
("tu" / "avversario") e lo disegna. Non servono seed condivisi né replay del
registro mosse, e i due client non possono divergere perché non calcolano nulla.

Le alternative scartate:

- *Client-authoritative con seed condiviso*: entrambi i browser conoscerebbero
  l'intero ordine del mazzo, quindi le carte dell'avversario sarebbero leggibili
  dalla console. Inaccettabile per un gioco a informazione nascosta.
- *Validazione in PL/pgSQL*: costringerebbe a riscrivere in SQL le regole già
  collaudate (prese obbligatorie, somme, primiera, scope), con due
  implementazioni da tenere allineate.

## Schema database

Il segreto va separato da ciò che è pubblico, perché Realtime rispetta le policy
RLS: se i client non possono leggere una riga non ricevono nemmeno gli eventi di
modifica.

### `game_sessions`

Leggibile dai due partecipanti.

| colonna | tipo | note |
|---|---|---|
| `id` | uuid pk | |
| `player_a` | uuid → profiles | chi ha lanciato la sfida, seat 1 |
| `player_b` | uuid → profiles | chi ha accettato, seat 2 |
| `game_type` | text | `'scopa'` |
| `status` | text | `active` \| `finished` \| `abandoned` |
| `turn_seat` | smallint | 1 o 2 |
| `turn_deadline` | timestamptz | scadenza del turno corrente |
| `public_state` | jsonb | vedi sotto, nessuna mano dentro |
| `version` | int | incrementato a ogni mossa |
| `winner_seat` | smallint | null finché la partita è in corso |
| `created_at`, `updated_at` | timestamptz | |

RLS: `SELECT` se `auth.uid()` è `player_a` o `player_b`. Nessuna policy
`INSERT`/`UPDATE`/`DELETE` per il ruolo `authenticated`: scrive solo il service
role, cioè la Edge Function.

### `game_session_hands`

| colonna | tipo | note |
|---|---|---|
| `session_id` | uuid → game_sessions | |
| `user_id` | uuid → profiles | |
| `seat` | smallint | |
| `hand` | jsonb | le 3 carte in mano |

Chiave primaria `(session_id, user_id)`. RLS: `SELECT` solo se
`auth.uid() = user_id`. Anche qui scrive solo il service role. Le carte di un
giocatore non compaiono mai in una riga che l'avversario possa selezionare.

### `game_session_secrets`

Una riga per sessione, `SELECT` vietato a chiunque tranne il service role.
Contiene `state jsonb`: lo stato completo di `ScopaEngine`, mazzo residuo e
prese comprese.

Separarlo da `game_sessions` evita che una policy sbagliata su quella tabella
esponga il mazzo: `game_sessions` non contiene nulla di segreto.

### `game_invites`

Aggiunta della colonna `session_id uuid` (nullable), così chi ha lanciato la
sfida scopre via Realtime quale partita è stata creata.

## Forma dello snapshot

`public_state` contiene solo informazione che entrambi possono vedere:

```
{
  tableCards: Card[],
  deckCount: number,
  seats: {
    1: { userId, username, captureCount, scope, matchScore },
    2: { userId, username, captureCount, scope, matchScore }
  },
  roundNumber: number,
  lastMove: {
    seat, card, capturedCards, isScopa, dealtNewHands
  } | null,
  roundResult: <roundScoreResult> | null
}
```

Il client compone la propria vista unendo `public_state`, la riga di
`game_session_hands` che gli spetta e il proprio seat:

```
{
  you:      { hand, captureCount, scope, matchScore, username },
  opponent: { handCount, captureCount, scope, matchScore, username },
  tableCards, deckCount, isYourTurn, turnDeadline,
  lastMove, roundResult, status
}
```

`lastMove` è indispensabile. Oggi `playMoveSequence()` calcola la presa **prima**
di applicare la mossa al motore, perché le serve per animare. In online la mossa
è già stata applicata dal server, quindi l'animazione deve essere guidata dal
descrittore che il server restituisce, non ricalcolata in locale.

## Edge Function `scopa`

Una sola funzione, con un campo `action`:

| azione | chi la chiama | effetto |
|---|---|---|
| `create` | chi accetta l'invito | crea sessione, distribuisce, scrive `session_id` sull'invito |
| `state` | entrambi | restituisce la vista del chiamante (usata all'avvio e come fallback) |
| `move` | il giocatore di turno | valida e applica la mossa |
| `timeout` | uno qualsiasi dei due | gioca d'ufficio se il turno è scaduto |
| `concede` | uno qualsiasi dei due | abbandono, vince l'altro |

Flusso di `move`:

1. Il client invia `{ sessionId, cardId, chosenOption }` con il proprio JWT.
2. La funzione risolve l'utente dal JWT e verifica che sia il giocatore indicato
   da `turn_seat`. In caso contrario `403`.
3. Reidrata `ScopaEngine` da `game_session_secrets.state` e chiama
   `playCard(role, cardId, chosenOption)`. Le regole restano quelle esistenti.
4. Se il motore restituisce `error`, risponde `400` e non scrive nulla.
5. Serializza il nuovo stato e scrive, in un'unica RPC atomica:
   `game_session_secrets`, `game_sessions` (nuovo `public_state`, `turn_seat`,
   `turn_deadline`, `version + 1`) e le due righe di `game_session_hands`.
6. Risponde al chiamante con la sua vista aggiornata.

L'atomicità serve perché uno stato scritto a metà (mani nuove, `public_state`
vecchio) produrrebbe una partita incoerente e irrecuperabile.

Controllo di concorrenza: il client invia il `version` che ha in mano; se non
coincide con quello in tabella la funzione risponde `409` e il client si
risincronizza. Evita che un doppio tap invii due volte la stessa mossa.

### Turni scaduti

`turn_deadline` è in tabella. Alla scadenza, uno qualsiasi dei due client chiama
`timeout`; la funzione verifica `now() > turn_deadline` e solo allora gioca al
posto del giocatore di turno usando `ScopaAI`. Se il tempo non è scaduto
risponde `409`. L'autorità resta una sola, e la partita non si blocca se chi
deve giocare chiude l'app.

Il timer locale resta 10 secondi; in online diventa 25, perché su rete mobile
dieci secondi sono pochi.

## Motore condiviso

`ScopaEngine.js`, `ScopaCards.js` e `ScopaAI.js` sono moduli ESM senza
dipendenze esterne, quindi Deno li importa senza modifiche.

Per non avere due copie che divergono, la sorgente resta `src/games/scopa/` e
uno script `npm run sync:engine` le copia in `supabase/functions/_shared/` prima
del deploy. La copia è un artefatto di build, non una seconda sorgente.

Al motore serve una sola aggiunta: `serialize()` / `static deserialize(json)`,
perché oggi lo stato vive solo in memoria. I ruoli interni restano `player` e
`cpu`; il server li mappa su seat 1 e seat 2 e la normalizzazione "tu /
avversario" avviene al confine, quando compone la vista.

## Refactor di `ScopaView`

È la parte più rischiosa: la view legge il motore direttamente in **52 punti**
(`this.engine.`) e nomina il computer in **63** (`cpu`).

Si introduce un'interfaccia sottile:

```
MatchController
  getView()                      -> snapshot normalizzato
  playCard(cardId, chosenOption) -> Promise<void>
  onChange(callback)             -> unsubscribe
  concede()
```

Due implementazioni:

- `LocalMatchController` — avvolge `ScopaEngine` e `ScopaAI`. La partita contro
  il computer deve restare identica: stesse animazioni, stesso timer da 10
  secondi, stessa mossa automatica alla scadenza.
- `OnlineMatchController` — chiama la Edge Function, resta in ascolto su
  Realtime per la sessione, con polling di riserva ogni 3 secondi se il canale
  cade.

`ScopaView` smette di conoscere il motore e disegna soltanto lo snapshot.
Etichette e avatar diventano dati: 🤖 "CPU Master" oppure 👤 con lo username
reale dell'amico.

## Aggancio alla lobby

"Accetta e Gioca" chiama `create`, che crea la sessione e scrive `session_id`
sull'invito. Chi aveva lanciato la sfida lo scopre via Realtime e entra nella
stessa partita. All'avvio, il client chiede se esiste una sessione attiva e la
riprende: chiudere l'app non perde la partita. Un pulsante "Abbandona" chiama
`concede`.

## Gestione degli errori

| situazione | comportamento |
|---|---|
| mossa fuori turno o carta non in mano | `400`, stato invariato, il client si risincronizza |
| `version` disallineato | `409`, il client rilegge lo stato e ridisegna |
| canale Realtime caduto | polling ogni 3s, banner "riconnessione" |
| avversario inattivo | alla scadenza chiunque può invocare `timeout` |
| avversario che abbandona | `status = abandoned`, vittoria assegnata, schermata di fine |

## Test

Il repository non ha ancora test: `package.json` non definisce uno script
`test`. Si introduce `node --test` sul gestore delle mosse della Edge Function,
che è una funzione pura da stato a stato:

- mossa di chi non è di turno → rifiutata
- carta non presente nella mano → rifiutata
- presa singola obbligatoria quando esiste (niente somma)
- scopa riconosciuta, e **non** assegnata sull'ultima presa della smazzata
- `version` disallineato → rifiutata
- `timeout` prima della scadenza → rifiutato; dopo → gioca d'ufficio
- fine smazzata: le carte rimaste vanno all'ultimo che ha preso

Verifica manuale a due dispositivi per animazioni, riconnessione e abbandono.

## Fasi di lavoro

1. Schema, RLS e RPC atomica di scrittura.
2. Edge Function, motore condiviso, script di sincronizzazione.
3. `MatchController` e refactor di `ScopaView` — qui si rischia di rompere la
   partita locale, quindi va verificata prima di proseguire.
4. `OnlineMatchController` e Realtime.
5. Aggancio a lobby e inviti.
6. Test e deploy.

## Cosa deve fare l'utente

- Eseguire lo script SQL sul dashboard Supabase.
- Lanciare `supabase functions deploy scopa` (la CLI è già installata).
