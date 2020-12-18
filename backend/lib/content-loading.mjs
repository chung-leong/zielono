import Fs from 'fs'; const { readFile } = Fs.promises;
import { findInflightData } from './content-saving.mjs';
import { getSiteContentPath } from './content-naming.mjs';

async function loadSiteContent(site, folder, hash, ext) {
  const path = getSiteContentPath(site, folder, hash, ext);
  return loadContent(path);
}

async function loadSiteContentMeta(site, folder, hash) {
  const buffer = await loadSiteContent(site, folder, hash, 'meta.json');
  const json = JSON.parse(buffer);
  return json;
}

async function findSiteContentMeta(site, folder, hash) {
  try {
    return await loadSiteContentMeta(site, folder, hash)
  } catch (err){
  }
}

async function loadContent(path) {
  const content = findInflightData(path) || await readFile(path);
  return content;
}

export {
  loadSiteContent,
  loadSiteContentMeta,
  findSiteContentMeta,
};
