import Chai from 'chai'; const { expect } = Chai;
import ExcelJS from 'exceljs'; const { Workbook, ValueType } = ExcelJS;
import { loadAsset, loadExcelFile } from './helpers/file-loading.mjs';
import { reinterpretDate } from '../lib/time-zone-management.mjs';

import {
  formatValue,
  ExcelFractionFormatter,
  ExcelNumberFormatter,
} from '../lib/excel-formatting.mjs';

describe('Excel data formatting', function() {
  describe('#ExcelNumberFormatter', function() {
    describe('#findFraction()', function() {
      const formatter = ExcelFractionFormatter.get('?/??', {});
      const f = (number, width) => {
        return formatter.findFraction(number, width);
      };
      it('should return expected results', function() {
        expect(f(1.95, 1)).to.eql({ whole: 2 });
        expect(f(1.05, 1)).to.eql({ whole: 1 });
        expect(f(1.95, 2)).to.eql({ whole: 1, nom: 19, dem: 20 });
        expect(f(0.006, 3)).to.eql({ whole: 0, nom: 3, dem: 500 });
        expect(f(0.272, 2)).to.eql({ whole: 0, nom: 3, dem: 11 });
        expect(f(0.272, 3)).to.eql({ whole: 0, nom: 34, dem: 125 });
        expect(f(0.378, 1)).to.eql({ whole: 0, nom: 3, dem: 8 });
        expect(f(0.378, 2)).to.eql({ whole: 0, nom: 31, dem: 82 });
        expect(f(0.378, 3)).to.eql({ whole: 0, nom: 189, dem: 500 });
        expect(f(0.717, 1)).to.eql({ whole: 0, nom: 5, dem: 7 });
        expect(f(0.717, 2)).to.eql({ whole: 0, nom: 38, dem: 53 });
        expect(f(0.717, 3)).to.eql({ whole: 0, nom: 38, dem: 53 });
        expect(f(0.806, 1)).to.eql({ whole: 0, nom: 4, dem: 5 });
        //expect(f(0.806, 2)).to.eql({ whole: 0, nom: 52, dem: 67 });
        expect(f(0.806, 3)).to.eql({ whole: 0, nom: 403, dem: 500 });
      })
      it('should handles negative numbers correctly', function() {
        expect(f(-1.95, 2)).to.eql({ whole: -1, nom: 19, dem: 20 });
        expect(f(-0.006, 3)).to.eql({ whole: -0, nom: 3, dem: 500 });
      })
    })
    describe('#format()', function() {
      const f = (number, fs, options) => {
        const formatter = ExcelFractionFormatter.get(fs, options);
        return formatter.format(number);
      };
      it('should handle fixed denominator', function() {
        expect(f(1.95, '?/100', {})).to.eql('95/100');
        expect(f(1.24, '?/4', {})).to.eql('1/4');
        expect(f(1.10, '?/4', {})).to.eql('   ');
        expect(f(1.30, '?/3', {})).to.eql('1/3');
      })
      it('should handle variable denominator', function() {
        expect(f(1.95, '?/?', {})).to.eql('   ');
        expect(f(1.95, '??/??', {})).to.eql('19/20');
        expect(f(1.272, '??/???', {})).to.eql('34/125');
      })
    })
  })
  describe('#ExcelNumberFormatter', function() {
    describe('#format()', function() {
      const f = (number, fs, options) => {
        const formatter = ExcelNumberFormatter.get(fs, options);
        return formatter.format(number);
      };
      it('should handle patterns with no decimal point', function() {
        expect(f(0.123, '0', { locale: 'en-us', signDisplay: 'auto' })).to.eql('0');
        expect(f(100.123, '0', { locale: 'en-us', signDisplay: 'auto' })).to.eql('100');
        expect(f(1.59, '0', { locale: 'en-us', signDisplay: 'auto' })).to.eql('2');
      })
      it('should handle patterns with decimal digits', function() {
        expect(f(0.123, '0.00', { locale: 'en-us', signDisplay: 'auto' })).to.eql('0.12');
        expect(f(100.123, '0.00##', { locale: 'en-us', signDisplay: 'auto' })).to.eql('100.123');
        expect(f(1.59, '0.0', { locale: 'en-us', signDisplay: 'auto' })).to.eql('1.6');
      })
      it('should add leading zeros', function() {
        expect(f(0.123, '0000.00', { locale: 'en-us', signDisplay: 'auto' })).to.eql('0000.12');
        expect(f(100.123, '0000.00#', { locale: 'en-us', signDisplay: 'auto' })).to.eql('0100.123');
        expect(f(-1.59, '0000', { locale: 'en-us', signDisplay: 'auto' })).to.eql('-0002');
      })
      it('should omit sign when directed', function() {
        expect(f(-1.59, '0000', { locale: 'en-us', signDisplay: 'never' })).to.eql('0002');
      })
      it('should handle zero integer digit pattern', function() {
        expect(f(0.123, '#.00', { locale: 'en-us', signDisplay: 'auto' })).to.eql('.12');
        expect(f(-0.123, '#.00', { locale: 'en-us', signDisplay: 'auto' })).to.eql('-.12');
        expect(f(0.123, '#', { locale: 'en-us', signDisplay: 'auto' })).to.eql('');
        expect(f(-0.123, '#', { locale: 'en-us', signDisplay: 'auto' })).to.eql('');
      })
      it('should handle pattern with digit grouping', function() {
        expect(f(1000000, '#,##0', { locale: 'en-us', signDisplay: 'auto' })).to.eql('1,000,000');
        expect(f(1000000, '#,##0', { locale: 'pl-pl', signDisplay: 'auto' })).to.eql('1\u00a0000\u00a0000');
        expect(f(1000000, '#,##0', { locale: 'de-de', signDisplay: 'auto' })).to.eql('1.000.000');
        expect(f(1000000, '#,##0', { locale: 'fr-fr', signDisplay: 'auto' })).to.eql('1\u202f000\u202f000');
      })
      it('should handle scientific notation', function() {
        expect(f(1500000, '0.00E+0', { locale: 'en-us', signDisplay: 'auto' })).to.eql('1.50E+6');
        expect(f(1500000, '0.00E+00', { locale: 'en-us', signDisplay: 'auto' })).to.eql('1.50E+06');
        expect(f(1500000, '0.00e+0', { locale: 'en-us', signDisplay: 'auto' })).to.eql('1.50e+6');
        expect(f(1500000, '0.00e+00', { locale: 'en-us', signDisplay: 'auto' })).to.eql('1.50e+06');
      })
      it('should handle scientific notation', function() {
        expect(f(150000, '##0.0E+0', { locale: 'en-us', signDisplay: 'auto' })).to.eql('150.0E+3');
        expect(f(150000, '##0.00E+00', { locale: 'en-us', signDisplay: 'auto' })).to.eql('150.00E+03');
      })
      it('should handle irregular patterns', function() {
        expect(f(123456789, '000-000-000', { locale: 'en-us', signDisplay: 'auto' })).to.eql('123-456-789');
        expect(f(789123456789, '000-000-000', { locale: 'en-us', signDisplay: 'auto' })).to.eql('789123-456-789');
        expect(f(-789123456789, '000-000-000', { locale: 'en-us', signDisplay: 'auto' })).to.eql('-789123-456-789');
        expect(f(1234567890.123, '000.000.000.000', { locale: 'en-us', signDisplay: 'auto' })).to.eql('1234567890.123.000.000');
        expect(f(789, '000-000-000', { locale: 'en-us', signDisplay: 'auto' })).to.eql('000-000-789');
        expect(f(789, '###-###-000', { locale: 'en-us', signDisplay: 'auto' })).to.eql('--789');
        expect(f(12.3456, '0.00 h 000', { locale: 'en-us', signDisplay: 'auto' })).to.eql('12.34 h 560');
        expect(f(150000, '##0.0   E+0', { locale: 'en-us', signDisplay: 'auto' })).to.eql('150.0   E+3');
        expect(f(150000, '##0.00   E+00', { locale: 'en-us', signDisplay: 'auto' })).to.eql('150.00   E+03');
      });
    })
  });
  describe('#formatValue()', function() {
    it('should handle conditional color', function() {
      const value = -15;
      const format = '0;[RED]-0';
      const result = formatValue(value, format, { locale: 'en-us' });
      expect(result).to.eql({ text: '-15',
        style: { color: '#ff0000' }
      });
    })
    it('should handle currency format', function() {
      const value = 500;
      const format = '#,##0.00 [$zł-415];[RED]-#,##0.00 [$zł-415]';
      const result1 = formatValue(value, format, { locale: 'en-us' });
      const result2 = formatValue(value, format, { locale: 'pl-pl' });
      expect(result1).to.eql({ text: '500.00 zł', style: undefined });
      expect(result2).to.eql({ text: '500,00 zł', style: undefined });
    })
    it('should handle negative currency value', function() {
      const value = -500;
      const format = '#,##0.00 [$zł-415];[RED]-#,##0.00 [$zł-415]';
      const result = formatValue(value, format, { locale: 'en-us' });
      expect(result).to.eql({ text: '-500.00 zł',
        style: { color: '#ff0000' }
      });
    })
    it('should handle percentage', function() {
      const value = 0.5;
      const format = '0 %';
      const result = formatValue(value, format, { locale: 'en-us' });
      expect(result).to.eql({ text: '50 %', style: undefined });
    })
    it('should handle fraction', function() {
      const value = 100.5;
      const format = '# ?/?';
      const result = formatValue(value, format, { locale: 'en-us' });
      expect(result).to.eql({ text: '100 1/2', style: undefined });
    })
    it('should handle boolean', function() {
      const format = '"TRUE";"TRUE";"FALSE"';
      const result1 = formatValue(0, format, { locale: 'en-us' });
      const result2 = formatValue(1, format, { locale: 'en-us' });
      expect(result1).to.eql({ text: 'FALSE', style: undefined });
      expect(result2).to.eql({ text: 'TRUE', style: undefined });
    })
    it('should handle time', function() {
      const value = new Date(1970, 1, 1, 0, 0, 0, 500);
      const format = 'hh:mm:ss.0 AM/PM';
      const result = formatValue(value, format, { locale: 'en-us' });
      expect(result).to.eql({ text: '12:00:00.5 AM', style: undefined });
    })
    it('should handle null correctly', function() {
      const value = null;
      const format = '# ?/2';
      const result = formatValue(value, format, { locale: 'en-us' });
      expect(result).to.eql({ text: '0    ', style: undefined });
    })

    let workbook;
    before(async () => {
      const buffer = await loadAsset('formatting.xlsx');
      workbook = new Workbook();
      await workbook.xlsx.load(buffer);
    })
    it('should be able to correctly process items in sheet "normal"', function() {
      testSheet(workbook, 'normal', { locale: 'en-us' });
    })
    it('should be able to correctly process items in sheet "special"', function() {
      testSheet(workbook, 'special', { locale: 'en-us' });
    })
    it('should be able to correctly process items in sheet "datetime"', function() {
      testSheet(workbook, 'datetime', { locale: 'en-us' });
    })
    it('should be able to correctly process items in sheet "fraction"', function() {
      testSheet(workbook, 'fraction', { locale: 'en-us' });
    })
  })
  describe('#parseExcelFile()', function() {
    let formatting;
    before(async () => {
      formatting = await loadExcelFile('formatting.xlsx');
    })
    it('should format data in the same manner as Excel', function() {
      for (let sheet of formatting.sheets) {
        const [ patternCol, valueCol, resultCol, formattedCol ] = sheet.columns;
        for (let [ index, pattern ] of patternCol.cells.entries()) {
          try {
            const value = valueCol.cells[index];
            const result = resultCol.cells[index];
            const formatted = formattedCol.cells[index];
            if (result.style && result.style.backgroundColor) {
              continue;
            }
            if (result.text !== undefined) {
              expect(result.text).to.eql(formatted.value);
            }
          } catch(err) {
            err.message += ` on row ${index + 2} in sheet ${sheet.name}`;
            throw err;
          }
        }
      }
    })
  })
})

