// Génère build/icon.ico et build/icon.png (1024 px, converti en .icns pour macOS par electron-builder) à partir de
// src/assets/orchestra-logo-small.svg.
// Lancé par Electron (npm run build:icon) : il sait dessiner un SVG, sans dépendance en plus.
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const PNG_SIZE = 1024; // macOS demande au moins 512 px
const root = path.join(__dirname, '..');
const source = path.join(root, 'src', 'assets', 'orchestra-logo-small.svg');
const outDir = path.join(root, 'build');

async function renderPng(win, svgDataUrl, size) {
  const base64 = await win.webContents.executeJavaScript(`(async () => {
    const img = new Image();
    img.src = ${JSON.stringify(svgDataUrl)};
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = ${size};
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, ${size}, ${size});
    return canvas.toDataURL('image/png').split(',')[1];
  })()`);
  return Buffer.from(base64, 'base64');
}

// Format .ico : en-tête, une entrée de 16 octets par taille, puis les images PNG à la suite.
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type : icône
  header.writeUInt16LE(images.length, 4);

  const entries = Buffer.alloc(16 * images.length);
  let offset = header.length + entries.length;
  images.forEach(({ size, png }, i) => {
    const e = i * 16;
    entries[e] = size >= 256 ? 0 : size; // 0 = 256 px
    entries[e + 1] = size >= 256 ? 0 : size;
    entries.writeUInt16LE(1, e + 4); // plans
    entries.writeUInt16LE(32, e + 6); // bits par pixel
    entries.writeUInt32LE(png.length, e + 8);
    entries.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([header, entries, ...images.map((img) => img.png)]);
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadURL('about:blank');
  const svgDataUrl = 'data:image/svg+xml;base64,' + fs.readFileSync(source).toString('base64');

  const images = [];
  for (const size of SIZES) images.push({ size, png: await renderPng(win, svgDataUrl, size) });

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'icon.ico'), buildIco(images));
  fs.writeFileSync(path.join(outDir, 'icon.png'), await renderPng(win, svgDataUrl, PNG_SIZE));
  console.log(`build/icon.ico (${SIZES.join(', ')} px) et build/icon.png (${PNG_SIZE} px) générés`);
  app.quit();
});
