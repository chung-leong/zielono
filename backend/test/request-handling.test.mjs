import Chai from 'chai'; const { expect } = Chai;
import HttpMocks from 'node-mocks-http'; const { createRequest, createResponse } = HttpMocks;
import Layer from 'express/lib/router/layer.js';
import { createTempFolder, saveYAML, removeYAML, getAssetPath } from './helpers/file-loading.mjs';
import { setConfigFolder } from '../lib/config-management.mjs';

import {
  addHandlers,
  handleSiteAssociation,
  handleRefExtraction,
  handleResourceRedirection,
  handleInvalidRequest,
  handleError,
} from '../lib/request-handling.mjs';
import {
  handlePageRequest,
} from '../lib/request-handling-page.mjs';
import {
  handleImageRequest,
} from '../lib/request-handling-image.mjs';
import {
  handleDataRequest,
} from '../lib/request-handling-data.mjs';
import {
  handleAdminRequest,
} from '../lib/request-handling-admin.mjs';


describe('Request handling', function() {
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
    it('should send the error message as text', function() {
      const err = new Error('Hello world');
      const req = createRequest()
      const res = createResponse();
      handleError(err, req, res, next);
      expect(res._getData()).to.eql(err.message);
      expect(res.statusCode).to.eql(400);
    })
    it('should set status code if error object has one', function() {
      const err = new Error('Hello world');
      err.status = 404;
      const req = createRequest();
      const res = createResponse();
      handleError(err, req, res, next);
      expect(res._getData()).to.eql(err.message);
      expect(res.statusCode).to.eql(err.status);
    })
    it('should not do anything when headers are sent', function() {
      const err = new Error('Hello world');
      const req = createRequest();
      const res = createResponse();
      res.end();
      expect(() => { handleError(err, req, res, next) }).to.throw();
      expect(res._getData()).to.eql('');
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
      await handleSiteAssociation(req, res, next);
      expect(req.url).to.eql('/somewhere/');
      expect(req).to.have.property('site').that.is.an('object');
      expect(req.site).to.have.property('name', 'site1');
      expect(req.baseUrl).to.eql('/site1');
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
      expect(req.url).to.eql('/somewhere/else/');
      expect(req.ref).to.eql('heads/main');
    })
  })
  describe('handleResourceRedirection()', function() {
    it('should redirect addresses relative to page URL (/-/*)', function() {
      const req = createRequest({
        port: 80,
        url: '/somewhere/else/-/data/sushi',
        originalUrl: '/site1/somewhere/else/-/data/sushi?style=0',
        baseUrl: '/site1',
        query: { style: 'en' },
        params: { page: 'somewhere/else', resource: '-/data/sushi?style=0' }
      });
      const res = createResponse();
      const redirect = '/site1/-/data/sushi?style=0';
      handleResourceRedirection(req, res, next);
      expect(res.statusCode).to.eql(301);
      expect(res._getRedirectUrl()).to.eql(redirect);
      expect(nextCalled).to.be.false;
    })
    it('should redirect addresses relative to page URL (*.*)', function() {
      const req = createRequest({
        port: 80,
        url: '/somewhere/else/index.js',
        originalUrl: '/site1/somewhere/else/index.js',
        baseUrl: '/site1',
        query: { style: 'en' },
        params: { page: 'somewhere/else', resource: 'index.js' }
      });
      const res = createResponse();
      const redirect = '/site1/index.js';
      handleResourceRedirection(req, res, next);
      expect(res.statusCode).to.eql(301);
      expect(res._getRedirectUrl()).to.eql(redirect);
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
