// Fabrique les médias du site à partir du tournage de ../video-orchestra :
// boucles muettes recadrées (assets/clips/*.mp4 + vignette .jpg) et vidéo de présentation (assets/video/).
// Usage : node tools/make-media.cjs   (ffmpeg de ../video-orchestra/node_modules/ffmpeg-static)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SITE = path.join(__dirname, '..');
const VIDEO = path.join(SITE, '..', 'video-orchestra');
const RAW = path.join(VIDEO, 'raw');
const FFMPEG = path.join(VIDEO, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
const CLIPS = path.join(SITE, 'assets', 'clips');
const PROMO = path.join(SITE, 'assets', 'video');

// Chaque boucle : scène, morceaux [début, fin, vitesse] en secondes du tournage, recadrage [x, y, l, h] en 16:9.
const CLIP_LIST = {
  drop: { scene: 'relay', parts: [[5.6, 14.8, 1.2], [14.8, 15.2, 1]], crop: [0, 40, 1600, 900] },
  link: { scene: 'relay', parts: [[20.8, 32.8, 1.4], [32.8, 35.5, 2.5], [35.5, 40.1, 1.4]], crop: [80, 40, 1600, 900] },
  relay: { scene: 'relay', parts: [[40.1, 44.7, 2.5], [44.7, 58.4, 4], [58.4, 60.4, 1], [60.4, 65.8, 2], [65.8, 70.5, 1]], crop: [140, 160, 1440, 810] },
  delegation: { scene: 'delegation', parts: [[55.8, 62.6, 3.5], [62.6, 63.2, 1], [63.2, 79.9, 4], [79.9, 84, 1]], crop: [40, 130, 1600, 900] },
  terminal: { scene: 'terminal', parts: [[22.9, 27.3, 2.5], [27.3, 46.4, 3], [46.4, 49.5, 1]], crop: [140, 170, 1440, 810] },
  branch: { scene: 'branch', parts: [[9.5, 15.2, 1.2], [15.2, 17.3, 4], [17.3, 19.3, 1.2]], crop: [0, 40, 1600, 900] },
  changes: { scene: 'branch', parts: [[35.9, 44.6, 1]], crop: [320, 140, 1440, 810] },
  role: { scene: 'extras', parts: [[0.9, 6, 1.2], [6, 10, 3], [10, 14.8, 1.2]], crop: [520, 170, 1280, 720] },
  log: { scene: 'extras', parts: [[15.1, 22.6, 1.1]], crop: [400, 30, 1280, 720] },
  agents: { scene: 'extras', parts: [[24, 32.2, 1.1]], crop: [0, 180, 1600, 900] },
  sketch: { scene: 'extras', parts: [[33.3, 52.2, 1.4]], crop: [480, 250, 1280, 720] },
  theme: { scene: 'extras', parts: [[52.4, 61.3, 1]], crop: [0, 0, 1920, 1080] },
};

const ff = (args) => execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

function makeClip(name, { scene, parts, crop }) {
  const [x, y, w, h] = crop;
  const filters = parts.map(
    ([from, to, speed], i) => `[0:v]trim=start=${from}:end=${to},setpts=(PTS-STARTPTS)/${speed},fps=30,crop=${w}:${h}:${x}:${y},scale=960:540:flags=lanczos[p${i}]`
  );
  filters.push(`${parts.map((_, i) => `[p${i}]`).join('')}concat=n=${parts.length}:v=1:a=0[v]`);
  const out = path.join(CLIPS, `${name}.mp4`);
  ff(['-i', path.join(RAW, `${scene}.mp4`), '-filter_complex', filters.join(';'), '-map', '[v]', '-an',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
  // Vignette : dernière image (l'état final est le plus parlant), affichée avant le chargement de la vidéo.
  ff(['-sseof', '-0.2', '-i', out, '-frames:v', '1', '-q:v', '4', path.join(CLIPS, `${name}.jpg`)]);
  console.log(`  ${name}.mp4  ${(fs.statSync(out).size / 1e6).toFixed(2)} Mo`);
}

fs.mkdirSync(CLIPS, { recursive: true });
fs.mkdirSync(PROMO, { recursive: true });
const only = process.argv.slice(2);
for (const [name, clip] of Object.entries(CLIP_LIST)) if (!only.length || only.includes(name)) makeClip(name, clip);

if (!only.length || only.includes('promo')) {
  const promo = path.join(PROMO, 'orchestra-promo.mp4');
  ff(['-i', path.join(VIDEO, 'orchestra-promo.mp4'), '-vf', 'fps=30', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '24',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', promo]);
  ff(['-ss', '20', '-i', path.join(VIDEO, 'orchestra-promo.mp4'), '-frames:v', '1', '-q:v', '3', path.join(PROMO, 'poster.jpg')]);
  console.log(`  orchestra-promo.mp4  ${(fs.statSync(promo).size / 1e6).toFixed(2)} Mo`);
}
