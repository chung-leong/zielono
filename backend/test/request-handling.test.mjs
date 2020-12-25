import Chai from 'chai'; const { expect } = Chai;
import HttpMocks from 'node-mocks-http'; const { createRequest, createResponse } = HttpMocks;
import Layer from 'express/lib/router/layer.js';
import { createTempFolder, saveYAML, removeYAML } from './helpers/file-saving.mjs';
import { getAssetPath  } from './helpers/path-finding.mjs';
import { loadConfig, setConfigFolder } from '../lib/config-loading.mjs';
import { handlePageRequest } from '../lib/request-handling-page.mjs';
import { handleImageRequest } from '../lib/request-handling-image.mjs';
import { handleDataRequest } from '../lib/request-handling-data.mjs';
import { handleAdminRequest } from '../lib/request-handling-admin.mjs';

import {
  addHandlers,
  handleSiteAssociation,
  handleRedirection,
  handleRefExtraction,
  handleLocaleExtraction,
  handleResourceRedirection,
  handleInvalidRequest,
  handleError,
} from '../lib/request-handling.mjs';

describe('Request handling', function() {
  let tmpFolder;
  before(async function() {
    tmpFolder = await createTempFolder();
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
    await loadConfig(tmpFolder.path);
  })
  after(function() {
    setConfigFolder(undefined);
  })
  describe('addHandlers()', function() {
    // capture routes with mock app
    const layers = [];
    const addRoute = (end, path, ...handlers) => {
      const options = { sensitive: true, strict: false, end };
      for (let handler of handlers) {
        const layer = Layer(path, options, handler);
        layers.push(layer);
      }
    };
    const app = {
      set: () => {},
      use: (...args) => addRoute(false, ...args),
      get: (...args) => addRoute(true, ...args),
      post: (...args) => addRoute(true, ...args),
    };
    addHandlers(app);
    const test = (url, expectedHandler, expectedParams) => {
      it(`should use ${expectedHandler.name} for "${url}"`, function() {
        // find matching route
        let handler, params;
        for (let layer of layers) {
          if (layer.match(url)) {
            handler = layer.handle;
            params = {};
            for (let { name } of layer.keys) {
              // omit captured string by numeric keys
              if (typeof(name) === 'string') {
                params[name] = layer.params[name];
              }
            }
            break;
          }
        }
        expect(handler).to.equal(expectedHandler);
        expect(params).to.eql(expectedParams);
      })
    };
    test('/', handlePageRequest, {
      page: ''
    });
    test('/somewhere', handlePageRequest, {
      page: 'somewhere'
    });
    test('/somewhere/out/there/index.js', handleResourceRedirection, {
      page: 'somewhere/out/there',
      resource: 'index.js'
    });
    test('/somewhere/out/there/-/images/abc/w80.jpg', handleResourceRedirection, {
      page: 'somewhere/out/there',
      resource: '-/images/abc/w80.jpg'
    });
    test('/somewhere/out/there/-/data/sushi', handleResourceRedirection, {
      page: 'somewhere/out/there',
      resource: '-/data/sushi'
    });
    test('/somewhere/out/there', handlePageRequest, {
      page: 'somewhere/out/there'
    });
    test('/somewhere/out/there/', handlePageRequest, {
      page: 'somewhere/out/there/'
    });
    test('/index.js', handlePageRequest, {
      filename: 'index.js'
    });
    test('/-/images/abc/w80.jpg', handleImageRequest, {
      hash: 'abc',
      filename: 'w80.jpg'
    });
    test('/-/data/sushi', handleDataRequest, {
      name: 'sushi',
    });
    test('/-/sddd/asddde', handleInvalidRequest, {});
    test('/zielono', handleAdminRequest, {});
    test('/zielono/ghhj/', handleAdminRequest, {});
    test('/zielono/-/data/some', handleAdminRequest, {});
    test('/zielonooo', handlePageRequest, {
      page: 'zielonooo'
    });
  })
  let nextCalled, next;
  beforeEach(function() {
    nextCalled = false;
    next = (err) => {
      nextCalled = true;
      if (err) {
        throw err;
      }
    };
  })
  describe('handleError()', function() {
    let nodeEnv = process.env.NODE_ENV;
    before(function() {
      nodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
    })
    after(function() {
      process.env.NODE_ENV = nodeEnv;
    })
    it('should send the error message as text', function() {
      const err = new Error('Hello world');
      const req = createRequest()
      const res = createResponse();
      handleError(err, req, res, next);
      expect(res._getData()).to.equal(err.message);
      expect(res.statusCode).to.equal(400);
    })
    it('should set status code if error object has one', function() {
      const err = new Error('Hello world');
      err.status = 404;
      const req = createRequest();
      const res = createResponse();
      handleError(err, req, res, next);
      expect(res._getData()).to.equal(err.message);
      expect(res.statusCode).to.equal(err.status);
    })
    it('should not do anything when headers are sent', function() {
      const err = new Error('Hello world');
      const req = createRequest();
      const res = createResponse();
      res.end();
      expect(() => { handleError(err, req, res, next) }).to.throw();
      expect(res._getData()).to.equal('');
      expect(nextCalled).to.be.true;
    })
  })
  describe('handleSiteAssociation()', function() {
    it('should attach matching server and site config to request object', async function() {
      const req = createRequest({
        hostname: 'duck.test',
        port: 80,
        url: '/somewhere/',
        originalUrl: '/somewhere/?lang=en',
        query: { lang: 'en' }
      });
      const res = createResponse();
      await handleSiteAssociation(req, res, next);
      expect(req).to.have.property('site').that.is.an('object');
      expect(req).to.have.property('server').that.is.an('object');
      expect(req.site).to.have.property('name', 'site1');
      expect(nextCalled).to.be.true;
    })
    it('should redirect to canonical domain name', async function() {
      const req = createRequest({
        hostname: 'www.duck.test',
        port: 80,
        url: '/somewhere/',
        originalUrl: '/somewhere/?lang=en',
        query: { lang: 'en' }
      });
      const redirect = '//duck.test/somewhere/?lang=en';
      const res = createResponse();
      handleRedirection(req, res, () => {});
      await handleSiteAssociation(req, res, next);
      expect(res._getHeaders()).to.have.property('x-accel-redirect', redirect);
      expect(res.headersSent).to.be.true;
      expect(nextCalled).to.be.false;
    })
    it('should match against URL when there is not domain match', async function() {
      const req = createRequest({
        port: 80,
        url: '/site1/somewhere/',
        originalUrl: '/site1/somewhere/?lang=en',
        query: { lang: 'en' }
      });
      const res = createResponse();
      handleRedirection(req, res, () => {});
      await handleSiteAssociation(req, res, next);
      expect(req.url).to.equal('/somewhere/');
      expect(req).to.have.property('site').that.is.an('object');
      expect(req.site).to.have.property('name', 'site1');
      expect(req.baseUrl).to.equal('/site1');
    })
  })
  describe('handleRefExtraction', function() {
    it('should extract brach ref from URL', function() {
      const req = createRequest({
        port: 80,
        url: '/(heads/main)/somewhere/else/',
        originalUrl: '/(heads/main)/somewhere/else/',
      });
      const res = createResponse();
      handleRefExtraction(req, res, next);
      expect(req.url).to.equal('/somewhere/else/');
      expect(req.ref).to.equal('heads/main');
    })
  })
  describe('handleLocaleExtraction()', function() {
    it('should extract locale code from URL', function() {
      const req = createRequest({
        port: 80,
        site: {
          name: 'site1',
          domains: [],
          locale: 'en-US',
          localization: 'language'
        },
        url: '/de-de/somewhere/out/there',
        originalUrl: '/de-de/site1/somewhere/out/there?okay=1',
        baseUrl: '/site1',
        query: { okay: '1' },
        params: {},
        headers: {
          'accept-language': 'en-US,en;q=0.9,pl;q=0.8'
        },
      });
      const res = createResponse();
      handleRedirection(req, res, () => {});
      handleLocaleExtraction(req, res, next);
      expect(req).to.have.property('locale', 'de-de');
      expect(req).to.have.property('url', '/somewhere/out/there');
      expect(nextCalled).to.be.true;
    })
    it('should extract language code from URL', function() {
      const req = createRequest({
        port: 80,
        site: {
          name: 'site1',
          domains: [],
          locale: 'en-US',
          localization: 'language'
        },
        url: '/de/somewhere/out/there',
        originalUrl: '/de/site1/somewhere/out/there?okay=1',
        baseUrl: '/site1',
        query: { okay: '1' },
        params: {},
        headers: {
          'accept-language': 'en-US,en;q=0.9,pl;q=0.8'
        },
      });
      const res = createResponse();
      handleRedirection(req, res, () => {});
      handleLocaleExtraction(req, res, next);
      expect(req).to.have.property('locale', 'de');
      expect(req).to.have.property('url', '/somewhere/out/there');
      expect(nextCalled).to.be.true;
    })
    it('should redirect to language specific page', function() {
      const req = createRequest({
        port: 80,
        site: {
          name: 'site1',
          domains: [],
          locale: 'de-DE',
          localization: 'language'
        },
        url: '/somewhere/out/there',
        originalUrl: '/site1/somewhere/out/there?okay=1',
        baseUrl: '/site1',
        query: { okay: '1' },
        params: {},
        headers: {
          'accept-language': 'en-US,en;q=0.9,pl;q=0.8'
        },
      });
      const res = createResponse();
      handleRedirection(req, res, () => {});
      handleLocaleExtraction(req, res, next);
      expect(res.statusCode).to.equal(302);
      expect(res._getRedirectUrl()).to.equal('/site1/en/somewhere/out/there?okay=1');
      expect(nextCalled).to.be.false;
    })
    it('should not redirect when language matches but country does not', function() {
      const req = createRequest({
        port: 80,
        site: {
          name: 'site1',
          domains: [],
          locale: 'en-GB',
          localization: 'language'
        },
        url: '/somewhere/out/there',
        originalUrl: '/site1/somewhere/out/there?okay=1',
        baseUrl: '/site1',
        query: { okay: '1' },
        params: {},
        headers: {
          'accept-language': 'en-US,en;q=0.9,pl;q=0.8'
        },
      });
      const res = createResponse();
      handleRedirection(req, res, () => {});
      handleLocaleExtraction(req, res, next);
      expect(req.locale).to.equal('en-GB');
      expect(req.url).to.equal('/somewhere/out/there');
      expect(res.statusCode).to.not.equal(302);
      expect(nextCalled).to.be.true;
    })
    it('should redirect when only language matches when localization = full', function() {
      const req = createRequest({
        port: 80,
        site: {
          name: 'site1',
          domains: [],
          locale: 'en-GB',
          localization: 'full'
        },
        url: '/somewhere/out/there',
        originalUrl: '/site1/somewhere/out/there?okay=1',
        baseUrl: '/site1',
        query: { okay: '1' },
        params: {},
        headers: {
          'accept-language': 'en-US,en;q=0.9,pl;q=0.8'
        },
      });
      const res = createResponse();
      handleRedirection(req, res, () => {});
      handleLocaleExtraction(req, res, next);
      expect(res.statusCode).to.equal(302);
      expect(res._getRedirectUrl()).to.equal('/site1/en-us/somewhere/out/there?okay=1');
      expect(nextCalled).to.be.false;
    })
  })
  describe('handleResourceRedirection()', function() {
    it('should redirect addresses relative to page URL (/-/*)', function() {
      const req = createRequest({
        port: 80,
        site: { name: 'site1', domains: [] },
        url: '/somewhere/else/-/data/sushi',
        originalUrl: '/site1/somewhere/else/-/data/sushi?style=0',
        baseUrl: '/site1',
        query: { style: '0' },
        params: { page: 'somewhere/else', resource: '-/data/sushi' }
      });
      const res = createResponse();
      handleRedirection(req, res, () => {});
      handleResourceRedirection(req, res, next);
      expect(res.statusCode).to.equal(301);
      expect(res._getRedirectUrl()).to.equal('/site1/-/data/sushi?style=0');
      expect(nextCalled).to.be.false;
    })
    it('should redirect addresses relative to page URL (*.*)', function() {
      const req = createRequest({
        port: 80,
        site: { name: 'site1', domains: [] },
        url: '/somewhere/else/index.js',
        originalUrl: '/site1/somewhere/else/index.js?lang=en',
        baseUrl: '/site1',
        query: { lang: 'en' },
        params: { page: 'somewhere/else', resource: 'index.js' }
      });
      const res = createResponse();
      handleRedirection(req, res, () => {});
      handleResourceRedirection(req, res, next);
      expect(res.statusCode).to.equal(301);
      expect(res._getRedirectUrl()).to.equal('/site1/index.js?lang=en');
      expect(nextCalled).to.be.false;
    })
  })
  describe('handleInvalidRequest()', function() {
    it('should emit a 404 error', function() {
      const req = createRequest();
      const res = createResponse();
      expect(() => {
        handleInvalidRequest(req, res, next)
      }).to.throw().with.property('status', 404);
      expect(nextCalled).to.be.true;
    })
  })
})
