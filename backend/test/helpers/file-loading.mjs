import FS from 'fs'; const { readFile } = FS.promises;
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseExcelFile } from '../../src/excel-parsing.mjs';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cache = {};

function getAssetPath(relPath) {
  const path = join(__dirname, '../assets', relPath);
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

function getDigest(buffer) {
  const hash = createHash('sha1');
  hash.update(buffer);
  return hash.digest('hex');
}

export {
  loadExcelFile,
  loadAsset,
  getAssetPath,
  getDigest,
};
