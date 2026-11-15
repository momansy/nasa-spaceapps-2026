// T041 step 2: Spanish consistency (neutral Latin-American Spanish). Idempotent.
import fs from 'node:fs';
const rules = [
  // gendered failure noun: "fallo" (peninsular) -> "falla" (Latin America), with article/adjective agreement
  [/\bun fallo oculto\b/g, 'una falla oculta'],
  [/\bel próximo fallo\b/g, 'la próxima falla'],
  [/\bla mayoría de los fallos\b/g, 'la mayoría de las fallas'],
  [/\bpuede detectar un fallo\b/g, 'puede detectar una falla'],
  [/\bFallos\b/g, 'Fallas'], [/\bfallos\b/g, 'fallas'],
  [/\bFallo\b/g, 'Falla'], [/\bfallo\b/g, 'falla'],
  [/\bFiabilidad\b/g, 'Confiabilidad'], [/\bfiabilidad\b/g, 'confiabilidad'],
  [/\bfiables?\b/g, (m) => (m.endsWith('s') ? 'confiables' : 'confiable')],
  // "pulsar" -> "presionar"
  [/\bPULSA\b/g, 'PRESIONA'], [/\bPulsa\b/g, 'Presiona'], [/\bpulsa\b/g, 'presiona'],
  [/\bpulsar\b/g, 'presionar'], [/\bpulsado\b/g, 'presionado'],
];
let n = 0;
for (const d of ['data/strings', 'client/src/i18n/strings'])
  for (const f of fs.readdirSync(d)) {
    if (!f.startsWith('es.')) continue;
    const p = `${d}/${f}`;
    const o = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const k of Object.keys(o)) {
      if (typeof o[k] !== 'string' || k.endsWith('.source')) continue;
      let v = o[k];
      for (const [re, to] of rules) v = v.replace(re, to);
      if (v !== o[k]) { o[k] = v; n++; }
    }
    fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n');
  }
console.log('changed values', n);
