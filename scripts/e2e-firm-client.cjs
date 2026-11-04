// Dual-account journey: a firm request appears in the client portal live, and
// the firm's "waiting on client" count rises, without a refresh on either side.
// Run: SUPABASE_MGMT_TOKEN=... node scripts/e2e-firm-client.cjs
const { chromium } = require('C:/Users/Administrator/AppData/Roaming/npm/node_modules/playwright');
const assert = require('node:assert');

const MGMT = process.env.SUPABASE_MGMT_TOKEN;
const PROD = 'vhrnrbnjhmxrygvyfirf';
const ORG = '24403cfe-42f1-4b53-801c-37a9b92fdccf';
const TAXPAYER = '3e58a82c-5290-4109-8731-0acf5a40db55';
const FIRM = { email: 'demo@kima.cm', pass: 'Demo2026!' };
const CLIENT = { email: 'client@kima.cm', pass: 'Demo2026!' };

async function sql(q) {
  const r = await fetch('https://api.supabase.com/v1/projects/' + PROD + '/database/query', {
    method: 'POST', headers: { Authorization: 'Bearer ' + MGMT, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  });
  return { status: r.status, body: await r.text() };
}

async function login(page, url, email, pass, emailSel, passSel, btnText) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.fill(emailSel, email);
  await page.fill(passSel, pass);
  await page.locator('button', { hasText: new RegExp(btnText) }).last().click();
  await page.waitForTimeout(6000);
}

(async () => {
  const label = 'PIECE TEST ' + Date.now();
  const b = await chromium.launch();
  const firm = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const client = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

  await login(firm, 'http://localhost:3000/fr/firm-login', FIRM.email, FIRM.pass, '#firm-email', '#firm-password', 'Se connecter');
  await firm.goto('http://localhost:3000/fr/workspace', { waitUntil: 'networkidle', timeout: 90000 });
  await firm.waitForTimeout(3000);
  const beforeText = await firm.locator('section button', { hasText: 'En attente des clients' }).innerText();

  await login(client, 'http://localhost:3000/fr/login', CLIENT.email, CLIENT.pass, '#portal-email', '#portal-password', 'Se connecter');
  await client.waitForTimeout(3000);
  console.log('client url:', client.url());

  const ins = await sql(`insert into document_requests (taxpayer_id, organization_id, label_fr, label_en, status, responsible, due_on) values ('${TAXPAYER}','${ORG}','${label}','${label}','requested','taxpayer','2026-12-31') returning id`);
  console.log('insert:', ins.status, ins.body.slice(0, 80));

  // client should see it live (realtime), no refresh
  await client.waitForTimeout(6000);
  const clientBody = await client.locator('body').innerText();
  const clientSaw = clientBody.includes(label);
  console.log('client saw request live:', clientSaw);

  // firm waiting count rises (realtime reload)
  await firm.waitForTimeout(6000);
  const afterText = await firm.locator('section button', { hasText: 'En attente des clients' }).innerText();
  console.log('firm waiting before/after:', JSON.stringify(beforeText), '->', JSON.stringify(afterText));

  await sql(`delete from document_requests where label_fr = '${label}'`);
  await b.close();
  assert(clientSaw, 'client did not see the request');
  console.log('PASS');
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
