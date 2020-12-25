import { join } from 'path';
import QueryString from 'querystring';
import { findGitAdapter } from './git-adapters.mjs';
import { ssrRootFolder } from './page-generation.mjs';
import { findAccessToken } from './config-loading.mjs';
import { getIPv4Address } from './network-handling.mjs';
import { findServerConfig } from './config-loading.mjs';

/**
 * Find different versions of a site's web-page, based on git log
 *
 * @param  {object} site
 * @param  {object} options
 * @param  {boolean} options.useRef
 *
 * @return {object[]}
 */
async function findPageVersions(site, options) {
  const { useRef } = options;
  if (!site.page) {
    throw new Error(`Site "${site.name}" is not configured for web-page generation`);
  }
  const folder = ssrRootFolder;
  const { url, path } = site.page.code;
  const repo = { url, path };
  const adapter = findGitAdapter(repo);
  if (!adapter) {
    const { url, path } = options;
    throw new Error(`Cannot find an adapter for repo: ${url || path}`);
  }
  const token = (url) ? findAccessToken(url) : undefined;
  const codeVersions = await adapter.retrieveVersions(folder, repo, { token });
  const versionRefs = (useRef) ? await adapter.retrieveVersionRefs(folder, repo, { token }) : {};
  let defaultRef = site.page.code.ref;
  if (useRef && !defaultRef) {
    // need to know the default branch
    defaultRef = await adapter.getDefaultBranch(repo, { token });
  }
  const versions = [];
  for (let codeVersion of codeVersions) {
    const { sha, date } = codeVersion;
    const refs = versionRefs[sha];
    let pageRef = sha;
    if (refs) {
      if (defaultRef && refs.includes(defaultRef)) {
        pageRef = undefined;
      } else {
        pageRef = refs[0];
      }
    }
    const pageURL = getSiteURL(site);
    if (pageRef) {
      pageURL.pathname += `(${pageRef})/`;
    }
    const version = { url: pageURL.href, ...codeVersion };
    versions.push(version);
  }
  return versions;
}

/**
 * Get the URL of a resource at a site
 *
 * @param  {object} site
 * @param  {string|undefined} subpath
 *
 * @return {URL}
 */
function getSiteURL(site, subpath, query) {
  const url = getServerURL();
  const path = (subpath) ? join('/', subpath) : '/';
  if (site.domains.length > 0) {
    url.hostname = site.domains[0];
    url.pathname += path.substr(1);
  } else {
    url.pathname += join(site.name, path);
  }
  if (query) {
    url.search = '?' + QueryString.encode(query);
  }
  return url;
}

/**
 * Get the URL of a resource at the server
 *
 * @param  {string|undefined} subpath
 *
 * @return {URL}
 */
function getServerURL(subpath, query) {
  const server = findServerConfig();
  const path = (subpath) ? join('/', subpath) : '/';
  let url;
  if (server.nginx) {
    url = new URL(server.nginx.url);
  } else {
    const port = server.listen[0];
    url = new URL(`http://${getIPv4Address()}:${port}`);
  }
  if (url.pathname.endsWith('/')) {
    url.pathname += path.substr(1);
  } else {
    url.pathname += path;
  }
  if (query) {
    url.search = '?' + QueryString.encode(query);
  }
  return url;
}

/**
 * Check if the given URL points to a resource at a site
 *
 * @param  {string} url
 * @param  {object} site
 *
 * @return {boolean}
 */
function atSiteURL(url, site) {
  const baseURL = `/${site.name}`;
  if (url.startsWith(baseURL)) {
    if (baseURL.length === url.length || url.charAt(baseURL.length) === '/') {
      return true;
    }
  }
  return false;
}

export {
  findPageVersions,
  getSiteURL,
  getServerURL,
  atSiteURL,
};
