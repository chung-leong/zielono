import Chai from 'chai'; const { expect } = Chai;
import { getAssetPath } from './helpers/file-loading.mjs';

import {
  setConfigFolder,
  getServerConfig,
  findSiteConfig,
  getSiteConfigs,
  loadConfigFile,
} from '../src/config-management.mjs';

describe('Config management', function() {
  before(function() {
    const path = getAssetPath('storage');
    setConfigFolder(path);
  })
  describe('#loadConfigFile', function() {
    it('should correctly load a yaml file', async function() {
      const config = await loadConfigFile('zielono');
      expect(config).to.have.property('listen', 80);
      expect(config).to.have.property('nginx').that.is.an('object');
    })
  })
  describe('#getSiteConfigs', function() {
    it('shoud load site configs', async function() {
      const sites = await getSiteConfigs();
      expect(sites).to.be.an('array').that.have.lengthOf(2);
      const [ site1, site2 ] = sites;
      expect(site1).to.have.property('name', 'site1');
      expect(site1).to.have.property('domains').that.is.an('array');
      expect(site1).to.have.property('files').that.is.an('array');
    })
  })
})
