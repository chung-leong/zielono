import Chai from 'chai'; const { expect } = Chai;
import FS from 'fs'; const { readFile } = FS.promises;
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

import {
  parseExcelFile,
  extractKeywords,
  extractNameFlags,
} from '../src/excel-parsing.mjs';

describe('Excel parsing', function() {
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
    it('should handle comma-delimited list', function() {
      const keywords = extractKeywords(' Hello, world,  cat ');
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
      const nameFlags = extractNameFlags('Hello world');
      expect(nameFlags).to.eql({
        name: 'Hello world',
        nameCC: 'helloWorld'
      });
    })
    it('should handle names with signle flag correctly', function() {
      const nameFlags = extractNameFlags('Hello world(en)');
      expect(nameFlags).to.eql({
        name: 'Hello world',
        nameCC: 'helloWorld',
        flags: [ 'en' ]
      });
    })
    it('should handle names with multiple flags correctly', function() {
      const nameFlags = extractNameFlags(' Hello world (en-US, en-GB)');
      expect(nameFlags).to.eql({
        name: 'Hello world',
        nameCC: 'helloWorld',
        flags: [ 'en-US', 'en-GB' ]
      });
    })
  })
  describe('#parseExcelFile', function() {
    it('should correctly extract metadata', async function() {
      const data = await readFile(`${__dirname}/assets/sample.xlsx`);
      const json = await parseExcelFile(data);
      expect(json.title).to.eql('This is a title');
      expect(json.subject).to.eql('This is the subject');
      expect(json.description).to.eql('This is a description!');
      expect(json.keywords).to.eql([ 'chicken', 'duck', 'morons' ]);
    })
    it('should ignore empty and hidden sheets', async function() {
      const data = await readFile(`${__dirname}/assets/sample.xlsx`);
      const json = await parseExcelFile(data);
      expect(json.sheets).to.have.lengthOf(5);
    })
    it('should extract flags from sheet names', async function() {
      const data = await readFile(`${__dirname}/assets/sample.xlsx`);
      const json = await parseExcelFile(data);
      const [ sheet1 ] = json.sheets;
      expect(sheet1.name).to.eql('Text');
      expect(sheet1.flags).to.eql([ 'with styles' ]);
    })
    it('should extract flags from column names', async function() {
      const data = await readFile(`${__dirname}/assets/sushi.xlsx`);
      const json = await parseExcelFile(data);
      const [ sheet1 ] = json.sheets;
      const [ col1, col2, col3, col4 ] = sheet1.columns;
      expect(col1.name).to.eql('Name');
      expect(col2.name).to.eql('Description');
      expect(col2.flags).to.eql([ 'en' ]);
      expect(col3.name).to.eql('Description');
      expect(col3.flags).to.eql([ 'pl' ]);
      expect(col4.name).to.eql('Picture');
    })
  })
})
