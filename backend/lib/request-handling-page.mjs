import { retrieveFromGit } from './file-retrieval.mjs';
import { generatePage } from './page-generation.mjs';
import { findAccessToken } from './config-management.mjs';
import { getHash }  from './content-storage.mjs';
import { HttpError } from './error-handling.mjs';
import { extname } from 'path';

/**
 * Handle page request
 *
 * @param  {Request}  req
 * @param  {Response} res
 * @param  {function} next
 */
async function handlePageRequest(req, res, next) {
  const { page, filename } = req.params;
  const { site, ref } = req;
  try {
    if (!site || !site.code) {
      throw new HttpError(404);
    }
    const { locale } = site;
    const { url, path } = site.code;
    const gitParams = { url, path, ref };
    if (url) {
      gitParams.accessToken = await findAccessToken(url);
    }
    let buffer, type, etag;
    if (page !== undefined) {
      // a page request
      const pageParams = { pagePath: page };
      const { html, sources } = await generatePage(pageParams, gitParams, locale);
      buffer = Buffer.from(html);
      type = 'html';
      etag = getHash(buffer);
    } else if (filename) {
      // a request for a dependent file
      buffer = await retrieveFromGit(`www/${filename}`, gitParams);
      type = extname(filename).substr(1);
      etag = buffer.sha;
    }
    if (etag) {
      const ifNoneMatch = req.headers['if-none-match'];
      if (ifNoneMatch === etag) {
        res.status(304).end();
        return;
      }
      res.set('ETag', etag);
    }
    res.type(type).send(buffer);
  } catch (err) {
    if(filename === 'favicon.ico') {
      res.status(204).end();
      return;
    }
    next(err);
  }
}

export {
  handlePageRequest,
};
