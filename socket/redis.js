import redis from "redis";

const client = redis.createClient({
  host: "localhost",
  port: 6379,
});

client.on("error", (error) => {
  console.error(error);
});

export const getRedisClient = async () => {
  await client.connect();
  return client;
};
