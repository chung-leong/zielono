import camelCase from 'lodash/camelCase.js';
import ExcelJS from 'exceljs'; const { Workbook, ValueType } = ExcelJS;
import './exceljs-patching.mjs';
import colCache from 'exceljs/lib/utils/col-cache.js';
import { Readable } from 'stream';
import { formatValue } from './excel-formatting.mjs';
import { extractCellStyle, extractRichText, applyStyle } from './excel-styling.mjs';
import { ExcelConditionalStyling } from './excel-styling-conditional.mjs';
import { setTimeZone, restoreTimeZone, reinterpretDate } from './time-zone-management.mjs';

/**
 * Parse an Excel file
 *
 * @param  {Buffer} buffer
 * @param  {object} options
 *
 * @return {object}
 */
async function parseExcelFile(buffer, options) {
  const { style = true } = options;
  const workbook = new Workbook;
  await workbook.xlsx.load(buffer);
  const { keywords, title, description, subject, category } = workbook;
  const { contentStatus: status } = workbook;
  const meta = { title, subject, description, keywords, category, status };
  const sheets = [];
  let expiration;
  for (let worksheet of workbook.worksheets) {
    const sheet = await parseExcelWorksheet(worksheet, options);
    if (sheet) {
      if (sheet.expiration) {
        if (!expiration || sheet.expiration < expiration) {
          expiration = sheet.expiration;
        }
        sheet.expiration = undefined;
      }
      sheets.push(sheet);
    }
  }
  const json = { ...meta, sheets, expiration };
  if (!style) {
    stripCellStyle(json);
  }
  return json;
}

/**
 * Parse an CVS file
 *
 * @param  {Buffer} buffer
 * @param  {object} options
 *
 * @return {object}
 */
async function parseCSVFile(buffer, options) {
  const { sheetName } = options;
  const workbook = new Workbook;
  const stream = Readable.from(buffer);
  await workbook.csv.read(stream, { sheetName });
  const worksheet = workbook.worksheets[0];
  const sheet = await parseExcelWorksheet(worksheet, options);
  return { sheets: [ sheet ] };
}

/**
 * Parse an Excel worksheet
 *
 * @param  {Worksheet} worksheet
 * @param  {object} options
 *
 * @return {(object|undefined)}
 */
async function parseExcelWorksheet(worksheet, options) {
  try {
    // set time zone so dates are interpreted correctly
    // needs to happen in synchronous section since setting
    // is global
    setTimeZone(options.timeZone);
    return parseExcelWorksheetSync(worksheet, options);
  } finally {
    // restore time zone
    restoreTimeZone();
  }
}

/**
 * Parse an Excel worksheet
 *
 * @param  {Worksheet} worksheet
 * @param  {object} options
 *
 * @return {(object|undefined)}
 */
