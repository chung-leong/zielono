import Fs from 'fs'; const { readFile } = Fs.promises;
import { getAssetPath } from './path-finding.mjs';
import { parseExcelFile } from '../../lib/excel-parsing.mjs';

const cache = {};

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
};
