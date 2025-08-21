const mongoose = require("mongoose");

var schema = new mongoose.Schema(
  {
    active: {
      type: String,
    },
    status: {
      type: String,
    },
    gender: {
      type: String,
      // enum: ["Male", "Female"],
      default: null,
    },
    country: {
      type: String,
      default: null,
    },
    preferedGender: {
      type: String,
      // enum: ["Male", "Female"],
      default: null,
    },
    preferedCountry: {
      type: String,
      default: null,
    },
    sub: {
      type: String,
      default: "free",
    },
    email: {
      type: String,
      default: null,
    },
    name: {
      type: String,
      default: null,
    },
    password: {
      type: String,
      default: null, // hashed password for local login
    },
    proDuration: {
      type: Date,
      default: null,
    },
    stripeCustomerId: {
      type: String,
      default: null,
    },
    subscriptionId: {
      type: String,
      default: null,
    },
    age:{
      type: Number,
      default: null, // Age of the user
    },
    freeLimit: {
      type: Number,
      default: 15,
    },
    filterUsage: {
      date: Date,
      duration: { type: Number, default: 0 }, // in ms
    },
    isBanned: { type: Boolean, default: false },
    banReason: { type: String, default: "" },
    banExpiresAt: { type: Date, default: null }, // For pro users
    pfp: {
      type: String,
      default: "",
    },
    isGuest: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const UserDB = mongoose.model("ome", schema);
module.exports = UserDB;

const bannedIPSchema = new mongoose.Schema({
  ip: { type: String },
  bannedAt: { type: Date, default: Date.now },
  reason: { type: String },
});
