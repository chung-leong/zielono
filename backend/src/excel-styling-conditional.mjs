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
      default:
        //console.log(ruleDef);
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
      const result = formatValue(value, numFmt, { locale });
      if (result) {
        applyStyle(contents, result.style);
        contents.text = result.text;
      }
    }
    // add style to contents, potentially overwriting color specified by format
    const style = extractCellStyle(this.style, false);
    applyStyle(contents, style);
  }
}

class ExcelConditionalRuleValueBased extends ExcelConditionalRule {
  constructor(range, ruleDef) {
    super(range, ruleDef);
    const { cfvo, color } = ruleDef;
    this.valueObjects = cfvo;
    if (this.type === 'colorScale') {
      this.colors = ruleDef.color;
    } else if (this.type === 'dataBar') {
      this.color = ruleDef.color;
    } else {
      this.iconSet = ruleDef.iconSet;
      this.reverse = ruleDef.reverse;
    }
    this.showValue = (ruleDef.showValue !== false);
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
          // can only handle references
          if (/^\$?[A-Z]+\$?\d+$/.test(vo.value)) {
            const cell = worksheet.findCell(vo.value);
            if (!cell) {
              throw new Error('Invalid cell reference');
            }
            value = getNumeric(cell.value);
          } else {
            throw new Error('Unable to handle formula');
          }
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
      const argbs = this.colors.map(getColor);
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
      const argb = getColor(this.color);
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
  constructor(range, ruleDef) {
    super(range, ruleDef);
    this.bottom = (ruleDef.bottom === true);
    this.percent = (ruleDef.percent === true);
    this.rank = ruleDef.rank;
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
  constructor(range, ruleDef) {
    super(range, ruleDef);
    this.aboveAverage = (ruleDef.aboveAverage !== false);
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
  constructor(range, ruleDef) {
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

function getColor(color) {
  const argb = extractColor(color);
  if (!argb) {
    throw new Error('Invalid color');
  }
  return argb;
}

function getNumeric(value) {
  if (typeof(value) === 'number') {
    return value;
  } else if (typeof(value) === 'boolean') {
    return value ? 1 : 0;
  } else if (value instanceof Date) {
    return value.getTime();
  } else if (value.result) {
    return getNumeric(value.result);
  }
}

export {
  ExcelConditionalStyling,
  ExcelConditionalRule,
  interpolateColor2,
  interpolateColor3
};
