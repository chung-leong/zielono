import express from 'express';
import handleCORS from 'cors';
import handleCompression from 'compression';
import { getSiteConfigs, getServerConfig } from './config-management.mjs';

async function startHTTPServer() {
  // start up Express
  const app = express();
  const corsOptions = {
    exposedHeaders: [
      'etag',
      'X-Cache-Status',
      'X-Total',
      'X-Total-Pages',
    ],
  };
  app.set('json spaces', 2);
  app.use(handleCORS(corsOptions));
  app.use(handleCompression());
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
    const { hostname, port, originalUrl } = req;
    const server = await getServerConfig();
    const sites = await getSiteConfigs();
    for (let [ name, site ] of Object.entries(sites)) {
      if (!site.domains) {
        continue;
      }
      const domainIndex = site.domains.indexOf(hostname);
      if (domainIndex !== -1) {
        if (domainIndex > 0) {
          if (server.nginx) {
            const host = site.domains[0] + (port != 80 ? `:${port}` : '');
            const url = `//${host}${originalUrl}`;
            res.set({ 'X-Accel-Redirect': url });
            res.end();
            return;
          }
        }
        req.site = site;
      }
    }
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
