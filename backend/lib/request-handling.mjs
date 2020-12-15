import createApp, { json as createJSONParser } from 'express';
import createCORSHandler from 'cors';
import createCompressionHandler from 'compression';
import { findSiteConfigs, findServerConfig } from './config-loading.mjs';
import { handleImageRequest } from './request-handling-image.mjs';
import { handleDataRequest } from './request-handling-data.mjs';
import { handlePageRequest } from './request-handling-page.mjs';
import { handleAdminRequest } from './request-handling-admin.mjs';
import { handleHookRequest, handleHookRequestValidation } from './request-handling-hook.mjs';
import { HttpError } from './error-handling.mjs';

let server;

async function startHTTPServer() {
  // start up Express
  const app = createApp();
  // attach request handlers
  addHandlers(app);
  // get server settings
  const config = findServerConfig();
  // wait for server to start up
  await new Promise((resolve, reject) => {
    const args = [ ...config.listen, resolve ];
    server = app.listen(...args);
    server.once('error', (evt) => reject(new Error(evt.message)));
  });
  return server;
}

async function stopHTTPServer(maxWait = 5000) {
  if (server) {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, maxWait);
      server.on('close', () => {
        resolve();
        clearTimeout(timeout);
      });
      server.close();
      server = undefined;
    });
  }
}

/**
 * Add handlers to Express app
 *
 * @param {Express} app
 */
function addHandlers(app) {
  app.set('json spaces', 2);
  // allow these headers to be seen in cross-site requests
  const exposedHeaders = [
    'etag',
    'X-Cache-Status',
    'X-Total',
    'X-Total-Pages',
  ];
  app.use(createCORSHandler(exposedHeaders));
  // compress responses here so compressed file are stored in the cache
  app.use(createCompressionHandler());
  // validate signatures in hook requests are correct 
  app.use(handleHookRequestValidation);
  app.use(createJSONParser());
  app.post('/-/hook/:hash', handleHookRequest);
  app.use(handleSiteAssociation);
  app.use('/zielono', handleAdminRequest);
  app.use(handleRefExtraction);
  app.use('/:page(*)/:resource(-/*)', handleResourceRedirection);
  app.get('/-/data/:name', handleDataRequest);
  app.get('/-/images/:hash/:filename?', handleImageRequest);
  app.get('/-/*', handleInvalidRequest);
  app.use('/:page(*)/:resource(*.*)', handleResourceRedirection);
  app.get('/:filename(*.*)', handlePageRequest);
  app.get('/:page(*)', handlePageRequest);
  app.use(handleError);
}

/**
 * Attach site configuration to request object when domain name or folder name
 * matches
 *
 * @param  {Request}  req
 * @param  {Response} res
 * @param  {function} next
 */
function handleSiteAssociation(req, res, next) {
  try {
    const { hostname, originalUrl, url } = req;
    const server = findServerConfig();
    const sites = findSiteConfigs();
    let baseUrl = '';
    let site = sites.find((s) => s.domains.includes(hostname));
    if (site) {
      const domainIndex = site.domains.indexOf(hostname);
      if (domainIndex > 0) {
        // redirect to canonical domain name to improve caching
        if (server.nginx) {
          const host = attachServerPort(site.domains[0], server);
          const url = `//${host}${originalUrl}`;
          res.set({ 'X-Accel-Redirect': url });
          res.end();
          return;
        }
      }
    } else {
      // see if the URL starts with the name of a site
      site = sites.find((s) => atBaseURL(url, `/${s.name}`));
      if (site) {
        baseUrl = `/${site.name}`;
      } else if (url === '/') {
        const first = sites[0];
        if (first) {
          if (first.domains[0]) {
            const host = attachServerPort(site.domains[0], server);
            res.redirect(`//${host}`);
          } else {
            res.redirect(`/${first.name}`);
          }
          return;
        }
      }
    }
    req.url = url.substr(baseUrl.length);
    req.baseUrl = baseUrl;
    req.site = site;
    req.server = server;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Extract ref (branch, tag, or commit id) from URL
 *
 * @param  {Request}  req
 * @param  {Response} res
 * @param  {function} next
 */
function handleRefExtraction(req, res, next) {
  const { url } = req;
  const m = /^\/\(([^\)\s]+)\)/.exec(url);
  if (m) {
    req.ref= m[1];
    req.url = url.substr(m[0].length);
  }
  next();
}

/**
 * Redirect resource request with address relative to page URL to address
 * relative to base URL
 *
 * @param  {Request}  req
 * @param  {Response} res
 * @param  {function} next
 */
function handleResourceRedirection(req, res, next) {
  const { originalUrl, baseUrl } = req;
  const { page } = req.params;
  const newUrl = baseUrl + originalUrl.substr(baseUrl.length + 1 + page.length);
  res.redirect(301, newUrl);
}

/**
 * Raise a 404 Not found error when backend request isn't valid
 *
 * @param  {Request}  req
 * @param  {Response} res
 * @param  {function} next
 */
function handleInvalidRequest(req, res, next) {
  next(new HttpError(404));
}

/**
 * Output error to client
 *
 * @param  {Error}    err
 * @param  {Request}  req
 * @param  {Response} res
 * @param  {function} next
 */
function handleError(err, req, res, next) {
  if (res.headersSent) {
    return next(err)
  }
  const { message, status = 400 } = err;
  res.type('text').status(status).send(message);
}

/**
 * Check if url is based on another
 *
 * @param  {string} url
 * @param  {string} baseURL
 *
 * @return {boolean}
 */
function atBaseURL(url, baseURL) {
  if (url.startsWith(baseURL)) {
    if (baseURL.length === url.length || url.charAt(baseURL.length) === '/') {
      return true;
    }
  }
  return false;
}

function attachServerPort(domain, server) {
  let port = 80;
  if (server.nginx && server.nginx.url) {
    const urlParts = new URL(server.nginx.url);
    if (urlParts.port) {
      port = parseInt(urlParts.port);
    }
  } else if (typeof(server.listen[0]) === 'number') {
    port = server.listen[0];
  }
  return (port === 80 || port === 443) ? domain : `${domain}:${port}`;
}

export {
  startHTTPServer,
  stopHTTPServer,
  addHandlers,
  handleSiteAssociation,
  handleRefExtraction,
  handleResourceRedirection,
  handleInvalidRequest,
  handleError,
};
