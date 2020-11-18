import split from 'lodash/split.js';
import replace from 'lodash/replace.js';
import { extractColor, stringifyARGB } from './excel-styling.mjs';

class ExcelConditionalStyling {
  constructor(worksheet) {
    this.rules = [];
    for (let ruleSetDef of worksheet.conditionalFormattings) {
      const range = parseCellRange(ruleSetDef.ref);
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
    }
    this.rules.sort((a, b) => a.priority - b.priority);
    this.worksheet = worksheet;
  }

  check(cell, contents) {
    for (let rule of this.rules) {
      rule.check(cell, contents);
    }
  }

  apply() {
    for (let rule of this.rules) {
      rule.apply(this.worksheet);
    }
  }
}

class ExcelConditionalRule {
  constructor(range, ruleDef) {
    const { start, end } = range;
    this.cells = [];
    this.firstCol = start.col;
    this.lastCol = end.col;
    this.firstRow = start.row;
    this.lastRow = end.row;
    this.priority = ruleDef.priority;
  }

  isInRange(cell) {
    const { col, row } = cell;
    if (this.firstRow <= row && row <= this.lastRow) {
      if (this.firstCol <= col && col <= this.lastCol) {
        return true;
      }
    }
    return false;
  }

  check(cell, contents) {
    if (this.isInRange(cell)) {
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
      switch (vo.type) {
        case 'num':
          return vo.value;
        case 'min':
          return minValue;
        case 'max':
          return maxValue;
        case 'percent':
          return minValue + (maxValue - minValue) * vo.value;
        case 'percentile':
          const pos = (cells.length - 1) * (vo.value / 100);
          const base = Math.floor(pos);
          const rest = pos - base;
          const baseValue = cells[base].number;
          if(base + 1 < cells.length) {
            const nextValue = cells[base + 1].number;
            return baseValue + rest * (nextValue - baseValue);
          } else {
            return baseValue;
          }
        case 'formula':
          // can only handle references
          if (/^\$?[A-Z]+\$?\d+$/.test(vo.value)) {
            const cell = worksheet.getCell(vo.value);
            let value = cell.result;
            if (value === undefined) {
              value = cell.value;
            }
            if (value && typeof(value) != 'number') {
              value = value.valueOf();
            }
            if (typeof(value) === 'number'){
              return value;
            }
          }
          return NaN;
      }
    });
    const colors = this.colors.map(extractColor);
    if (!cfValues.some(isNaN) && !colors.some(c => !c)) {
      // calculate the color for each cell
      for (let { contents, number } of cells) {
        let color;
        if (colors.length === 2) {
          const [ min, max ] = cfValues;
          color = interpolateColor2(colors, number, min, max);
        } else if (colors.length === 3) {
          const [ min, mid, max ] = cfValues;
          color = interpolateColor2(colors, number, min, max, mid);
        }
        if (!contents.style) {
          contents.style = {};
        }
        contents.style.backgroundColor = stringifyARGB(color);
      }
    }
  }
}

const colCharOffset = 'A'.charCodeAt(0) - 1;

function parseCellAddress(address) {
  const m = /^([A-Z]+)(\d+)$/.exec(address);
  let col, row;
  if (m) {
    const colName = m[1];
    col = 0;
    for (let i = colName.length - 1, j = 0; i >= 0; i--, j++) {
      const n = colName.charCodeAt(i) - colCharOffset;
      col += (j > 0) ? n * Math.pow(26, j) : n;
    }
    row = parseInt(m[2]);
  }
  return { col, row };
}

function parseCellRange(ref) {
  const [ startAddress, endAddress ] = split(ref, ':');
  const start = parseCellAddress(startAddress);
  const end = parseCellAddress(endAddress);
  return { start, end };
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
  const a = c1.a + (c2.a - c1.a) * fraction;
  const r = c1.r + (c2.r - c1.r) * fraction;
  const g = c1.g + (c2.g - c1.g) * fraction;
  const b = c1.b + (c2.b - c1.b) * fraction;
  return { a, r, g, b };
}

export {
  ExcelConditionalStyling,
  ExcelConditionalRule,
  ExcelConidtionalRuleColorScale,
};
