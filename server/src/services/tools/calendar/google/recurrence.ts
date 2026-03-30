// Strips the `_YYYYMMDDTHHMMSSZ` or `_YYYYMMDD` instance suffix from a
// recurring event ID to obtain the master event ID.
export function stripRecurrenceSuffix(eventId: string): string {
  return eventId.replace(/_\d{8}(T\d{6}Z)?$/, '');
}

// Appends `UNTIL=<one second before instanceStart>` to an RRULE string,
// effectively ending the series just before the given instance.
export function truncateRruleUntil(rrule: string, instanceEventId: string): string {
  const match = instanceEventId.match(/_(\d{8}T\d{6}Z)$/);
  if (!match) return rrule;
  const instanceStart = new Date(
    match[1].replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z'),
  );
  const until = new Date(instanceStart.getTime() - 1000);
  const untilStr = until.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  // Remove existing UNTIL/COUNT via split/filter to avoid malformed output
  const parts = rrule.replace(/^RRULE:/, '').split(';')
    .filter((p) => !p.startsWith('UNTIL=') && !p.startsWith('COUNT='));
  return `RRULE:${parts.join(';')};UNTIL=${untilStr}`;
}
