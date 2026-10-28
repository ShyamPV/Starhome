/**
 * Time scales. Julian Dates here are on the UTC scale; the ~69 s TT-UTC offset is
 * below the accuracy of the low-precision ephemerides used in deliverable 1 and will
 * be handled properly when the VSOP87/ELP ephemerides land.
 */

export const JD_UNIX_EPOCH = 2_440_587.5;
export const J2000 = 2_451_545.0;
export const DAYS_PER_JULIAN_CENTURY = 36_525;

export function dateToJulian(date: Date): number {
  return date.getTime() / 86_400_000 + JD_UNIX_EPOCH;
}

export function julianToDate(jd: number): Date {
  return new Date((jd - JD_UNIX_EPOCH) * 86_400_000);
}

export function centuriesSinceJ2000(jd: number): number {
  return (jd - J2000) / DAYS_PER_JULIAN_CENTURY;
}

/** Greenwich mean sidereal time in degrees (IAU 1982, adequate to ~0.1 s). */
export function greenwichMeanSiderealTimeDeg(jd: number): number {
  const t = centuriesSinceJ2000(jd);
  const gmst =
    280.46061837 +
    360.98564736629 * (jd - J2000) +
    0.000387933 * t * t -
    (t * t * t) / 38_710_000;
  return ((gmst % 360) + 360) % 360;
}
