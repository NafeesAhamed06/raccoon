const express = require("express");
const route = express.Router();
const services = require("../services/render");
const controller = require("../controller/controller");

// route.get("/", (req,res) => {
//   console.log("brr")
//   if(req.isAuthenticated()){
//     services.homeRoutes(req, res, req.user );
//   }else{
//     res.redirect("/auth/google")
//   }
// });
// route.get("/", services.homeRoutes);


// route.get("/video_chat", services.video_chat);
// route.get("/text_chat", services.text_chat);
route.post("/api/users", controller.create);
route.put("/leaving-user-update/:id", controller.leavingUserUpdate);
route.put(
  "/update-on-otheruser-closing/:id",
  controller.updateOnOtherUserClosing
);

route.put("/new-user-update/:id", controller.newUserUpdate);
//route.put("/new-user-update", controller.newUserUpdate);
route.post("/get-remote-users", controller.remoteUserFind);
route.put("/update-on-engagement/:id", controller.updateOnEngagement);
route.put("/update-on-next/:id", controller.updateOnNext);
route.post("/get-next-user", controller.getNextUser);
route.delete("/deleteAllRecords", controller.deleteAllRecords);

module.exports = route;
