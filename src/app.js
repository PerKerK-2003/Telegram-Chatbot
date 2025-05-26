require("dotenv").config();
const express = require("express");
const { json, urlencoded } = require("express");
const initializeBot = require("./bot/bot");

const app = express();

app.use(json());
app.use(urlencoded({ extended: true }));

initializeBot();

module.exports = app;
