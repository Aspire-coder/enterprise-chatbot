const getSourceName = (uri = "") => {
  const fileName = decodeURIComponent(uri.split("/").pop() || uri);

  return fileName || "policy document";
};

const formatCitations = (citations = []) => {
  const sources = citations.flatMap((citation) =>
    (citation.retrievedReferences || []).map((reference) => {
      const uri =
        reference.location?.s3Location?.uri ||
        reference.location?.webLocation?.url ||
        "";

      return {
        title: getSourceName(uri),
        uri,
      };
    }),
  );

  return Array.from(
    new Map(sources.filter((source) => source.uri).map((source) => [source.uri, source])).values(),
  );
};


const stripInlineMetadataBlocks = (text = "") =>
  text
    .replace(/METADATA\s*[\s\S]*?\s*END_METADATA/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export {
  formatCitations,
  getSourceName,
  stripInlineMetadataBlocks,
};
