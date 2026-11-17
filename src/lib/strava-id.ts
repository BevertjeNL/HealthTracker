// Strava's numeric IDs may exceed JavaScript's exact integer range. Prefer the
// string supplied by Strava; accept older responses only while their ID is safe.
export function stravaObjectId(object: { id_str?: unknown; id?: unknown }): string {
  if (object.id_str !== undefined) {
    if (typeof object.id_str === "string" && /^[1-9]\d*$/.test(object.id_str)) {
      return object.id_str;
    }
    throw new Error("Strava returned an invalid string ID");
  }

  if (typeof object.id === "number" && Number.isSafeInteger(object.id) && object.id > 0) {
    return String(object.id);
  }
  throw new Error("Strava returned no safe ID");
}
