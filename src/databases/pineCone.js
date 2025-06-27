require("dotenv").config();
const { Pinecone } = require("@pinecone-database/pinecone");

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

const index = pinecone.index(process.env.PINECONE_INDEX_NAME);

async function getVector(id) {
  const match = await index.fetch([id]);

  if (!match || !match.records) {
    throw new Error(`Vector '${id}' không tồn tại trong cơ sở dữ liệu.`);
  }
  return match;
}

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

  if (!result || !result.matches) {
    throw new Error("Không tìm thấy kết quả tương tự.");
  }
  return result.matches.map((match) => ({
    id: match.id,
    score: match.score,
    metadata: match.metadata,
  }));
}

async function updateSPStatus(id, newStatus) {
  const match = await getVector(id);

  const { metadata } = match.records;

  await index.update({
    id: id.toString(),
    metadata: {
      ...metadata,
      supportStatus: newStatus,
    },
  });
}

module.exports = { upsertVector, queryVector, updateSPStatus, getVector };
