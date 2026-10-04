// Domain lists used to check that an evidence link matches its claimed tier (HANDOFF.md sections 3 and 9.4).
// This is configuration, not data. Extend it as new trusted sources come up.

export const FILING_DOMAINS = [
  "sec.gov",
  "hkexnews.hk",
  "companieshouse.gov.uk",
  "company-information.service.gov.uk",
  "sedarplus.ca",
  "asx.com.au",
  "londonstockexchange.com",
];

// Section 3, item 4.
export const REPUTABLE_PRESS = ["reuters.com", "bloomberg.com", "ft.com", "wsj.com", "cnbc.com", "techcrunch.com", "theinformation.com"];

// Section 3, item 5. Always labeled as estimates.
export const ANALYTICS = [
  "sensortower.com",
  "appfigures.com",
  "alinea-analytics.com",
  "vginsights.com",
  "gamalytic.com",
  "similarweb.com",
  "circana.com",
  "sacra.com",
];

// Hosts that usually sit behind a login or paywall (section 13). Not fetched automatically.
export const PAYWALLED = ["theinformation.com", "sacra.com", "pitchbook.com", "wsj.com", "ft.com", "bloomberg.com"];

export const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

export const onList = (host: string, list: string[]) => list.some((d) => host === d || host.endsWith("." + d));

export const isCompanyIR = (host: string) => /^(investors?|ir)\./.test(host);
