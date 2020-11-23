import Chai from 'chai'; const { expect } = Chai;
import HttpMocks from 'node-mocks-http'; const { createRequest, createResponse } = HttpMocks;
import { getAssetPath } from './helpers/file-loading.mjs';
import { setConfigFolder } from '../src/config-management.mjs';

import {
  handleSiteAssociation,
  handleError,
} from '../src/request-handling.mjs';

describe('Request handling', function() {
  before(function() {
    const path = getAssetPath('config');
    setConfigFolder(path);
  })
  let nextCalled, nextError, next = (err) => {
    nextCalled = true;
    nextError = err;
  };
  beforeEach(function() {
    nextCalled = false;
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
      handleError(err, req, res, next);
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
      expect(req.site).to.have.property('name');
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
  })
})
