let timeZoneSet = false;
let timeZoneBefore;

/**
 * Set time zone for entire process
 *
 * @param {string} timeZone
 */
function setTimeZone(timeZone) {
  if (timeZone) {
    if (!timeZoneSet) {
      timeZoneSet = true;
      timeZoneBefore = process.env.TZ;
      process.env.TZ = timeZone;
    } else {
      throw new Error('Cannot set time zone again');
    }
  }
}

/**
 * Restore time zone setting to previous state
 */
function restoreTimeZone() {
  if (timeZoneSet) {
    if (timeZoneBefore != undefined)  {
      process.env.TZ = timeZoneBefore;
    } else {
      delete process.env.TZ;
    }
    timeZoneSet = false;
    timeZoneBefore = undefined;
  }
}

/**
 * Check if a time zone is recognizable
 *
 * @param  {string} timeZone
 *
 * @return {boolean}
 */
function checkTimeZone(timeZone) {
  const date = new Date(0);
  try {
    date.toLocaleTimeString('en-us', { timeZone });
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Reinterpret a date as being in the current time zone
 *
 * Example: '12:45:00 GMT' -> '12:45:00 CET'
 *
 * @param  {Date} date
 *
 * @return {Date}
 */
function reinterpretDate(date) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = date.getUTCSeconds();
  const milliseconds = date.getUTCMilliseconds();
  return new Date(year, month, day, hours, minutes, seconds, milliseconds);
}

export {
  setTimeZone,
  restoreTimeZone,
  checkTimeZone,
  reinterpretDate,
};
