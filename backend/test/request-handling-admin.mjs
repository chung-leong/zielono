import Chai from 'chai'; const { expect } = Chai;
import HttpMocks from 'node-mocks-http'; const { createRequest, createResponse } = HttpMocks;

import {
  handleAdminRequest,
} from '../lib/request-handling-admin.mjs';

describe('Admin request handling', function() {
  describe('#handleAdminRequest()', function() {
    it('should say "Under construction"', function() {
      const req = createRequest()
      const res = createResponse();
      handleAdminRequest(req, res, () => {});
      expect(res._getData()).to.eql('Under construction');
    })
  })
})