function testSheet(workbook, name, options) {
  for (let worksheet of workbook.worksheets) {
    if (worksheet.name === name) {
      const { rowCount } = worksheet;
      for (let r = 2; r <= rowCount; r++) {
        const wsRow = worksheet.getRow(r);
        if (!wsRow.hasValues) {
          continue;
        }
        const valueCell = wsRow.getCell(2);
        const targetCell = wsRow.getCell(3);
        const resultCell = wsRow.getCell(4);
        let value = valueCell.value;
        const format = targetCell.numFmt;
        const result = resultCell.text;
        if (valueCell.fill && valueCell.fill.pattern === 'solid') {
          continue;
        }
        if (value instanceof Date) {
          value = reinterpretDate(value);
        }
        if (valueCell.effectiveType === ValueType.RichText || valueCell.effectiveType === ValueType.Hyperlink) {
          value = valueCell.text;
        }
        let text;
        try {
          const ours = formatValue(value, format, options);
          text = ours.text;
        } catch (err) {
          if (value == null) {
            text = '0';
          } else {
            text = value + '';
          }
        }
        try {
          expect(text).to.eql(result);
        } catch (err) {
          err.message += ` on row ${r}`;
          throw err;
        }
      }
      return;
    }
  }
  throw new Error(`Unable to find sheet "${name}"`);
}
