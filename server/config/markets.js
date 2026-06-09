const defaultMarket = "United Kingdom";
const toMarketEnvKey = (market = "") =>
  market
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
const countryMarketCodeMap = {
  "United Kingdom": "UK",
  Germany: "DE",
  Belgium: "BEL",
  Canada: "CA",
  "United States": "US",
  Ecuador: "EC",
  France: "FR",
  Spain: "ES",
  Italy: "IT",
  Netherlands: "NL",
  Denmark: "DK",
  Sweden: "SE",
  Norway: "NO",
  Finland: "FI",
  Ireland: "IE",
  Australia: "AU",
  "New Zealand": "NZ",
  India: "IN",
  Japan: "JP",
  "South Korea": "KR",
  Singapore: "SG",
  Brazil: "BR",
  Mexico: "MX",
  "South Africa": "ZA",
};
const countryLanguageCodeMap = {
  "United Kingdom": {
    default: "en",
  },
  Germany: {
    default: "de",
  },
  Belgium: {
    default: "fr",
  },
  Canada: {
    default: "en",
  },
  France: {
    default: "fr",
  },
  Italy: {
    default: "it",
  },
  Netherlands: {
    default: "nl",
  },
  Sweden: {
    default: "sv",
  },
};
const countryLanguageLocaleMap = countryLanguageCodeMap;
const languageCodeMap = {
  Dutch: "nl",
  English: "en",
  French: "fr",
  German: "de",
  Italian: "it",
  Japanese: "ja",
  Polish: "pl",
  Serbian: "sr",
  Spanish: "es",
  Swedish: "sv",
};
const getMarketMetadataValue = (selectedCountry = defaultMarket) =>
  process.env[`BEDROCK_MARKET_METADATA_${toMarketEnvKey(selectedCountry)}`] ||
  countryMarketCodeMap[selectedCountry] ||
  toMarketEnvKey(selectedCountry);
const getCountryCode = (selectedCountry = defaultMarket) =>
  countryMarketCodeMap[selectedCountry] || toMarketEnvKey(selectedCountry);
const getSelectedLanguageCode = ({
  selectedCountry = defaultMarket,
  selectedLanguage = "",
  responseLanguage = "",
} = {}) => {
  const marketLanguages = countryLanguageCodeMap[selectedCountry] || {};

  return (
    marketLanguages.default ||
    marketLanguages[selectedLanguage] ||
    marketLanguages[responseLanguage] ||
    languageCodeMap[selectedLanguage] ||
    languageCodeMap[responseLanguage] ||
    null
  );
};
const getSelectedLocale = getSelectedLanguageCode;
const countryMarketMetadataMap = {
  "United Kingdom": {
    marketValues: ["UK", "United Kingdom", "GB", "GBR", "UK-EN"],
    localeValues: ["UK-EN", "en-GB"],
    countryValues: ["UK", "United Kingdom", "GB", "GBR"],
    regionValues: ["UK", "GB", "GBR"],
  },
  Germany: {
    marketValues: ["DE", "DEU", "Germany", "Deutschland", "DE-DE", "Germany-DE"],
    localeValues: ["DE-DE", "de-DE"],
    countryValues: ["DE", "DEU", "Germany", "Deutschland"],
    regionValues: ["DE", "DEU"],
  },
  Belgium: {
    marketValues: ["BEL", "BE", "Belgium", "Belgique", "Belgie", "NL-BE"],
    localeValues: ["NL-BE", "nl-BE", "FR-BE", "fr-BE"],
    countryValues: ["BEL", "BE", "Belgium", "Belgique", "Belgie"],
    regionValues: ["BEL", "BE"],
  },
  Canada: {
    marketValues: ["CA", "CAN", "Canada", "Canadian", "CA-EN", "CA-FR", "Canada-EN", "Canada-FR"],
    localeValues: ["CA-EN", "CA-FR", "en-CA", "fr-CA"],
    countryValues: ["CA", "CAN", "Canada", "Canadian"],
    regionValues: ["CA", "CAN"],
  },
  Italy: {
    marketValues: ["IT", "ITA", "Italy", "ITALY", "Italia", "ITALIA", "IT-IT", "it-IT", "Italy-IT", "Italy_IT"],
    localeValues: ["IT-IT", "it-IT", "IT_IT", "it_IT"],
    countryValues: ["IT", "ITA", "Italy", "ITALY", "Italia", "ITALIA"],
    regionValues: ["IT", "ITA"],
  },
  Netherlands: {
    marketValues: ["NL", "NLD", "Netherlands", "Nederland", "NL-NL", "Netherlands-NL"],
    localeValues: ["NL-NL", "nl-NL"],
    countryValues: ["NL", "NLD", "Netherlands", "Nederland"],
    regionValues: ["NL", "NLD"],
  },
  Sweden: {
    marketValues: ["SE", "SWE", "Sweden", "Sverige", "SE-SE", "Sweden-SE"],
    localeValues: ["SE-SE", "sv-SE"],
    countryValues: ["SE", "SWE", "Sweden", "Sverige"],
    regionValues: ["SE", "SWE"],
  },
};

export {
  defaultMarket,
  countryMarketCodeMap,
  countryMarketMetadataMap,
  countryLanguageCodeMap,
  countryLanguageLocaleMap,
  getCountryCode,
  toMarketEnvKey,
  getMarketMetadataValue,
  getSelectedLanguageCode,
  getSelectedLocale,
};
