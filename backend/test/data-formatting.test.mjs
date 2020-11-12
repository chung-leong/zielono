import Chai from 'chai'; const { expect } = Chai;

import {
  formatValue,
  formatNumber,
  formatFraction,
  formatTimeComponent,
  findFraction,
} from '../src/data-formatting.mjs';

describe('Excel parsing', function() {
  describe('#findFraction()', function() {
    it('should return expected results', function() {
      expect(findFraction(1.95, 1)).to.eql({ whole: 2 });
      expect(findFraction(1.05, 1)).to.eql({ whole: 1 });
      expect(findFraction(1.95, 2)).to.eql({ whole: 1, nom: 19, dem: 20 });
      expect(findFraction(0.006, 3)).to.eql({ whole: 0, nom: 3, dem: 500 });
      expect(findFraction(0.272, 2)).to.eql({ whole: 0, nom: 3, dem: 11 });
      expect(findFraction(0.272, 3)).to.eql({ whole: 0, nom: 34, dem: 125 });
      expect(findFraction(0.378, 1)).to.eql({ whole: 0, nom: 3, dem: 8 });
      expect(findFraction(0.378, 2)).to.eql({ whole: 0, nom: 31, dem: 82 });
      expect(findFraction(0.378, 3)).to.eql({ whole: 0, nom: 189, dem: 500 });
      expect(findFraction(0.717, 1)).to.eql({ whole: 0, nom: 5, dem: 7 });
      expect(findFraction(0.717, 2)).to.eql({ whole: 0, nom: 38, dem: 53 });
      expect(findFraction(0.717, 3)).to.eql({ whole: 0, nom: 38, dem: 53 });
      expect(findFraction(0.806, 1)).to.eql({ whole: 0, nom: 4, dem: 5 });
      //expect(findFraction(0.806, 2)).to.eql({ whole: 0, nom: 52, dem: 67 });
      expect(findFraction(0.806, 3)).to.eql({ whole: 0, nom: 403, dem: 500 });
    })
    it('should handles negative numbers correctly', function() {
      expect(findFraction(-1.95, 2)).to.eql({ whole: -1, nom: 19, dem: 20 });
      expect(findFraction(-0.006, 3)).to.eql({ whole: -0, nom: 3, dem: 500 });
    })
  })
  describe('#formatFraction()', function() {
    it('should handle fixed denominator', function() {
      expect(formatFraction(1.95, '?/100', {})).to.eql('95/100');
      expect(formatFraction(1.24, '?/4', {})).to.eql('1/4');
      expect(formatFraction(1.10, '?/4', {})).to.eql('');
      expect(formatFraction(1.30, '?/3', {})).to.eql('1/3');
    })
    it('should handle variable denominator', function() {
      expect(formatFraction(1.95, '?/?', {})).to.eql('');
      expect(formatFraction(1.95, '??/??', {})).to.eql('19/20');
      expect(formatFraction(1.272, '??/???', {})).to.eql('34/125');
    })
  })
  describe('#formatNumber()', function() {
    it('should handle patterns with no decimal point', function() {
      expect(formatNumber(0.123, '0', { locale: 'en-us', omitSign: false })).to.eql('0');
      expect(formatNumber(100.123, '0', { locale: 'en-us', omitSign: false })).to.eql('100');
      expect(formatNumber(1.59, '0', { locale: 'en-us', omitSign: false })).to.eql('2');
    })
    it('should handle patterns with decimal digits', function() {
      expect(formatNumber(0.123, '0.00', { locale: 'en-us', omitSign: false })).to.eql('0.12');
      expect(formatNumber(100.123, '0.00##', { locale: 'en-us', omitSign: false })).to.eql('100.123');
      expect(formatNumber(1.59, '0.0', { locale: 'en-us', omitSign: false })).to.eql('1.6');
    })
    it('should add leading zeros', function() {
      expect(formatNumber(0.123, '0000.00', { locale: 'en-us', omitSign: false })).to.eql('0000.12');
      expect(formatNumber(100.123, '0000.00#', { locale: 'en-us', omitSign: false })).to.eql('0100.123');
      expect(formatNumber(-1.59, '0000', { locale: 'en-us', omitSign: false })).to.eql('-0002');
    })
    it('should omit sign when directed', function() {
      expect(formatNumber(-1.59, '0000', { locale: 'en-us', omitSign: true })).to.eql('0002');
    })
    it('should handle zero integer digit pattern', function() {
      expect(formatNumber(0.123, '#.00', { locale: 'en-us', omitSign: false })).to.eql('.12');
      expect(formatNumber(-0.123, '#.00', { locale: 'en-us', omitSign: false })).to.eql('-.12');
      expect(formatNumber(0.123, '#', { locale: 'en-us', omitSign: false })).to.eql('');
      expect(formatNumber(-0.123, '#', { locale: 'en-us', omitSign: false })).to.eql('');
    })
    it('should handle pattern with digit grouping', function() {
      expect(formatNumber(1000000, '#,##0', { locale: 'en-us', omitSign: false })).to.eql('1,000,000');
      expect(formatNumber(1000000, '#,##0', { locale: 'pl-pl', omitSign: false })).to.eql('1\u00a0000\u00a0000');
      expect(formatNumber(1000000, '#,##0', { locale: 'de-de', omitSign: false })).to.eql('1.000.000');
      expect(formatNumber(1000000, '#,##0', { locale: 'fr-fr', omitSign: false })).to.eql('1\u202f000\u202f000');
    })
    it('should handle scientific notation', function() {
      expect(formatNumber(1500000, '0.00E+0', { locale: 'en-us', omitSign: false })).to.eql('1.50E+6');
      expect(formatNumber(1500000, '0.00E+00', { locale: 'en-us', omitSign: false })).to.eql('1.50E+06');
      expect(formatNumber(1500000, '0.00e+0', { locale: 'en-us', omitSign: false })).to.eql('1.50e+6');
      expect(formatNumber(1500000, '0.00e+00', { locale: 'en-us', omitSign: false })).to.eql('1.50e+06');
    })
    it('should handle scientific notation', function() {
      expect(formatNumber(150000, '##0.0E+0', { locale: 'en-us', omitSign: false })).to.eql('150.0E+3');
      expect(formatNumber(150000, '##0.00E+00', { locale: 'en-us', omitSign: false })).to.eql('150.00E+03');
    })
    it('should handle irregular patterns', function() {
      expect(formatNumber(123456789, '000-000-000', { locale: 'en-us', omitSign: false })).to.eql('123-456-789');
      expect(formatNumber(789123456789, '000-000-000', { locale: 'en-us', omitSign: false })).to.eql('789123-456-789');
      expect(formatNumber(-789123456789, '000-000-000', { locale: 'en-us', omitSign: false })).to.eql('-789123-456-789');
      expect(formatNumber(1234567890.123, '000.000.000.000', { locale: 'en-us', omitSign: false })).to.eql('1234567890.123.000.000');
      expect(formatNumber(789, '000-000-000', { locale: 'en-us', omitSign: false })).to.eql('000-000-789');
      expect(formatNumber(789, '###-###-000', { locale: 'en-us', omitSign: false })).to.eql('--789');
      expect(formatNumber(12.3456, '0.00 h 000', { locale: 'en-us', omitSign: false })).to.eql('12.34 h 560');
      expect(formatNumber(150000, '##0.0   E+0', { locale: 'en-us', omitSign: false })).to.eql('150.0   E+3');
      expect(formatNumber(150000, '##0.00   E+00', { locale: 'en-us', omitSign: false })).to.eql('150.00   E+03');
    });
  })
  describe('#formatTimeComponent()', function() {
    it('should handle year', function() {
      const date = new Date('2017-07-04T21:58:22.234Z')
      expect(formatTimeComponent(date, 'YY', { locale: 'en-us', timeZone: 'Europe/Warsaw' })).to.eql('17');
      expect(formatTimeComponent(date, 'YYYY', { locale: 'en-us', timeZone: 'Europe/Warsaw' })).to.eql('2017');
    })
    it('should handle month', function() {
      const date = new Date('2017-07-04T21:58:22.234Z')
      expect(formatTimeComponent(date, 'M', { locale: 'en-us', timeZone: 'Europe/Warsaw' })).to.eql('7');
      expect(formatTimeComponent(date, 'MM', { locale: 'en-us', timeZone: 'Europe/Warsaw' })).to.eql('07');
      expect(formatTimeComponent(date, 'MMM', { locale: 'en-us', timeZone: 'Europe/Warsaw' })).to.eql('Jul');
      expect(formatTimeComponent(date, 'MMMM', { locale: 'en-us', timeZone: 'Europe/Warsaw' })).to.eql('July');
      expect(formatTimeComponent(date, 'MMM', { locale: 'pl-pl', timeZone: 'Europe/Warsaw' })).to.eql('lip');
      expect(formatTimeComponent(date, 'MMMM', { locale: 'pl-pl', timeZone: 'Europe/Warsaw' })).to.eql('lipiec');
    })
    it('should handle day', function() {
      const date = new Date('2017-07-04T21:58:22.234Z')
      expect(formatTimeComponent(date, 'D', { locale: 'en-us', timeZone: 'Europe/Warsaw' })).to.eql('4');
      expect(formatTimeComponent(date, 'DD', { locale: 'en-us', timeZone: 'Europe/Warsaw' })).to.eql('04');
    })
    it('should handle weekday', function() {
      const date = new Date('2017-07-04T21:58:22.234Z')
      expect(formatTimeComponent(date, 'NN', { locale: 'en-us', timeZone: 'Europe/Warsaw' })).to.eql('Tue');
      expect(formatTimeComponent(date, 'NNNN', { locale: 'en-us', timeZone: 'Europe/Warsaw' })).to.eql('Tuesday');
      expect(formatTimeComponent(date, 'NN', { locale: 'pl-pl', timeZone: 'Europe/Warsaw' })).to.eql('wt.');
      expect(formatTimeComponent(date, 'NNNN', { locale: 'pl-pl', timeZone: 'Europe/Warsaw' })).to.eql('wtorek');
    })
  })
  describe('#formatValue()', function() {
    it('should handle conditional color', function() {
      const value = -15;
      const format = '0;[RED]-0';
      const result = formatValue(value, format, { locale: 'en-us' });
      expect(result).to.eql({ text: '-15', color: '#ff0000' });
    })
    it('should handle currency format', function() {
      const value = 500;
      const format = '#,##0.00 [$zł-415];[RED]-#,##0.00 [$zł-415]';
      const result1 = formatValue(value, format, { locale: 'en-us' });
      const result2 = formatValue(value, format, { locale: 'pl-pl' });
      expect(result1).to.eql({ text: '500.00 zł', color: undefined });
      expect(result2).to.eql({ text: '500,00 zł', color: undefined });
    })
    it('should handle negative currency value', function() {
      const value = -500;
      const format = '#,##0.00 [$zł-415];[RED]-#,##0.00 [$zł-415]';
      const result = formatValue(value, format, { locale: 'en-us' });
      expect(result).to.eql({ text: '-500.00 zł', color: '#ff0000' });
    })
    it('should handle percentage', function() {
      const value = 0.5;
      const format = '0 %';
      const result = formatValue(value, format, { locale: 'en-us' });
      expect(result).to.eql({ text: '50 %', color: undefined });
    })
    it('should handle fraction', function() {
      const value = 100.5;
      const format = '# ?/?';
      const result = formatValue(value, format, { locale: 'en-us' });
      expect(result).to.eql({ text: '100 1/2', color: undefined });
    })
    it('should handle boolean', function() {
      const format = '"TRUE";"TRUE";"FALSE"';
      const result1 = formatValue(0, format, { locale: 'en-us' });
      const result2 = formatValue(1, format, { locale: 'en-us' });
      expect(result1).to.eql({ text: 'FALSE', color: undefined });
      expect(result2).to.eql({ text: 'TRUE', color: undefined });
    })
  })
})
