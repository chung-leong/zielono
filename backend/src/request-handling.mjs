import createApp from 'express';
import createCORSHandler from 'cors';
import createCompressionHandler from 'compression';
import { getSiteConfigs, getServerConfig } from './config-management.mjs';

async function startHTTPServer() {
  // start up Express
  const app = createApp();
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
  app.use(handleError);

  const server = await new Promise((resolve, reject) => {
    const server = app.listen(80, () => resolve(server));
    server.once('error', (evt) => reject(new Error(evt.message)));
  });
  return server;
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

async function handleSiteAssociation(req, res, next) {
  try {
    const { hostname, port, originalUrl, url } = req;
    const server = await getServerConfig();
    const sites = await getSiteConfigs();
    let site = sites.find((s) => s.domains && s.domains.includes(hostname));
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
        // trim off the name
        req.url = url.substr(site.name.length + 1);
      }
    }
    req.site = site;
    req.server = server;
    next();
  } catch (err) {
    next(err);
  }
}

function handleError(err, req, res, next) {
  if (res.headersSent) {
    return next(err)
  }
  const status = err.status || err.statusCode || 400;
  res.type('text').status(status).send(err.message);
}

export {
  startHTTPServer,
  stopHTTPServer,
  handleSiteAssociation,
  handleError,
};
