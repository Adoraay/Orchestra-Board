// Copie locale du runtime avec les ressources Windows d'Orchestra ; electron.exe reste intact.
const fs = require('fs');
const path = require('path');
const { createHash, randomUUID } = require('crypto');
const { pipeline } = require('stream/promises');

async function hashFile(file) {
  const hash = createHash('sha256');
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest('hex');
}

async function prepareRuntime(root = path.resolve(__dirname, '..')) {
  if (process.platform !== 'win32') throw new Error('Ce lanceur est réservé à Windows.');
  root = await fs.promises.realpath(root);
  const directory = await fs.promises.realpath(path.join(root, 'node_modules', 'electron', 'dist'));
  const relative = path.relative(root, directory);
  if (path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep)) throw new Error('Le runtime Electron doit appartenir à ce projet.');
  const source = path.join(directory, 'electron.exe');
  const target = path.join(directory, 'Orchestra.exe');
  const stamp = path.join(directory, 'orchestra-runtime.json');
  const iconPath = path.join(root, 'build', 'icon.ico');
  const pkg = JSON.parse(await fs.promises.readFile(path.join(root, 'package.json'), 'utf8'));
  const [sourceHash, iconHash, scriptHash] = await Promise.all([hashFile(source), hashFile(iconPath), hashFile(__filename)]);
  const fingerprint = createHash('sha256').update(JSON.stringify({ sourceHash, iconHash, scriptHash, version: pkg.version })).digest('hex');
  const cached = async () => {
    try {
      const value = JSON.parse(await fs.promises.readFile(stamp, 'utf8'));
      const stat = await fs.promises.stat(target);
      return value.fingerprint === fingerprint && value.size === stat.size && value.mtime === stat.mtimeMs;
    } catch { return false; }
  };
  if (await cached()) return { executable: target, reused: true };

  // resedit est déjà fourni par electron-builder : aucune dépendance supplémentaire.
  const { NtExecutable, NtExecutableResource, Resource, Data } = require('resedit');
  const executable = NtExecutable.from(await fs.promises.readFile(source), { ignoreCert: true });
  const resources = NtExecutableResource.from(executable);
  const versions = Resource.VersionInfo.fromEntries(resources.entries);
  if (!versions.length) versions.push(Resource.VersionInfo.createEmpty());
  for (const version of versions) {
    version.setFileVersion(pkg.version);
    version.setProductVersion(pkg.version);
    const languages = version.getAllLanguagesForStringValues();
    for (const language of languages.length ? languages : [{ lang: 1033, codepage: 1200 }]) {
      version.setStringValues(language, { CompanyName: 'Orchestra', FileDescription: 'Orchestra', ProductName: 'Orchestra', InternalName: 'Orchestra', OriginalFilename: 'Orchestra.exe', FileVersion: pkg.version, ProductVersion: pkg.version, LegalCopyright: pkg.build?.copyright ?? 'Orchestra' });
    }
    version.outputToResourceEntries(resources.entries);
  }
  const icons = Data.IconFile.from(await fs.promises.readFile(iconPath)).icons.map((item) => item.data);
  const groups = Resource.IconGroupEntry.fromEntries(resources.entries);
  for (const group of groups.length ? groups : [{ id: 1, lang: 1033 }]) Resource.IconGroupEntry.replaceIconsForResource(resources.entries, group.id, group.lang, icons);
  resources.outputResource(executable);
  const temporary = target + '.' + randomUUID() + '.tmp';
  const temporaryStamp = stamp + '.' + randomUUID() + '.tmp';
  try {
    await fs.promises.writeFile(temporary, Buffer.from(executable.generate()), { flag: 'wx' });
    // Un second double-clic a pu finir la même préparation entre-temps.
    if (await cached()) return { executable: target, reused: true };
    await fs.promises.rename(temporary, target);
    const stat = await fs.promises.stat(target);
    await fs.promises.writeFile(temporaryStamp, JSON.stringify({ fingerprint, sourceHash, size: stat.size, mtime: stat.mtimeMs }));
    await fs.promises.rename(temporaryStamp, stamp);
    return { executable: target, reused: false };
  } catch (error) {
    if (await cached()) return { executable: target, reused: true };
    if (['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw new Error('Ferme complètement Orchestra avant de mettre à jour son runtime, puis relance launcher.exe.');
    throw error;
  } finally {
    await Promise.all([temporary, temporaryStamp].map((file) => fs.promises.unlink(file).catch(() => {})));
  }
}

if (require.main === module) prepareRuntime().then(({ reused }) => console.log(`Orchestra.exe ${reused ? 'déjà prêt' : 'préparé avec le logo Orchestra'}.`)).catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { prepareRuntime, hashFile };
