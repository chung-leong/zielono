import createApp from 'express';
import createCORSHandler from 'cors';
import createCompressionHandler from 'compression';
import { getSiteConfigs, getServerConfig } from './config-management.mjs';
import { handleImageRequest } from './request-handling-image.mjs';
import { handleDataRequest } from './request-handling-data.mjs';
import { handlePageRequest } from './request-handling-page.mjs';
import { handleAdminRequest } from './request-handling-admin.mjs';
import { HttpError } from './error-handling.mjs';

async function startHTTPServer() {
  // start up Express
  const app = createApp();
  // attach request handlers
  addHandlers(app);
  // get server settings
  const config = await getServerConfig();
  // wait for server to start up
  return new Promise((resolve, reject) => {
    const args = [ ...config.listen, () => resolve(server) ];
    const server = app.listen(...args);
    server.once('error', (evt) => reject(new Error(evt.message)));
  });
}

async function stopHTTPServer(server, maxWait) {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, maxWait);
    server.on('close', () => {
      resolve();
      clearTimeout(timeout);
    });
    server.close();
  });
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
async function handleSiteAssociation(req, res, next) {
  try {
    const { hostname, port, originalUrl, url } = req;
    const server = await getServerConfig();
    const sites = await getSiteConfigs();
    let baseUrl = '';
    let site = sites.find((s) => s.domains.includes(hostname));
    if (site) {
      const domainIndex = site.domains.indexOf(hostname);
      if (domainIndex > 0) {
        // redirect to canonical domain name to improve caching
        if (server.nginx) {
          const host = site.domains[0] + (port != 80 ? `:${port}` : '');
          const url = `//${host}${originalUrl}`;
          res.set({ 'X-Accel-Redirect': url });
          res.end();
          return;
        }
      }
    } else {
      // see if the URL starts with the name of a site
      site = sites.find((s) => url.startsWith(`/${s.name}/`));
      if (site) {
        baseUrl = `/${site.name}`;
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
