import FS from 'fs'; const { readFile, readdir } = FS.promises;
import { join } from 'path';

async function loadSiteContent(site, folder, hash) {
  const { storage } = site;
  const meta = await loadSiteContentMeta(site, folder, hash);
  let ext = '';
  switch (folder) {
    case 'images': ext = meta.format; break;
    case 'data': ext = 'json'; break;
    case 'git': ext = meta.extension; break;
      break;
  }
  const filename = (ext) ? `${hash}.${ext}` : hash;
  const path = join(storage.path, folder, filename);
  const content = await readFile(path);
  return { content, meta };
}

async function loadSiteContentMeta(site, folder, hash) {
  const { storage } = site;
  const path = join(storage.path, folder, `${hash}.meta.json`);
  const string = await readFile(path, 'utf-8');
  const json = JSON.parse(string);
  return json;
}

export {
  loadSiteContent,
  loadSiteContentMeta,
};
