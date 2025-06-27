const {
  upsertVector,
  queryVector,
  updateSPStatus,
  getVector,
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
    const existingFAQ = await findSimilarEmbeddings(question, 1);
    if (
      existingFAQ.length > 0 &&
      existingFAQ[0].supportStatus === true &&
      existingFAQ[0].score > 0.99
    ) {
      console.log("Đã tồn tại câu hỏi tương tự với trạng thái hỗ trợ.");
      return existingFAQ[0].id; // Trả về ID của câu hỏi đã tồn tại
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
    console.log(`Đã lưu embedding cho câu hỏi: ${question}`);
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
      id: result.id,
      question: result.metadata.question,
      answer: result.metadata.answer,
      score: result.score,
      rootMessage: result.metadata.rootMessage,
      supportStatus: result.metadata.supportStatus,
    }));
  } catch (error) {
    console.error("Lỗi khi tìm kiếm embedding tương tự:", error.message);
    throw error;
  }
}

async function updateSupportStatus(vectorId, newStatus) {
  try {
    const match = await getVector(vectorId);
    const record = Object.values(match.records)[0];
    console.log("Record:", record);
    if (!record || !record.metadata) {
      console.warn("Không tìm thấy record hoặc metadata:", record);
      return; // hoặc throw new Error("No metadata found");
    }
    let rootMessage;
    const { metadata } = record;
    if (metadata.rootMessage && metadata.rootMessage !== "") {
      rootMessage = metadata.rootMessage;
    } else {
      rootMessage = vectorId; // Nếu không có rootMessage, sử dụng vectorId
    }
    console.log("Vector ID:", vectorId);
    console.log("rootMessage:", rootMessage);

    await updateSPStatus(rootMessage, newStatus);
    console.log(`Đã cập nhật supportStatus cho vector ${rootMessage}`);
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
