import Fs from 'fs'; const { readFile } = Fs.promises;
import { findInflightData } from './content-saving.mjs';
import { getServerContentPath, getSiteContentPath } from './content-naming.mjs';

async function loadServerContent(folder, hash, ext) {
  const path = getServerContentPath(folder, hash, ext);
  return loadContent(path);
}

async function loadServerContentMeta(folder, hash) {
  const buffer = await loadServerContent(folder, hash, 'meta.json');
  const json = JSON.parse(buffer);
  return json;
}

async function findServerContentMeta(site, folder, hash) {
  try {
    return await loadServerContentMeta(site, folder, hash)
  } catch (err){
  }
}

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
  loadServerContent,
  loadServerContentMeta,
  findServerContentMeta,
  loadSiteContent,
  loadSiteContentMeta,
  findSiteContentMeta,
};
