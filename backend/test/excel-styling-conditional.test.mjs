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
      expect(cellF2).to.eql({ value: 1, style: { textAlign: 'center' } });
    })
    it('should attach parameters for data bar', function() {
      const sheet = sample.sheets[3];
      expect(sheet).to.have.property('name', 'Conditional formatting');
      const column = sheet.columns[6];
      expect(column).to.have.property('name', 'Data bar 1');
      const cellG2 = sheet.rows[0][6];
      const cellG7 = sheet.rows[5][6];
      const cellG11 = sheet.rows[9][6];
      expect(cellG2).to.eql({ value: 1, style: { textAlign: 'right' },
        bar: {
          width: (1 - 1) / (10 - 1),
          color: '#638ec6'
        }
      });
      expect(cellG7).to.eql({ value: 6, style: { textAlign: 'right' },
        bar: {
          width: (6 - 1) / (10 - 1),
          color: '#638ec6'
        }
      });
      expect(cellG11).to.eql({ value: 10,
        bar: {
          width: (10 - 1) / (10 - 1),
          color: '#638ec6'
        }
      });
    })
    it('should set hideValue for data bar', function() {
      const sheet = sample.sheets[3];
      expect(sheet).to.have.property('name', 'Conditional formatting');
      const column = sheet.columns[7];
      expect(column).to.have.property('name', 'Data bar 2');
      const cellH2 = sheet.rows[0][7];
      const cellH7 = sheet.rows[5][7];
      expect(cellH2).to.eql({ value: 5, style: { textAlign: 'right' },
        hideValue: true,
        bar: {
          width: (5 - 5) / (14 - 5),
          color: '#638ec6'
        }
      });
      expect(cellH7).to.eql({ value: 10,
        style: {
          textAlign: 'right',
          backgroundColor: '#ffff00'
        },
        hideValue: true,
        bar: {
          width: (10 - 5) / (14 - 5),
          color: '#638ec6'
        }
      });
    })
    it('should apply styling to cells in the top 20%', function() {
      const sheet = sample.sheets[3];
      expect(sheet).to.have.property('name', 'Conditional formatting');
      const column = sheet.columns[8];
      expect(column).to.have.property('name', 'Top 20%');
      const cellI2 = sheet.rows[0][8];
      const cellI9 = sheet.rows[7][8];
      const cellI10 = sheet.rows[8][8];
      expect(cellI2).to.eql({ value: 1,
        style: {
          textAlign: 'right'
        },
      });
      expect(cellI9).to.eql({ value: 8,
        style: {
          textAlign: 'right'
        },
      });
      expect(cellI10).to.eql({ value: 9,
        style: {
          color: '#9c0006',
          textAlign: 'right',
          backgroundColor: '#ffc7ce'
        },
      });
    })
    it('should apply styling to top 5 cells', function() {
      const sheet = sample.sheets[3];
      expect(sheet).to.have.property('name', 'Conditional formatting');
      const column = sheet.columns[9];
      expect(column).to.have.property('name', 'Top 5');
      const cellJ2 = sheet.rows[0][9];
      const cellJ6 = sheet.rows[4][9];
      const cellJ7 = sheet.rows[5][9];
      expect(cellJ2).to.eql({ value: 10,
        style: {
          textAlign: 'right'
        },
      });
      expect(cellJ6).to.eql({ value: 50,
        style: {
          textAlign: 'right'
        },
      });
      expect(cellJ7).to.eql({ value: 60,
        style: {
          color: '#9c0006',
          textAlign: 'right',
          backgroundColor: '#ffc7ce'
        },
      });
    })
    it('should apply styling to bottom 5 cells', function() {
      const sheet = sample.sheets[3];
      expect(sheet).to.have.property('name', 'Conditional formatting');
      const column = sheet.columns[10];
      expect(column).to.have.property('name', 'Bottom 5');
      const cellK2 = sheet.rows[0][10];
      const cellK6 = sheet.rows[4][10];
      const cellK7 = sheet.rows[5][10];
      expect(cellK2).to.eql({ value: 10,
        style: {
          color: '#9c0006',
          textAlign: 'right',
          backgroundColor: '#ffc7ce'
        },
      });
      expect(cellK6).to.eql({ value: 50,
        style: {
          color: '#9c0006',
          textAlign: 'right',
          backgroundColor: '#ffc7ce'
        },
      });
      expect(cellK7).to.eql({ value: 60,
        style: {
          textAlign: 'right',
        },
      });
    })
    it('should apply styling to cells with above average values', function() {
      const sheet = sample.sheets[3];
      expect(sheet).to.have.property('name', 'Conditional formatting');
      const column = sheet.columns[11];
      expect(column).to.have.property('name', 'Above avg');
      const cellL2 = sheet.rows[0][11];
      const cellL6 = sheet.rows[4][11];
      const cellL7 = sheet.rows[5][11];
      expect(cellL2).to.eql({ value: 10,
        style: {
          textAlign: 'right',
        },
      });
      expect(cellL6).to.eql({ value: 50,
        style: {
          textAlign: 'right',
        },
      });
      expect(cellL7).to.eql({ value: 60,
        style: {
          color: '#9c0006',
          textAlign: 'right',
          backgroundColor: '#ffc7ce'
        },
      });
    })
    it('should apply styling to cells with below average values', function() {
      const sheet = sample.sheets[3];
      expect(sheet).to.have.property('name', 'Conditional formatting');
      const column = sheet.columns[12];
      expect(column).to.have.property('name', 'Below avg');
      const cellM2 = sheet.rows[0][12];
      const cellM6 = sheet.rows[4][12];
      const cellM7 = sheet.rows[5][12];
      expect(cellM2).to.eql({ value: -10, text: '(10.00)',
        style: {
          color: '#9c6500',
          textAlign: 'right',
          backgroundColor: '#ffeb9c'
        },
      });
      expect(cellM6).to.eql({ value: 50, text: '50.00 ',
        style: {
          color: '#9c6500',
          textAlign: 'right',
          backgroundColor: '#ffeb9c'
        },
      });
      expect(cellM7).to.eql({ value: 60, text: '60.00 ',
        style: {
          textAlign: 'right',
        },
      });
    })
    it('should obtain icon set parameters (reversed)', function() {
      const sheet = sample.sheets[3];
      expect(sheet).to.have.property('name', 'Conditional formatting');
      const column = sheet.columns[13];
      expect(column).to.have.property('name', 'Icon set 1');
      const cellN2 = sheet.rows[0][13];
      const cellN5 = sheet.rows[3][13];
      const cellN8 = sheet.rows[6][13];
      const cellN9 = sheet.rows[7][13];
      expect(cellN2).to.eql({ value: 1, style: { textAlign: 'right' },
        icon: {
          set: '3Flags',
          index: 2,
        }
      });
      expect(cellN5).to.eql({ value: 4, style: { textAlign: 'right' },
        icon: {
          set: '3Flags',
          index: 2,
        }
      });
      expect(cellN8).to.eql({ value: 7, style: { textAlign: 'right' },
        icon: {
          set: '3Flags',
          index: 1,
        }
      });
      expect(cellN9).to.eql({ value: 8, style: { textAlign: 'right' },
        icon: {
          set: '3Flags',
          index: 0,
        }
      });
    })
    it('should obtain icon set parameters (5 icons)', function() {
      const sheet = sample.sheets[3];
      expect(sheet).to.have.property('name', 'Conditional formatting');
      const column = sheet.columns[14];
      expect(column).to.have.property('name', 'Icon set 2');
      const cellO2 = sheet.rows[0][14];
      const cellO4 = sheet.rows[2][14];
      const cellO6 = sheet.rows[4][14];
      const cellO8 = sheet.rows[6][14];
      const cellO10 = sheet.rows[8][14];
      expect(cellO2).to.eql({ value: 1, style: { textAlign: 'right' },
        icon: {
          set: '5ArrowsGray',
          index: 0,
        }
      });
      expect(cellO4).to.eql({ value: 3, style: { textAlign: 'right' },
        icon: {
          set: '5ArrowsGray',
          index: 1,
        }
      });
      expect(cellO6).to.eql({ value: 5, style: { textAlign: 'right' },
        icon: {
          set: '5ArrowsGray',
          index: 2,
        }
      });
      expect(cellO8).to.eql({ value: 7, style: { textAlign: 'right' },
        icon: {
          set: '5ArrowsGray',
          index: 3,
        }
      });
      expect(cellO10).to.eql({ value: 9, style: { textAlign: 'right' },
        icon: {
          set: '5ArrowsGray',
          index: 4,
        }
      });
    })
    it('should set hideValue for icon set', function() {
      const sheet = sample.sheets[3];
      expect(sheet).to.have.property('name', 'Conditional formatting');
      const column = sheet.columns[15];
      expect(column).to.have.property('name', 'Icon set 3');
      const cellP2 = sheet.rows[0][15];
      expect(cellP2).to.eql({ value: 1, style: { textAlign: 'right' },
        hideValue: true,
        icon: {
          set: '3Symbols2',
          index: 0,
        }
      });
    })
    it('should apply style to cells with duplicate values', function() {
      const sheet = sample.sheets[3];
      expect(sheet).to.have.property('name', 'Conditional formatting');
      const column = sheet.columns[16];
      expect(column).to.have.property('name', 'Duplicate');
      const cellQ2 = sheet.rows[0][16];
      const cellQ6 = sheet.rows[4][16];
      const cellQ9 = sheet.rows[7][16];
      const cellQ11 = sheet.rows[9][16];
      expect(cellQ2).to.eql({ value: 1,
        style: {
          textAlign: 'right'
        },
      });
      expect(cellQ6).to.eql({ value: 10,
        style: {
          color: '#9c0006',
          textAlign: 'right',
          backgroundColor: '#ffc7ce'
        },
      });
      expect(cellQ9).to.eql({ value: 10,
        style: {
          color: '#9c0006',
          textAlign: 'right',
          backgroundColor: '#ffc7ce'
        },
      });
      expect(cellQ11).to.eql({ value: '10', text: 'Top 10',
        style: {
          color: '#9c0006',
          backgroundColor: '#ffc7ce'
        },
      });
    })
    it('should apply style to cells with unique values', function() {
      const sheet = sample.sheets[3];
      expect(sheet).to.have.property('name', 'Conditional formatting');
      const column = sheet.columns[17];
      expect(column).to.have.property('name', 'Unique');
      const cellR2 = sheet.rows[0][17];
      const cellR4 = sheet.rows[2][17];
      const cellR6 = sheet.rows[4][17];
      const cellR9 = sheet.rows[7][17];
      expect(cellR2).to.eql({ value: 10,
        style: {
          textAlign: 'right'
        },
      });
      expect(cellR4).to.eql({ value: 11,
        style: {
          color: '#9c0006',
          textAlign: 'right',
          backgroundColor: '#ffc7ce'
        },
      });
      expect(cellR6).to.eql({ value: 9,
        style: {
          textAlign: 'right',
        },
      });
      expect(cellR9).to.eql({ value: '9' });
    })
  })
})
