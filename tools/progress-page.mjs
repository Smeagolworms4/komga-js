#!/usr/bin/env node
// Génère la page de suivi du portage (HTML) à partir de port-status et de tools/progress-data.json.
// Usage : node tools/progress-page.mjs <fichier-sortie.html>
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const out = process.argv[2] ?? join(ROOT, 'build/progress.html')
const data = JSON.parse(readFileSync(join(ROOT, 'tools/progress-data.json'), 'utf8'))
const status = JSON.parse(execFileSync('node', [join(ROOT, 'tools/port-status.mjs'), '--json'], { encoding: 'utf8', maxBuffer: 1 << 26 }))

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`)
const nf = (n) => n.toLocaleString('fr-FR')

const now = new Date()
const elapsedMin = Math.round((now - new Date(data.sessionStart)) / 60000)
const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

// --- agrégats -------------------------------------------------------------
const main = status.rows.filter((r) => r.kind === 'main')
const tests = status.rows.filter((r) => r.kind === 'test')
const ok = (r) => r.status === 'ok' || r.status === 'tests-missing'
const sum = (a, f) => a.reduce((n, r) => n + f(r), 0)
const mainLines = sum(main, (r) => r.ktLines)
const mainDone = sum(main.filter(ok), (r) => r.ktLines)
const testCount = sum(tests, (r) => r.testCount ?? 0)
const testDone = sum(tests.filter((r) => r.status !== 'missing'), (r) => (r.testCount ?? 0) - (r.missingTests?.length ?? 0))
const pct = (a, b) => (b === 0 ? 0 : Math.round((a / b) * 1000) / 10)

const LABELS = {
  'domain/model': 'Modèle du domaine',
  'domain/persistence': 'Interfaces de persistance',
  'domain/service': 'Services du domaine',
  'infrastructure/jooq': 'Accès aux données (DAO)',
  'interfaces/api': 'API : contrôleurs et DTO',
  'infrastructure/metadata': 'Métadonnées',
  'infrastructure/security': 'Sécurité',
  'infrastructure/mediacontainer': 'Lecture des archives',
  'infrastructure/search': 'Recherche plein texte',
  'infrastructure/web': 'Couche web',
  'infrastructure/image': 'Images',
  'infrastructure/kobo': 'Kobo',
  'infrastructure/openapi': 'OpenAPI',
  'infrastructure/configuration': 'Configuration',
  'application/tasks': 'Tâches de fond',
  'interfaces/sse': 'Événements temps réel (SSE)',
  'interfaces/scheduler': 'Planification',
  flyway: 'Migrations de base',
}
const groups = new Map()
for (const r of main) {
  const p = r.kt.replace('komga/src/main/kotlin/org/gotson/komga/', '').replace('komga/src/flyway/kotlin/', 'flyway/')
  const parts = p.split('/')
  let key = parts[0] === 'flyway' ? 'flyway' : parts.length > 2 ? `${parts[0]}/${parts[1]}` : 'autres'
  if (!LABELS[key]) key = 'autres'
  const g = groups.get(key) ?? { lines: 0, done: 0, files: 0, filesDone: 0 }
  g.lines += r.ktLines
  g.files++
  if (ok(r)) {
    g.done += r.ktLines
    g.filesDone++
  }
  groups.set(key, g)
}
LABELS.autres = 'Divers (utilitaires, point d’entrée…)'
const groupRows = [...groups].sort((a, b) => b[1].lines - a[1].lines)

const done = data.lots.filter((l) => l.status === 'done')
const running = data.lots.filter((l) => l.status === 'running')
const workMin = sum(done, (l) => l.min)

// --- rendu ------------------------------------------------------------------
const bar = (v, t) => {
  const p = pct(v, t)
  return `<div class="bar" role="img" aria-label="${p} %"><span style="width:${p}%"></span></div>`
}

const html = `<title>Portage KomgaJS</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Condensed:wght@600;700&display=swap">
<style>
:root{
  --bg:#f5f6f8; --surface:#ffffff; --ink:#15171c; --muted:#5b6170; --line:#dfe2e8;
  --kt:#7f52ff; --ts:#2f6fb8; --track:#e6e8ee;
  --ok:#1f7a4d; --ok-bg:#e3f3ea; --run:#8a5a00; --run-bg:#fbefd6;
  color-scheme:light;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --bg:#0f1115; --surface:#171a21; --ink:#e8eaf0; --muted:#9aa1b1; --line:#2a2f3a;
    --kt:#a58bff; --ts:#6aa6ec; --track:#262b36;
    --ok:#6fd3a0; --ok-bg:#16301f; --run:#f0c068; --run-bg:#33280f;
    color-scheme:dark;
  }
}
:root[data-theme="dark"]{
  --bg:#0f1115; --surface:#171a21; --ink:#e8eaf0; --muted:#9aa1b1; --line:#2a2f3a;
  --kt:#a58bff; --ts:#6aa6ec; --track:#262b36;
  --ok:#6fd3a0; --ok-bg:#16301f; --run:#f0c068; --run-bg:#33280f;
  color-scheme:dark;
}
body{background:var(--bg);color:var(--ink);font:15px/1.5 "IBM Plex Sans",system-ui,sans-serif;padding-inline:16px;padding-block:28px 48px}
.wrap{max-width:1080px;margin:0 auto;display:grid;gap:28px}
h1,h2{font-family:"IBM Plex Sans Condensed","IBM Plex Sans",system-ui,sans-serif;text-wrap:balance;margin:0}
h1{font-size:30px;letter-spacing:-.01em}
h2{font-size:19px}
.sub{color:var(--muted);margin:6px 0 0}
.mono,.num{font-family:"IBM Plex Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums}
header{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:end;gap:12px}
.flow{font-family:"IBM Plex Mono",monospace;font-size:13px;color:var(--muted)}
.flow b{color:var(--kt);font-weight:500}.flow i{color:var(--ts);font-style:normal;font-weight:500}
.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:14px 16px;display:grid;gap:6px}
.stat .k{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.stat .v{font-size:26px;font-weight:600}
.stat .d{font-size:13px;color:var(--muted)}
.bar{height:8px;background:var(--track);border-radius:4px;overflow:hidden}
.bar span{display:block;height:100%;background:linear-gradient(90deg,var(--kt),var(--ts));border-radius:4px}
section{display:grid;gap:12px}
.pk{display:grid;grid-template-columns:minmax(150px,1.2fr) 3fr minmax(120px,auto);gap:6px 14px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:14px 16px}
.pk .n{font-weight:500}.pk .c{text-align:right;color:var(--muted);font-size:13px}
.tbl{overflow-x:auto;background:var(--surface);border:1px solid var(--line);border-radius:8px}
table{border-collapse:collapse;width:100%;min-width:720px;font-size:14px}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:500}
tr:last-child td{border-bottom:0}
td.dur{white-space:nowrap}
.chip{display:inline-block;font-size:12px;padding:2px 8px;border-radius:999px;white-space:nowrap}
.chip.done{background:var(--ok-bg);color:var(--ok)}.chip.run{background:var(--run-bg);color:var(--run)}
.two{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:14px 16px;display:grid;gap:8px}
ul{margin:0;padding-left:18px;display:grid;gap:4px}
.row{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line);padding-block:6px}
.row:last-child{border-bottom:0}
footer{color:var(--muted);font-size:13px}
@media (max-width:560px){.pk{grid-template-columns:1fr}.pk .c{text-align:left}}
</style>
<div class="wrap">
  <header>
    <div>
      <h1>Portage KomgaJS</h1>
      <p class="sub">Backend de Komga 1.28.1 traduit à plat, fichier par fichier, du Kotlin vers TypeScript.</p>
    </div>
    <div class="flow">Mis à jour à ${hhmm(now)} · session commencée à ${data.sessionStart.slice(11, 16)} · <span class="num">${fmtMin(elapsedMin)}</span> écoulées<br><b>Kotlin</b> → <i>TypeScript</i></div>
  </header>

  <div class="summary">
    <div class="stat"><span class="k">Code principal porté</span><span class="v num">${pct(mainDone, mainLines)} %</span>${bar(mainDone, mainLines)}<span class="d num">${nf(mainDone)} / ${nf(mainLines)} lignes · ${main.filter(ok).length} / ${main.length} fichiers</span></div>
    <div class="stat"><span class="k">Tests Kotlin portés</span><span class="v num">${pct(testDone, testCount)} %</span>${bar(testDone, testCount)}<span class="d num">${nf(testDone)} / ${nf(testCount)} tests</span></div>
    <div class="stat"><span class="k">Lots terminés</span><span class="v num">${done.length}</span><span class="d">${running.length} en cours · ${fmtMin(workMin)} de travail cumulé</span></div>
    <div class="stat"><span class="k">RAM après lecture</span><span class="v num">${data.bench.js.afterRead} Mo</span><span class="d">KomgaJS, contre ${data.bench.java.afterRead} Mo pour Komga Java (÷ ${(data.bench.java.afterRead / data.bench.js.afterRead).toFixed(1)})</span></div>
  </div>

  <section>
    <h2>Mémoire : Komga Java contre KomgaJS</h2>
    <p class="sub">Même bibliothèque de 60 BD (645 Mo), même scénario, configuration vierge, réglages par défaut. Mémoire réelle du processus (RSS).</p>
    ${[
      ['Au repos', 'idle'],
      ['Après scan et analyse', 'afterScan'],
      ['Après lecture (miniatures, pages)', 'afterRead'],
    ]
      .map(([label, k]) => {
        const max = Math.max(data.bench.java.afterRead, data.bench.java.afterScan)
        return `<div class="pk"><span class="n">${label}</span><div style="display:grid;gap:4px"><div class="bar"><span style="width:${(data.bench.java[k] / max) * 100}%;background:var(--kt)"></span></div><div class="bar"><span style="width:${(data.bench.js[k] / max) * 100}%;background:var(--ts)"></span></div></div><span class="c num">Java ${data.bench.java[k]} Mo<br>JS ${data.bench.js[k]} Mo</span></div>`
      })
      .join('\n    ')}
    <div class="pk"><span class="n">Démarrage / durée du scan</span><span class="c num" style="text-align:left">Java ${data.bench.java.startup} s / ${data.bench.java.scan} s</span><span class="c num">JS ${data.bench.js.startup} s / ${data.bench.js.scan} s</span></div>
  </section>

  <section>
    <h2>Avancement par partie de Komga</h2>
    ${groupRows
      .map(
        ([k, g]) =>
          `<div class="pk"><span class="n">${esc(LABELS[k])}</span>${bar(g.done, g.lines)}<span class="c num">${pct(g.done, g.lines)} % · ${nf(g.done)} / ${nf(g.lines)} l.</span></div>`,
      )
      .join('\n    ')}
  </section>

  <section>
    <h2>Lots de travail</h2>
    <div class="tbl"><table>
      <thead><tr><th>Lot</th><th>Qui</th><th>Durée</th><th>Vérifié contre</th><th>Résultat</th><th>État</th></tr></thead>
      <tbody>
      ${data.lots
        .map((l) => {
          const dur = l.status === 'done' ? fmtMin(l.min) : `depuis ${l.start}`
          const chip = l.status === 'done' ? '<span class="chip done">Terminé</span>' : '<span class="chip run">En cours</span>'
          return `<tr><td>${esc(l.lot)}</td><td>${esc(l.who)}</td><td class="dur num">${esc(dur)}</td><td>${esc(l.check ?? '—')}</td><td>${esc(l.result ?? '—')}</td><td>${chip}</td></tr>`
        })
        .join('\n      ')}
      </tbody>
    </table></div>
  </section>

  <div class="two">
    <div class="card">
      <h2>Reste à faire</h2>
      ${data.remaining.map((r) => `<div class="row"><span>${esc(r.step)}</span><span class="num">${esc(r.estimate)}</span></div>`).join('\n      ')}
    </div>
    <div class="card">
      <h2>Écarts connus avec Komga</h2>
      <ul>${data.deviations.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
    </div>
  </div>

  <footer>Chiffres calculés par <span class="mono">tools/port-status.mjs</span> sur le dépôt KomgaJS. Les durées sont le temps de travail de chaque lot ; plusieurs lots tournent en parallèle.</footer>
</div>
`
writeFileSync(out, html)
console.log(`écrit : ${out}`)
