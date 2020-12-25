import { retrieveFromCloud, retrieveFromDisk } from './file-retrieval.mjs';
import { parseExcelFile, parseCSVFile, stripCellStyle } from './excel-parsing.mjs';
import { loadSiteContent, loadSiteContentMeta, findSiteContentMeta } from './content-loading.mjs';
import { saveSiteContent, saveSiteContentMeta } from './content-saving.mjs';
import { getHash } from './content-naming.mjs';
import { getImageMeta } from './request-handling-image.mjs';
import { getSiteURL } from './page-linking.mjs';
import { HttpError } from './error-handling.mjs';

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
    const fileIndex = parseInt(name);
    if (fileIndex >= 0) {
      const file = site.files[fileIndex];
      if (file) {
        const urlParts = getSiteURL(site, `/-/data/${file.name}`);
        res.redirect(urlParts);
        return;
      }
    }
    const file = site.files.find((f) => f.name === name);
    if (!file) {
      throw new HttpError(404);
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
    try {
      if (file.url) {
        sourceFile = await retrieveFromCloud(file.url, options);
      } else if (file.path) {
        sourceFile = await retrieveFromDisk(file.path, options);
      }
    } catch (err) {
      if (meta) {
        // keep sending the data that were extracted earlier
        // but save the error
        const error = {
          status: err.status,
          message: err.message,
        };
        await saveSiteContentMeta(site, 'data', hash, { ...meta, error });
      } else {
        throw err;
      }
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
        mtime = (meta.mtime) ? new Date() : null;
      }
    } else {
      // parse source file
      const { locale: defLocale } = site;
      const { timeZone, locale = defLocale, headers } = file;
      const { filename } = sourceFile;
      let json, etime;
      if (/\.json$/i.test(filename)) {
        json = JSON.parse(sourceFile);
      } else if (/\.csv$/i.test(filename)) {
        const sheetName = filename.substr(0, filename.length - 4);
        json = await parseCSVFile(sourceFile, { locale, timeZone, sheetName });
      } else if (/\.xlsx$/i.test(filename)) {
        json = await parseExcelFile(sourceFile, { locale, timeZone, headers });
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
    if (req.query.style === '0') {
      const json = JSON.parse(content);
      stripCellStyle(json);
      const text = JSON.stringify(json, undefined, 2);
      content = Buffer.from(text);
    }
    res.set('Cache-control', `max-age=${file.maxAge}`);
    if (etag) {
      res.set('ETag', etag);
    }
    if (mtime) {
      res.set('Last-modified', mtime.toUTCString());
    }
    res.set('Content-Length', content.length);
    res.type('text').send(content);
  } catch (err) {
    next(err);
  }
}

async function saveEmbeddedMedia(site, json) {
  // find all the cells with images
  const imageCells = [];
  for (let sheet of json.sheets) {
    for (let column of sheet.columns) {
      if (column.header) {
        if (column.header.image) {
          imageCells.push(column.header);
        }

      }
      for (let cell of column.cells) {
        if (cell.image) {
          imageCells.push(cell);
        }
      }
    }
  }
  const imageHashes = [];
  const processed = {};
  for (let cell of imageCells) {
    try {
      const { buffer, extension: format, srcRect } = cell.image;
      const hash = getHash(buffer);
      let meta = processed[hash];
      if (!meta) {
        await saveSiteContent(site, 'images', hash, format, buffer, { hashed: 'content' });
        meta = await findSiteContentMeta(site, 'images', hash);
        if (!meta) {
          const { width, height } = await getImageMeta(buffer, format);
          meta = processed[hash] = { width, height, format };
          await saveSiteContentMeta(site, 'images', hash, meta);
        }
      }
      const { width, height } = meta;
      let crop;
      if (srcRect) {
        // srcRect contain percentages
        const left = convertToPixels(width, srcRect.l);
        const right = convertToPixels(width, srcRect.r);
        const top = convertToPixels(height, srcRect.t);
        const bottom = convertToPixels(height, srcRect.b);
        if (left || right || top || bottom) {
          crop = {
            left, top,
            width: width - left - right,
            height: height - top - bottom,
          };
        }
      }
      // replace image with ref
      cell.image = { hash, width, height, crop, format };
      imageHashes.push(hash);
    } catch (err) {
      // image cannot be read so get rid of it
      delete cell.image;
    }
  }
  return (imageHashes.length > 0) ? imageHashes : undefined;
}

function convertToPixels(dim, millipercent) {
  return Math.max(0, Math.round(dim * (millipercent / 100000)))
}

export {
  handleDataRequest,
  saveEmbeddedMedia,
};
