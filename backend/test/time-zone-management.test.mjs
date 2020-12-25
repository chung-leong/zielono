import Chai from 'chai'; const { expect } = Chai;
import { loadExcelFile } from './helpers/file-loading.mjs';

import {
  setTimeZone,
  restoreTimeZone,
  checkTimeZone,
  reinterpretDate,
} from '../lib/time-zone-management.mjs';

describe('Time zone management', function() {
  describe('checkTimeZone()', function() {
    it('should return true if time zone is valid', function() {
      const result = checkTimeZone('Europe/Warsaw');
      expect(result).to.be.true;
    })
    it('should return false if time zone is invalid', function() {
      const result = checkTimeZone('Europe/Pcim');
      expect(result).to.be.false;
    })
  })
  describe('setTimeZone()', function() {
    it('should set time zone globally', function() {
      setTimeZone('Pacific/Honolulu');
      const date = new Date(0);
      const str = date.toLocaleTimeString('eu-US', { hour12: true });
      expect(str).to.equal('2:00:00 PM');
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
      expect(str).to.equal('0:00:00 AM');
      restoreTimeZone();
    })
  })
  describe('restoreTimeZone()', function() {
    it('should revert time zone setting to previous state', function() {
      const date = new Date(0);
      const str1 = date.toLocaleTimeString('eu-US', { hour12: true });
      setTimeZone('Pacific/Honolulu');
      const str2 = date.toLocaleTimeString('eu-US', { hour12: true });
      restoreTimeZone();
      const str3 = date.toLocaleTimeString('eu-US', { hour12: true });
      expect(str1).to.not.equal(str2);
      expect(str3).to.equal(str1);
    })
  })
  describe('reinterpretDate()', function() {
    it('should apply time-zone adjustment to date object', function() {
      try {
        setTimeZone('Pacific/Honolulu');
        const date = new Date(0);
        const result = reinterpretDate(date);
        expect(result.getHours()).to.equal(0);
        expect(result.getDate()).to.equal(1);
        expect(result.getMonth()).to.equal(0);
        expect(result.toLocaleTimeString('en-us')).to.equal('12:00:00 AM');
      } finally {
        restoreTimeZone();
      }
    })
  })
  describe('parseExcelFile()', function() {
    let formatting;
    before(async () => {
      formatting = await loadExcelFile('formatting.xlsx', { timeZone: 'Pacific/Honolulu' });
    })
    it('should interpret date in accordance with specified time zone', function() {
      // Hawaii is ten hours behind, so at midnight it's 10:00 at Greenwich
      const hawaiianDate = new Date('2011-11-20T10:00:00.000Z');
      const sheet3 = formatting.sheets[2];
      const cellB2 = sheet3.columns[1].cells[0];
      expect(cellB2.value).to.eql(hawaiianDate);
    })
  })
})
