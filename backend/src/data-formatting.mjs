import Lodash from 'lodash'; const { split, toLower } = Lodash;

import { getExcelColor } from './excel-colors.mjs';
const { floor, abs } = Math;

function formatValue(value, formatString, locale) {
  // handle conditional formatting
  const parts = split(formatString, /;/);
  let applicablePart = parts[0];
  let usingNegFormat = false, usingZeroFormat = false;
  if (typeof(value) === 'number') {
    if (value === 0 && parts.length >= 3) {
      applicablePart = parts[2];
      usingZeroFormat = true;
    } else if (value < 0 && parts.length >= 2) {
      applicablePart = parts[1];
      usingNegFormat = true;
    }
  }
  // create a closure for replacing matching patterns
  let text = applicablePart;
  const replace = (pattern, f) => { text = text.replace(pattern, f); };
  // replace currency symbol/locale pattern
  replace(/\[\$([^-\]]*)-([0-9]+)]/g, (m0, m1, m2) => {
    return m1;
  });
  // replace color pattern
  let color;
  replace(/\[(BLACK|BLUE|CYAN|GREEN|MAGENTA|RED|WHITE|YELLOW|COLOR\s*(\d\d?))\]/gi, (m0, m1) => {
    color = getExcelColor(m1 || m0);
    return '';
  });
  // replace numerial pattern
  replace(/[#0](.*[#0])?/, (m0) => {
    return formatNumber(value, m0, locale, usingNegFormat);
  });

  return { text, color };
}

function formatNumber(number, formatString, locale, omitSign) {
  const options = {
    signDisplay: (omitSign) ? 'never' : 'auto',
    useGrouping: false,
    minimumIntegerDigits: 0,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  };
  let irregular = false;
  let commaEncountered = false, periodEncountered = false;
  let zeroEncountered1 = false, zeroEncountered2 = false;
  let poundEncountered1 = false, poundEncountered2 = false;
  for (let i = 0; i < formatString.length; i++) {
    const c = formatString.charAt(i);
    if (!periodEncountered) {
      if (c === '0') {
        options.minimumIntegerDigits++;
        zeroEncountered1 = true;
      } else if (c === '#' && !zeroEncountered1) {
        poundEncountered1 = true;
      } else if (c === '.') {
        periodEncountered = true;
      } else if (c === ',' && !commaEncountered) {
        options.useGrouping = true;
        commaEncountered = true;
      } else {
        irregular = true;
        break;
      }
    } else {
      if (c === '0' && !poundEncountered2) {
        options.minimumFractionDigits++;
        options.maximumFractionDigits++;
        zeroEncountered2 = true;
      } else if (c === '#') {
        options.maximumFractionDigits++;
        poundEncountered2 = true;
      } else {
        irregular = true;
        break;
      }
    }
  }

  if (!irregular) {
    // we can use toLocaleString() to handle the regular case
    // function doesn't allow minimumIntegerDigits to be zero
    // we need to bump it to 1 and strip out the zero afterward
    let stripLeadingZero = false;
    if (options.minimumIntegerDigits === 0) {
      options.minimumIntegerDigits = 1;
      stripLeadingZero = true;
    }
    let res = number.toLocaleString(locale, options);
    if (stripLeadingZero) {
      if (res.substr(0, 1) === '0') {
        res = res.substr(1);
      } else if (res.substr(0, 2) === '-0') {
        res = (res.length > 2) ? '-' + res.substr(2) : '';
      }
    }
    return res;
  } else {
    // TODO
  }
}

/**
 * Find fractional representation of a number, limited by width of denominator
 *
 * @param  {number} number
 * @param  {number} width
 *
 * @return {object}
 */
function findFraction(number, width) {
  // deal with negative number
  if (number < 0) {
    const res = findFraction(-number, width);
    res.whole = -res.whole;
    return res;
  }
  const whole = floor(number);
  const x = number - whole;
  // the cutoff and error shrinks increasing width
  let error = 0.0001, cutoff = 0.1, limit = 10;
  for (let w = 1; w < width; w++) {
    cutoff *= 0.1;
    error *= 0.1;
    limit *= 10;
  }
  if (x <= cutoff) {
    return { whole };
  } else if (1 - cutoff < x) {
    return { whole: whole + 1 };
  }
  // the lower fraction is 0/1
  let lowerN = 0, lowerD = 1;
  // the upper fraction is 1/1
  let upperN = 1, upperD = 1;
  // remember the best effort
  let nom, dem, minDelta = Infinity;
  for(;;) {
    // the middle fraction is (lowerN + upperN) / (lowerD + upperD)
    const middleN = lowerN + upperN;
    const middleD = lowerD + upperD;
    // see if the denominator is too wide
    if (middleD >= limit) {
      break;
    }
    // see how much the guess is off by
    const diff1 = middleN - middleD * (x + error);
    const diff2 = middleN - middleD * (x - error);
    const delta = abs(diff1 + diff2);
    if (delta < minDelta) {
      nom = middleN;
      dem = middleD;
      minDelta = delta;
    }
    if (diff1 > 0) {
      // middle is our new upper
      upperN = middleN;
      upperD = middleD;
    } else if (diff2 < 0) {
      // middle is our new lower
      lowerN = middleN;
      lowerD = middleD;
    } else {
      // done
      break;
    }
  }
  return { whole, nom, dem };
}

export {
  formatValue,
  formatNumber,
  findFraction,
};
