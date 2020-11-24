import split from 'lodash/split.js';
import replace from 'lodash/replace.js';
import floor from 'lodash/floor.js';
import meanBy from 'lodash/meanBy.js';
import countBy from 'lodash/countBy.js';
import colCache from 'exceljs/lib/utils/col-cache.js';
import { extractCellStyle, extractColor, stringifyARGB, applyStyle } from './excel-styling.mjs';
import { formatValue } from './excel-formatting.mjs';

class ExcelConditionalStyling {
  constructor(worksheet, options) {
    this.rules = [];
    this.errors = [];
    for (let ruleSetDef of worksheet.conditionalFormattings) {
      try {
        const range = colCache.decode(ruleSetDef.ref);
        for (let ruleDef of ruleSetDef.rules) {
          const rule = ExcelConditionalRule.create(range, ruleDef, options);
          if (rule) {
            this.rules.push(rule);
          }
        }
      } catch (err) {
        this.errors.push(err);
      }
    }
    this.rules.sort((a, b) => b.priority - a.priority);
    this.worksheet = worksheet;
  }

  check(cell, contents) {
    for (let rule of this.rules) {
      rule.check(cell, contents);
    }
  }

  apply() {
    for (let rule of this.rules) {
      try {
        rule.apply(this.worksheet);
      } catch (err) {
        this.errors.push(err);
      }
    }
  }
}

class ExcelConditionalRule {
  static create(range, ruleDef, options) {
    switch (ruleDef.type) {
      case 'colorScale':
      case 'dataBar':
      case 'iconSet':
        return new ExcelConditionalRuleValueBased(range, ruleDef, options);
      case 'top10':
        return new ExcelConditionalRuleRankBased(range, ruleDef, options);
      case 'aboveAverage':
        return new ExcelConditionalRuleAverageBased(range, ruleDef, options);
      case 'uniqueValues':
      case 'duplicateValues':
        return new ExcelConditionalRuleUniquenessBased(range, ruleDef, options);
      case 'cellIs':
      case 'containsText':
      case 'beginsWith':
      case 'endsWith':
        return new ExcelConditionalRuleOperatorBased(range, ruleDef, options);
      case 'timePeriod':
        return new ExcelConditionalRuleTimeBased(range, ruleDef, options);
    }
  }

  constructor(range, ruleDef, options) {
    // save the applicable range
    const { left, right, top, bottom, tl, br } = range;
    const { type, priority, style } = ruleDef;
    this.cells = [];
    this.firstCol = left;
    this.lastCol = right;
    this.firstRow = top;
    this.lastRow = bottom;
    this.topLeft = tl;
    this.bottomRight = br;
    this.type = type;
    this.priority = priority;
    this.style = style;
    this.options = options;
  }

  /**
   * Return numeric cells
   *
   * @return {object[]}
   */
  filter() {
    return this.cells.filter((c) => c.number !== undefined);
  }

  /**
   * Return numeric cells, sorted
   *
   * @return {object[]}
   */
  sort() {
    return this.filter().sort((a, b) => a.number - b.number);
  }

  /**
   * Check if a cell is in range and if so remember it
   *
   * @param  {Cell} cell
   * @param  {object} contents
   *
   * @return {boolean}
   */
  check(cell, contents) {
    const { col, row } = cell;
    if (this.firstRow <= row && row <= this.lastRow) {
      if (this.firstCol <= col && col <= this.lastCol) {
        const { value } = contents;
        if (value != null) {
          const number = getNumeric(value);
          this.cells.push({ col, row, contents, number });
        }
        return true;
      }
    }
    return false;
  }

  /**
   * Apply styling to matching cells
   *
   * @param  {Worksheet} worksheet
   */
  apply(worksheet) {}

  /**
   * Apply style to contents of a matching cell
   *
   * @param  {object} contents
   */
  applyStyle(contents) {
    // apply formatting string if there's one
    const { numFmt } = this.style;
    if (numFmt) {
      const { locale } = this.options;
      try {
        const { value } = contents;
        const result = formatValue(value, numFmt.formatCode, { locale });
        if (result) {
          applyStyle(contents, result.style);
          contents.text = result.text;
        }
      } catch (err) {
        // type mismatch probably
      }
    }
    // add style to contents, potentially overwriting color specified by format
    const style = extractCellStyle(this.style, false);
    applyStyle(contents, style);
  }
}

