import FS from 'fs'; const { readFile } = FS.promises;
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseExcelFile } from '../../src/excel-parsing.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadExcelFile(filename) {
  const data = await loadAsset(filename);
  const json = await parseExcelFile(data);
  return json;
}

async function loadAsset(filename) {
  const data = await readFile(`${__dirname}/../assets/${filename}`);
  return data;
}

export {
  loadExcelFile,
  loadAsset,
};
