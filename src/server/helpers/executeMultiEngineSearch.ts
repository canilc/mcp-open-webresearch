import { SearchResult, SupportedEngine } from "../../types/index.js";
import { searchBing } from "../../engines/bing/index.js";
import { searchDuckDuckGo } from "../../engines/duckduckgo/index.js";
import { searchBrave } from "../../engines/brave/index.js";
import { globalRateLimiter } from "../../utils/rateLimiter.js";
import { loadConfig } from "../../config/loader.js";

export const availableSearchEngines: Record<
  SupportedEngine,
  (query: string, limit: number) => Promise<SearchResult[]>
> = {
  bing: searchBing,
  duckduckgo: searchDuckDuckGo,
  brave: searchBrave,
};

/**
 * Distributes search limit across multiple engines
 */
export const distributeSearchLimit = (
  totalLimit: number,
  engineCount: number
): number[] => {
  const base = Math.floor(totalLimit / engineCount);
  const remainder = totalLimit % engineCount;
  return Array.from(
    { length: engineCount },
    (_, i) => base + (i < remainder ? 1 : 0)
  );
};

/**
 * Executes search across specified engines with graceful failure handling
 * Skips rate-limited engines and returns results from available engines
 */
export const executeMultiEngineSearch = async (
  query: string,
  engines: string[],
  maxResults: number
): Promise<SearchResult[]> => {
  const cleanQuery = query.trim();
  if (!cleanQuery) throw new Error("Search query cannot be empty");

  const config = loadConfig();

  // Filter out rate-limited engines
  const availableEngines = engines.filter((engine) => {
    const isRateLimited = globalRateLimiter.isRateLimited(engine);
    if (isRateLimited) {
      console.debug(`Engine ${engine} is rate limited, skipping...`);
    }
    return !isRateLimited;
  });

  // If all engines are rate limited, return empty results
  if (availableEngines.length === 0) {
    console.warn("All search engines are rate limited");
    return [];
  }

  // Distribute search limit across available engines
  const engineLimits = distributeSearchLimit(maxResults, availableEngines.length);

  // Create search promises with rate limiting checks
  const searchResultPromises = availableEngines.map((engine, index) => {
    return (async () => {
      try {
        const currentSearchEngine =
          availableSearchEngines[engine as SupportedEngine];

        if (!currentSearchEngine) {
          console.debug(`Engine ${engine} not found`);
          return [];
        }

        // Check rate limit before making request
        if (config.rateLimiting.enabled) {
          const canMakeRequest = globalRateLimiter.recordRequest(engine);
          if (!canMakeRequest) {
            console.debug(`Engine ${engine} has exceeded rate limit`);
            globalRateLimiter.markRateLimited(engine);
            return [];
          }
        }

        const results = await currentSearchEngine(cleanQuery, engineLimits[index]);
        return results;
      } catch (error) {
        console.debug(
          `Search from engine ${engine} failed:`,
          error instanceof Error ? error.message : error
        );
        // Return empty array instead of throwing, allowing other engines to continue
        return [];
      }
    })();
  });

  try {
    const searchResults = await Promise.all(searchResultPromises);
    const flatResults = searchResults.flat();
    return flatResults.slice(0, maxResults);
  } catch (error) {
    console.debug("Search execution failed:", error);
    return [];
  }
};
