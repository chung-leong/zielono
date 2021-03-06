import Chai from 'chai'; const { expect } = Chai;
import { loadExcelFile } from './helpers/file-loading.mjs'

import {
  extractColor,
  getNamedColor,
  getIndexedColor,
  getThemeColor,
  parseARGB,
  stringifyARGB,
} from '../lib/excel-styling.mjs';

describe('Excel styling', function() {
  describe('parseARGB()', function() {
    it('should correctly parse an RGB string', function() {
      const argb = parseARGB('#FEf1f2f3');
      expect(argb).to.eql({ a: 0xfe, r: 0xf1, g: 0xf2, b: 0xf3 });
    })
  })
  describe('stringifyARGB()', function() {
    it('should return color in basic hex representation when the color is opaque', function () {
      const color = stringifyARGB({ a:0xff, r: 0xff, g: 0x01, b: 0x01 });
      expect(color).to.equal('#ff0101');
    })
    it('should return color in rgba() notation when the color is transparent', function () {
      const color = stringifyARGB({ a:0xf0, r: 0xff, g: 0x01, b: 0x01 });
      expect(color).to.equal('rgba(255, 1, 1, 0.94)');
    })
  })
  describe('getNamedColor()', function() {
    it('should return a color by name', function() {
      const color = getNamedColor('RED');
      expect(color).to.eql({ a: 0xff, r: 0xff, g: 0x00, b: 0x00 });
    })
    it('should return an unnamed color', function() {
      const color = getNamedColor('10');
      expect(color).to.eql({ a: 0xff, r: 0x00, g: 0x80, b: 0x00 });
    })
  })
  describe('getIndexedColor()', function() {
    it('should return a color by index', function() {
      const color = getIndexedColor(5);
      expect(color).to.eql({ a: 0xff, r: 0x00, g: 0x00, b: 0xff })
    })
    it('should return undefined when index is out of range', function() {
      const color = getIndexedColor(64);
      expect(color).to.be.undefined;
    })
  })
  describe('getThemeColor()', function() {
    it('should return a theme color with no tint', function() {
      const color = getThemeColor(1, 0);
      expect(color).to.eql({ a: 255, r: 0, g: 0, b: 0 });
    })
    it('should return a theme color with max tint', function() {
      const color = getThemeColor(1, 1);
      expect(color).to.eql({ a: 255, r: 255, g: 255, b: 255 });
    })
    it('should return a color correspdoning to the theme = 3', function() {
      const color = getThemeColor(3, 0.80);
      expect(color).to.eql({ a: 255, r: 218, g: 221, b: 225 });
    })
  })
  describe('extractColor()', function() {
    it('should extract color specified as ARGB', function() {
      const color = extractColor({ argb: '#ff00ff00' });
      expect(color).to.eql({ a: 255, r: 0, g: 255, b: 0 });
    })
    it('should extract theme color', function() {
      const color = extractColor({ theme: 3, tint: 0.80 });
      expect(color).to.eql({ a: 255, r: 218, g: 221, b: 225 });
    })
    it('should extract indexed color', function() {
      const color = extractColor({ indexed: 5 });
      expect(color).to.eql({ a: 0xff, r: 0x00, g: 0x00, b: 0xff });
    })
  })
  describe('parseExcelFile()', function() {
    let sample;
    before(async () => {
      sample = await loadExcelFile('sample.xlsx');
    })
    it('should apply indentation', function() {
      const sheet1 = sample.sheets[0];
      const cellA3 = sheet1.columns[0].cells[1];
      const cellB3 = sheet1.columns[1].cells[1];
      expect(cellA3).to.eql({ value: 'Indent' });
      expect(cellB3).to.eql({ value: 'This is a test',
        style: {
          verticalAlign: 'bottom',
          paddingLeft: '20pt'
        }
      });
    })
    it('should apply horizontal alignment', function() {
      const sheet1 = sample.sheets[0];
      const cellA4 = sheet1.columns[0].cells[2];
      const cellB4 = sheet1.columns[1].cells[2];
      expect(cellA4).to.eql({ value: 'Align right' });
      expect(cellB4).to.eql({ value: 'This is a test',
        style: {
          verticalAlign: 'bottom',
          textAlign: 'right'
        }
      });
      const cellA5 = sheet1.columns[0].cells[3];
      const cellB5 = sheet1.columns[1].cells[3];
      expect(cellA5).to.eql({ value: 'Align center' });
      expect(cellB5).to.eql({ value: 'This is a test',
        style: {
          verticalAlign: 'bottom',
          textAlign: 'center'
        }
      });
      const cellA6 = sheet1.columns[0].cells[4];
      const cellB6 = sheet1.columns[1].cells[4];
      expect(cellA6).to.eql({ value: 'Align left' });
      expect(cellB6).to.eql({ value: 123,
        style: {
          verticalAlign: 'bottom',
        }
      });
    })
    it('should apply vertical alignment', function() {
      const sheet1 = sample.sheets[0];
      const cellA7 = sheet1.columns[0].cells[5];
      const cellB7 = sheet1.columns[1].cells[5];
      expect(cellA7).to.eql({ value: 'Align top' });
      expect(cellB7).to.eql({ value: 'This is a test' });
      const cellA8 = sheet1.columns[0].cells[6];
      const cellB8 = sheet1.columns[1].cells[6];
      expect(cellA8).to.eql({ value: 'Align middle' });
      expect(cellB8).to.eql({ value: 'This is a test',
        style: {
          verticalAlign: 'middle',
        }
      });
      const cellA9 = sheet1.columns[0].cells[7];
      const cellB9 = sheet1.columns[1].cells[7];
      expect(cellA9).to.eql({ value: 'Align bottom' });
      expect(cellB9).to.eql({ value: 'This is a test',
        style: {
          verticalAlign: 'bottom',
        }
      });
    })
    it('should apply color', function() {
      const sheet1 = sample.sheets[0];
      const cellA10 = sheet1.columns[0].cells[8];
      const cellB10 = sheet1.columns[1].cells[8];
      expect(cellA10).to.eql({ value: 'Color' });
      expect(cellB10).to.eql({ value: 'This is a test',
        style: {
          verticalAlign: 'bottom',
          textAlign: 'center',
          color: '#ff0000',
        }
      });
      const cellA11 = sheet1.columns[0].cells[9];
      const cellB11 = sheet1.columns[1].cells[9];
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
      const sheet1 = sample.sheets[0];
      const cellA12 = sheet1.columns[0].cells[10];
      const cellB12 = sheet1.columns[1].cells[10];
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
      const sheet1 = sample.sheets[0];
      const cellA13 = sheet1.columns[0].cells[11];
      const cellB13 = sheet1.columns[1].cells[11];
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
      const sheet1 = sample.sheets[0];
      const cellA14 = sheet1.columns[0].cells[12];
      const cellB14 = sheet1.columns[1].cells[12];
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
    it('should extract rich text with double underline', function() {
      const sheet1 = sample.sheets[0];
      const cellA34 = sheet1.columns[0].cells[31];
      const cellB34 = sheet1.columns[1].cells[31];
      expect(cellA34).to.eql({ value: 'Double underline' });
      expect(cellB34).to.eql({
        value: [
          { text: 'This is a ' },
          { text: 'test', style: { textDecoration: 'underline double' } },
          { text: ', and this is only a test' },
        ],
        style: {
          verticalAlign: 'bottom',
        }
      });
    })
    it('should extract rich text with underline and line-through', function() {
      const sheet1 = sample.sheets[0];
      const cellA35 = sheet1.columns[0].cells[32];
      const cellB35 = sheet1.columns[1].cells[32];
      expect(cellA35).to.eql({ value: 'Strike and underline' });
      expect(cellB35).to.eql({
        value: [
          { text: 'This is a ' },
          { text: 'test', style: { textDecoration: 'line-through underline' } },
          { text: ', and this is only a test' },
        ],
        style: {
          verticalAlign: 'bottom',
        }
      });
    })
    it('should pick up accounting underline', function() {
      const sheet1 = sample.sheets[0];
      const cellA36 = sheet1.columns[0].cells[33];
      const cellB36 = sheet1.columns[1].cells[33];
      expect(cellA36).to.eql({ value: 'Underline accounting' });
      expect(cellB36).to.eql({
        value: 'This is a test, and this is only a test',
        style: {
          textDecoration: 'underline',
          textUnderlinePosition: 'under'
        }
      });
    })
    it('should pick up double accounting underline', function() {
      const sheet1 = sample.sheets[0];
      const cellA37 = sheet1.columns[0].cells[34];
      const cellB37 = sheet1.columns[1].cells[34];
      expect(cellA37).to.eql({ value: 'Double accounting' });
      expect(cellB37).to.eql({
        value: 'This is a test, and this is only a test',
        style: {
          textDecoration: 'underline double',
          textUnderlinePosition: 'under'
        }
      });
    })
    it('should extract rich text superscript section', function() {
      const sheet1 = sample.sheets[0];
      const cellA38 = sheet1.columns[0].cells[35];
      const cellB38 = sheet1.columns[1].cells[35];
      expect(cellA38).to.eql({ value: 'Superscript' });
      expect(cellB38).to.eql({
        value: [
          { text: 'This is a test' },
          { text: '2', style: { verticalAlign: 'super' } },
        ],
        style: {
          verticalAlign: 'bottom',
        }
      });
    })
    it('should extract rich text subscript section', function() {
      const sheet1 = sample.sheets[0];
      const cellA39 = sheet1.columns[0].cells[36];
      const cellB39 = sheet1.columns[1].cells[36];
      expect(cellA39).to.eql({ value: 'Subscript' });
      expect(cellB39).to.eql({
        value: [
          { text: 'This is a test' },
          { text: '2', style: { verticalAlign: 'sub' } },
        ],
        style: {
          verticalAlign: 'bottom',
        }
      });
    })
    it('should extract rich text with section in different font', function() {
      const sheet1 = sample.sheets[0];
      const cellA15 = sheet1.columns[0].cells[13];
      const cellB15 = sheet1.columns[1].cells[13];
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
      const sheet1 = sample.sheets[0];
      const cellA16 = sheet1.columns[0].cells[14];
      const cellB16 = sheet1.columns[1].cells[14];
      expect(cellA16).to.eql({ value: 'Border thin' });
      expect(cellB16).to.eql({
        value: null,
        style: {
          verticalAlign: 'bottom',
          border: '1px solid #000000'
        }
      });
      const cellA18 = sheet1.columns[0].cells[16];
      const cellB18 = sheet1.columns[1].cells[16];
      expect(cellA18).to.eql({ value: 'Border thick' });
      expect(cellB18).to.eql({
        value: null,
        style: {
          verticalAlign: 'bottom',
          border: '3px solid #000000'
        }
      });
      const cellA20 = sheet1.columns[0].cells[18];
      const cellB20 = sheet1.columns[1].cells[18];
      expect(cellA20).to.eql({ value: 'Border hairline' });
      expect(cellB20).to.eql({
        value: null,
        style: {
          verticalAlign: 'bottom',
          border: '0.5px solid #000000'
        }
      });
      const cellA22 = sheet1.columns[0].cells[20];
      const cellB22 = sheet1.columns[1].cells[20];
      expect(cellA22).to.eql({ value: 'Border dotted' });
      expect(cellB22).to.eql({
        value: null,
        style: {
          verticalAlign: 'bottom',
          border: '1px dotted #ff0000'
        }
      });
      const cellA24 = sheet1.columns[0].cells[22];
      const cellB24 = sheet1.columns[1].cells[22];
      expect(cellA24).to.eql({ value: 'Border dashed' });
      expect(cellB24).to.eql({
        value: null,
        style: {
          verticalAlign: 'bottom',
          border: '1px dashed #000000'
        }
      });
      const cellA26 = sheet1.columns[0].cells[24];
      const cellB26 = sheet1.columns[1].cells[24];
      expect(cellA26).to.eql({ value: 'Border double' });
      expect(cellB26).to.eql({
        value: null,
        style: {
          verticalAlign: 'bottom',
          border: '1px double #000000'
        }
      });
      const cellA28 = sheet1.columns[0].cells[26];
      const cellB28 = sheet1.columns[1].cells[26];
      expect(cellA28).to.eql({ value: 'Border thick dashed' });
      expect(cellB28).to.eql({
        value: null,
        style: {
          verticalAlign: 'bottom',
          border: '3px dashed #000000'
        }
      });
      const cellA30 = sheet1.columns[0].cells[28];
      const cellB30 = sheet1.columns[1].cells[28];
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
