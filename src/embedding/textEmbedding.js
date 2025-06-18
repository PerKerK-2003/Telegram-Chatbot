const {
  upsertVector,
  queryVector,
  updateSPStatus,
} = require("../databases/pineCone");
const { generateEmbedding } = require("../utils/gemini");

async function saveTextEmbedding(
  messageId,
  userId,
  chatId,
  question,
  answer,
  imageId = null,
  rootMessage
) {
  try {
    const embedding = await generateEmbedding(question);
    if (!embedding) {
      throw new Error("Không thể tạo embedding cho văn bản.");
    }

    const id = `${messageId}`;
    await upsertVector(id, embedding, {
      userId,
      chatId,
      question,
      answer,
      imageId,
      rootMessage,
      supportStatus: false,
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

async function updateSupportStatus(vectorId, newStatus) {
  try {
    await updateSPStatus(vectorId, newStatus);
    console.log(`Đã cập nhật supportStatus cho vector ${vectorId}`);
  } catch (error) {
    console.error("Lỗi khi cập nhật trạng thái hỗ trợ:", error.message);
    throw error;
  }
}

module.exports = {
  saveTextEmbedding,
  findSimilarEmbeddings,
  updateSupportStatus,
};
