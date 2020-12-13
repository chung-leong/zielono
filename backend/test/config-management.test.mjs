import Chai from 'chai'; const { expect } = Chai;
import delay from 'delay';
import { createTempFolder, saveYAML, removeYAML, getAssetPath } from './helpers/file-loading.mjs';

import {
  setConfigFolder,
  getConfigFolder,
  getServerConfig,
  processServerConfig,
  findSiteConfig,
  getSiteConfigs,
  processSiteConfig,
  processTokenConfig,
  findAccessToken,
  preloadConfig,
  watchConfigFolder,
  unwatchConfigFolder,
  configEventEmitter,
} from '../lib/config-management.mjs';

describe('Config management', function() {
  let tmpFolder;
  before(async function() {
    tmpFolder = await createTempFolder();
    setConfigFolder(tmpFolder.path);
    await saveYAML(tmpFolder, 'site1', {
      domains: [ 'duck.test', 'www.duck.test' ],
      files: [
        { name: 'sushi', path: getAssetPath('sushi.xlsx'), timeZone: 'Europe/Warsaw' },
        { name: 'sample', path: getAssetPath('sample.xlsx') },
        { name: 'image', path: getAssetPath('image.xlsx') },
      ]
    });
    await saveYAML(tmpFolder, 'site2', {
      domains: [ 'chicken.test', 'www.chicken.test' ],
      files: [
        { name: 'sushi', url: 'https://www.dropbox.com/scl/fi/v6rp5jdiliyjjwp4l4chi/sushi.xlsx?dl=0&rlkey=30zvrg53g5ovu9k8pr63f25io' },
      ]
    });
    await saveYAML(tmpFolder, 'zielono', {
      listen: 8080,
      nginx: {
        cache: {
          path: '/var/cache/nginx'
        }
      }
    });
    await saveYAML(tmpFolder, '.tokens', [
      {
        url: 'https://github.com/chung-leong/zielono/',
        token: 'AB1234567890'
      }
    ], 0o600);
  })
  after(function() {
    setConfigFolder(undefined);
  })
  describe('processServerConfig()', function() {
    it('should return a default configuration', function() {
      const config = processServerConfig({});
      expect(config).to.eql({
        listen: [ 8080 ],
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
  describe('processSiteConfig()', function() {
    it('should return a default configuration', function() {
      const config = processSiteConfig('hello', {});
      expect(config).to.eql({
        name: 'hello',
        domains: [],
        files: [],
        storage: { path: `${tmpFolder.path}/hello` },
        code: undefined,
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
  describe('getSiteConfigs()', function() {
    it('shoud load site configs', async function() {
      const sites = await getSiteConfigs();
      expect(sites).to.be.an('array').that.have.lengthOf(2);
      const [ site1, site2 ] = sites;
      expect(site1).to.have.property('name', 'site1');
      expect(site1).to.have.property('domains').that.is.an('array');
      expect(site1).to.have.property('files').that.is.an('array');
    })
  })
  describe('findAccessToken()', function() {
    it('shoud find access token for URL', async function() {
      const url = 'https://github.com/chung-leong/zielono/';
      const token = await findAccessToken(url);
      expect(token).to.equal('AB1234567890');
    })
    it('should not throw if .tokens.yaml is missing', async function() {
      const url = 'https://github.com/chung-leong/zielono/';
      const folder = getConfigFolder();
      try {
        setConfigFolder(folder + '/random');
        const token = await findAccessToken(url);
        expect(token).to.equal(undefined);
      } finally {
        setConfigFolder(folder);
      }
    })
  })
  describe('preloadConfig()', function() {
    it('should load both server and site config', async function() {
      const { server, sites } = await preloadConfig();
      expect(server).to.be.an('object');
      expect(sites).to.be.an('array').that.have.lengthOf(2);
    })
  })
  describe('watchConfigFolder()', function() {
    it('should detect site addition', async function() {
      try {
        await watchConfigFolder();
        let change;
        const event = new Promise((resolve) => {
          configEventEmitter.once('site-change', (before, after) => {
            change = { before, after };
          });
        });
        await saveYAML(tmpFolder, 'site3', {});
        await Promise.race([ event, delay(500) ]);
        expect(change).to.have.property('before', undefined);
        expect(change).to.have.property('after').that.is.an('object');
        const sites = await getSiteConfigs();
        const site3 = sites.find((s) => s.name === 'site3');
        expect(site3).to.be.an('object');
      } finally {
        await unwatchConfigFolder();
      }
    })
    it('should detect site removal', async function() {
      try {
        await watchConfigFolder();
        let change;
        const event1 = new Promise((resolve) => {
          configEventEmitter.once('site-change', (before, after) => {
            change = { before, after };
          });
        });
        await saveYAML(tmpFolder, 'site4', {});
        await Promise.race([ event1, delay(500) ]);
        const sites = await getSiteConfigs();
        const site4 = sites.find((s) => s.name === 'site4');
        expect(site4).to.be.an('object');
        const event2 = new Promise((resolve) => {
          configEventEmitter.once('site-change', (before, after) => {
            change = { before, after };
          });
        });
        await removeYAML(tmpFolder, 'site4');
        await Promise.race([ event1, delay(500) ]);
        expect(change).to.have.property('before').that.is.an('object');
        expect(change).to.have.property('after', undefined);
        const sitesAfter = await getSiteConfigs();
        const site4After = sitesAfter.find((s) => s.name === 'site4');
        expect(site4After).to.equal(undefined);
      } finally {
        await unwatchConfigFolder();
      }
    })
    it('should server change', async function() {
      try {
        await watchConfigFolder();
        let change;
        const event = new Promise((resolve) => {
          configEventEmitter.once('server-change', (before, after) => {
            change = { before, after };
          });
        });
        const server = getServerConfig();
        await saveYAML(tmpFolder, 'zielono', { listen: 80 });
        await Promise.race([ event, delay(500) ]);
        expect(change).to.have.property('before').with.property('listen').that.eql([ 8080 ]);
        expect(change).to.have.property('after').with.property('listen').that.eql([ 80 ]);
        await saveYAML(tmpFolder, 'zielono', server);
      } finally {
        await unwatchConfigFolder();
      }
    })
  })
})
