import Chai from 'chai'; const { expect } = Chai;
import { loadExcelFile } from './helpers/file-loading.mjs'

import {
  interpolateColor2,
  interpolateColor3,
} from '../src/excel-styling-conditional.mjs';

describe('Excel conditional styling', function() {
  describe('#interpolateColor2()', function() {
    it('should return a color that is half way between the two', function() {
      const colors = [
        { a: 255, r: 255, g: 0, b: 0 },
        { a: 255, r: 0, g: 255, b: 0 },
      ] ;
      const min = 0, max = 10, value = 5;
      const result = interpolateColor2(colors, value, min, max);
      expect(result).to.eql({ a: 255, r: 127, g: 127, b: 0 });
    })
    it('should return the first color when value undershoots', function() {
      const colors = [
        { a: 255, r: 255, g: 0, b: 0 },
        { a: 255, r: 0, g: 255, b: 0 },
      ] ;
      const min = 0, max = 10, value = -5;
      const result = interpolateColor2(colors, value, min, max);
      expect(result).to.eql({ a: 255, r: 255, g: 0, b: 0 });
    })
    it('should return the second color when value overshoots', function() {
      const colors = [
        { a: 255, r: 255, g: 0, b: 0 },
        { a: 255, r: 0, g: 255, b: 0 },
      ] ;
      const min = 0, max = 10, value = 15;
      const result = interpolateColor2(colors, value, min, max);
      expect(result).to.eql({ a: 255, r: 0, g: 255, b: 0 });
    })
  })
  describe('#interpolateColor3()', function() {
    it('should interpolate between the first and second color when value is below midpoint', function() {
      const colors = [
        { a: 255, r: 255, g: 0, b: 0 },
        { a: 255, r: 0, g: 255, b: 0 },
        { a: 255, r: 0, g: 0, b: 255 },
      ] ;
      const min = 0, max = 16, mid = 8, value = 4;
      const result = interpolateColor3(colors, value, min, max, mid);
      expect(result).to.eql({ a: 255, r: 127, g: 127, b: 0 });
    })
    it('should interpolate between the second and third color when value is above midpoint', function() {
      const colors = [
        { a: 255, r: 255, g: 0, b: 0 },
        { a: 255, r: 0, g: 255, b: 0 },
        { a: 255, r: 0, g: 0, b: 255 },
      ] ;
      const min = 0, max = 16, mid = 8, value = 12;
      const result = interpolateColor3(colors, value, min, max, mid);
      expect(result).to.eql({ a: 255, r: 0, g: 127, b: 127 });
    })
  })
  describe('#parseExcelFile()', function() {
    let sample;
    before(async () => {
      sample = await loadExcelFile('sample.xlsx');
    })
    it('should apply two-color colorscale with numeric parameters', function() {
      const sheet = sample.sheets[3];
      expect(sheet).to.have.property('name', 'Conditional formatting');
      const column = sheet.columns[0];
      expect(column).to.have.property('name', 'Number 2');
      const cellA2 = sheet.rows[0][0];
      const cellA5 = sheet.rows[3][0];
      const cellA10 = sheet.rows[8][0];
      expect(cellA2).to.eql({ value: 10,
        style: {
          textAlign: 'center',
          backgroundColor: '#ff7c32',
        }
      });
      expect(cellA5).to.eql({ value: 40,
        style: {
          textAlign: 'center',
          backgroundColor: '#ffa255',
        }
      });
      expect(cellA10).to.eql({ value: 90,
        style: {
          textAlign: 'center',
          backgroundColor: '#ffe290',
        }
      });
    })
    it('should apply three-color colorscale with parameters in percentile', function() {
      const sheet = sample.sheets[3];
      expect(sheet).to.have.property('name', 'Conditional formatting');
      const column = sheet.columns[1];
      expect(column).to.have.property('name', 'Percentile 3');
      const cellB2 = sheet.rows[0][1];
      const cellB5 = sheet.rows[3][1];
      const cellB10 = sheet.rows[8][1];
      expect(cellB2).to.eql({ value: 1,
        style: {
          textAlign: 'center',
          backgroundColor: '#f8696b',
        }
      });
      expect(cellB5).to.eql({ value: 4,
        style: {
          textAlign: 'center',
          backgroundColor: '#fcb479',
        }
      });
      expect(cellB10).to.eql({ value: 88,
        style: {
          textAlign: 'center',
          backgroundColor: '#5c8bc5',
        }
      });
    })
    it('should apply three-color colorscale with parameters in percentage', function() {
      const sheet = sample.sheets[3];
      expect(sheet).to.have.property('name', 'Conditional formatting');
      const column = sheet.columns[2];
      expect(column).to.have.property('name', 'Percent 3');
      const cellC2 = sheet.rows[0][2];
      const cellC5 = sheet.rows[3][2];
      const cellC10 = sheet.rows[8][2];
      expect(cellC2).to.eql({ value: -5000,
        style: {
          textAlign: 'center',
          backgroundColor: '#f8696b',
        }
      });
      expect(cellC5).to.eql({ value: 4000,
        style: {
          textAlign: 'center',
          backgroundColor: '#fcbb7a',
        }
      });
      expect(cellC10).to.eql({ value: 23456,
        style: {
          textAlign: 'center',
          backgroundColor: '#5a8ac6',
        }
      });
    })
    it('should apply three-color colorscale with min/max parameters', function() {
      const sheet = sample.sheets[3];
      expect(sheet).to.have.property('name', 'Conditional formatting');
      const column = sheet.columns[3];
      expect(column).to.have.property('name', 'MinMax 3');
      const cellD2 = sheet.rows[0][3];
      const cellD5 = sheet.rows[3][3];
      const cellD10 = sheet.rows[8][3];
      expect(cellD2).to.eql({ value: new Date(2020, 0, 1), text: '01/01/20',
        style: {
          textAlign: 'center',
          backgroundColor: '#f8696b',
        }
      });
      expect(cellD5).to.eql({ value: new Date(2020, 0, 4), text: '01/04/20',
        style: {
          textAlign: 'center',
          backgroundColor: '#fcbf7b',
        }
      });
      expect(cellD10).to.eql({ value: new Date(2020, 0, 9), text: '01/09/20',
        style: {
          textAlign: 'center',
          backgroundColor: '#7e9fb7',
        }
      });
    })
    it('should apply three-color colorscale with cell ref as parameters', function() {
      const sheet = sample.sheets[3];
      expect(sheet).to.have.property('name', 'Conditional formatting');
      const column = sheet.columns[4];
      expect(column).to.have.property('name', 'Ref');
      const cellE2 = sheet.rows[0][4];
      const cellE5 = sheet.rows[3][4];
      const cellE10 = sheet.rows[8][4];
      expect(cellE2).to.eql({ value: 1,
        style: {
          textAlign: 'center',
          backgroundColor: '#f8696b',
        }
      });
      expect(cellE5).to.eql({ value: 4,
        style: {
          textAlign: 'center',
          backgroundColor: '#fdca7d',
        }
      });
      expect(cellE10).to.eql({ value: 9,
        style: {
          textAlign: 'center',
          backgroundColor: '#f7e687',
        }
      });
    })
    it('should ignore rules that use formula as parameters', function() {
      const sheet = sample.sheets[3];
      expect(sheet).to.have.property('name', 'Conditional formatting');
      const column = sheet.columns[5];
      expect(column).to.have.property('name', 'Formula');
      const cellF2 = sheet.rows[0][5];
      expect(cellF2).to.eql({ value: 1,
        style: {
          textAlign: 'center',
        }
      });
    })
  })
})
