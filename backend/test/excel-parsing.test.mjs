import Chai from 'chai'; const { expect } = Chai;
import { loadExcelFile, loadAsset } from './helpers/file-loading.mjs'
import { getHash }  from '../lib/content-naming.mjs';

import {
  parseCSVFile,
  extractNameFlags,
} from '../lib/excel-parsing.mjs';

describe('Excel parsing', function() {
  describe('extractNameFlags()', function() {
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
  describe('parseExcelFile()', function() {
    let sample, sushi;
    before(async () => {
      sample = await loadExcelFile('sample.xlsx');
      sushi = await loadExcelFile('sushi.xlsx');
    })
    it('should correctly extract metadata', function() {
      expect(sample.title).to.equal('This is a title');
      expect(sample.subject).to.equal('This is the subject');
      expect(sample.description).to.equal('This is a description!');
      expect(sample.keywords).to.equal('chicken duck morons');
      expect(sample.category).to.equal('Category');
      expect(sample.status).to.equal('ready');
    })
    it('should ignore empty and hidden sheets', function() {
      expect(sample.sheets).to.have.lengthOf(5);
    })
    it('should extract flags from sheet names', function() {
      const sheet1 = sample.sheets[0];
      expect(sheet1.name).to.equal('Text');
      expect(sheet1.flags).to.eql([ 'with styles' ]);
    })
    it('should extract flags from column names', function() {
      const sheet1 = sushi.sheets[0];
      const [ col1, col2, col3, col4 ] = sheet1.columns;
      expect(col1.name).to.equal('Name');
      expect(col2.name).to.equal('Description');
      expect(col2.flags).to.eql([ 'en' ]);
      expect(col3.name).to.equal('Description');
      expect(col3.flags).to.eql([ 'pl' ]);
      expect(col4.name).to.equal('Picture');
    })
    it('should extract plain text from cells', function() {
      const sheet1 = sample.sheets[0];
      const cellA2 = sheet1.columns[0].cells[0];
      const cellB2 = sheet1.columns[1].cells[0];
      expect(cellA2).to.eql({ value: 'Normal' });
      expect(cellB2).to.eql({ value: 'This is a test',
        style: {
          verticalAlign: 'bottom'
        }
      });
    })
    it('should keep empty rows', function() {
      const sheet1 = sample.sheets[0];
      const cellA17 = sheet1.columns[0].cells[15];
      const cellB17 = sheet1.columns[1].cells[15];
      expect(cellA17).to.eql({ value: null });
      expect(cellB17).to.eql({ value: null, style: { verticalAlign: 'bottom' } });
      const cellA19 = sheet1.columns[0].cells[17];
      const cellB19 = sheet1.columns[1].cells[17];
      expect(cellA17).to.eql({ value: null });
      expect(cellB17).to.eql({ value: null, style: { verticalAlign: 'bottom' } });
    })
    it('should skip hidden rows', function() {
      const sheet1 = sample.sheets[0];
      const cellA31 = sheet1.columns[0].cells[29];
      expect(cellA31).to.eql({ value: null });
      const cellA33 = sheet1.columns[0].cells[30];
      expect(cellA33).to.eql({ value: 'Visible' });
    })
    it('should skip hidden columns', function() {
      const sheet1 = sample.sheets[0];
      expect(sheet1.columns).to.have.lengthOf(2);
    });
    it('should obtain values from calculated cells', function() {
      const sheet3 = sample.sheets[2];
      const cellA2 = sheet3.columns[0].cells[0];
      const cellB2 = sheet3.columns[1].cells[0];
      expect(cellA2).to.eql({
        value: 4,
        text: '$4.0',
        style: {
          verticalAlign: 'bottom',
          textAlign: 'right',
        }
      });
      expect(cellB2).to.eql({
        value: 15.16,
        text: '15.16 PLN',
        style: {
          verticalAlign: 'bottom',
          textAlign: 'right',
        }
      });
    })
    it('should handle cells in error condition', function() {
      const sheet3 = sample.sheets[2];
      const cellA6 = sheet3.columns[0].cells[4];
      const cellB6 = sheet3.columns[1].cells[4];
      expect(cellA6).to.eql({
        value: { error: '#DIV/0!' },
        style: {
          verticalAlign: 'bottom'
        },
      });
      expect(cellB6).to.eql({
        value: { error: '#DIV/0!' },
        style: {
          verticalAlign: 'bottom'
        },
      });
    })
    it('should attach images to cells', function() {
      const sheet1 = sushi.sheets[0];
      const cellD2 = sheet1.columns[3].cells[0];
      const cellD3 = sheet1.columns[3].cells[1];
      expect(cellD2).to.have.property('image');
      expect(cellD3).to.have.property('image');
      const hash1 = getHash(cellD2.image.buffer);
      const hash2 = getHash(cellD3.image.buffer);
      // values from sha1sum
      expect(hash1).to.equal('1a1e9e305b5a132560e861531430f9b881b35cd1');
      expect(hash2).to.equal('32e4106d369959addd2abed33f59f78ea92c0c28');
    })
    it('should preserve styling on cells used as column headers', function() {
      const [ sheet1 ] = sushi.sheets;
      const [ col1 ] = sheet1.columns;
      expect(col1).to.have.property('headers').with.lengthOf(1);
      expect(col1.headers[0]).to.have.property('style');
      expect(col1.headers[0].style).to.eql({
        verticalAlign: 'bottom',
        fontWeight: 'bold',
        borderBottom: '1px solid #000000'
      });
    })
    it('should not use first row as column name when "headers = 0"', async function() {
      const sushi = await loadExcelFile('sushi.xlsx', { headers: false });
      const [ sheet1 ] = sushi.sheets;
      const [ col1, col2 ] = sheet1.columns;
      expect(col1).to.have.property('headers').with.lengthOf(0);
      expect(col1).to.have.property('name', 'A');
      expect(col2).to.have.property('name', 'B');
      const cellA1 = sheet1.columns[0].cells[0];
      const cellB1 = sheet1.columns[1].cells[0];
      expect(cellA1).to.have.property('value', 'Name');
      expect(cellB1).to.have.property('value', 'Description (en)');
    })
    it('should use freeze panes to determine where headers end"', async function() {
      const file = await loadExcelFile('freeze-panes.xlsx');
      const [ sheet1 ] = file.sheets;
      const [ col1, col2 ] = sheet1.columns;
      expect(col1).to.have.property('name', 'Country');
      expect(col1).to.have.property('flags').that.eql([ 'en' ]);
      expect(col1).to.have.property('headers').with.lengthOf(2);
      expect(col1).to.have.property('cells').with.lengthOf(5);
      expect(col2).to.have.property('name', 'Country');
      expect(col2).to.have.property('flags').that.eql([ 'pl' ]);
    })
    it('should remove style from cells when "style = false"', async function() {
      const sushi = await loadExcelFile('sushi.xlsx', { style: false });
      const [ sheet1 ] = sushi.sheets;
      const [ col1 ] = sheet1.columns;
      expect(col1).to.not.have.property('style');
      const cellA2 = col1.cells[0];
      expect(cellA2).to.not.have.property('style');
    })
    it('should extract of clipping rect of images', async function() {
      const image = await loadExcelFile('image.xlsx');
      const [ sheet1 ] = image.sheets;
      const [ col1 ] = sheet1.columns;
      const cellA2 = col1.cells[0];
      expect(cellA2.image).to.have.property('srcRect')
      expect(cellA2.image.srcRect).to.have.keys([ 'l', 'r', 't', 'b' ]);
    })
    it('should handle merged cells correctly', async function() {
      const merged = await loadExcelFile('merged.xlsx');
      const [ sheet1 ] = merged.sheets;
      const [ col1, col2, col3 ] = sheet1.columns;
      expect(col1).to.have.property('name', 'Name');
      expect(col2).to.have.property('name', 'Name');
      expect(col3).to.have.property('name', 'Currency');
      const cellB1 = col2.headers[0];
      expect(cellB1).to.have.property('master').that.eql({ col: 0, row: -2 });
      const cellB11 = col2.cells[7];
      expect(cellB11).to.have.property('master').that.eql({ col: 0, row: 7 });
      const cellC7 = col3.cells[3];
      expect(cellC7).to.have.property('master').that.eql({ col: 2, row: 1 });
    })
    it('should reurn data with expiration date', async function() {
      const json = await loadExcelFile('dates.xlsx');
      expect(json).to.have.property('expiration').that.is.a('date');
    })
  })
  describe('parseCSVFile()', function() {
    let sample;
    before(async () => {
      const buffer = await loadAsset('sample.csv');
      sample = await parseCSVFile(buffer, { sheetName: 'sample' });
    })
    it('should have the right sheet name and columns', function() {
      const [ sheet ] = sample.sheets;
      expect(sheet).to.have.property('name', 'sample');
      const [ col1, col2 ] = sheet.columns;
      expect(col1).to.have.property('name', 'Month');
      expect(col2).to.have.property('name', 'Average');
    })
  })
})
