import { retrieveFromCloud, retrieveFromDisk } from './file-retrieval.mjs';
import { parseExcelFile, parseCSVFile } from './excel-parsing.mjs';
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
    let content, etag, mtime;
    if (!sourceFile) {
      // no change has occurred since the file was last read
      // see if the browser has given us an etag to check against
      const ifNoneMatch = req.headers['if-none-match'];
      if (ifNoneMatch === meta.etag) {
        res.status(304).end();
        return;
      } else {
        // load the content
        content = await loadSiteContent(site, 'data', hash, 'json');
        etag = meta.etag;
        mtime = new Date(meta.mtime);
      }
    } else {
      // parse source file
      const { timeZone, columnNames } = site;
      const { filename } = sourceFile;
      let json, etime;
      if (/\.json$/i.test(filename)) {
        json = JSON.parse(sourceFile);
      } else if (/\.csv$/i.test(filename)) {
        const sheetName = filename.substr(0, filename.length - 4);
        json = await parseCSVFile(sourceFile, { timeZone, sheetName });
      } else if (/\.xlsx$/i.test(filename)) {
        json = await parseExcelFile(sourceFile, { timeZone, columnNames });
        etime = json.expiration;
      } else {
        throw new Error(`Unknown file type: ${buffer.filename}`);
      }
      // save any embedded images
      const images = await saveEmbeddedMedia(site, json);
      // save content
      const text = JSON.stringify(json, undefined, 2);
      content = Buffer.from(text);
      etag = sourceFile.etag;
      mtime = sourceFile.mtime;
      await saveSiteContent(site, 'data', hash, 'json', content);
      // save metadata
      const meta = { ...file, etag, mtime, etime, images };
      await saveSiteContentMeta(site, 'data', hash, meta);
    }
    if (etag) {
      res.set('ETag', etag);
    }
    if (mtime) {
      res.set('Last-modified', mtime.toUTCString());
    }
    res.send(content);
  } catch (err) {
    next(err);
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
  return (imageHashes.length > 0) ? imageHashes : undefined;
}

export {
  handleDataRequest,
  saveEmbeddedMedia,
};
