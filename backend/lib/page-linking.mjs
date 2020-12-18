import { findGitAdapter } from './git-adapters.mjs';
import { ssrRootFolder } from './page-generation.mjs';
import { findAccessToken } from './config-loading.mjs';
import { getIPv4Address } from './network-handling.mjs';
import { findServerConfig } from './config-loading.mjs';

async function findPageVersions(site, options) {
  const { useRef } = options;
  if (!site.code) {
    throw new Error(`Site "${site.name}" does not have a code section`);
  }
  const folder = ssrRootFolder;
  const { url, path } = site.code;
  const repo = { url, path };
  const adapter = findGitAdapter(repo);
  if (!adapter) {
    const { url, path } = options;
    throw new Error(`Cannot find an adapter for repo: ${url || path}`);
  }
  const token = (url) ? findAccessToken(url) : undefined;
  const codeVersions = await adapter.retrieveVersions(folder, repo, { token });
  const versionRefs = (useRef) ? await adapter.retrieveVersionRefs(folder, repo, { token }) : {};
  let defaultRef = site.code.ref;
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

function getSiteURL(site) {
  const url = getServerURL();
  if (site.domains.length > 0) {
    url.hostname = site.domains[0];
  } else {
    url.pathname += `${site.name}/`;
  }
  return url;
}

function getServerURL() {
  const server = findServerConfig();
  if (server.nginx) {
    return new URL(server.nginx.url);
  } else {
    const port = server.listen[0];
    return new URL(`http://${getIPv4Address()}:${port}`);
  }
}

export {
  findPageVersions,
  getSiteURL,
  getServerURL,
};
