// The station is in Sri Lanka, but the server runs on UTC, so every time shown
// to people (emails, dashboard, admin panel) is formatted in Sri Lanka time.
export const STATION_TIME_ZONE = 'Asia/Colombo';

/**
 * A date and time in Sri Lanka time, e.g. "Oct 27, 2026, 3:45 PM"
 */
export function formatStationDateTime(value: Date | string): string {
  return new Date(value).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: STATION_TIME_ZONE,
  });
}

/**
 * A short weekday and time in Sri Lanka time, e.g. "Tue 3:45 PM"
 */
export function formatStationDueTime(value: Date | string): string {
  return new Date(value).toLocaleString('en-US', {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: STATION_TIME_ZONE,
  });
}
