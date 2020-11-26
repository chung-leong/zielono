import FS from 'fs'; const { readFile, writeFile, lstat } = FS.promises;
import { join } from 'path';
import { createHash } from 'crypto';

function getHash(data) {
  const hash = createHash('sha1');
  hash.update(data);
  return hash.digest('hex');
}

function getSiteContentPath(site, folder, hash, ext) {
  const { storage } = site;
  const filename = (ext) ? `${hash}.${ext}` : hash;
  const path = join(storage.path, folder, filename);
  return path;
}

async function loadSiteContent(site, folder, hash, ext) {
  const path = getSiteContentPath(site, folder, hash, ext)
  const content = await readFile(path);
  return content;
}

async function loadSiteContentMeta(site, folder, hash) {
  const buffer = await loadSiteContent(site, folder, hash, 'meta.json');
  const json = JSON.parse(buffer);
  return json;
}

async function checkSiteContent(site, folder, hash, ext, size) {
  const path = getSiteContentPath(site, folder, hash, ext)
  try {
    const stat = await lstat(path);
    return (stat.size == size);
  } catch (err) {
    return false;
  }
}

async function saveSiteContent(site, folder, hash, ext, buffer) {
  const path = getSiteContentPath(site, folder, hash, ext)
  await writeFile(path, buffer);
}

async function saveSiteContentMeta(site, folder, hash, meta) {
  const text = JSON.stringify(meta, undefined, 2);
  const buffer = Buffer.from(text);
  await saveSiteContent(site, folder, hash, 'meta.json', buffer);
}

async function findSiteContentMeta(site, folder, hash) {
  try {
    loadSiteContentMeta(site, folder, hash)
  } catch (err){
  }
}

export {
  getHash,
  checkSiteContent,
  loadSiteContent,
  loadSiteContentMeta,
  findSiteContentMeta,
  saveSiteContent,
  saveSiteContentMeta,
};
