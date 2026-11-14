import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const manifest = JSON.parse(read('assets/media/style/PROMPT_PACK.json'));
const guide = read('assets/media/style/STYLE_GUIDE.md');
const credits = read('assets/media/CREDITS.md');
const checks = [];
const check = (name, pass) => checks.push({ name, pass: Boolean(pass) });
check('Nine explicit requests and nine completed outputs recorded', manifest.requests.length === 9 && manifest.generated_files.length === 9 && manifest.requests.every(r => manifest.generated_files.includes(r.path)));
check('Unique planned paths', new Set(manifest.requests.map(r => r.path)).size === 9);
check('Six planned landscape style-frame sizes at least 1920 x 1080 px', manifest.requests.slice(0, 6).every(r => r.params.aspect_ratio === '16:9' && r.params.size === '2048x1152'));
check('Both key-art ratios specified', manifest.requests[6].params.aspect_ratio === '16:9' && manifest.requests[7].params.aspect_ratio === '1:1');
check('Planned cinematic duration within 8-15 s', manifest.requests[8].params.duration >= 8 && manifest.requests[8].params.duration <= 15);
check('All planned paths confined to assets/media', manifest.requests.every(r => r.path.startsWith('assets/media/') && !r.path.includes('..')));
check('Every request has a complete prompt and a credits row', manifest.requests.every(r => r.params.prompt.length > 300 && credits.includes(r.id)));
check('Guide covers accessibility, materials, lighting and model boundaries', ['#77D6A1', '#FFD166', '#FF8F8F', 'roughness', 'smoothness', '4500 K', '200%', 'game_value', 'not simulation outputs'].every(s => guide.includes(s)));

function luminance(hex) {
  const c = hex.match(/[0-9a-f]{2}/gi).map(x => parseInt(x, 16) / 255).map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
const palette = { ceramic: '#E8EEF0', muted: '#B6C7D3', signal: '#55C5CD', meets: '#77D6A1', marginal: '#FFD166', fails: '#FF8F8F' };
const contrastResults = Object.entries(palette).map(([token, hex]) => ({ token, hex, background: '#112B40', ratio: Number(contrast(hex, '#112B40').toFixed(3)) }));
check('Specified text/status foregrounds exceed 4.5:1 on opaque Console', contrastResults.every(r => r.ratio >= 4.5));
function probe(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) return { path: relativePath, exists: false };
  const run = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_type,codec_name,width,height,pix_fmt,r_frame_rate', '-of', 'json', absolutePath], { encoding: 'utf8' });
  if (run.status !== 0) return { path: relativePath, exists: true, probe_error: run.stderr.trim() || `ffprobe exited ${run.status}` };
  return { path: relativePath, exists: true, ...JSON.parse(run.stdout) };
}
const media = manifest.requests.map(r => probe(r.path));
const stills = media.slice(0, 8);
const video = media[8];
check('Six style frames decode as 2048 x 1152 PNG', stills.slice(0, 6).every(m => m.streams?.some(s => s.codec_type === 'video' && s.codec_name === 'png' && s.width === 2048 && s.height === 1152)));
check('Key art decodes at required landscape and square sizes', stills[6]?.streams?.some(s => s.codec_name === 'png' && s.width === 2048 && s.height === 1152) && stills[7]?.streams?.some(s => s.codec_name === 'png' && s.width === 2048 && s.height === 2048));
const videoDuration = Number(video.format?.duration);
check('C1 cinematic decodes as silent 1280 x 720 H.264 for 8-15 s', video.streams?.some(s => s.codec_type === 'video' && s.codec_name === 'h264' && s.width === 1280 && s.height === 720) && !video.streams?.some(s => s.codec_type === 'audio') && videoDuration >= 8 && videoDuration <= 15);
const contactSheet = probe('orchestration/evidence/T005/contact-sheet.jpg');
check('Contact sheet decodes and includes recorded visual acceptance', contactSheet.streams?.some(s => s.codec_type === 'video' && s.width === 1920 && s.height === 810) && credits.includes('## T005 completion — C1 Earth Watch briefing') && credits.includes('Gate: APPROVED.'));
const outputFiles = ['assets/media/style/STYLE_GUIDE.md', 'assets/media/style/PROMPT_PACK.json', 'assets/media/CREDITS.md', 'orchestration/evidence/T005/README.md', 'orchestration/evidence/T005/verify-preproduction.mjs'];
const sizes = outputFiles.map(p => ({ path: p, bytes: fs.statSync(path.join(root, p)).size }));
check('Authored source files each below 50 MB (decimal)', sizes.every(x => x.bytes < 50_000_000));
const result = { checked_at: new Date().toISOString(), node: process.version, scope: 'Source, decoded-media and recorded visual-acceptance checks.', checks, contrastResults, authoredFileSizes: sizes, media, contactSheet, preproduction_pass: checks.slice(0, 10).every(c => c.pass), media_acceptance_pass: checks.every(c => c.pass), blocker: manifest.blocker };
fs.writeFileSync(path.join(root, 'orchestration/evidence/T005/verification.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ checks_passed: checks.filter(c => c.pass).length, checks_total: checks.length, missing_media: media.filter(x => !x.exists).length, media_acceptance: result.media_acceptance_pass ? 'PASS' : 'FAIL' }, null, 2));
process.exitCode = result.media_acceptance_pass ? 0 : 1;
