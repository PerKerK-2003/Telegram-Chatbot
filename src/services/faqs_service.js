// services/faqService.js
const db = require("../databases/database");

async function getFAQs() {
  try {
    const faqs = await db("support").select("message", "answer");
    return faqs;
  } catch (error) {
    console.error("Có lỗi xảy ra khi lấy thông tin:", error);
    return [];
  }
}

async function addOrUpdateFAQ(message, answer) {
  try {
    const existingFAQ = await db("support").where("message", message).first();

    if (existingFAQ) {
      await db("support").where("message", message).update({ answer });
      console.log("Cập nhật thông tin hỗ trợ thành công.");
    } else {
      await db("support").insert({ user_id: 1, message, image: null, answer });
    }
  } catch (error) {
    console.error("Có lỗi xảy ra khi thêm hoặc cập nhật thông tin:", error);
  }
}

module.exports = { getFAQs, addOrUpdateFAQ };
