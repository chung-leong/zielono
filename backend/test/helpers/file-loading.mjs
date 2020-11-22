import FS from 'fs'; const { readFile } = FS.promises;
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseExcelFile } from '../../src/excel-parsing.mjs';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
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
  const data = await readFile(`${__dirname}/../assets/${filename}`);
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
  getDigest,
};
