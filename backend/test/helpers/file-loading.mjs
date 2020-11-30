import Fs from 'fs'; const { readFile } = Fs.promises;
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseExcelFile } from '../../lib/excel-parsing.mjs';

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

export {
  loadExcelFile,
  loadAsset,
  getAssetPath,
};
