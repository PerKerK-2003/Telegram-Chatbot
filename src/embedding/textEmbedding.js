const { upsertVector, queryVector } = require("../databases/pineCone");
const { generateEmbedding } = require("../utils/gemini");

async function saveTextEmbedding(userId, chatId, question, answer) {
  try {
    const existingEmbeddings = await findSimilarEmbeddings(question, 1);
    if (existingEmbeddings[0].score > 0.98) {
      console.log(
        "Embedding đã tồn tại, không cần lưu lại:",
        existingEmbeddings[0]
      );
      return existingEmbeddings[0].id; // Trả về ID của embedding đã tồn tại
    }
    const embedding = await generateEmbedding(question);
    if (!embedding) {
      throw new Error("Không thể tạo embedding cho văn bản.");
    }

    const id = `${userId}-${chatId}-${Date.now()}`;
    await upsertVector(id, embedding, {
      userId,
      chatId,
      question,
      answer,
      timestamp: new Date().toISOString(),
    });

    return id;
  } catch (error) {
    console.error("Lỗi khi lưu embedding:", error.message);
    throw error;
  }
}

async function findSimilarEmbeddings(question, limit = 1) {
  try {
    const embedding = await generateEmbedding(question);
    if (!embedding) {
      throw new Error("Không thể tạo embedding cho văn bản.");
    }

    const results = await queryVector(embedding, limit);
    return results.map((result) => ({
      question: result.metadata.question,
      answer: result.metadata.answer,
      score: result.score,
    }));
  } catch (error) {
    console.error("Lỗi khi tìm kiếm embedding tương tự:", error.message);
    throw error;
  }
}

module.exports = {
  saveTextEmbedding,
  findSimilarEmbeddings,
};
