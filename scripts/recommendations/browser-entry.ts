// Browser build of the harness (used when only a browser can reach Supabase)
import { getRecommendations } from './harness';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).FMJ = { getRecommendations };
