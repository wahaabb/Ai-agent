
const mongoose = require("mongoose");

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  sequence: { type: Number, default: 1041 },
});

module.exports = mongoose.model("Counter", counterSchema);
