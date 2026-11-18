/**
 * Where the user is, more precisely than state/metro: their ZIP code turned
 * into a map point (Census ZCTA centre) and the closest metro area
 * (Census CBSA centre) — used to search for courses near them and to sort
 * approved training programs by distance.
 */
import { supabase } from './supabase';
import { metroPoint } from '../data/metroPoints';

export interface HomePoint {
  zip: string;
  lat: number;
  lon: number;
  city: string;        // closest metro area's main city, e.g. 'Tyler'
  state: string;       // its state, e.g. 'TX'
  cityMiles: number;   // straight-line miles from the ZIP to that city
}

export const isZip = (s: string) => /^\d{5}$/.test(s.trim());

/** null = unknown ZIP; throws when the lookup itself failed. */
export async function locateZip(zip: string): Promise<HomePoint | null> {
  const { data, error } = await supabase.rpc('locate_zip', { p_zip: zip.trim() });
  if (error) throw new Error(error.message);
  const r = (data ?? [])[0];
  if (!r) return null;
  return { zip: r.zip, lat: r.lat, lon: r.lon, city: r.city, state: r.state, cityMiles: Number(r.city_miles) };
}

export interface CourseArea { label: string; city: string | null; state: string | null }

/**
 * The place to search for courses:
 *   ZIP given → the closest city to it;
 *   otherwise the metro they picked; otherwise their state.
 */
export function courseArea(s: {
  homePoint: HomePoint | null; locationIsMetro: boolean | null; locationMetro: string | null;
  locationState: string | null; locationStateName: string | null;
}): CourseArea | null {
  if (s.homePoint) return { label: `${s.homePoint.city}, ${s.homePoint.state}`, city: s.homePoint.city, state: s.homePoint.state };
  if (s.locationIsMetro && s.locationMetro && s.locationState) {
    const city = s.locationMetro.split('/')[0].trim();
    return { label: `${city}, ${s.locationState}`, city, state: s.locationState };
  }
  if (s.locationStateName) return { label: s.locationStateName, city: null, state: s.locationState };
  return null;
}

/** How far around the user we look for approved training programs */
export const SEARCH_RADIUS_MI = 50;

/**
 * Where to search around: the ZIP code when given (most precise), otherwise
 * the centre of the metro area the user picked. null = only the state is known.
 */
export function useSearchPoint(s: {
  homePoint: HomePoint | null; locationIsMetro: boolean | null; locationMetro: string | null; locationState: string | null;
}): { lat: number; lon: number } | null {
  if (s.homePoint) return { lat: s.homePoint.lat, lon: s.homePoint.lon };
  return s.locationIsMetro ? metroPoint(s.locationMetro, s.locationState) : null;
}
