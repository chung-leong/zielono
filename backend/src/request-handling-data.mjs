import { retrieveFromCloud, retrieveFromDisk } from './file-retrieval.mjs';
import { parseExcelFile } from './excel-parsing.mjs';
import { getHash }  from './content-storage.mjs';
import {
  findSiteContentMeta, loadSiteContent, loadSiteContentMeta,
  checkSiteContent, saveSiteContent, saveSiteContentMeta
 } from './content-storage.mjs';
import { getImageMeta } from './request-handling-image.mjs';
import { HTTPError } from './error-handling.mjs';

/**
 * Handle data request
 *
 * @param  {Request}  req
 * @param  {Response} res
 * @param  {function} next
 */
async function handleDataRequest(req, res, next) {
  try {
    const { site } = req;
    const { name } = req.params;
    const file = site.files.find((f) => f.name === name);
    if (!file) {
      throw new HTTPError(404);
    }
    // find the file's metadata (if it's been used before)
    const hash = getHash(file.url || file.path);
    const options = {};
    const meta = await findSiteContentMeta(site, 'data', hash);
    if (meta && meta.timeZone === file.timeZone) {
      options.etag = meta.etag;
      options.mtime = meta.mtime;
    }
    let sourceFile;
    if (file.url) {
      sourceFile = await retrieveFromCloud(file.url, options);
    } else {
      sourceFile = await retrieveFromDisk(file.path, options);
    }
    if (!sourceFile) {
      // no change has occurred since the file was last read
      // see if the browser has given us an etag to check against
      const ifNoneMatch = req.headers['if-none-match'];
      if (ifNoneMatch === meta.etag) {
        res.status(304).end();
      } else {
        // load the content and send it
        const content = await loadSiteContent(site, 'data', hash, 'json');
        res.send(content);
      }
      return;
    }
    // parse Excel file
    const { timeZone, columnNames } = site;
    const json = await parseSourceFile(sourceFile, { timeZone, columnNames });
    // save any embedded images
    const images = await saveEmbeddedMedia(site, json);
    const text = JSON.stringify(json, undefined, 2);
    const content = Buffer.from(text);
    const newMeta = {
      ...file,
      etag: sourceFile.etag,
      mtime: sourceFile.mtime,
      etime: content.expiration,
      images,
    };
    await saveSiteContentMeta(site, 'data', hash, newMeta);
    await saveSiteContent(site, 'data', hash, 'json', content);
    if (sourceFile.etag) {
      res.set('ETag', sourceFile.etag);
    }
    if (sourceFile.mtime) {
      res.set('Last-modified', sourceFile.mtime.toUTCString());
    }
    res.send(content);
  } catch (err) {
    next(err);
  }
}

async function parseSourceFile(buffer, options) {
  if (/\.json$/.test(buffer.filename)) {
    const json = JSON.parse(buffer.toString());
    return json;
  } else {
    return parseExcelFile(buffer, options);
  }
}

async function saveEmbeddedMedia(site, json) {
  // find all the cells with images
  const imageCells = [];
  for (let sheet of json.sheets) {
    for (let row of sheet.rows) {
      for (let cell of row) {
        if (cell.image) {
          imageCells.push(cell);
        }
      }
    }
  }
  const imageHashes = [];
  for (let cell of imageCells) {
    try {
      // get image metadata first
      const { buffer, extension: format } = cell.image;
      const { width, height } = await getImageMeta(buffer, format);
      const hash = getHash(buffer);
      // see if the file exists already
      const exists = await checkSiteContent(site, 'images', hash, format, buffer.length);
      if (!exists) {
        await saveSiteContent(site, 'images', hash, format, buffer);
      }
      const meta = await findSiteContentMeta(site, 'images', hash);
      if (!meta) {
        const newMeta = { width, height, format };
        await saveSiteContentMeta(site, 'images', hash, newMeta);
      }
      // replace image with ref
      cell.image = { hash, width, height, format };
      imageHashes.push(hash);
    } catch (err) {
      // image cannot be read so get rid of it
      delete cell.image;
    }
  }
  return imageHashes;
}

export {
  handleDataRequest,
  saveEmbeddedMedia,
};
