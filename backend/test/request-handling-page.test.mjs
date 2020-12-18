import Chai from 'chai'; const { expect } = Chai;
import HttpMocks from 'node-mocks-http'; const { createRequest, createResponse } = HttpMocks;
import { createTempFolder } from './helpers/file-saving.mjs'
import './helpers/conditional-testing.mjs';

import {
  handlePageRequest,
} from '../lib/request-handling-page.mjs';

describe('Page request handling', function() {
  describe('handlePageRequest()', function() {
    const next = (err) => {
      if (err) {
        throw err;
      }
    };
    it('should retrieve file from local git', async function() {
      const site = {
        name: 'tmp',
        code: {
          path: '/home/cleong/zielono-generic-site'
        },
      };
      const req = createRequest({
        ref: undefined,
        params: { filename: 'index.js.LICENSE.txt' },
      });
      const res = createResponse();
      req.site = site;
      await handlePageRequest(req, res, next);
      const data = res._getData();
      const text = data.toString();
      expect(text).to.contain('React');
    })
    it('should respond to request for non-existent favicon.ico with 204', async function() {
      const site = {
        name: 'tmp',
        code: {
          path: '/home/cleong/zielono-generic-site'
        },
      };
      const req = createRequest({
        ref: undefined,
        params: { filename: 'favicon.ico' },
      });
      const res = createResponse();
      req.site = site;
      await handlePageRequest(req, res, next);
      expect(res.statusCode).to.equal(204);
    })
    it('should generate a HTML page from code in local git', async function() {
      const site = {
        name: 'tmp',
        code: {
          path: '/home/cleong/zielono-generic-site'
        },
      };
      const req = createRequest({
        ref: undefined,
        params: { page: '' },
      });
      const res = createResponse();
      req.site = site;
      await handlePageRequest(req, res, next);
      const data = res._getData();
      const text = data.toString();
      expect(text).to.contain('react-container');
    })
  })
})
