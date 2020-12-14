import Fs from 'fs'; const { readFile, writeFile, stat } = Fs.promises;
import mkdirp from 'mkdirp';
import { dirname, join } from 'path';
import { createHash } from 'crypto';

function getHash(...args) {
  const hash = createHash('sha1');
  for (let data of args) {
    hash.update(data);
  }
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
  // look for file in write queue
  const op = writeQueue.find((op) => op.path === path);
  if (op) {
    // return the copy being written to disk
    return op.buffer;
  }
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
    const stat = await stat(path);
    return (stat.size == size);
  } catch (err) {
    return false;
  }
}

const writeQueue = [];

async function saveSiteContent(site, folder, hash, ext, buffer) {
  const path = getSiteContentPath(site, folder, hash, ext)
  // save in queue so the loadSiteContent() can find it
  const op = { path, buffer };
  writeQueue.push(op);
  // ensure folder exists
  const folderPath = dirname(path);
  await mkdirp(folderPath);
  await writeFile(path, buffer);
  // pop it back out
  const index = writeQueue.indexOf(op);
  writeQueue.splice(index, 1);
}

async function saveSiteContentMeta(site, folder, hash, meta) {
  const text = JSON.stringify(meta, undefined, 2);
  const buffer = Buffer.from(text);
  await saveSiteContent(site, folder, hash, 'meta.json', buffer);
}

async function findSiteContentMeta(site, folder, hash) {
  try {
    return await loadSiteContentMeta(site, folder, hash)
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
