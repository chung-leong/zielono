import Chai from 'chai'; const { expect } = Chai;

import {
  parseExcelFile,
  extractKeywords,
  extractNameFlags,
} from '../src/excel-parsing.mjs';

describe('Excel parsing', function() {
  describe('#parseExcelFile', function() {
    
  })
  describe('#extractKeywords()', function() {
    it('should handle null input', function() {
      const keywords1 = extractKeywords(undefined);
      const keywords2 = extractKeywords('');
      expect(keywords1).to.eql([]);
      expect(keywords2).to.eql([]);
    })
    it('should correctly extract keywords', function() {
      const keywords = extractKeywords(' Hello world  cat ');
      expect(keywords).to.eql([ 'Hello', 'world', 'cat' ]);
    })
  })
  describe('#extractNameFlags()', function() {
    it('should handle null input', function() {
      const nameFlags1 = extractNameFlags(undefined);
      const nameFlags2 = extractNameFlags('');
      expect(nameFlags1).to.be.undefined;
      expect(nameFlags2).to.be.undefined;
    })
    it('should handle names with no flags correctly', function() {
      const nameFlags = extractNameFlags('Hello');
      expect(nameFlags).to.eql({ name: 'Hello' });
    })
    it('should handle names with signle flag correctly', function() {
      const nameFlags = extractNameFlags('Hello (EN)');
      expect(nameFlags).to.eql({ name: 'Hello', flags: [ 'en' ] });
    })
    it('should handle names with multiple flags correctly', function() {
      const nameFlags = extractNameFlags(' Hello (EN-US, EN-GB)');
      expect(nameFlags).to.eql({ name: 'Hello', flags: [ 'en-us', 'en-gb' ] });
    })
  })
})
