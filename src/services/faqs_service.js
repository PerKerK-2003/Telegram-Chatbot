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
  botMessageId,
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
        latestAnswer &&
        latestQuestion &&
        latestAnswer.support_status == 0 &&
        Date.now() - latestQuestion.created_at < 10 * 60 * 1000
      ) {
        console.log("Time:", Date.now() - latestQuestion.created_at);
        const insertedSupport = await db("support").insert({
          message_text: message,
          user_id: userId,
          message_id: messageId,
          root_message: latestQuestion.root_message,
          chat_id: chatId,
          photo_id: image,
        });

        const sp_id = insertedSupport[0];
        await db("support_detail").insert({
          sp_id: sp_id,
          text: answer,
          chat_id: chatId,
          message_id: botMessageId,
          user_id: await getBotId(),
          rl_message_id: messageId,
          root_message: latestQuestion.root_message,
        });
        console.log("Câu hỏi và câu trả lời đã được thêm tiếp.");
        return latestQuestion.root_message;
      } else {
        const insertedSupport = await db("support").insert({
          message_text: message,
          user_id: userId,
          message_id: messageId,
          root_message: messageId,
          chat_id: chatId,
          photo_id: image,
        });

        const sp_id = insertedSupport[0];

        await db("support_detail").insert({
          sp_id: sp_id,
          text: answer,
          chat_id: chatId,
          message_id: messageId + 1,
          user_id: await getBotId(),
          rl_message_id: messageId,
          root_message: messageId,
        });
        console.log("Câu hỏi và câu trả lời đã được thêm.");
        return messageId;
      }
    } else {
      console.log("Câu hỏi đã tồn tại.");
      return existingFAQ.message_id;
    }
  } catch (error) {
    console.error("Có lỗi xảy ra khi thêm thông tin:", error);
  }
}

async function updateFAQ(support_status, messageId, chatId) {
  try {
    const updatedRows = await db("support_detail")
      .where({
        rl_message_id: messageId,
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

    // Nếu không có câu hỏi => không thể tìm câu trả lời
    if (!latestQuestion) {
      console.log("Không có câu hỏi nào để tìm câu trả lời.");
      return null;
    }

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
    console.log("Latest message:", latestMessage);
    const rootMessage = latestMessage.root_message;

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

async function getHelpfulResponses(rootMessage, chatId) {
  try {
    const responses = await db("support_detail")
      .where({
        chat_id: chatId,
        root_message: rootMessage,
        support_status: 1,
      })
      .select("text")
      .first();
    console.log("Responses:", responses);
    return responses ? responses : null;
  } catch (error) {
    console.error("Lỗi khi lấy phản hồi hữu ích:", error);
    return;
  }
}

async function continueSession(chatId, userId) {
  try {
    const latestAnswer = await getLatestAnswer(userId, chatId);
    console.log("Latest answer:", latestAnswer);
    if (!latestAnswer) {
      console.log("Không có câu hỏi nào để tiếp tục.");
      return null;
    }
    if (latestAnswer.support_status === -1) {
      await updateFAQ(0, latestAnswer.rl_message_id, chatId);
      console.log(
        "Cập nhật trạng thái hỗ trợ cho câu hỏi:",
        latestAnswer.rl_message_id
      );
    }
    return latestAnswer;
  } catch (error) {
    console.error("Lỗi khi tiếp tục phiên:", error);
    return null;
  }
}

async function expireOldSessions(userId, chatId) {
  try {
    const latestAnswer = await getLatestAnswer(userId, chatId);
    if (!latestAnswer) {
      console.log("Không có câu hỏi nào để xử lý.");
      return;
    }
    const expirationTime = 10 * 60 * 1000; // 10 phút
    const timePass = Date.now() - new Date(latestAnswer.created_at).getTime();
    if (timePass > expirationTime && latestAnswer.support_status === 0) {
      console.log("Phiên đã hết hạn, cập nhật trạng thái hỗ trợ.");
      console.log(
        "Cập nhật trạng thái hỗ trợ cho câu hỏi:",
        latestAnswer.rl_message_id
      );
      await updateFAQ(-1, latestAnswer.rl_message_id, chatId);
    }
  } catch (error) {
    console.error("Lỗi khi cập nhật trạng thái:", error);
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
  getHelpfulResponses,
  expireOldSessions,
  continueSession,
};
