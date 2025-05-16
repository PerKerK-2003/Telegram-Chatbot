require("dotenv").config();
const express = require("express");
const { json, urlencoded } = require("express");
const initializeBot = require("./bot/bot"); // Only call bot setup

const app = express();

app.use(json());
app.use(urlencoded({ extended: true }));

initializeBot(); // Start Telegram bot logic

module.exports = app;