function parseExcelWorksheetSync(worksheet, options) {
  const { state, rowCount, columnCount, views } = worksheet;
  const { locale, timeZone, headers = true } = options;
  const sheetNameFlags = extractNameFlags(worksheet.name);
  if (state !== 'visible' || !sheetNameFlags) {
    return;
  }
  // find images used in worksheet first
  const wsImages = worksheet.getImages();
  const media = {}, rowHasMedia = {};
  if (wsImages) {
    for (let wsImage of wsImages) {
      const { imageId, range, srcRect } = wsImage;
      // the anchor of the image (top left corner)
      const { nativeCol, nativeRow } = range.tl;
      const c = nativeCol + 1;
      const r = nativeRow + 1;
      const wbImage = worksheet.workbook.getImage(imageId);
      media[`${c}:${r}`] = { ...wbImage, srcRect };
      rowHasMedia[r] = true;
    }
  }
  const conditionalStyling = new ExcelConditionalStyling(worksheet, { locale });
  // see where column headers end
  let headerRow = 0;
  if (headers) {
    headerRow = 1;
    for (let view of views) {
      if (view.state === 'frozen') {
        headerRow = view.ySplit;
      }
    }
  }
  const offsets = { column: 0, row: headerRow };
  const columns = [];
  const columnHash = {};
  for (let c = 1; c <= columnCount; c++) {
    const wsColumn = worksheet.getColumn(c);
    const headers = [];
    const lines = [];
    if(!wsColumn.hidden) {
      if (headerRow === 0) {
        lines.push(colCache.n2l(c));
      } else {
        // use the row(s) as column names
        const used = [];
        const opts = { locale, offsets };
        for (let r = 1; r <= headerRow; r++) {
          const wsRow = worksheet.getRow(r);
          if (wsRow.hidden) {
            continue;
          }
          const wsCell = wsRow.getCell(c);
          const medium = media[`${c}:${r}`];
          const contents = extractCellContents(wsCell, medium, opts);
          headers.push(contents);
          conditionalStyling.check(wsCell, contents);
          // don't use the text of a merged cell twice
          if (!used.includes(wsCell.master)) {
            lines.push(wsCell.text);
            used.push(wsCell.master);
          }
        }
      }
    }
    const columnNameFlags = extractNameFlags(lines.join('\n'));
    if (columnNameFlags) {
      const column = { ...columnNameFlags, headers, cells: [] };
      columns.push(column);
      columnHash[c] = column;
    } else {
      offsets.column++;
    }
  }
  if (columns.length === 0) {
    return;
  }
  // all the remaining rows are treated as data rows
  let lowestNonEmptyRow = headerRow;
  for (let r = headerRow + 1; r <= rowCount; r++) {
    const wsRow = worksheet.getRow(r);
    // make sure empty rows aren't import unless they're neccessary
    if (!wsRow.hidden && (wsRow.hasValues || rowHasMedia[r])) {
      const prevNonEmptyRow = lowestNonEmptyRow;
      if (r > lowestNonEmptyRow) {
        lowestNonEmptyRow = r;
        if (r !== prevNonEmptyRow + 1) {
          // go back and process the empty rows above this one
          r = prevNonEmptyRow;
          continue;
        }
      }
    } else {
      if (r > lowestNonEmptyRow) {
        // don't process an empty row unless there's something beneath it
        continue;
      } else {
        // increase the offset to account for the missing row
        offsets.row++;
        if (wsRow.hidden) {
          continue;
        }
      }
    }
    const opts = { locale, offsets };
    for (let c = 1; c <= columnCount; c++) {
      const column = columnHash[c];
      if (column) {
        const wsCell = wsRow.getCell(c);
        const medium = media[`${c}:${r}`];
        const contents = extractCellContents(wsCell, medium, opts);
        column.cells.push(contents);
        conditionalStyling.check(wsCell, contents);
      }
    }
  }
  // apply conditional styling
  conditionalStyling.apply();
  const sheet = { ...sheetNameFlags, columns };
  if (conditionalStyling.errors.length > 0) {
    // attach error messages
    sheet.errors = [];
    for (let error of conditionalStyling.errors) {
      if (!sheet.errors.includes(error.message)) {
        sheet.errors.push(error.message);
      }
    }
  }
  return sheet;
}

/**
 * Extract name and possible flags enclosed in parentheses
 *
 * @param  {string} text
 *
 * @return {(object|undefined)}
 */
function extractNameFlags(text) {
  const trimmed = (text || '').trim();
  if (trimmed) {
    // look for text in parentheses
    const m = /\s*\(([^\)]+)\)$/.exec(trimmed);
    const results = {};
    if (m) {
      const name = trimmed.substr(0, trimmed.length - m[0].length);
      const nameCC = camelCase(name);
      const flags = m[1].split(/\s*,\s*/);
      return { name, nameCC, flags };
    } else {
      const nameCC = camelCase(trimmed);
      return { name: trimmed, nameCC };
    }
  }
}

/**
 * Extract value from a cell in a worksheet
 *
 * @param  {Cell}              wsCell
 * @param  {(Image|undefined)} medium
 * @param  {object}            options
 *
 * @return {(object|string)}
 */
function extractCellContents(wsCell, medium, options) {
  const { locale, offsets } = options;
  // deal with merged cell
  if (wsCell !== wsCell.master) {
    const { col, row } = wsCell.master;
    return {
      master: {
        col: col - offsets.column - 1,
        row: row - offsets.row - 1,
      }
    };
  }
  const contents = {};
  // extract style
  const style = extractCellStyle(wsCell, true);
  if (style) {
    contents.style = style;
  }
  // get the cell's value
  const { type, effectiveType, numFmt } = wsCell;
  let value = (type === ValueType.Formula) ? wsCell.result : wsCell.value;
  if (value instanceof Date) {
    // reinterpret time as local time
    value = reinterpretDate(value);
  } else if (effectiveType === ValueType.RichText) {
    value = extractRichText(value.richText);
  }
  contents.value = value;
  // apply formatting
  try {
    const result = formatValue(value, numFmt, { locale });
    if (result) {
      applyStyle(contents, result.style);
      contents.text = result.text;
    }
  } catch (e) {
    // probably a type mismatch error
  }
  // attach image
  if (medium && medium.type === 'image') {
    contents.image = medium;
  }
  return contents;
}

/**
 * Remove style object from cells and columns
 *
 * @param  {Object} json
 */
function stripCellStyle(json) {
  for (let sheet of json.sheets){
    for (let column of sheet.columns) {
      if (column.header) {
        delete column.header.style;
      }
      for (let cell of column.cells) {
        delete cell.style;
      }
    }
  }
}

export {
  parseExcelFile,
  parseCSVFile,
  extractNameFlags,
  reinterpretDate,
  stripCellStyle,
};
