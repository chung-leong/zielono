import Chai from 'chai'; const { expect } = Chai;
import { saveYAML } from './helpers/file-saving.mjs';
import { createTempFolder } from './helpers/file-saving.mjs';
import { getGenericCodePath } from './helpers/path-finding.mjs';
import { setConfigFolder, loadConfig, findSiteConfig } from '../lib/config-loading.mjs';
import './helpers/conditional-testing.mjs';

import {
  getServerURL,
  getSiteURL,
  findPageVersions,
} from '../lib/page-linking.mjs';

describe('Page linking', function() {
  after(function() {
    setConfigFolder(undefined);
  })
  describe('getServerURL()', function() {
    it('should return the URL of the Nginx server when specified', async function() {
      const tmpFolder = await createTempFolder();
      await saveYAML(tmpFolder, 'zielono', {
        nginx: {
          url: 'https://somewhere.net'
        }
      });
      await loadConfig(tmpFolder.path);
      const result = getServerURL();
      expect(result.href).to.equal('https://somewhere.net/');
    })
    it('should return an URL with an IP address when Nginx config is missing', async function() {
      const tmpFolder = await createTempFolder();
      await saveYAML(tmpFolder, 'zielono', {});
      await loadConfig(tmpFolder.path);
      const result = getServerURL();
      expect(result.href).to.match(/http:\/\/\d+\.\d+\.\d+\.\d+:8080/);
    })
    it('should use the path of the Nginx URL', async function() {
      const tmpFolder = await createTempFolder();
      await saveYAML(tmpFolder, 'zielono', {
        nginx: {
          url: 'https://somewhere.net/zielono'
        }
      });
      await loadConfig(tmpFolder.path);
      const result = getServerURL();
      expect(result.href).to.equal('https://somewhere.net/zielono/');
    })
  })
  describe('getSiteURL()', function() {
    it('should return the URL using the first domain of the site', async function() {
      const tmpFolder = await createTempFolder();
      await saveYAML(tmpFolder, 'zielono', {
        nginx: {
          url: 'https://somewhere.net'
        }
      });
      await saveYAML(tmpFolder, 'site-1', {
        domains: [ 'donut.test', 'bigos.pl' ]
      });
      await loadConfig(tmpFolder.path);
      const site = findSiteConfig('site-1');
      const result = getSiteURL(site);
      expect(result.href).to.equal('https://donut.test/');
    })
    it('should use the port of the Nginx URL', async function() {
      const tmpFolder = await createTempFolder();
      await saveYAML(tmpFolder, 'zielono', {
        nginx: {
          url: 'https://somewhere.net:8080'
        }
      });
      await saveYAML(tmpFolder, 'site-1', {
        domains: [ 'donut.test', 'bigos.pl' ]
      });
      await loadConfig(tmpFolder.path);
      const site = findSiteConfig('site-1');
      const result = getSiteURL(site);
      expect(result.href).to.equal('https://donut.test:8080/');
    })
    it('should use the path of the Nginx URL', async function() {
      const tmpFolder = await createTempFolder();
      await saveYAML(tmpFolder, 'zielono', {
        nginx: {
          url: 'https://somewhere.net/zielono'
        }
      });
      await saveYAML(tmpFolder, 'site-1', {
        domains: [ 'donut.test', 'bigos.pl' ]
      });
      await loadConfig(tmpFolder.path);
      const site = findSiteConfig('site-1');
      const result = getSiteURL(site);
      expect(result.href).to.equal('https://donut.test/zielono/');
    })
    it('should append site name to server URL when site has no domain names', async function() {
      const tmpFolder = await createTempFolder();
      await saveYAML(tmpFolder, 'zielono', {
        nginx: {
          url: 'https://somewhere.net/zielono/'
        }
      });
      await saveYAML(tmpFolder, 'site-1', {});
      await loadConfig(tmpFolder.path);
      const site = findSiteConfig('site-1');
      const result = getSiteURL(site);
      expect(result.href).to.equal('https://somewhere.net/zielono/site-1/');
    })
  })
  skip.if.no.generic.code.
  describe('findPageVersions()', function() {
    it('should list of URLs pointing to different version of the site', async function() {
      const tmpFolder = await createTempFolder();
      await saveYAML(tmpFolder, 'zielono', {
        nginx: {
          url: 'https://somewhere.net:8080'
        }
      });
      await saveYAML(tmpFolder, 'site-1', {
        page: {
          code: {
            path: getGenericCodePath(),
            ref: 'main'
          }
        }
      });
      await loadConfig(tmpFolder.path);
      const site = findSiteConfig('site-1', {});
      const versions = await findPageVersions(site, { useRef: true });
      expect(versions).to.be.an('array').that.is.not.empty;
      const version = versions.find((v) => v.url === 'https://somewhere.net:8080/site-1/');
      expect(version).to.be.an('object');
    })
    it('should find default version when ref is not set', async function() {
      const tmpFolder = await createTempFolder();
      await saveYAML(tmpFolder, 'zielono', {
        nginx: {
          url: 'https://somewhere.net:8080'
        }
      });
      await saveYAML(tmpFolder, 'site-1', {
        page: {
          code: {
            path: getGenericCodePath(),
          }
        }
      });
      await loadConfig(tmpFolder.path);
      const site = findSiteConfig('site-1', {});
      const versions = await findPageVersions(site, { useRef: true });
      expect(versions).to.be.an('array').that.is.not.empty;
      const version = versions.find((v) => v.url === 'https://somewhere.net:8080/site-1/');
      expect(version).to.be.an('object');
    })
    it('should place "heads/main" in URL when ref is something else', async function() {
      const tmpFolder = await createTempFolder();
      await saveYAML(tmpFolder, 'zielono', {
        nginx: {
          url: 'https://somewhere.net:8080'
        }
      });
      await saveYAML(tmpFolder, 'site-1', {
        page: {
          code: {
            path: getGenericCodePath(),
            ref: 'v1.0'
          }
        }
      });
      await loadConfig(tmpFolder.path);
      const site = findSiteConfig('site-1', {});
      const versions = await findPageVersions(site, { useRef: true });
      expect(versions).to.be.an('array').that.is.not.empty;
      const version = versions.find((v) => v.url === 'https://somewhere.net:8080/site-1/(heads/main)/');
      expect(version).to.be.an('object');
    })
  })
})
