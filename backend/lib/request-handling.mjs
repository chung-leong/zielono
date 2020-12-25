import createApp, { json as createJSONParser } from 'express';
import createCORSHandler from 'cors';
import createCompressionHandler from 'compression';
import { findSiteConfigs, findServerConfig } from './config-loading.mjs';
import { getServerURL, getSiteURL, atSiteURL } from './page-linking.mjs';
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
  app.use(handleRedirection);
  app.use(handleSiteAssociation);
  app.use('/zielono', handleAdminRequest);
  app.use('/:page(*)/:resource(-/*)', handleResourceRedirection);
  app.get('/-/data/:name', handleDataRequest);
  app.get('/-/images/:hash/:filename?', handleImageRequest);
  app.get('/-/*', handleInvalidRequest);
  app.use(handleRefExtraction);
  app.use(handleLocaleExtraction);
  app.use('/:page(*)/:resource(*.*)', handleResourceRedirection);
  app.get('/:filename(*.*)', handlePageRequest);
  app.get('/:page(*)', handlePageRequest);
  app.use(handleError);
}

/**
 * Attach custom verion of res.redirect()
 *
 * @param  {Request}  req
 * @param  {Response} res
 * @param  {function} next
 */
function handleRedirection(req, res, next) {
  const f = res.redirect;
  res.redirect = function(url, options = {}) {
    const { permanent = false, internal = false } = options;
    const status = (permanent) ? 301 : 302;
    if (url instanceof URL) {
      const serverURL = getServerURL();
      if (url.host === serverURL.host) {
        url = url.href.substr(url.origin.length);
      } else {
        // exclude protocol
        url = url.href.substr(url.protocol.length);
      }
    }
    if (internal) {
      res.set('X-Accel-Redirect', url);
      res.end();
    } else {
      f.call(this, status, url);
    }
  };
  next();
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
    const { hostname, query, url } = req;
    const server = findServerConfig();
    const sites = findSiteConfigs();
    let baseUrl = '';
    let site = sites.find((s) => s.domains.includes(hostname));
    if (site) {
      const domainIndex = site.domains.indexOf(hostname);
      if (domainIndex > 0) {
        // redirect to canonical domain name to improve caching
        if (server.nginx) {
          const urlParts = getSiteURL(site, url, query);
          res.redirect(urlParts, { internal: true });
          return;
        }
      }
    } else {
      // see if the URL starts with the name of a site
      site = sites.find((s) => atSiteURL(url, s));
      if (site) {
        baseUrl = `/${site.name}`;
      } else if (url === '/') {
        const urlParts = getServerURL('/zielono/');
        res.redirect(urlParts);
        return;
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
    req.ref = m[1];
    req.url = url.substr(m[0].length);
  }
  next();
}

/**
 * Extract locale code from URL, redirecting if it's absent and user preference does
 * not match default site locale
 *
 * @param  {Request}  req
 * @param  {Response} res
 * @param  {function} next
 */
function handleLocaleExtraction(req, res, next) {
  const { site, url, query } = req;
  if (site && site.locale && site.localization !== 'off') {
    const m = /^\/([a-z]{2}(\-[a-z]{2})?)\b/i.exec(url);
    if (m) {
      req.locale = m[1];
      req.url = url.substr(m[0].length);
    } else {
      req.locale = site.locale;
      // see if we should redirect to foreign language version
      const accepted = req.headers['accept-language'];
      const locales = [];
      if (accepted) {
        for (let token of accepted.split(/\s*,\s*/)) {
          const m = /([^;]+);q=(.*)/.exec(token);
          const code = (m) ? m[1] : token;
          const qFactor = (m) ? parseFloat(m[2]) : 1;
          const [ language, country ] = code.toLowerCase().split('-');
          if (site.localization === 'full') {
            // don't include country-less entry when there's one of that language already
            if (!country) {
              if (locales.find((l) => l.language === language)) {
                continue;
              }
            }
          }
          locales.push({ language, country, qFactor });
        }
      }
      const [ siteLanguage, siteCountry ] = site.locale.toLowerCase().split('-');
      const match = locales.find(({ language, country }) => {
        if (site.localization === 'full' && country && siteCountry) {
          return (language === siteLanguage && country === siteCountry);
        } else {
          return (language === siteLanguage);
        }
      });
      if (!match && locales.length > 0) {
        locales.sort((a, b) => b.qFactor - a.qFactor);
        const { language, country } = locales[0];
        const prefix = (site.localization === 'full' && country) ? `/${language}-${country}` : `/${language}`;
        const urlParts = getSiteURL(site, prefix + url, query);
        res.redirect(urlParts);
        return;
      }
    }
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
  const { site, query } = req;
  const { page, resource } = req.params;
  if (site) {
    const urlParts = getSiteURL(site, resource, query);
    res.redirect(urlParts, { permanent: true });
    return;
  }
  next();
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
  if (process.env.NODE_ENV === 'production') {
    const { message, status = 400 } = err;
    res.type('text').status(status).send(message);
  } else {
    const { stack, status = 400 } = err;
    res.type('text').status(status).send(stack);
  }
}

export {
  startHTTPServer,
  stopHTTPServer,
  addHandlers,
  handleRedirection,
  handleSiteAssociation,
  handleRefExtraction,
  handleLocaleExtraction,
  handleResourceRedirection,
  handleInvalidRequest,
  handleError,
};
