// services/faqService.js
const db = require("../databases/database");

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
      const latestAnswer = await getLatestAnswer(userId, chatId);
      const latestQuestion = await getLatestQuestion(userId, chatId);
      if (
        latestAnswer.support_status == 0 &&
        Date.now() - latestQuestion.created_at < 10 * 60 * 1000
      ) {
        console.log("Time:", Date.now() - latestQuestion.created_at);
        const [insertedSupport] = await db("support")
          .insert({
            message_text: message,
            user_id: userId,
            message_id: messageId,
            root_message: latestQuestion.root_message
              ? latestQuestion.root_message
              : latestQuestion.message_id,
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
          root_message: latestQuestion.root_message
            ? latestQuestion.root_message
            : latestQuestion.message_id,
        });
        console.log("Câu hỏi và câu trả lời đã được thêm tiếp.");
      } else {
        const [insertedSupport] = await db("support")
          .insert({
            message_text: message,
            user_id: userId,
            message_id: messageId,
            root_message: messageId,
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
          root_message: messageId,
        });
        console.log("Câu hỏi và câu trả lời đã được thêm tiếp.");
      }
    } else {
      console.log("Câu hỏi đã tồn tại.");
    }
    return messageId;
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
        user_id: await getBotId(),
      })
      .update({ support_status });

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

async function getLatestQuestion(userId, chatId) {
  try {
    const latestQuestion = await db("support")
      .where({ user_id: userId, chat_id: chatId })
      .orderBy("id", "desc")
      .first();

    if (latestQuestion) {
      return latestQuestion;
    } else {
      console.log("Không có câu hỏi nào được tìm thấy.");
      return null;
    }
  } catch (error) {
    console.error("Lỗi khi lấy câu hỏi mới nhất:", error);
    return null;
  }
}

async function getLatestAnswer(userId, chatId) {
  try {
    const latestQuestion = await getLatestQuestion(userId, chatId);
    const latestAnswer = await db("support_detail")
      .where({
        rl_message_id: latestQuestion.message_id,
        chat_id: chatId,
      })
      .orderBy([
        { column: "created_at", order: "desc" },
        { column: "sp_id", order: "desc" },
        { column: "message_id", order: "desc" },
      ])
      .first();
    if (latestAnswer) {
      return latestAnswer;
    } else {
      console.log("Không có câu trả lời nào được tìm thấy.");
      return null;
    }
  } catch (error) {
    console.error("Lỗi khi lấy câu trả lời mới nhất:", error);
    return null;
  }
}

async function getRootMessage(messageId, chatId, userId) {
  try {
    const result = await db("support")
      .where({ message_id: messageId, chat_id: chatId, user_id: userId })
      .select("root_message")
      .first();

    const rootMessage = result?.root_message ?? null;

    return rootMessage;
  } catch (error) {
    console.error("Lỗi khi lấy tin nhắn gốc:", error);
    return null;
  }
}

async function getHistoryConversation(chatId, userId) {
  try {
    const latestMessage = await getLatestQuestion(userId, chatId);
    const rootMessage =
      latestMessage?.root_message || latestMessage?.message_id;
    console.log("Lấy rootMessage:", rootMessage);
    const history = await db("support as sp")
      .join("support_detail as spd", "sp.id", "spd.sp_id")
      .select("sp.message_text as question", "spd.text as answer")
      .where({
        "sp.chat_id": chatId,
        "sp.user_id": userId,
        "sp.root_message": rootMessage,
      })
      .orderBy("spd.created_at", "asc");
    return history;
  } catch (error) {
    console.error("Lỗi khi lấy lịch sử cuộc trò chuyện:", error);
    return [];
  }
}

async function updateHelpfulResponse(messageId, chatId, userId) {
  try {
    const helpfulResponse = await db("support_detail")
      .where({
        user_id: userId,
        chat_id: chatId,
        message_id: messageId,
        support_status: 1,
      })
      .first();
    if (helpfulResponse) {
      await db("support")
        .join("support_detail", "support.id", "support_detail.sp_id")
        .where({
          "support.message_id": helpfulResponse.root_message,
          "support_detail.rl_message_id": messageId,
        })
        .update({ text: helpfulResponse.text });
      console.log("Cập nhật phản hồi hữu ích thành công.");
    }
  } catch (error) {
    console.error("Lỗi khi cập nhật phản hồi hữu ích:", error);
  }
}

module.exports = {
  insertFAQ,
  getBotId,
  updateFAQ,
  getLatestQuestion,
  getLatestAnswer,
  getRootMessage,
  getHistoryConversation,
  updateHelpfulResponse,
};
