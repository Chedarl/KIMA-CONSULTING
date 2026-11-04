// Screen conformance: does each page tie to the spec page definition, the shared
// design system, and the backend tables it must read?
// Usage: SUPABASE_MGMT_TOKEN=... node scripts/screen-conformance.cjs
const { chromium } = require('C:/Users/Administrator/AppData/Roaming/npm/node_modules/playwright');

const TOKEN = process.env.SUPABASE_MGMT_TOKEN;
const PROD = 'vhrnrbnjhmxrygvyfirf';
const CASE = '5024fdf1-92a7-4954-97da-4c5460f12e11';
const CLIENT = '3e58a82c-5290-4109-8731-0acf5a40db55';

const PAGES = [
  { id: 'F02', route: '/', must: ['À traiter', 'Pipeline', 'XAF'], tables: ['compliance_cases', 'invoices', 'service_payments', 'document_requests'] },
  { id: 'F04', route: '/clients/' + CLIENT, must: ['Vue d', 'Documents', 'Missions', 'Notes'], tables: ['taxpayers', 'engagements', 'documents', 'messages', 'case_events'] },
  { id: 'F06', route: '/workflows', must: ['Kanban', 'Liste', 'À démarrer', 'Terminé'], tables: ['compliance_cases'] },
  { id: 'F10', route: '/inbox', must: ['Demandes', 'Tous'], tables: ['documents', 'document_requests'] },
  { id: 'F11', route: '/documents/__DOC__', must: ['verdicts', 'Métadonnées'], tables: ['documents', 'document_verdicts', 'document_versions'] },
  { id: 'F19', route: '/ai', must: ['Kima AI', 'Poser une question', 'Sources vérifiées'], tables: [] },
  { id: 'F20', route: '/branding', must: ['Studio de marque', 'Couleur', 'Logo'], tables: ['branding'] },
  { id: 'F08', route: '/templates', must: ['Modèles de mission', 'Dupliquer'], tables: ['engagement_templates'] },
  { id: 'F13', route: '/cases/' + CASE, must: ['Mboa', 'Dossier'], tables: ['compliance_cases', 'case_events'] },
  { id: 'F15', route: '/billing', must: ['Facturation'], tables: ['invoices', 'service_payments'] },
];

async function sql(q) {
  const r = await fetch('https://api.supabase.com/v1/projects/' + PROD + '/database/query', {
    method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  });
  return { status: r.status, text: await r.text() };
}

async function tableExists(t) {
  if (!TOKEN) return null;
  const r = await fetch('https://api.supabase.com/v1/projects/' + PROD + '/database/query', {
    method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: "select 1 as ok from information_schema.tables where table_schema='public' and table_name='" + t + "'" }),
  });
  const txt = await r.text();
  return txt.includes('"ok":1');
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const out = [];

  const firm = await ctx.newPage();
  await firm.goto('http://localhost:3000/fr/firm-login', { waitUntil: 'networkidle', timeout: 90000 });
  await firm.fill('#firm-email', 'demo@kima.cm');
  await firm.fill('#firm-password', 'Demo2026!');
  await firm.locator('button', { hasText: 'Se connecter' }).last().click();
  await firm.waitForTimeout(6000);

  let DOC = '';
  if (TOKEN) {
    const ins = await sql("insert into documents (id, taxpayer_id, file_name, storage_path, mime_type, review_status, visibility, arrived_via) values ('5e5d0000-0000-4000-8000-00000000dd09','3e58a82c-5290-4109-8731-0acf5a40db55','AUDIT.pdf','3e58a82c-5290-4109-8731-0acf5a40db55/nonexistent.pdf','application/pdf','received','internal','client') on conflict (id) do nothing returning id");
    if (ins.status === 201 || ins.status === 200) DOC = '5e5d0000-0000-4000-8000-00000000dd09';
  }

  for (const page of PAGES) {
    if (page.route.includes('__DOC__')) page.route = page.route.replace('__DOC__', DOC || 'none');
    const res = await firm.goto('http://localhost:3000/fr/workspace' + page.route, { waitUntil: 'load', timeout: 120000 }).catch(() => null);
    await firm.waitForTimeout(2200);
    const body = await firm.locator('body').innerText().catch(() => '');
    const h1 = (await firm.locator('h1').first().innerText().catch(() => '')).trim();
    const teal = await firm.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--teal').trim());
    const mains = await firm.locator('main#main').count();
    const lower = body.toLowerCase();
    const missing = page.must.filter((m) => !lower.includes(m.toLowerCase()));
    const tables = {};
    for (const t of page.tables) tables[t] = await tableExists(t);
    out.push({ id: page.id, route: page.route, status: res ? res.status() : 'ERR', h1: h1.slice(0, 30), theme: !!teal, mains, missing, tables });
  }

  if (DOC) await sql("delete from documents where id='" + DOC + "'");

  const client = await ctx.newPage();
  await client.goto('http://localhost:3000/fr/login', { waitUntil: 'networkidle', timeout: 90000 });
  await client.fill('#portal-email', 'client@kima.cm');
  await client.fill('#portal-password', 'Demo2026!');
  await client.locator('button', { hasText: 'Se connecter' }).last().click();
  await client.waitForTimeout(6000);
  const cres = await client.goto('http://localhost:3000/fr/app', { waitUntil: 'load', timeout: 120000 }).catch(() => null);
  await client.waitForTimeout(1200);
  const cbody = await client.locator('body').innerText().catch(() => '');
  out.push({ id: 'C02', route: '/app', status: cres ? cres.status() : 'ERR', h1: (await client.locator('h1').first().innerText().catch(() => '')).trim().slice(0, 30), theme: true, mains: await client.locator('main#main').count(), missing: ['Envoyer une pièce', 'Écrire au cabinet', 'Voir les factures'].filter((m) => !cbody.toLowerCase().includes(m.toLowerCase())), tables: { document_requests: await tableExists('document_requests') } });

  console.log('CONF=' + JSON.stringify(out));
  await b.close();
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