class ExcelConditionalRuleValueBased extends ExcelConditionalRule {
  constructor(range, ruleDef, options) {
    super(range, ruleDef, options);
    const { cfvo, color, iconSet, reverse, showValue } = ruleDef;
    this.valueObjects = cfvo;
    if (this.type === 'colorScale') {
      this.colors = color;
    } else if (this.type === 'dataBar') {
      this.color = color;
    } else {
      this.iconSet = iconSet;
      this.reverse = reverse;
    }
    this.showValue = (showValue !== false);
  }

  apply(worksheet) {
    // sort the cells by numeric value
    const cells = this.sort();
    const minValue = cells[0].number;
    const maxValue = cells[cells.length - 1].number;
    // get the control values
    const gte = [];
    const cfValues = this.valueObjects.map((vo, index) => {
      let value;
      switch (vo.type) {
        case 'num': value = vo.value; break;
        case 'min': value = minValue; break;
        case 'max': value = maxValue; break;
        case 'percent':
          value = minValue + (maxValue - minValue) * (vo.value / 100);
          break;
        case 'percentile':
          const pos = (cells.length - 1) * (vo.value / 100);
          const base = floor(pos);
          const rest = pos - base;
          value = cells[base].number;
          if(base + 1 < cells.length) {
            const next = cells[base + 1].number;
            value += rest * (next - value);
          }
          break;
        case 'formula':
          const result = evaluateSimpleFormula(vo.value, worksheet);
          value = getNumeric(result);
          break;
      }
      if (typeof(value) !== 'number') {
        throw new Error('Invalid parameter');
      }
      // whether iconSet rule comparison is performed as > or >=
      gte[index] = (vo.gte !== false);
      return value;
    });
    if (this.type === 'colorScale') {
      const argbs = this.colors.map(getColorARGB);
      // calculate the color for each cell
      for (let { contents, number } of cells) {
        let argb;
        if (argbs.length === 2) {
          const [ min, max ] = cfValues;
          argb = interpolateColor2(argbs, number, min, max);
        } else if (argbs.length === 3) {
          const [ min, mid, max ] = cfValues;
          argb = interpolateColor3(argbs, number, min, max, mid);
        }
        const backgroundColor = stringifyARGB(argb);
        applyStyle(contents, { backgroundColor });
      }
    } else if (this.type === 'dataBar') {
      const argb = getColorARGB(this.color);
      const [ min, max ] = cfValues;
      for (let { contents, number } of cells) {
        const width = (number - min) / (max - min);
        const color = stringifyARGB(argb);
        contents.bar = { width, color };
        if (!this.showValue) {
          contents.hideValue = true;
        }
      }
    } else if (this.type === 'iconSet') {
      const set = this.iconSet;
      const max = cfValues.length - 1;
      for (let { contents, number } of cells) {
        let index = 0;
        while (index < max) {
          if (number < cfValues[index + 1]) {
            break;      // can't use the next one, so we're done
          } else if (number == cfValues[index + 1] && !gte[index + 1]) {
            break;      // not greater-or-equal
          } else {
            index++;    // use next one
          }
        }
        if (this.reverse) {
          index = cfValues.length - index - 1;
        }
        contents.icon = { set, index };
        if (!this.showValue) {
          contents.hideValue = true;
        }
      }
    }
  }
}

class ExcelConditionalRuleRankBased extends ExcelConditionalRule {
  constructor(range, ruleDef, options) {
    super(range, ruleDef, options);
    const { bottom, percent, rank } = ruleDef;
    this.bottom = (bottom === true);
    this.percent = (percent === true);
    this.rank = rank;
  }

  apply(worksheet) {
    let cells = this.sort();
    let count = this.rank;
    if (this.percent) {
      count = floor(cells.length * (count / 100));
    }
    if (this.bottom) {
      cells = cells.slice(0, count);
    } else {
      cells = cells.slice(cells.length - count);
    }
    for (let { contents } of cells) {
      this.applyStyle(contents);
    }
  }
}

class ExcelConditionalRuleAverageBased extends ExcelConditionalRule {
  constructor(range, ruleDef, options) {
    super(range, ruleDef);
    const { aboveAverage } = ruleDef;
    this.aboveAverage = (aboveAverage !== false);
  }

  apply(worksheet) {
    const cells = this.filter();
    const above = this.aboveAverage;
    const avg = meanBy(cells, (c) => c.number);
    for (let { contents, number } of cells) {
      if ((above && number > avg) || (!above && number < avg)) {
        this.applyStyle(contents);
      }
    }
  }
}

class ExcelConditionalRuleUniquenessBased extends ExcelConditionalRule {
  constructor(range, ruleDef, options) {
    super(range, ruleDef);
  }

