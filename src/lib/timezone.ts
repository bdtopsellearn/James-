/**
 * One timezone for the whole site: Asia/Dhaka (Bangladesh Standard Time, UTC+06:00), shown in the
 * 12-hour clock (AM / PM). The 24-hour format is switched off everywhere.
 *
 * Every Date.toLocale*String() call that does not pass its own timeZone now renders in Dhaka time,
 * so created/updated/purchase/campaign/notification times are consistent for every user, wherever
 * the visitor's phone or browser is set to. A call that asks for hour12:false / a 24-hour cycle is
 * also shown as 12-hour, so no screen can slip back to 24-hour time.
 */
export const APP_TIME_ZONE = 'Asia/Dhaka';

const withZone = (opts?: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions => {
  const o: any = { ...(opts || {}) };
  if (!o.timeZone) o.timeZone = APP_TIME_ZONE;
  o.hour12 = true;            // 12-hour clock only
  delete o.hourCycle;         // an hourCycle (h23/h24) would otherwise bring 24-hour time back
  return o;
};

let installed = false;
export function installDhakaTimezone() {
  if (installed) return;
  installed = true;
  const proto = Date.prototype as any;
  for (const fn of ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString'] as const) {
    const original = proto[fn];
    proto[fn] = function (locales?: string | string[], options?: Intl.DateTimeFormatOptions) {
      return original.call(this, locales, withZone(options));
    };
  }
}

/** Calendar date in Bangladesh as YYYY-MM-DD (never the UTC date, which is wrong for 6 hours of every day). */
export function dhakaDateKey(input: Date | number | string = new Date()): string {
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/** e.g. "Mon, Oct 5" for a YYYY-MM-DD Bangladesh date key (used by chart labels). */
export function dhakaDayLabel(dateKey: string): { weekday: string; short: string } {
  const [y, m, d] = dateKey.split('-').map(Number);
  const noon = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12, 0, 0)); // noon UTC → same calendar day in Dhaka
  return {
    weekday: new Intl.DateTimeFormat('en-US', { timeZone: APP_TIME_ZONE, weekday: 'short' }).format(noon),
    short: new Intl.DateTimeFormat('en-US', { timeZone: APP_TIME_ZONE, month: 'short', day: 'numeric' }).format(noon),
  };
}
