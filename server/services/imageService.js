import { port } from "../config/constants.js";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { firstMetadataValue, getFileTitle, isImagePath } from "../utils/helpers.js";

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
});

const getS3ImageObject = ({ bucket, key }) =>
  s3Client.send(new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  }));

const toChatImageUrl = (value = "") => {
  const trimmedValue = String(value).trim();

  if (/^https?:\/\//i.test(trimmedValue)) return trimmedValue;
  if (/^s3:\/\//i.test(trimmedValue) && isImagePath(trimmedValue)) {
    return `http://localhost:${port}/api/assets/s3-image?uri=${encodeURIComponent(trimmedValue)}`;
  }

  return "";
};

const getImageCardsFromCitations = (citations = []) => {
  const seen = new Set();

  return citations
    .flatMap((citation) => citation.retrievedReferences || [])
    .flatMap((reference) => {
      const metadata = reference.metadata || {};
      const uri =
        reference.location?.s3Location?.uri ||
        reference.location?.webLocation?.url ||
        "";
      const candidates = [
        firstMetadataValue(metadata, [
          "image_url",
          "imageUrl",
          "image_urls",
          "imageUrls",
          "visual_url",
          "visualUrl",
          "diagram_url",
          "diagramUrl",
          "related_image_url",
          "relatedImageUrl",
          "asset_url",
          "assetUrl",
          "s3_image_uri",
          "s3ImageUri",
        ]),
        isImagePath(uri) ? uri : "",
      ]
        .join(",")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

      return candidates
        .map((candidate) => {
          const url = toChatImageUrl(candidate);

          if (!url || seen.has(url)) return null;
          seen.add(url);

          return {
            title:
              firstMetadataValue(metadata, ["title", "name", "image_title", "imageTitle"]) ||
              getFileTitle(candidate),
            alt:
              firstMetadataValue(metadata, ["alt_text", "altText", "alt"]) ||
              getFileTitle(candidate),
            url,
          };
        })
        .filter(Boolean);
    })
    .slice(0, 3);
};

const belgiumPolicyImageRules = [
  {
    pattern: /assistant\s+manager|assistent\s+manager|assistant-manager/i,
    title: "Assistant Manager",
    uri: "s3://global-chatbot-kb/Foreverliving-NL-BE/images/assistant-manager.png",
  },
  {
    pattern: /assistant\s+supervisor|assistent\s+supervisor|assistant-supervisor/i,
    title: "Assistant Supervisor",
    uri: "s3://global-chatbot-kb/Foreverliving-NL-BE/images/assistant-supervisor.png",
  },
  {
    pattern: /\bsupervisor\b/i,
    title: "Supervisor",
    uri: "s3://global-chatbot-kb/Foreverliving-NL-BE/images/supervisor.png",
  },
  {
    pattern: /\bmanager\b/i,
    title: "Manager",
    uri: "s3://global-chatbot-kb/Foreverliving-NL-BE/images/manager.png",
  },
  {
    pattern: /eerste\s+vijf\s+sleutelpersonen|vijf\s+sleutelpersonen|five\s+key/i,
    title: "Jouw eerste vijf sleutelpersonen",
    uri: "s3://global-chatbot-kb/Foreverliving-NL-BE/images/jouw-EERSTE-VIJF-SLEUTELPERSONEN.png",
  },
];

const getPolicyImageCardsForMarket = ({ message = "", selectedCountry = "" }) => {
  if (selectedCountry !== "Belgium") return [];

  const matchedRule = belgiumPolicyImageRules.find((rule) => rule.pattern.test(message));

  if (!matchedRule) return [];

  return [
    {
      title: matchedRule.title,
      alt: matchedRule.title,
      url: toChatImageUrl(matchedRule.uri),
    },
  ].filter((card) => card.url);
};

const getImageCardsForResponse = ({ citations = [], message = "", selectedCountry = "" }) => {
  const seen = new Set();

  return [
    ...getImageCardsFromCitations(citations),
    ...getPolicyImageCardsForMarket({ message, selectedCountry }),
  ]
    .filter((card) => {
      if (!card.url || seen.has(card.url)) return false;
      seen.add(card.url);
      return true;
    })
    .slice(0, 3);
};

export {
  belgiumPolicyImageRules,
  getImageCardsFromCitations,
  getImageCardsForResponse,
  getPolicyImageCardsForMarket,
  getS3ImageObject,
  toChatImageUrl,
};
