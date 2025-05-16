const db = require("../databases/database");

async function logUniqueQuestion(userId, message, image = null, answer = null) {
  try {
    await db("support").insert({
      user_id: userId,
      message,
      image,
      answer,
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      console.log("Trùng lặp thông tin: ");
    } else {
      console.error("Lỗi xảy ra khi đang thêm thông tin: ", error);
    }
  }
}

module.exports = {
  logUniqueQuestion,
};
