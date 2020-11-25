import Chai from 'chai'; const { expect } = Chai;
import HttpMocks from 'node-mocks-http'; const { createRequest, createResponse } = HttpMocks;
import pathToRegExp from 'path-to-regexp';
import { getAssetPath } from './helpers/file-loading.mjs';
import { setConfigFolder } from '../src/config-management.mjs';

import {
  addHandlers,
  handleSiteAssociation,
  handleResourceRedirection,
  handleInvalidRequest,
  handleError,
} from '../src/request-handling.mjs';
import {
  handlePageRequest,
} from '../src/request-handling-page.mjs';
import {
  handleImageRequest,
} from '../src/request-handling-image.mjs';
import {
  handleDataRequest,
} from '../src/request-handling-data.mjs';
import {
  handleAdminRequest,
} from '../src/request-handling-admin.mjs';


describe('Request handling', function() {
  before(function() {
    const path = getAssetPath('storage');
    setConfigFolder(path);
  })
  describe('#addHandlers()', function() {
    // capture routes with mock app
    const routes = [];
    const addRoute = (end, path, handler) => {
      if (!handler) {
        return;
      }
      const params = [];
      const options = { sensitive: true, strict: false, end };
      const regExp = pathToRegExp(path, params, options);
      const match = (url) => {
        const m = regExp.exec(url);
        if (m) {
          const result = {};
          for (let [ index, param ] of params.entries()) {
            if (typeof(param.name) === 'string') {
              result[param.name] = m[index + 1];
            }
          }
          return result;
        } else {
          return false;
        }
      };
      routes.push({ path, handler, match });
    };
    const app = {
      set: () => {},
      use: addRoute.bind(null, false),
      get: addRoute.bind(null, true),
    };
    addHandlers(app);
    const test = (url, expectedHandler, expectedParams) => {
      it(`should use ${expectedHandler.name} for "${url}"`, function() {
        // find matching route
        let handler, params;
        for (let route of routes) {
          params = route.match(url);
          if (params) {
            handler = route.handler;
            break;
          }
        }
        expect(handler).to.equal(expectedHandler);
        expect(params).to.eql(expectedParams);
      })
    };
    test('/', handlePageRequest, {
      path: ''
    });
    test('/somewhere', handlePageRequest, {
      path: 'somewhere'
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
      path: 'somewhere/out/there'
    });
    test('/somewhere/out/there/', handlePageRequest, {
      path: 'somewhere/out/there/'
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
    test('/-/sddd/asddde', handleInvalidRequest, {
      path: 'sddd/asddde'
    });
    test('/zielono', handleAdminRequest, {});
    test('/zielono/ghhj/', handleAdminRequest, {});
    test('/zielono/-/data/some', handleAdminRequest, {});
    test('/zielonooo', handlePageRequest, {
      path: 'zielonooo'
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
  describe('#handleError()', function() {
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
  describe('#handleSiteAssociation()', function() {
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
  describe('#handleResourceRedirection()', function() {
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
  describe('#handleInvalidRequest()', function() {
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
