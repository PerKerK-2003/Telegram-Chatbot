// services/faqService.js
const db = require("../databases/database");

async function getFAQs() {
  try {
    const pairs = await db("support as sp")
      .join("support_detail as spd", "sp.id", "spd.sp_id")
      .select("sp.message_text as question", "spd.text as answer")
      .whereNull("spd.rl_message_id");
    return pairs;
  } catch (error) {
    console.error("Lỗi khi lấy cặp hỏi-đáp:", error);
    return [];
  }
}

async function getBotId() {
  try {
    const bot = await db("user").where("is_bot", 1).first();
    return bot ? bot.id : null;
  } catch (error) {
    console.error("Lỗi khi lấy ID bot:", error);
    return null;
  }
}

async function insertFAQ(
  message,
  answer,
  messageId,
  chatId,
  userId,
  image = null
) {
  try {
    const existingFAQ = await db("support")
      .where("message_text", message)
      .first();

    if (!existingFAQ) {
      const [insertedSupport] = await db("support")
        .insert({
          message_text: message,
          user_id: userId,
          message_id: messageId,
          chat_id: chatId,
          photo_id: image,
        })
        .returning("sp_id");

      const sp_id = insertedSupport.sp_id || insertedSupport;

      await db("support_detail").insert({
        sp_id: sp_id,
        text: answer,
        chat_id: chatId,
        message_id: messageId + 1,
        user_id: await getBotId(),
        rl_message_id: messageId,
      });

      console.log("Câu hỏi và câu trả lời đã được thêm.");
    } else {
      console.log("Câu hỏi đã tồn tại.");
    }
  } catch (error) {
    console.error("Có lỗi xảy ra khi thêm thông tin:", error);
  }
}

async function updateFAQ(support_status, messageId, chatId) {
  try {
    const updatedRows = await db("support_detail")
      .where({
        message_id: messageId,
        chat_id: chatId,
      })
      .update({ support_status });
    console.log(
      "messageId:",
      messageId,
      "support_status:",
      support_status,
      "chatId:",
      chatId
    );
    console.log("Cập nhật số hàng:", updatedRows);
    if (updatedRows > 0) {
      console.log("Cập nhật trạng thái hỗ trợ thành công.");
    } else {
      console.log("Không tìm thấy câu hỏi để cập nhật.");
    }
  } catch (error) {
    console.error("Có lỗi xảy ra khi cập nhật trạng thái hỗ trợ:", error);
  }
}

module.exports = { getFAQs, insertFAQ, getBotId, updateFAQ };
