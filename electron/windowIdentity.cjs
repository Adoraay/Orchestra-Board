const fs = require('fs');
const path = require('path');
const { nativeImage } = require('electron');

function loadWindowIdentity({ directory = path.join(__dirname, '..'), executable = process.execPath } = {}) {
  // Une image en mémoire pour la fenêtre, un vrai fichier ICO pour les propriétés du Shell Windows.
  const icon = nativeImage.createFromBuffer(fs.readFileSync(path.join(directory, 'build', 'icon.png')));
  const launcher = path.join(directory, 'launcher.exe');
  const development = fs.existsSync(launcher);
  return {
    icon,
    details: {
      appId: 'com.orchestraboard.orchestra',
      appIconPath: development ? path.join(directory, 'build', 'icon.ico') : path.join(path.dirname(directory), 'Orchestra.ico'),
      appIconIndex: 0,
      relaunchCommand: `"${development ? launcher : executable}"`,
      relaunchDisplayName: 'Orchestra',
    },
  };
}

module.exports = { loadWindowIdentity };
