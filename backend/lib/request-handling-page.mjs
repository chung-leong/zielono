import { retrieveFromGit } from './file-retrieval.mjs';
import { generatePage } from './page-generation.mjs';
import { findAccessToken } from './config-loading.mjs';
import { getHash }  from './content-naming.mjs';
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
    if (!site || !site.page) {
      throw new HttpError(404);
    }
    // TODO: this isn't right--locale should be specific to the request
    const { locale } = site;
    const { url, path } = site.page.code;
    const repo = { url, path };
    const token = (url) ? await findAccessToken(url) : undefined;
    let buffer, type, etag;
    if (page !== undefined) {
      // a page request--render it on server side
      // the following object will be passed to the SSR code
      const params = { path: page };
      const { html, sources } = await generatePage(params, repo, { token, ref, locale });
      buffer = Buffer.from(html);
      type = 'html';
      etag = getHash(buffer);
    } else if (filename) {
      // a request for a dependent file
      buffer = await retrieveFromGit(`www/${filename}`, repo, { token, ref });
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
