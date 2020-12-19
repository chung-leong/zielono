import Chai from 'chai'; const { expect } = Chai;
import { createTempConfig } from './helpers/config-creation.mjs';
import { setConfigFolder, loadServerConfig, loadSiteConfig, loadAccessTokens } from '../lib/config-loading.mjs';

import {
  saveServerConfig,
  saveSiteConfig,
  saveAccessTokens,
} from '../lib/config-saving.mjs';

describe('Config saving', function() {
  let tmpFolder;
  before(async function() {
    tmpFolder = await createTempConfig(false);
    setConfigFolder(tmpFolder.path);
  })
  describe('saveServerConfig()', function() {
    it('should save server config', async function() {
      const config = {
        listen: 90
      };
      await saveServerConfig(config);
      const server = await loadServerConfig();
      expect(server).to.have.property('listen').that.eql([ 90 ]);
    })
    it('should throw an error when there is unknown field in server config', async function() {
      const config = {
        listen: 90,
        unknown: {}
      };
      try {
        await saveServerConfig(config);
        this.fail();
      } catch (err) {
        expect(err).to.be.an('error');
      }
    })
  })
  describe('saveSiteConfig()', function() {
    it('should save site config', async function() {
      const config = {
        domains: [ 'duck.test' ],
        files: []
      };
      await saveSiteConfig('site-1', config);
      const site = await loadSiteConfig('site-1');
      expect(site).to.have.property('name', 'site-1');
      expect(site).to.have.property('domains').that.eql([ 'duck.test' ]);
    })
    it('should throw an error when there is unknown field in site config', async function() {
      const config = {
        domains: [ 'duck.test' ],
        file: []
      };
      try {
        await saveSiteConfig('site-1', config);
        this.fail();
      } catch (err) {
        expect(err).to.be.an('error');
      }
    })
  })
  describe('saveAccessTokens()', function() {
    it('should save site config', async function() {
      const config = [
        {
          url: 'https://github.com/chung-leong/zielono',
          token: 'abc'
        }
      ];
      await saveAccessTokens(config);
      const tokens = await loadAccessTokens();
      expect(tokens).to.eql(config);
    })
    it('should throw an error when token is missing', async function() {
      const config = [
        {
          url: 'https://github.com/chung-leong/zielono',
          token: 'abc'
        }
      ];
      try {
        await saveAccessTokens(config);
        this.fail();
      } catch (err) {
        expect(err).to.be.an('error');
      }
    })
  })
})
