import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import {
  AppConfig,
  ProxyConfig,
  ProxyProtocol,
  ProxyAgent,
  RateLimitConfig,
} from "../types/app-config.js";

const PROTOCOL_PATTERN = /^(https?|socks4a?|socks5):\/\//i;

export const urlSeemsValid = (url: string): boolean => {
  const emptyUrl = url.trim().length === 0;
  const urlStartsWithProtocol = PROTOCOL_PATTERN.test(url);
  return !emptyUrl && urlStartsWithProtocol;
};

const loadProxyConfig = (): ProxyConfig => {
  const proxyUrl =
    process.env.SOCKS5_PROXY ||
    process.env.SOCKS4A_PROXY ||
    process.env.SOCKS4_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    "";

  const isValid = urlSeemsValid(proxyUrl);

  let urlObject: URL;
  let protocol: ProxyProtocol = null;
  let error: string | null = isValid
    ? null
    : `Invalid proxy URL or protocol. Expected protocol: ${
        PROTOCOL_PATTERN.source
      } Received: ${proxyUrl === "" ? "unset" : proxyUrl}`;

  console.debug(`loader: ${error ? `error detected: ${error}` : `no error`}`);

  let host: string | null = null;
  let port: number | null = null;

  let username: string | null = null;
  let password: string | null = null;

  let agent: ProxyAgent | null = null;

  if (isValid) {
    try {
      urlObject = new URL(proxyUrl);
      protocol = urlObject.protocol.replace(":", "") as ProxyProtocol;
      host = urlObject.hostname;
      port = urlObject.port ? Number.parseInt(urlObject.port, 10) : null;
      username = urlObject.username;
      password = urlObject.password;

      if (protocol && protocol.includes("socks")) {
        agent = {
          http: new SocksProxyAgent(urlObject),
          https: new SocksProxyAgent(urlObject),
        };
      } else {
        agent = {
          http: new HttpsProxyAgent(urlObject),
          https: new HttpsProxyAgent(urlObject),
        };
      }
    } catch (caughtError) {
      console.debug("loader: Failed to create proxy agent: ", caughtError);
      error = error
        ? error + `\n${caughtError};`
        : `Failed to create proxy agent: ${caughtError}`;
    }
  }

  return {
    url: proxyUrl,
    enabled: process.env.USE_PROXY === "true",
    isValid,
    protocol,
    error,
    host,
    port,
    username,
    password,
    agent,
  };
};

const loadRateLimitConfig = (): AppConfig["rateLimiting"] => {
  const enabled = process.env.RATE_LIMITING_ENABLED === "true";

  // Default rate limit: 30 requests per 1 minute per engine
  const defaultConfig: RateLimitConfig = {
    maxRequests: 30,
    windowMinutes: 1,
  };

  const parseEngineConfig = (engineName: string): RateLimitConfig => {
    const maxRequestsEnv = process.env[`RATE_LIMIT_${engineName.toUpperCase()}_MAX_REQUESTS`];
    const windowMinutesEnv = process.env[`RATE_LIMIT_${engineName.toUpperCase()}_WINDOW_MINUTES`];

    return {
      maxRequests: maxRequestsEnv ? Number.parseInt(maxRequestsEnv, 10) : defaultConfig.maxRequests,
      windowMinutes: windowMinutesEnv ? Number.parseInt(windowMinutesEnv, 10) : defaultConfig.windowMinutes,
    };
  };

  return {
    enabled,
    engines: {
      bing: parseEngineConfig("bing"),
      duckduckgo: parseEngineConfig("duckduckgo"),
      brave: parseEngineConfig("brave"),
    },
  };
};

export const loadConfig = (): Readonly<AppConfig> => {
  const config: AppConfig = {
    defaultSearchEngines: process.env.DEFAULT_SEARCH_ENGINES
      ? (process.env.DEFAULT_SEARCH_ENGINES.split(",").filter(
          (e): e is AppConfig["defaultSearchEngines"][number] =>
            ["bing", "duckduckgo", "brave"].includes(e)
        ) as AppConfig["defaultSearchEngines"])
      : (["bing", "duckduckgo", "brave"] as AppConfig["defaultSearchEngines"]),
    proxy: loadProxyConfig(),
    enableCors: process.env.ENABLE_CORS === "true",
    corsOrigin: process.env.CORS_ORIGIN || "*",
    rateLimiting: loadRateLimitConfig(),
  };

  return Object.freeze(config);
};
