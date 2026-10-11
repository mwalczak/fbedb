// One-off database fixes, run inside the pod by the "Maintenance" workflow:
//   node maintenance.js unlink-overlinked <max pages> [--dry-run]
const { Store } = require('./src/store');

const [cmd, arg, flag] = process.argv.slice(2);
if (cmd !== 'unlink-overlinked') {
  console.error(`unknown command "${cmd || ''}"; try: unlink-overlinked 5 --dry-run`);
  process.exit(2);
}
const max = Number(arg);
if (!Number.isInteger(max) || max < 1) {
  console.error('give the most Pages an event may be linked to, e.g. 5');
  process.exit(2);
}
const dryRun = flag === '--dry-run';
const store = new Store(process.env.DB_FILE || 'data/events.db');
try {
  const rows = store.unlinkOverlinked(max, { dryRun });
  console.log(`${rows.length} events linked to more than ${max} Pages`
    + (dryRun ? ' (dry run, nothing changed)' : '; their Page links are removed'));
  for (const r of rows) console.log(`  ${r.pages} Pages: ${r.name || '(no name)'} (https://www.facebook.com/events/${r.fb_id}/)`);
} finally {
  store.close();
}
