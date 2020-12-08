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
  const { state, rowCount, columnCount, views } = worksheet;
  const { locale, timeZone, headers = true } = options;
  const sheetNameFlags = extractNameFlags(worksheet.name);
  if (state === 'visible' && sheetNameFlags) {
    // set time zone so dates are interpreted correctly
    setTimeZone(timeZone);
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
    // process the cells
    const columns = [];
    const columnHash = {};
    let withNames;
    if (headers) {
      withNames = 1;
      for (let view of views) {
        if (view.state === 'frozen') {
          withNames = view.ySplit;
        }
      }
    } else {
      withNames = 0;
      for (let c = 1; c <= columnCount; c++) {
        const wsColumn = worksheet.getColumn(c);
        if (!wsColumn.hidden) {
          const name = colCache.n2l(c);
          const column = { name, cells: [] };
          columns.push(column);
          columnHash[c] = column;
        }
      }
    }
    let lowestNonEmptyRow = 1;
    for (let r = 1; r <= rowCount; r++) {
      const wsRow = worksheet.getRow(r);
      if (wsRow.hidden) {
        // skip hidden rows
        continue;
      }
      if (wsRow.hasValues || rowHasMedia[r]) {
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
        }
      }
      if (r === withNames) {
        // use the row as column names
        for (let c = 1; c <= columnCount; c++) {
          const wsColumn = worksheet.getColumn(c);
          if (wsColumn.hidden) {
            continue;
          }
          const headers = [];
          const lines = [];
          for (let h = 1; h <= r; h++) {
            const wsRow = worksheet.getRow(h);
            if (!wsRow.hidden) {
              const wsCell = wsRow.getCell(c);
              const medium = media[`${c}:${h}`];
              headers.push(extractCellContents(wsCell, medium, { locale }));
              lines.push(wsCell.text);
            }
          }
          const columnNameFlags = extractNameFlags(lines.join('\n'));
          if (columnNameFlags) {
            const column = { ...columnNameFlags, headers, cells: [] };
            columns.push(column);
            columnHash[c] = column;
          }
        }
        if (columns.length === 0) {
          break;
        }
      } else if (r > withNames) {
        // all the remaining rows are treated as data rows
        for (let c = 1; c <= columnCount; c++) {
          const column = columnHash[c];
          if (column) {
            const wsCell = wsRow.getCell(c);
            const medium = media[`${c}:${r}`];
            const contents = extractCellContents(wsCell, medium, { locale });
            column.cells.push(contents);
            conditionalStyling.check(wsCell, contents);
          }
        }
      }
    }
    // apply conditional styling
    conditionalStyling.apply();
    // restore time zone
    restoreTimeZone();
    // don't return empty sheets
    if (columns.length > 0) {
      return { ...sheetNameFlags, columns };
    }
  }
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
  const { locale } = options;
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
