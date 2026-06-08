import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config();

const client = createClient({
  url: process.env.REDIS_URL
});

try {
  console.log("Connecting...");

  await client.connect();

  console.log("Connected!");

  await client.set("test", "hello");

  const value = await client.get("test");

  console.log("Value:", value);

  await client.quit();

  console.log("Done");
} catch (err) {
  console.error("Redis Error:", err);
}