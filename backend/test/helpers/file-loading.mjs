import Fs from 'fs'; const { readFile, writeFile, unlink } = Fs.promises;
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import Tmp from 'tmp-promise';
import JsYAML from 'js-yaml'; const { safeLoad, safeDump } = JsYAML;
import { parseExcelFile } from '../../lib/excel-parsing.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cache = {};

function getAssetPath(relPath) {
  const path = join(__dirname, '../assets', relPath);
  return path;
}

function getRepoPath() {
  const path = resolve(__dirname, '../../..');
  return path;
}

async function loadExcelFile(filename, options) {
  const data = await loadAsset(filename);
  const json = await parseExcelFile(data, options || { locale: 'en-US' });
  return json;
}

async function loadAsset(filename) {
  if (cache[filename]) {
    return cache[filename];
  }
  const path = getAssetPath(filename);
  const data = await readFile(path);
  cache[filename] = data;
  return data;
}

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

export {
  loadExcelFile,
  loadAsset,
  getAssetPath,
  getRepoPath,
  createTempFolder,
  saveYAML,
  removeYAML,
};
