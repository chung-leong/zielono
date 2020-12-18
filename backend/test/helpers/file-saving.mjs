import Fs from 'fs'; const { writeFile, unlink } = Fs.promises;
import { join } from 'path';
import mkdirp from 'mkdirp';
import Tmp from 'tmp-promise';
import { createHash } from 'crypto';
import JsYAML from 'js-yaml'; const { safeLoad, safeDump } = JsYAML;

async function createTempFolder() {
  const tmp = await Tmp.dir({ unsafeCleanup: true });
  after(() => tmp.cleanup());
  return { path: tmp.path };
}

async function saveYAML(tmpFolder, filename, json, mode) {
  const text = safeDump(json, { skipInvalid: true });
  const path = join(tmpFolder.path, filename + '.yaml');
  await writeFile(path, text, { mode });
}

async function removeYAML(tmpFolder, filename) {
  const path = join(tmpFolder.path, filename + '.yaml');
  await unlink(path);
}

async function saveCacheFile(tmpFolder, hostname, path) {
  const key = hostname + path;
  const hash = createHash('md5');
  hash.update(key);
  const filename = hash.digest('hex');
  const folder1 = filename.substr(filename.length - 3, 1);
  const folder2 = filename.substr(filename.length - 2, 2);
  const cacheFolder = join(tmpFolder.path, folder1, folder2);
  const entryPath = join(cacheFolder, filename);
  const list = [];
  list.push(Buffer.alloc(0x0140));
  list.push(Buffer.from(`\nKEY: ${key}\n ${4} `));
  list.push(Buffer.from(`Content-Length: 1234\n`));
  list.push(Buffer.from(`Host: ${hostname}\n`));
  list.push(Buffer.from(`\n`));
  list.push(Buffer.alloc(1234));
  const buffer = Buffer.concat(list);
  await mkdirp(cacheFolder);
  await writeFile(entryPath, buffer);
}

export {
  createTempFolder,
  saveYAML,
  removeYAML,
  saveCacheFile,
};
