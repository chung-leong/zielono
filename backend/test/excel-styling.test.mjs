import Chai from 'chai'; const { expect } = Chai;
import { loadExcelFile } from './helpers/file-loading.mjs'

import {
  extractColor,
  getNamedColor,
  getIndexedColor,
  getThemeColor,
  parseARGB,
  stringifyARGB,
} from '../src/excel-styling.mjs';

describe('Excel styling', function() {
  describe('#parseARGB()', function() {
  })
  describe('#stringifyARGB()', function() {
  })
  describe('#parseExcelFile()', function() {
    let sample, sushi;
    before(async () => {
      sample = await loadExcelFile('sample.xlsx');
    })
    it('should apply indentation', function() {
      const [ sheet1 ] = sample.sheets;
      const [ cellA3, cellB3 ] = sheet1.rows[1];
      expect(cellA3).to.eql({ value: 'Indent' });
      expect(cellB3).to.eql({ value: 'This is a test',
        style: {
          verticalAlign: 'bottom',
          paddingLeft: '20pt'
        }
      });
    })
    it('should apply horizontal alignment', function() {
      const [ sheet1 ] = sample.sheets;
      const [ cellA4, cellB4 ] = sheet1.rows[2];
      expect(cellA4).to.eql({ value: 'Align right' });
      expect(cellB4).to.eql({ value: 'This is a test',
        style: {
          verticalAlign: 'bottom',
          textAlign: 'right'
        }
      });
      const [ cellA5, cellB5 ] = sheet1.rows[3];
      expect(cellA5).to.eql({ value: 'Align center' });
      expect(cellB5).to.eql({ value: 'This is a test',
        style: {
          verticalAlign: 'bottom',
          textAlign: 'center'
        }
      });
      const [ cellA6, cellB6 ] = sheet1.rows[4];
      expect(cellA6).to.eql({ value: 'Align left' });
      expect(cellB6).to.eql({ value: 123,
        style: {
          verticalAlign: 'bottom',
        }
      });
    })
    it('should apply vertical alignment', function() {
      const [ sheet1 ] = sample.sheets;
      const [ cellA7, cellB7 ] = sheet1.rows[5];
      expect(cellA7).to.eql({ value: 'Align top' });
      expect(cellB7).to.eql({ value: 'This is a test' });
      const [ cellA8, cellB8 ] = sheet1.rows[6];
      expect(cellA8).to.eql({ value: 'Align middle' });
      expect(cellB8).to.eql({ value: 'This is a test',
        style: {
          verticalAlign: 'middle',
        }
      });
      const [ cellA9, cellB9 ] = sheet1.rows[7];
      expect(cellA9).to.eql({ value: 'Align bottom' });
      expect(cellB9).to.eql({ value: 'This is a test',
        style: {
          verticalAlign: 'bottom',
        }
      });
    })
    it('should apply color', function() {
      const [ sheet1 ] = sample.sheets;
      const [ cellA10, cellB10 ] = sheet1.rows[8];
      expect(cellA10).to.eql({ value: 'Color' });
      expect(cellB10).to.eql({ value: 'This is a test',
        style: {
          verticalAlign: 'bottom',
          textAlign: 'center',
          color: '#ff0000',
        }
      });
      const [ cellA11, cellB11 ] = sheet1.rows[9];
      expect(cellA11).to.eql({ value: 'Background color' });
      expect(cellB11).to.eql({ value: 'This is a test',
        style: {
          verticalAlign: 'bottom',
          textAlign: 'center',
          backgroundColor: '#ffd966',   // doesn't quite match what's onscreen
        }
      });
    })
    it('should extract rich text with bolded section', function() {
      const [ sheet1 ] = sample.sheets;
      const [ cellA12, cellB12 ] = sheet1.rows[10];
      expect(cellA12).to.eql({ value: 'Bold' });
      expect(cellB12).to.eql({
        value: [
          { text: 'This is a ' },
          { text: 'test', style: { fontWeight: 'bold' } },
          { text: ', and this is only a test' },
        ],
        style: {
          verticalAlign: 'bottom',
        }
      });
    })
    it('should extract rich text with italic section', function() {
      const [ sheet1 ] = sample.sheets;
      const [ cellA13, cellB13 ] = sheet1.rows[11];
      expect(cellA13).to.eql({ value: 'Italic' });
      expect(cellB13).to.eql({
        value: [
          { text: 'This is a ' },
          { text: 'test', style: { fontStyle: 'italic' } },
          { text: ', and this is only a test' },
        ],
        style: {
          verticalAlign: 'bottom',
        }
      });
    })
    it('should extract rich text with underlined section', function() {
      const [ sheet1 ] = sample.sheets;
      const [ cellA14, cellB14 ] = sheet1.rows[12];
      expect(cellA14).to.eql({ value: 'Underline' });
      expect(cellB14).to.eql({
        value: [
          { text: 'This is a ' },
          { text: 'test', style: { textDecoration: 'underline' } },
          { text: ', and this is only a test' },
        ],
        style: {
          verticalAlign: 'bottom',
        }
      });
    })
    it('should extract rich text with section in different font', function() {
      const [ sheet1 ] = sample.sheets;
      const [ cellA15, cellB15 ] = sheet1.rows[13];
      expect(cellA15).to.eql({ value: 'Font' });
      expect(cellB15).to.eql({
        value: [
          { text: 'This is a ' },
          { text: 'test', style: { fontFamily: 'Bauhaus 93', fontSize: '16pt' } }
        ],
        style: {
          verticalAlign: 'bottom',
        }
      });
    })
    it('should apply border', function() {
      const [ sheet1 ] = sample.sheets;
      const [ cellA16, cellB16 ] = sheet1.rows[14];
      expect(cellA16).to.eql({ value: 'Border thin' });
      expect(cellB16).to.eql({
        value: null,
        style: {
          verticalAlign: 'bottom',
          border: '1px solid #000000'
        }
      });
      const [ cellA18, cellB18 ] = sheet1.rows[16];
      expect(cellA18).to.eql({ value: 'Border thick' });
      expect(cellB18).to.eql({
        value: null,
        style: {
          verticalAlign: 'bottom',
          border: '3px solid #000000'
        }
      });
      const [ cellA20, cellB20 ] = sheet1.rows[18];
      expect(cellA20).to.eql({ value: 'Border hairline' });
      expect(cellB20).to.eql({
        value: null,
        style: {
          verticalAlign: 'bottom',
          border: '0.5px solid #000000'
        }
      });
      const [ cellA22, cellB22 ] = sheet1.rows[20];
      expect(cellA22).to.eql({ value: 'Border dotted' });
      expect(cellB22).to.eql({
        value: null,
        style: {
          verticalAlign: 'bottom',
          border: '1px dotted #ff0000'
        }
      });
      const [ cellA24, cellB24 ] = sheet1.rows[22];
      expect(cellA24).to.eql({ value: 'Border dashed' });
      expect(cellB24).to.eql({
        value: null,
        style: {
          verticalAlign: 'bottom',
          border: '1px dashed #000000'
        }
      });
      const [ cellA26, cellB26 ] = sheet1.rows[24];
      expect(cellA26).to.eql({ value: 'Border double' });
      expect(cellB26).to.eql({
        value: null,
        style: {
          verticalAlign: 'bottom',
          border: '1px double #000000'
        }
      });
      const [ cellA28, cellB28 ] = sheet1.rows[26];
      expect(cellA28).to.eql({ value: 'Border thick dashed' });
      expect(cellB28).to.eql({
        value: null,
        style: {
          verticalAlign: 'bottom',
          border: '3px dashed #000000'
        }
      });
      const [ cellA30, cellB30 ] = sheet1.rows[28];
      expect(cellA30).to.eql({ value: 'Border partial' });
      expect(cellB30).to.eql({
        value: null,
        style: {
          verticalAlign: 'bottom',
          borderRight: '1px solid #000000',
          borderBottom: '1px solid #000000',
        }
      });
    })
  })
})
