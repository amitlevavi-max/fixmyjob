/**
 * Spanish dictionary: English text (exactly as written in the code) → Spanish.
 * Neutral Latin-American Spanish, plain words, "tú". One file per area.
 */
import onboarding from './onboarding';
import main from './main';
import plan from './plan';
import data from './data';
import misc from './misc';
import careers from './careers';
import rights from './rights';

const ES: Record<string, string> = { ...rights, ...data, ...misc, ...careers, ...plan, ...main, ...onboarding };
export default ES;
