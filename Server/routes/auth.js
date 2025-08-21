const express = require("express");
const passport = require("passport");
const UserDB = require("../model/model");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

router.post("/guest-login", async (req, res) => {
  try {
    const guestId = uuidv4().slice(0, 8); // Short random ID
    const guestEmail = `guest-${guestId}@guest.local`;
    const guestUsername = `Guest_${guestId}`;

    // Check if already exists (optional)
    let guestUser = await UserDB.findOne({ email: guestEmail });
    const pfp = `https://api.dicebear.com/7.x/initials/svg?seed=${guestEmail}`;

    if (!guestUser) {
      guestUser = await UserDB.create({
        email: guestEmail,
        name: guestUsername,
        isGuest: true,
        pfp: pfp
      });
    }

    // Log the guest user in manually
    req.login(guestUser, (err) => {
      if (err) {
        return res.status(500).json({ message: "Login failed" });
      }
      return res.json({ message: "Logged in as guest", user: guestUser });
    });
  } catch (err) {
    console.error("Guest login error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Register route
router.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  const userExist = await UserDB.findOne({ email });

  if (userExist) return res.send("User already exists");

  const hashedPassword = await bcrypt.hash(password, 10);

  const pfp = `https://api.dicebear.com/7.x/initials/svg?seed=${email}`;

  const newUser = new UserDB({ name, email, password: hashedPassword, pfp });
  await newUser.save();

  res.redirect("/maillogin?type=login");
});

router.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/video_chat",
    failureRedirect: "/maillogin",
  })
);

// Google Auth Route
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// Google Auth Callback
router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  async (req, res) => {
    const usera = await UserDB.findOne({ email: req.user.email });
    const pfp = `https://api.dicebear.com/7.x/initials/svg?seed=${req.user.email}`;
    // console.log(usera)
    if (!usera) {
      console.log("No user in DB: " + req.user.email);
      const User = new UserDB({
        name: req.user.name,
        email: req.user.email,
        pfp: pfp,
      });
      User.save();
      res.redirect("/video_chat");
    } else {
      console.log("user " + req.user.email + "found in DB");
      res.redirect("/video_chat");
    }
  }
);

// Logout Route
router.get("/logout", (req, res) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect("/");
  });
});

module.exports = router;
