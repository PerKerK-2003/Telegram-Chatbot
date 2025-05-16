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

module.exports = { getFAQs };