  apply(worksheet) {
    // compare value as strings
    const cells = this.cells;
    const strings = cells.map((c) => c.contents.value + '');
    const counts = countBy(strings);
    const duplicate = (this.type === 'duplicateValues');
    for (let [ index, string ] of strings.entries()) {
      const count = counts[string];
      if ((duplicate) ? count > 1 : count === 1) {
        const { contents } = cells[index];
        this.applyStyle(contents);
      }
    }
  }
}

class ExcelConditionalRuleOperatorBased extends ExcelConditionalRule {
  constructor(range, ruleDef, options) {
    super(range, ruleDef, options);
    const { formulae, operator } = ruleDef;
    this.operator = operator;
    this.formulae = formulae;
  }

  apply(worksheet) {
    const cells = this.cells;
    const operands = this.extractOperands(worksheet);
    for (let { contents } of cells) {
      if (this.compareValue(contents.value, operands)) {
        this.applyStyle(contents);
      }
    }
  }

  extractOperands(worksheet) {
    const operands = [];
    for (let formula of this.formulae) {
      // extract operand from formula
      switch (this.operator) {
        case 'beginsWith':
          formula = reduceFormula(/^\s*LEFT\(\w+,\d+\)=(.*?)\s*$/i, formula);
          break;
        case 'endsWith':
          formula = reduceFormula(/^\s*RIGHT\(\w+,\d+\)=(.*?)\s*$/, formula);
          break;
        case 'containsText':
          formula = reduceFormula(/^\s*NOT\(ISERROR\(SEARCH\((.*?),\w+\)\)\)\s*$/, formula);
          break;
      }
      const result = evaluateSimpleFormula(formula);
      if (result == null) {
        throw new Error('Null value');
      }
      operands.push(result.valueOf());
    }
    return operands;
  }

  compareValue(value, operands) {
    if (value != null) {
      const v = value.valueOf(), op = operands;
      switch (this.operator) {
        case 'equal': return (v == op[0]);
        case 'notEqual': return (v != op[0]);
        case 'greaterThan': return (v > op[0]);
        case 'greaterThanOrEqual': return (v >= op[0]);
        case 'lessThan': return (v < op[0]);
        case 'lessThanOrEqual': return (v >= op[0]);
        case 'between': return (op[0] <= v && v <= op[1]);
        case 'beginsWith':
        case 'endsWith':;
        case 'containsText':
          return this.compareText(v, op[0]);
      }
    }
    return false;
  }

  compareText(haystack, needle) {
    if (typeof(haystack) !== 'string' || typeof(needle) !== 'string') {
      return false;
    }
    const { locale } = this.options;
    const s1 = haystack.toLocaleLowerCase(locale);
    const s2 = needle.toLocaleLowerCase(locale);
    const index = s1.indexOf(s2);
    switch (this.operator) {
      case 'beginsWith': return (index === 0);
      case 'endsWith': return (index + s2.length === s1.length);
      case 'containsText': return (index !== -1);
    }
  }
}

class ExcelConditionalRuleTimeBased extends ExcelConditionalRule {
  constructor(range, ruleDef, options) {
    super(range, ruleDef, options);
    const { timePeriod } = ruleDef;
    this.currentTime = getCurrentTime();
    this.timePeriod = timePeriod;
    this.timeRange = getTimePeriod(timePeriod, this.currentTime);
    this.expirationDate = undefined;
  }

  inTimeRange(date) {
    if (date instanceof Date) {
      const { start, end } = this.timeRange;
      if (start <= date && date < end) {
        // see how long the condition will remain true
        const validUntil = new Date(this.currentTime.getTime() + (end - date));
        if (!this.expirationDate || this.expirationDate > validUntil) {
          this.expirationDate = validUntil;
        }
        return true;
      }
    }
    return false;
  }

  apply(worksheet) {
    const cells = this.cells;
    for (let { contents } of cells) {
      if (this.inTimeRange(contents.value)) {
        this.applyStyle(contents);
      }
    }
  }
}

/**
 * Get intermediate color based on three colors
 *
 * @param  {object[]} colors
 * @param  {number}   value
 * @param  {number}   min
 * @param  {number}   max
 * @param  {number}   mid
 *
 * @return {object}
 */
function interpolateColor3(colors, value, min, max, mid) {
  const [ c1, c2, c3 ] = colors;
  if (value > mid) {
    return interpolateColor2([ c2, c3 ], value, mid, max);
  } else if (value < mid) {
    return interpolateColor2([ c1, c2 ], value, min, mid);
  } else {
    return c2;
  }
}

