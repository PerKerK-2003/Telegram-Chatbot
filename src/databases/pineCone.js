require("dotenv").config();
const { Pinecone } = require("@pinecone-database/pinecone");

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

const index = pinecone.index(process.env.PINECONE_INDEX_NAME);

async function upsertVector(id, vector, metadata = {}) {
  await index.upsert([
    {
      id,
      values: vector,
      metadata,
    },
  ]);
}

async function queryVector(vector, topK = 3) {
  const result = await index.query({
    topK,
    vector,
    includeMetadata: true,
  });

  return result.matches;
}

module.exports = { upsertVector, queryVector };
