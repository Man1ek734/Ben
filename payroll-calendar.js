const localDateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

export function payrollPeriodKey(timestamp) {
  const parts = Object.fromEntries(
    localDateTime.formatToParts(new Date(timestamp))
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  );
  const day = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  const shiftToSaturday = (day.getUTCDay() - 6 + 7) % 7;
  day.setUTCDate(day.getUTCDate() - shiftToSaturday);
  if (shiftToSaturday === 0 && Number(parts.hour) < 12) day.setUTCDate(day.getUTCDate() - 7);
  return day.toISOString().slice(0, 10);
}

export function payrollNextSaturday(key) {
  const day = new Date(key + 'T12:00:00Z');
  day.setUTCDate(day.getUTCDate() + 7);
  return day.toISOString().slice(0, 10);
}

export function periodBoundaryBetween(start, end, key) {
  let lower = start + 1;
  let upper = end;
  while (lower < upper) {
    const middle = lower + Math.floor((upper - lower) / 2);
    if (payrollPeriodKey(middle) === key) lower = middle + 1;
    else upper = middle;
  }
  return lower;
}
