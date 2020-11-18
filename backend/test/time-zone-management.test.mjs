import Chai from 'chai'; const { expect } = Chai;

import {
  setTimeZone,
  restoreTimeZone,
  checkTimeZone,
} from '../src/time-zone-management.mjs';

describe('Time zone management', function() {
  describe('#checkTimeZone()', function() {
    it('should return true if time zone is valid', function() {
      const result = checkTimeZone('Europe/Warsaw');
      expect(result).to.be.true;
    })
    it('should return false if time zone is invalid', function() {
      const result = checkTimeZone('Europe/Pcim');
      expect(result).to.be.false;
    })
  })
  describe('#setTimeZone()', function() {
    it('should set time zone globally', function() {
      setTimeZone('Pacific/Honolulu');
      const date = new Date(0);
      const str = date.toLocaleTimeString('eu-US', { hour12: true });
      expect(str).to.eql('2:00:00 PM');
      restoreTimeZone();
    })
    it('should throw when called a second time', function() {
      setTimeZone('Pacific/Honolulu');
      expect(() => setTimeZone('Europe/London')).to.throw;
      restoreTimeZone();
    })
    it('should deal with invalid time zone', function() {
      setTimeZone('Europe/Pcim');
      const date = new Date(0);
      const str = date.toLocaleTimeString('eu-US', { hour12: true });
      expect(str).to.eql('0:00:00 AM');
      restoreTimeZone();
    })
  })
  describe('#restoreTimeZone()', function() {
    it('should revert time zone setting to previous state', function() {
      const date = new Date(0);
      const str1 = date.toLocaleTimeString('eu-US', { hour12: true });
      setTimeZone('Pacific/Honolulu');
      const str2 = date.toLocaleTimeString('eu-US', { hour12: true });
      restoreTimeZone();
      const str3 = date.toLocaleTimeString('eu-US', { hour12: true });
      expect(str1).to.not.eql(str2);
      expect(str3).to.eql(str1);
    })
  })
})
