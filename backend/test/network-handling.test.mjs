import Chai from 'chai'; const { expect } = Chai;

import {
  getIPv4Addresses,
  getIPv4Address,
  getMacAddresses,
} from '../lib/network-handling.mjs';

describe('Network handling', function() {
  describe('getIPv4Addresses()', function() {
    it('should return a list of IP addresses', function() {
      const result = getIPv4Addresses();
      expect(result).to.be.an('array').that.is.not.empty;
    })
  })
  describe('getIPv4Address()', function() {
    it('should return an IP addresses', function() {
      const result = getIPv4Address();
      expect(result).to.match(/^\d+\.\d+\.\d+\.\d+$/);
    })
  })
  describe('getMacAddresses()', function() {
    it('should return a list of MAC addresses', function() {
      const result = getMacAddresses();
      expect(result).to.be.an('array').that.is.not.empty;
      expect(result[0]).to.match(/^\w{2}:\w{2}:\w{2}:\w{2}:\w{2}:\w{2}$/);
    })
  })
})