/**
 * Get intermediate color between two colors
 *
 * @param  {object[]} colors
 * @param  {number}   value
 * @param  {number}   min
 * @param  {number}   max
 *
 * @return {object}
 */
function interpolateColor2(colors, value, min, max) {
  const [ c1, c2 ] = colors;
  const fraction = (value - min) / (max - min);
  if (fraction >= 1) {
    return c2;
  } else if (fraction <= 0) {
    return c1;
  }
  const a = floor(c1.a + (c2.a - c1.a) * fraction);
  const r = floor(c1.r + (c2.r - c1.r) * fraction);
  const g = floor(c1.g + (c2.g - c1.g) * fraction);
  const b = floor(c1.b + (c2.b - c1.b) * fraction);
  return { a, r, g, b };
}

/**
 * Obtain a ARGB object from a color Object, throwing on failure
 *
 * @param  {object} color
 *
 * @return {object}
 */
function getColorARGB(color) {
  const argb = extractColor(color);
  if (!argb) {
    throw new Error('Invalid color');
  }
  return argb;
}

/**
 * Get a numeric value from
 * @param  {*} value
 *
 * @return {number}
 */
function getNumeric(value) {
  if (typeof(value) === 'number') {
    return value;
  } else if (typeof(value) === 'boolean') {
    return value ? 1 : 0;
  } else if (value instanceof Date) {
    return value.getTime();
  }
}

/**
 * Handle cell references and literals
 *
 * @param  {string}    formula
 * @param  {Worksheet} worksheet
 *
 * @return {*}
 */
function evaluateSimpleFormula(formula, worksheet) {
  if (/^\$?[A-Z]+\$?\d+$/.test(formula)) {
    const cell = worksheet.findCell(formula);
    if (!cell) {
      throw new Error('Invalid cell reference');
    }
    let { value } = cell;
    if (value instanceof Object && value.result) {
      value = value.result;
    }
    return value;
  } else {
    // see if it's a number
    const number = parseFloat(formula);
    if (!isNaN(number)) {
      return number;
    }
    // see if it's a literal string
    const m = /^\s*"(.*)"\s*$/.exec(formula);
    if (m) {
      const string = m[1].replace(/\\(.)/g, '$1');
      return string;
    }
    throw new Error('Unable to handle formula');
  }
}

/**
 * Look for regexp and return the first captured string on match
 *
 * @param  {RegExp} regExp
 * @param  {string} formula
 *
 * @return {string}
 */
function reduceFormula(regExp, formula) {
  const m = regExp.exec(formula);
  return (m) ? m[1] : formula;
}

/**
 * Get time period based on given time
 *
 * @param  {string} period
 * @param  {Date}   now
 *
 * @return {object}
 */
function getTimePeriod(period, now) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const dow = now.getDay();
  switch (period) {
    case 'today': return { start: new Date(y, m, d), end: new Date(y, m, d + 1) };
    case 'yesterday': return { start: new Date(y, m, d - 1), end: new Date(y, m, d) };
    case 'tomorrow': return { start: new Date(y, m, d + 1), end: new Date(y, m, d + 2) };
    case 'last7Days': return { start: new Date(y, m, d - 6), end: new Date(y, m, d + 1) };
    case 'thisWeek': return { start: new Date(y, m, d - dow), end: new Date(y, m, d - dow + 7) };
    case 'lastWeek': return { start: new Date(y, m, d - dow - 7), end: new Date(y, m, d - dow) };
    case 'nextWeek': return { start: new Date(y, m, d - dow + 7), end: new Date(y, m, d - dow + 14) };
    case 'thisMonth': return { start: new Date(y, m), end: new Date(y, m + 1) };
    case 'lastMonth': return { start: new Date(y, m - 1), end: new Date(y, m) };
    case 'nextMonth': return { start: new Date(y, m + 1), end: new Date(y, m + 2) };
    case 'thisYear': return { start: new Date(y, 0), end: new Date(y + 1, 0) };
    case 'lastYear': return { start: new Date(y - 1, 0), end: new Date(y, 0) };
    case 'nextYear': return { start: new Date(y + 1, 0), end: new Date(y + 2, 0) };
    default: throw new Error('Invalid time period');
  }
}

let currentTime;

function setCurrentTime(time) {
  currentTime = time;
}

function getCurrentTime() {
  return new Date(currentTime);
}

export {
  ExcelConditionalStyling,
  ExcelConditionalRule,
  interpolateColor2,
  interpolateColor3,
  getTimePeriod,
  setCurrentTime,
};
