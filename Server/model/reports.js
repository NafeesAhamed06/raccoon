const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema({
  reporterId: { type: String }, // socket.id or user id if logged in
  reportedId: { type: String },
  reason: { type: String },
  handled: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now },
});

const ReportDB = mongoose.model("Report", reportSchema);
module.exports = ReportDB;