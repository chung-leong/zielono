import Chai from 'chai'; const { expect } = Chai;
import { getAssetPath } from './helpers/file-loading.mjs';

import {
  setConfigFolder,
  getServerConfig,
  processServerConfig,
  findSiteConfig,
  getSiteConfigs,
  processSiteConfig,
} from '../lib/config-management.mjs';

describe('Config management', function() {
  before(function() {
    const path = getAssetPath('storage');
    setConfigFolder(path);
  })
  describe('#processServerConfig()', function() {
    it('should return a default configuration', function() {
      const config = processServerConfig({});
      expect(config).to.eql({
        listen: [ 80 ],
        nginx: undefined
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
  describe('#processSiteConfig()', function() {
    it('should return a default configuration', function() {
      const folder = getAssetPath('storage');
      const config = processSiteConfig('hello', {});
      expect(config).to.eql({
        name: 'hello',
        domains: [],
        files: [],
        storage: { path: `${folder}/hello` },
        locale: undefined
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
  describe('#getSiteConfigs()', function() {
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
