import split from 'lodash/split.js';
import replace from 'lodash/replace.js';
import floor from 'lodash/floor.js';
import colCache from 'exceljs/lib/utils/col-cache.js';
import { extractColor, stringifyARGB } from './excel-styling.mjs';

class ExcelConditionalStyling {
  constructor(worksheet) {
    this.rules = [];
    for (let ruleSetDef of worksheet.conditionalFormattings) {
      try {
        const range = colCache.decode(ruleSetDef.ref);
        for (let ruleDef of ruleSetDef.rules) {
          const { type } = ruleDef;
          let rule;
          switch (type) {
            case 'colorScale':
              rule = new ExcelConidtionalRuleColorScale(range, ruleDef);
              break;
          }
          if (rule) {
            this.rules.push(rule);
          }
        }
      } catch (err) {
        console.error(err.message);
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
        console.log(err.message);
      }
    }
  }
}

class ExcelConditionalRule {
  constructor(range, ruleDef) {
    this.cells = [];
    this.firstCol = range.left;
    this.lastCol = range.right;
    this.firstRow = range.top;
    this.lastRow = range.bottom;
    this.priority = ruleDef.priority;
  }

  inRange(cell) {
    const { col, row } = cell;
    if (this.firstRow <= row && row <= this.lastRow) {
      if (this.firstCol <= col && col <= this.lastCol) {
        return true;
      }
    }
    return false;
  }

  check(cell, contents) {
    if (this.inRange(cell)) {
      const { value } = contents;
      if (value != null) {
        const number = (typeof(value) === 'number') ? value : value.valueOf();
        if (typeof(number) === 'number') {
          this.cells.push({ contents, number });
        }
      }
      return true;
    } else {
      return false;
    }
  }

  apply(worksheet) {
  }
}

class ExcelConidtionalRuleColorScale extends ExcelConditionalRule {
  constructor(range, ruleDef) {
    super(range, ruleDef);
    this.valueObjects = ruleDef.cfvo;
    this.colors = ruleDef.color;
  }

  apply(worksheet) {
    if (this.cells.length === 0) {
      return;
    }
    // sort the cells by numeric value
    const cells = this.cells.slice(0).sort((a, b) => a.number - b.number);
    const minValue = cells[0].number;
    const maxValue = cells[cells.length - 1].number;
    // get the control values
    const cfValues = this.valueObjects.map((vo) => {
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
            const cell = worksheet.getCell(vo.value);
            value = cell.result;
            if (value === undefined) {
              value = cell.value;
            }
          } else {
            throw new Error('Unable to handle formula');
          }
          break;
      }
      if (value && typeof(value) != 'number') {
        value = value.valueOf();
      }
      return (typeof(value) === 'number') ? value : NaN;
    });
    if (cfValues.some(isNaN)) {
      throw new Error('Invalid parameter');
    }
    const colors = this.colors.map(extractColor);
    if (colors.some(c => !c)) {
      throw new Error('Invalid color');
    }
    // calculate the color for each cell
    for (let { contents, number } of cells) {
      let color;
      if (colors.length === 2) {
        const [ min, max ] = cfValues;
        color = interpolateColor2(colors, number, min, max);
      } else if (colors.length === 3) {
        const [ min, mid, max ] = cfValues;
        color = interpolateColor3(colors, number, min, max, mid);
      }
      if (!contents.style) {
        contents.style = {};
      }
      contents.style.backgroundColor = stringifyARGB(color);
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

export {
  ExcelConditionalStyling,
  ExcelConditionalRule,
  ExcelConidtionalRuleColorScale,
  interpolateColor2,
  interpolateColor3
};
