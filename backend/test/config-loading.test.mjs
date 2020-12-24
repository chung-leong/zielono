import Chai from 'chai'; const { expect } = Chai;
import { createTempConfig } from './helpers/config-creation.mjs';

import {
  setConfigFolder,
  getConfigFolder,
  processServerConfig,
  processSiteConfig,
  processTokenConfig,
  loadServerConfig,
  loadSiteConfig,
  loadSiteConfigs,
  loadAccessTokens,
  loadConfig,
  findSiteConfig,
  findAccessToken,
} from '../lib/config-loading.mjs';

describe('Config loading', function() {
  let tmpFolder;
  before(async function() {
    tmpFolder = await createTempConfig(false);
  })
  describe('processServerConfig()', function() {
    it('should return a default configuration', function() {
      const config = processServerConfig({});
      expect(config).to.eql({
        listen: [ 8080 ],
        nginx: undefined,
        ngrok: undefined,
        storage: {
          path: `${tmpFolder.path}/zielono`
        }
      });
    })
    it('should throw when required field is missing', function() {
      const input = { nginx: { cache: {} } };
      expect(() => processServerConfig(input)).to.throw();
    })
    it('should throw when extra fields are present', function() {
      const input = { extra: 1 };
      expect(() => processServerConfig(input)).to.throw();
    })
    it('should throw when type mismatches occur', function() {
      const input1 = { listen: '80' };
      const input2 = { nginx: false };
      const input3 = { nginx: { cache: {} } };
      expect(() => processServerConfig(input1)).to.throw();
      expect(() => processServerConfig(input2)).to.throw();
      expect(() => processServerConfig(input3)).to.throw();
    })
  })
  describe('processSiteConfig()', function() {
    it('should return a default configuration', function() {
      const config = processSiteConfig('hello', {});
      expect(config).to.eql({
        name: 'hello',
        domains: [],
        files: [],
        storage: { path: `${tmpFolder.path}/hello` },
        page: undefined,
      });
    })
    it('should throw when required field is missing', function() {
      const input = {
        files: [
          { url: 'https://something' },
        ]
      };
      expect(() => processSiteConfig('hello', input)).to.throw();
    })
    it('should throw when file both of or none of url and path is present', function() {
      const input1 = {
        files: [
          { name: 'something' },
        ]
      };
      const input2 = {
        files: [
          { name: 'something', url: 'https://something', path: '/var/something' },
        ]
      };
      expect(() => processSiteConfig('hello', input1)).to.throw();
      expect(() => processSiteConfig('hello', input2)).to.throw();
    })
    it('should throw when time zone is not valid', function() {
      const input = {
        files: [
          {
            name: 'something',
            url: 'https://something',
            timeZone: 'Europe/Pcim'
          }
        ]
      };
      expect(() => processSiteConfig('hello', input)).to.throw();
    })
    it('should throw when extra fields are present', function() {
      const input = { extra: 1 };
      expect(() => processSiteConfig('hello', input)).to.throw();
    })
  })
  describe('processTokenConfig()', function() {
    it('should accept an empty array', function() {
      const config = processTokenConfig([]);
      expect(config).to.eql([]);
    })
    it('should process a list of objects correctly', function() {
      const input = [
        { url: 'http://example.net', token: 'XXXXXXX' },
        { url: 'http://example.net', token: 'YYYYYYY' },
      ];
      const config = processTokenConfig(input);
      expect(config).to.eql(input);
    })
    it('should throw when required field is missing', function() {
      const input1 = [
        { url: 'http://something' }
      ];
      const input2 = [
        { token: 'XXXXXXXXX' }
      ];
      expect(() => processTokenConfig(input1)).to.throw();
      expect(() => processTokenConfig(input2)).to.throw();
    })
  })
  describe('loadSiteConfigs()', function() {
    it('shoud load site configs', async function() {
      const sites = await loadSiteConfigs();
      expect(sites).to.be.an('array').that.have.lengthOf(3);
      const [ site1, site2 ] = sites;
      expect(site1).to.have.property('name', 'site1');
      expect(site1).to.have.property('domains').that.is.an('array');
      expect(site1).to.have.property('files').that.is.an('array');
    })
  })
  describe('loadAccessTokens()', function() {
    it('shoud find access token for URL', async function() {
      const url = 'https://github.com/chung-leong/zielono/';
      const entries = await loadAccessTokens();
      expect(entries).to.eql([
        {
          url: 'https://github.com/chung-leong/zielono/',
          token: 'AB1234567890'
        }
      ]);
    })
    it('should not throw if .tokens.yaml is missing', async function() {
      const url = 'https://github.com/chung-leong/zielono/';
      const folder = getConfigFolder();
      try {
        setConfigFolder(folder + '/random');
        const entries = await loadAccessTokens(url);
        expect(entries).to.eql([]);
      } finally {
        setConfigFolder(folder);
      }
    })
  })
  describe('loadConfig()', function() {
    it('should load both server and site configs', async function() {
      const { server, sites } = await loadConfig();
      expect(server).to.be.an('object');
      expect(sites).to.be.an('array').that.have.lengthOf(3);
    })
  })
})
