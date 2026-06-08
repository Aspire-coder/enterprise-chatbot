import { getS3ImageObject } from "../services/imageService.js";
import { getContentTypeForImage, parseS3Uri } from "../utils/helpers.js";

export const s3ImageHandler = async (req, res) => {
  try {
    const parsed = parseS3Uri(req.query.uri || "");
    if (!parsed) return res.status(400).json({ error: "Valid S3 image URI is required." });

    if (parsed.bucket !== "global-chatbot-kb") {
      return res.status(403).json({ error: "Access denied." });
    }

    const object = await getS3ImageObject(parsed);
    const chunks = [];
    for await (const chunk of object.Body) chunks.push(chunk);

    res.setHeader("Content-Type", object.ContentType || getContentTypeForImage(parsed.key));
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(Buffer.concat(chunks));
  } catch (error) {
    console.error("Unable to load S3 chat image:", error);
    res.status(404).json({ error: "Image not available." });
  }
};
