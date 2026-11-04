// Does a change made elsewhere reach an open board without a reload?
// Stage moves are guarded by case_stage_guard(), so the test walks the legal
// path: documents -> accounting -> preparation, then preparation -> review.
const { chromium } = require('C:/Users/Administrator/AppData/Roaming/npm/node_modules/playwright');
const TOKEN = process.env.SUPABASE_MGMT_TOKEN;

async function sql(q) {
  const r = await fetch('https://api.supabase.com/v1/projects/vhrnrbnjhmxrygvyfirf/database/query', {
    method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  });
  const t = await r.text();
  if (t.includes('"message"')) throw new Error(t.slice(0, 120));
  return t;
}
async function bucketOf(page, id) {
  return await page.locator('a[href*="/cases/' + id + '"]').evaluate((el) => {
    const s = el.closest('section');
    return s ? s.dataset.bucket : 'none';
  }).catch(() => 'gone');
}
async function waitBucket(page, id, want, seconds) {
  for (let i = 0; i < seconds; i++) {
    await page.waitForTimeout(1000);
    if ((await bucketOf(page, id)) === want) return true;
  }
  return false;
}

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
  await p.goto('http://localhost:3000/fr/firm-login', { waitUntil: 'networkidle', timeout: 90000 });
  await p.fill('#firm-email', 'demo@kima.cm');
  await p.fill('#firm-password', 'Demo2026!');
  await p.locator('button', { hasText: 'Se connecter' }).last().click();
  await p.waitForTimeout(6000);
  await p.goto('http://localhost:3000/fr/workspace/workflows', { waitUntil: 'load', timeout: 120000 });
  await p.waitForTimeout(3000);

  const href = await p.locator('a[href*="/workspace/cases/"]').first().getAttribute('href');
  const id = (href || '').split('/cases/')[1];
  const row = JSON.parse(await sql("select stage from compliance_cases where id='" + id + "'"));
  const original = row[0].stage;

  // Walk to preparation along legal edges.
  const path = { documents: ['accounting', 'preparation'], accounting: ['preparation'], preparation: [] }[original] || [];
  for (const step of path) await sql("update compliance_cases set stage='" + step + "' where id='" + id + "'");
  const settled = await waitBucket(p, id, 'doing', 15);
  if (!settled) { console.log('RESULT=fail setup (board did not show doing)'); await b.close(); process.exit(1); }

  await sql("update compliance_cases set stage='review' where id='" + id + "'");
  const moved = await waitBucket(p, id, 'review', 15);

  // Put it back.
  for (const back of ['preparation', 'accounting', 'documents']) {
    try { await sql("update compliance_cases set stage='" + back + "' where id='" + id + "'"); } catch {}
  }
  console.log('case=' + id + ' original=' + original + ' moved=' + moved);
  console.log('RESULT=' + (moved ? 'pass' : 'fail') + ' (board moved without reload)');
  await b.close();
  process.exit(moved ? 0 : 1);
})();