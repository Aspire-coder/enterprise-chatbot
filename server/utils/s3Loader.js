// utils/s3Loader.js
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({ region: process.env.AWS_REGION });

// ── Parse s3://bucket/key/path into { bucket, key } ───────────────────────
const parseS3Uri = (uri = "") => {
  const match = uri.match(/^s3:\/\/([^/]+)\/(.+)$/i);
  if (!match) throw new Error(`Invalid S3 URI: "${uri}". Expected format: s3://bucket/key`);
  return { bucket: match[1], key: match[2] };
};

// ── Stream S3 object body into a Buffer ───────────────────────────────────
const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
};

// ── Read and parse a JSON file from S3 ───────────────────────────────────
// Throws on S3 error or JSON parse error — caller handles fallback
export const readS3Json = async (s3Uri) => {
  const { bucket, key } = parseS3Uri(s3Uri);
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const buffer   = await streamToBuffer(response.Body);
  return JSON.parse(buffer.toString("utf8"));
};

// ── Read a raw text file from S3 (non-JSON) ───────────────────────────────
export const readS3Text = async (s3Uri) => {
  const { bucket, key } = parseS3Uri(s3Uri);
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const buffer   = await streamToBuffer(response.Body);
  return buffer.toString("utf8");
};