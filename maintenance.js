// One-off database jobs, run inside the pod by the "Maintenance" workflow:
//   node maintenance.js unlink-overlinked <max pages> [--dry-run]
//   node maintenance.js list-pending
//   node maintenance.js approve <page url>        (a suggestion waiting for approval)
//   node maintenance.js reject <page url> [reason]
const { Store, pageUrl } = require('./src/store');

const [cmd, arg, flag] = process.argv.slice(2);
const commands = ['unlink-overlinked', 'list-pending', 'approve', 'reject'];
if (!commands.includes(cmd)) {
  console.error(`unknown command "${cmd || ''}"; try one of: ${commands.join(', ')}`);
  process.exit(2);
}
const store = new Store(process.env.DB_FILE || 'data/events.db');
try {
  if (cmd === 'unlink-overlinked') {
    const max = Number(arg);
    if (!Number.isInteger(max) || max < 1) {
      console.error('give the most Pages an event may be linked to, e.g. 5');
      process.exitCode = 2;
    } else {
      const dryRun = flag === '--dry-run';
      const rows = store.unlinkOverlinked(max, { dryRun });
      console.log(`${rows.length} events linked to more than ${max} Pages`
        + (dryRun ? ' (dry run, nothing changed)' : '; their Page links are removed'));
      for (const r of rows) console.log(`  ${r.pages} Pages: ${r.name || '(no name)'} (https://www.facebook.com/events/${r.fb_id}/)`);
    }
  } else if (cmd === 'approve' || cmd === 'reject') {
    // The same as the Approve / Reject buttons in Manage Pages.
    const url = pageUrl(arg);
    const s = url && store.sources(new Date(), 'pending').find((p) => p.url === url);
    if (!s) {
      console.error(`no suggestion waiting for ${arg || '(no address given)'}; see list-pending`);
      process.exitCode = 1;
    } else {
      store.updateSource(s.id, cmd === 'approve' ? { status: 'active' } : { status: 'rejected', reject_reason: flag || null });
      console.log(cmd === 'approve'
        ? `approved: ${s.name || s.url} (${s.url}); it's checked on the next fbevents run`
        : `rejected: ${s.name || s.url} (${s.url})${flag ? `: ${flag}` : ''}`);
    }
  } else {
    // Read-only: suggestions waiting for approval.
    const rows = store.sources(new Date(), 'pending');
    console.log(`${rows.length} suggested Pages waiting for approval`);
    for (const s of rows) {
      console.log(`- ${s.name || '(no name)'}: ${s.url}`);
      console.log(`  suggested ${s.created_at.slice(0, 16).replace('T', ' ')} UTC${s.suggested_by ? ` by ${s.suggested_by}` : ''}`);
      if (s.note) console.log(`  note: ${s.note}`);
      if (s.similar.length) console.log(`  similar name: ${s.similar.map((o) => `${o.name} (${o.status})`).join(', ')}`);
    }
  }
} finally {
  store.close();
}
