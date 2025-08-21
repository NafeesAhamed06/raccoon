//154
let localStream;
var username;
let remoteUser;
let remoteifF;
let url = new URL(window.location.href);
let peerConnection;
let remoteStream;
let sendChannel;
let receiveChannel;
let genderFilter;
let countryFilter;
var msgInput = document.querySelector("#msg-input");
var msgSendBtn = document.querySelector(".msg-send-button");
var chatTextArea = document.querySelector(".chat-text-area");
var ConnectedTexts = document.getElementById("connectedText");
var omeID = localStorage.getItem("omeID");
const verify = document.getElementById("text-chat");
let currentRoom = null;
let playerId = null; // your socket id
// if (myData) {
//   console.log("Here is the data: ", myData);
//   document.getElementById("connects").textContent =
//     "Connections Left: " + myData;
// } else if (!myData) {
//   if (mySUB == "pro") {
//     document.getElementById("connects").innerHTML =
//       "You are a PRO user<img width='20px' src='/img/SUBS/Pro.png'></img>";
//   }
//   if (mySUB == "free") {
//     document.getElementById("connects").textContent =
//       "Connections Left: " + myData;
//   } else {
//     document.getElementById("connects").textContent = "Connections Left: 15";
//   }
// }

const g = localStorage.getItem("genderFilter");
const c = localStorage.getItem("countryFilter");

if (g) {
  genderFilter = localStorage.getItem("genderFilter");
  document.getElementById("gender").value = genderFilter;
  console.log(genderFilter);
}
if (c) {
  countryFilter = localStorage.getItem("countryFilter");
  console.log(countryFilter);
}

if (myName) {
  document.getElementById("myname").textContent = myName;
}
if (omeID) {
  $.ajax({
    url: "/new-user-update/" + omeID + "",
    type: "PUT",
    contentType: "application/json", // Specify JSON content type
    data: JSON.stringify({ useridMail: myMail }), // Convert data to JSON url: "/new-user-update/" + omeID + "",
    success: function (data) {
      // console.log(data);
      console.log(myMail);
      const newOmeID = data.omeID;
      if (newOmeID) {
        localStorage.removeItem("omeID");
        localStorage.setItem("omeID", newOmeID);
        username = newOmeID;
        console.log("Here username is: ", username);
        runUser();
      } else {
        username = omeID;
        console.log("Here username is: ", username);
        runUser();
      }
    },
  });
  console.log("Here username is: ", username);
} else {
  var postData = { email: myMail };
  $.ajax({
    type: "POST",
    url: "/api/users",
    data: postData,
    success: function (response) {
      console.log(response);
      localStorage.setItem("omeID", response);
      username = response;
      runUser();
    },
    error: function (error) {
      console.log(error);
    },
  });
}
const canva = document.getElementById("canvas");
canva.width = 640;
canva.height = 360;
function runUser() {
  let init = async () => {
    const originalStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    localStream = canva.captureStream(60);
    const audioTrack = originalStream.getAudioTracks()[0];
    localStream.addTrack(audioTrack);
    document.getElementById("user-1").srcObject = localStream;
    $.post("/get-remote-users", {
      omeID: username,
      gender: genderFilter,
      country: countryFilter,
    })
      .done(function (data) {
        console.log(data);
        if (data[0]) {
          if (data[0]._id == remoteUser || data[0]._id == username) {
          } else {
            remoteUser = data[0]._id;
            createOffer(data[0]._id);
          }
        }
      })
      .fail(function (xhr, textStatus, errorThrown) {
        console.log(xhr.responseText);
      });
  };
  init();
  if (verify != null) {
    localStream.getAudioTracks()[0].enabled = false;
    localStream.getVideoTracks()[0].enabled = false;
  }
  let socket = io.connect();

  console.log(socket);

  // When game starts
  socket.on("gameStart", ({ question, roomId }) => {
    console.log(question);
    currentRoom = roomId;
    playerId = socket.id;
    document.getElementById("gamePopup").style.display = "flex";
    document.querySelector(".flued-close").style.pointerEvents = "auto";
    showQuestion(question);
    resetStrikesAndScores();
  });

  // Submit Answer
  // document.getElementById("submitAnswerBtn").addEventListener("click", () => {
  //   const answer = document.getElementById("answerInput").value.trim();
  //   if (!answer) return;

  //   socket.emit("submitAnswer", { roomId: currentRoom, answer });
  //   document.getElementById("answerInput").value = "";
  // });

  // Reveal correct answer

  socket.on("revealAnswer", ({ player, answer, points, scores, index }) => {
    // const div = document.createElement("p");
    // div.innerText = `${answer} (+${points} points by ${
    //   player === playerId ? "You" : "Opponent"
    // })`;
    let slot = document.getElementById(`answer-${index}`);
    if (slot) {
      if (username === player) {
        slot.outerHTML = `<label style="background: #448540" id="answer-${index}">${answer} (You)</label>`;
        playMusic("correct");
      } else {
        slot.outerHTML = `<label style="background: #cf3636" id="answer-${index}">${answer} (Opponent)</label>`;
      }
      const answersElement = document.getElementById("answers");
      const labels = answersElement.querySelectorAll("label");
      const inputs = answersElement.querySelectorAll("input");
      console.log(labels.length);
      console.log(inputs.length);
      if (labels.length === 2) {
        inputs.forEach((input) => {
          input.disabled = true;
        });
      }
    }
    // Update scores
    updateScores(scores);
  });

  // Update strike count
  socket.on("strikeUpdate", ({ player, strikes }) => {
    function getStrikeDisplay(playerId) {
      return "❌".repeat(strikes[playerId]);
    }
    if (player === playerId) {
      // document.getElementById("player1Strikes").innerText = `${
      //   getStrikeDisplay(playerId) || 0
      // }`;
      playMusic("wrong");
    }
    // } else {
    //   document.getElementById("player2Strikes").innerText = `${
    //     getStrikeDisplay(player) || 0
    //   }`;
    // }
  });

  // Next question
  socket.on("nextQuestion", ({ question }) => {
    showQuestion(question);
  });

  // Game over by strikes
  socket.on("gameOver", ({ reason, scores }) => {
    alert("Game Over! Someone reached 3 strikes");
    showFinalScores(scores);
    document.getElementById("gamePopup").style.display = "none";
  });

  // Game win after all questions
  socket.on("gameWin", (data) => {
    alert(
      `Game Completed! Winner: ${
        data.winner[0] === playerId ? "You" : "Opponent"
      }`
    );
    document.getElementById("game").innerHTML = `
    <h3 style="font-size: 2rem;">GAME FINISHED!!</h3>
    <div class="game-over-holder">
      YOU: ${data.scores[playerId] || 0} points<br>
      OPPONENT: ${
        data.winner[0] === playerId
          ? data.scores[
              Object.keys(data.scores).find((id) => id !== data.winner[0])
            ]
          : data.scores[data.winner[0]]
      } points
      <p>${data.winner[0] === playerId ? "You👑" : "Opponent👑"}</P>
      <button class="flued-close-2">Close Game</button>
    </div>
  `;
    document.querySelector(".scoreboard").style.display = "none";
    document.querySelector(".flued-close").style.pointerEvents = "none";
    playMusic("winner");
  });
  // // Game win after all questions
  // socket.on("gameWin", ({ scores, winner }) => {
  //   console.log(scores)
  //   alert(
  //     `Game Completed! Winner: ${winner[0] === playerId ? "You" : "Opponent"}`
  //   );
  //   document.getElementById("game").innerHTML = `
  //   <h3 style="font-size: 2rem;">GAME FINISHED!!</h3>
  //   <div class="game-over-holder">
  //     YOU: ${scores[playerId] || 0} points<br>
  //     OPPONENT: ${scores[data.player2] || 0} points
  //     <p>${winner[0] === playerId ? "You👑" : "Opponent👑"}</P>
  //     <button class="flued-close-2">Close Game</button>
  //   </div>
  // `;
  //   document.querySelector(".scoreboard").style.display = "none";
  //   showFinalScores(scores);
  //   document.getElementById("gamePopup").style.display = "none";
  //   playMusic("winner");
  // });

  // Helper functions
  function showQuestion(question) {
    console.log("Showing question:", question);
    // showQuestion(question);
    document.getElementById("game").innerHTML = `
    <h2>${question.question}</h2>
    <div id="answers">
      ${question.answers
        .map((a, i) => `<input class="answerinput" id="answer-${i}" enterkeyhint="done"/>`)
        .join("")}
    </div>
  `;
    document.querySelector(".scoreboard").style.display = "flex";

    // document.getElementById("answers").addEventListener("keypress", (e) => {
    //   if (e.target.classList.contains("answerinput") && e.key === "Enter") {
    //     const answer = e.target.value.trim();
    //     if (answer) {
    //       console.log(answer);
    //       socket.emit("submitAnswer", { roomId: currentRoom, answer });
    //       e.target.value = "";
    //     }
    //   }
    // });
    document.addEventListener("keydown", (e) => {
      if (e.target.classList.contains("answerinput") && e.key === "Enter") {
        e.preventDefault(); // stop going to next input

        const answer = e.target.value.trim();
        if (answer) {
          console.log(answer);
          socket.emit("submitAnswer", { roomId: currentRoom, answer });
          e.target.value = "";
        }
      }
    });
  }

  // document.querySelectorAll(".answerinput").forEach((input) => {
  //   input.addEventListener("keypress", (e) => {
  //     if (e.key === "Enter") {
  //       // Submit your form or perform your desired action here
  //       e.preventDefault(); // Prevents the default action, if needed
  //       // For example:
  //       console.log(input.value);
  //       // or
  //       // yourForm.submit();
  //       const answer = input.value.trim();
  //       if (!answer) return;

  //       socket.emit("submitAnswer", { roomId: currentRoom, answer });
  //       console.log("Answer submitted:", answer);
  //       // document.getElementById("answerInput").value = "";
  //     }
  //   });
  // });
  function resetStrikesAndScores() {
    document.getElementById("player1Score").innerText = "0";
    document.getElementById("player2Score").innerText = "0";
  }

  function updateScores(scores) {
    document.getElementById("player1Score").innerText = `${
      scores[playerId] || 0
    }`;
    const opponent = Object.keys(scores).find((id) => id !== playerId);
    document.getElementById("player2Score").innerText = `${
      scores[opponent] || 0
    }`;
  }

  function showFinalScores(scores) {
    updateScores(scores);
  }

  const brr = () => {
    console.log("heheh");
    localStorage.removeItem("genderFilter");
    localStorage.removeItem("countryFilter");
    socket.emit("remove-filters-match", username);
    window.location.reload();
  };
  window.brr = brr;
  //Filter Based Codes:

  const filterThumbs = document.querySelectorAll(".filter-thumb");
  let currentIndex = 0;

  const updateActiveFilter = (index) => {
    if (index < 0 || index >= filterThumbs.length) return;

    filterThumbs.forEach((t) => t.classList.remove("active"));
    const selectedThumb = filterThumbs[index];
    selectedThumb.classList.add("active");

    // Scroll to center
    selectedThumb.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });

    // const filterId = selectedThumb.getAttribute("data-filter");
    // if (filterId === "") {
    //   removeFilter();
    // } else {
    //   applyFilter(filterId);
    // }

    const filterId = selectedThumb.getAttribute("data-filter");
    if (filterId === "") {
      removeFilter();
    } else {
      applyFilter(filterId);
    }

    currentIndex = index;
  };

  // Tap selection
  filterThumbs.forEach((thumb, i) => {
    thumb.addEventListener("click", () => {
      updateActiveFilter(i);
    });
  });

  // Swipe support
  const carousel = document.querySelector(".filter-carousel");
  let startX = 0;

  carousel.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
  });

  carousel.addEventListener("touchend", (e) => {
    const endX = e.changedTouches[0].clientX;
    const deltaX = endX - startX;

    if (Math.abs(deltaX) > 50) {
      if (deltaX < 0) updateActiveFilter(currentIndex + 1);
      else updateActiveFilter(currentIndex - 1);
    }
  });

  // updateActiveFilter(0);

  async function applyFilter(filterId) {
    try {
      console.log("Applying lens:", filterId);
      const lens = await snapCamera.cameraKit.lensRepository.loadLens(
        filterId,
        "ecee53bc-3061-4d46-9679-c800d3111a81"
      );
      await snapCamera.session.applyLens(lens);

      socket.emit("start-filter", username);
    } catch (error) {
      console.error("Failed to apply lens:", error);
    }
  }

  function removeFilter() {
    console.log("Removing Filter");
    snapCamera.session.removeLens(); // Assuming you have a removeLens method
    socket.emit("stop-filter", username);
  }

  // document
  //   .getElementById("filterSelect")
  //   .addEventListener("change", async (e) => {
  //     const lensId = e.target.value;

  //     if (!lensId) {
  //       snapCamera.session.removeLens(); // Assuming you have a removeLens method
  //       socket.emit("stop-filter", username);
  //     } else {
  //       try {
  //         console.log("Applying lens:", lensId);
  //         const lens = await snapCamera.cameraKit.lensRepository.loadLens(
  //           lensId,
  //           "ecee53bc-3061-4d46-9679-c800d3111a81"
  //         );
  //         await snapCamera.session.applyLens(lens);

  //         socket.emit("start-filter", username);
  //       } catch (error) {
  //         console.error("Failed to apply lens:", error);
  //       }
  //     }
  //   });

  socket.on("disable-filter", () => {
    // Disable filter effect on video
    snapCamera.session.removeLens();
    document.getElementById("filterSelect").value = ""; // Reset the filter selection
    alert("You’ve used your 5-minute filter limit for today.");
  });

  //Filter Based Codes:

  socket.on("connect", () => {
    if (socket.connected) {
      console.log(username + " is connected to the server");
      socket.emit("userconnect", {
        displayName: username,
        email: myMail,
      });
    }
  });

  let servers = {
    iceServers: [
      {
        urls: "stun:stun.relay.metered.ca:80",
      },
      {
        urls: "turn:global.relay.metered.ca:80",
        username: "fa9979a6e783100976d5e7ae",
        credential: "XZhecIMeIDmPqIUs",
      },
      {
        urls: "turn:global.relay.metered.ca:80?transport=tcp",
        username: "fa9979a6e783100976d5e7ae",
        credential: "XZhecIMeIDmPqIUs",
      },
      {
        urls: "turn:global.relay.metered.ca:443",
        username: "fa9979a6e783100976d5e7ae",
        credential: "XZhecIMeIDmPqIUs",
      },
      {
        urls: "turns:global.relay.metered.ca:443?transport=tcp",
        username: "fa9979a6e783100976d5e7ae",
        credential: "XZhecIMeIDmPqIUs",
      },
    ],
  };
  async function restartConnection() {
    console.log("Manually restarting ICE...");

    try {
      console.log("Had A Connecting Problem Sending The Offer Once Again");
      createOffer(remoteUser);
    } catch (error) {
      console.error("Manual ICE Restart Failed:", error);
    }
  }
  let createPeerConnection = async () => {
    peerConnection = new RTCPeerConnection(servers);

    peerConnection.oniceconnectionstatechange = () => {
      console.log("ICE Connection State:", peerConnection.iceConnectionState);

      if (
        peerConnection.iceConnectionState === "failed" ||
        peerConnection.iceConnectionState === "disconnected"
      ) {
        console.log("ICE connection failed. Restarting ICE...");
        restartConnection();
        try {
          peerConnection.restartIce();
          console.log("ICE Restart Triggered Successfully.");
        } catch (error) {
          console.error("ICE Restart Failed:", error);
        }
      }
    };
    remoteStream = new MediaStream();
    document.getElementById("user-2").srcObject = remoteStream;
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });
    peerConnection.ontrack = async (event) => {
      event.streams[0].getTracks().forEach((track) => {
        remoteStream.addTrack(track);
      });
    };
    remoteStream.oninactive = () => {
      remoteStream.getTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      peerConnection.close();
    };
    peerConnection.onicecandidate = async (event) => {
      if (event.candidate) {
        socket.emit("candidateSentToUser", {
          username: username,
          remoteUser: remoteUser,
          gender: myGender,
          country: myCountry,
          age: myAge,
          remotepfp: DBpfp,
          iceCandidateData: event.candidate,
        });
      }
    };
    sendChannel = peerConnection.createDataChannel("sendDataChannel");
    sendChannel.onopen = () => {
      // ConnectedTexts.style.display = "inline";
      document.getElementById("connectionStatus").style.display = "none";
      document.getElementById("R-name").style.display = "block";
      // document.getElementById("connectionStatus").style.color = "green";
      console.log("Data channel is now open and ready to use");
      onSendChannelStateChange();
    };

    peerConnection.ondatachannel = receiveChannelCallback;
  };
  function sendData() {
    const msgData = msgInput.value;
    chatTextArea.innerHTML +=
      "<div class='message' style='margin-top:2px; margin-bottom:2px; padding-top: 8px; padding-bottom: 8px;'><b>Me: </b>" +
      msgData +
      "</div>";
    setTimeout(() => {
      chatTextArea.scrollTop = chatTextArea.scrollHeight;
    }, 100);
    if (sendChannel) {
      onSendChannelStateChange();
      sendChannel.send(msgData);
      msgInput.value = "";
    } else {
      receiveChannel.send(msgData);
      msgInput.value = "";
    }
  }
  function receiveChannelCallback(event) {
    console.log("Receive Channel Callback");
    receiveChannel = event.channel;
    receiveChannel.onmessage = onReceiveChannelMessageCallback;
    receiveChannel.onopen = onReceiveChannelStateChange;
    receiveChannel.onclose = onReceiveChannelStateChange;
  }
  function onReceiveChannelMessageCallback(event) {
    console.log("Received Message");
    chatTextArea.innerHTML +=
      "<div style='margin-top:2px; margin-bottom:2px; padding-top: 8px; padding-bottom: 8px;'><b>Stranger: </b>" +
      event.data +
      "</div>";
    setTimeout(() => {
      chatTextArea.scrollTop = chatTextArea.scrollHeight;
    }, 100);
  }
  function onReceiveChannelStateChange() {
    const readystate = receiveChannel.readystate;
    console.log("Receive channel state is: " + readystate);
    if (readystate === "open") {
      console.log(
        "Data channel ready state is open - onReceiveChannelStateChange"
      );
    } else {
      console.log(
        "Data channel ready state is NOT open - onReceiveChannelStateChange"
      );
    }
  }
  function onSendChannelStateChange() {
    const readystate = sendChannel.readystate;
    console.log("Send channel state is: " + readystate);
    if (readystate === "open") {
      console.log(
        "Data channel ready state is open - onSendChannelStateChange"
      );
    } else {
      console.log(
        "Data channel ready state is NOT open - onSendChannelStateChange"
      );
    }
  }
  function fetchNextUser(remoteUser) {
    $.post(
      "/get-next-user",
      {
        omeID: username,
        remoteUser: remoteUser,
        gender: genderFilter,
        country: countryFilter,
      },
      function (data) {
        console.log("Next user is: ", data);
        if (data[0]) {
          if (data[0]._id == remoteUser || data[0]._id == username) {
          } else {
            remoteUser = data[0]._id;
            createOffer(data[0]._id);
          }
        }
      }
    );
  }

  let createOffer = async (remoteU) => {
    createPeerConnection();
    let offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    if (peerConnection.localDescription) {
      console.log("podra vediya");
      socket.emit("offerSentToRemote", {
        username: username,
        remoteUser: remoteU,
        country: myCountry,
        age: myAge,
        gender: myGender,
        offer: peerConnection.localDescription,
      });
    } else {
      console.log("vediye illa");
      await peerConnection.setLocalDescription(offer);
      socket.emit("offerSentToRemote", {
        username: username,
        remoteUser: remoteU,
        country: myCountry,
        age: myAge,
        gender: myGender,
        offer: peerConnection.localDescription,
      });
    }
  };
  let createAnswer = async (data) => {
    remoteUser = data.username;
    createPeerConnection();
    await peerConnection
      .setRemoteDescription(data.offer)
      .then(() => console.log("Remote description set successfully"))
      .catch((e) => console.error("Error setting remote description:", e));
    let answer = await peerConnection.createAnswer();
    console.log(answer);
    await peerConnection.setLocalDescription(answer);
    socket.emit("answerSentToUser1", {
      answer: answer,
      sender: data.remoteUser,
      receiver: data.username,
    });
    document.querySelector(".next-chat").style.pointerEvents = "auto";
    document.querySelector(".rep-chat").style.pointerEvents = "auto";
    document.querySelector(".game-chat").style.pointerEvents = "auto";
    $.ajax({
      url: "/update-on-engagement/" + username + "",
      type: "PUT",
      success: function (response) {},
    });
  };

  socket.on("ReceiveOffer", function (data) {
    console.log("heee");
    // if(data.gender === )
    if (countryFilter || genderFilter) {
      const genderMatch = !genderFilter || data.gender === genderFilter;
      const countryMatch = !countryFilter || data.country === countryFilter;

      if (genderMatch && countryMatch) {
        console.log("heheh");
        createAnswer(data);
      } else {
        console.log("Heee");
        return;
      }
    } else {
      console.log("heheh");
      createAnswer(data);
    }
  });
  let addAnswer = async (data) => {
    if (!peerConnection.currentRemoteDescription) {
      console.log(data.answer);
      await peerConnection.setRemoteDescription(data.answer);
      console.log(peerConnection.currentRemoteDescription);
    }
    document.querySelector(".next-chat").style.pointerEvents = "auto";
    document.querySelector(".rep-chat").style.pointerEvents = "auto";
    document.querySelector(".game-chat").style.pointerEvents = "auto";

    $.ajax({
      url: "/update-on-engagement/" + username + "",
      type: "PUT",
      success: function (response) {
        console.log(response);
      },
    });
  };
  socket.on("ReceiveAnswer", function (data) {
    addAnswer(data);
  });
  socket.on("closedRemoteUser", function (data) {
    const remotStream = peerConnection.getRemoteStreams()[0];
    remotStream.getTracks().forEach((track) => track.stop());
    peerConnection.close();
    document.querySelector(".chat-text-area").innerHTML = "";
    const remoteVid = document.getElementById("user-2");
    ConnectedTexts.style.display = "none";
    document.getElementById("connectionStatus").style.display = "flex";
    document.getElementById("connectionStatus").innerHTML =
      "You Are Disconnected";
    document.getElementById("gamePopup").style.display = "none";

    document.getElementById("connectionStatus").style.color = "red";
    // document.querySelector(".loader").style.display = "block";
    document.getElementById("remote-dtl").style.display = "none";
    document.getElementById("R-name").textContent = "";
    document.getElementById("profileImage-R").src = "";
    if (remoteVid.srcObject) {
      remoteVid.srcObject.getTracks().forEach((track) => track.stop());
      remoteVid.srcObject = null;
    }
    console.log("Closed Remote user");
    // document.querySelector(".next-chat").style.pointerEvents = "none";
    document.querySelector(".rep-chat").style.pointerEvents = "none";
    document.querySelector(".game-chat").style.pointerEvents = "none";
    document.getElementById("gamePopup").style.display = "none";
    document.getElementById("game").innerHTML = "";
    document.getElementById("player1Score").innerText = "0";
    document.getElementById("player2Score").innerText = "0";
    $.ajax({
      url: "/update-on-next/" + username + "",
      type: "PUT",
      success: function (response) {
        fetchNextUser(remoteUser);
      },
    });
  });

  const hehe = document.getElementById("connectionStatus");
  socket.on("candidateReceiver", async function (data) {
    console.log(data);
    if (countryFilter || genderFilter) {
      const genderMatch = !genderFilter || data.gender === genderFilter;
      const countryMatch = !countryFilter || data.country === countryFilter;

      if (genderMatch && countryMatch) {
        document.getElementById("remote-dtl").style.display = "flex";
        document.querySelector(".loader").style.display = "none";
        document.getElementById(
          "R-name"
        ).textContent = `${data.name}(${data.age})`;
        document.getElementById("profileImage-R").src = data.remotepfp;
        hehe.innerHTML = `User Found <br/> Name: ${data.name} <br/>Country: ${data.country} <br/>Age: ${data.age}<br/> Connecting<div class='loader2'></div>`;
        hehe.style.color = "#ffff";

        remoteifF = data.username;
        peerConnection
          .addIceCandidate(new RTCIceCandidate(data.iceCandidateData))
          .then(() => console.log("ICE candidate added successfully"))
          .catch((e) => console.error("Error adding ICE Candidate:", e));
      } else {
        return;
      }
    } else {
      document.getElementById("remote-dtl").style.display = "flex";
      document.querySelector(".loader").style.display = "none";
      document.getElementById(
        "R-name"
      ).textContent = `${data.name}(${data.age})`;
      document.getElementById("profileImage-R").src = data.remotepfp;
      hehe.innerHTML = `User Found <br/> Name: ${data.name} <br/>Country: ${data.country} <br/>Age: ${data.age}<br/> Connecting<div class='loader2'></div>`;

      hehe.style.color = "#ff9700";

      remoteifF = data.username;
      peerConnection
        .addIceCandidate(new RTCIceCandidate(data.iceCandidateData))
        .then(() => console.log("ICE candidate added successfully"))
        .catch((e) => console.error("Error adding ICE Candidate:", e));
    }
  });

  msgSendBtn.addEventListener("click", function (event) {
    if (msgInput.value.length <= 0) {
      alert("Type Something");
    } else {
      sendData();
    }
  });
  msgInput.onkeydown = function (e) {
    if (e.keyCode == 13) {
      if (msgInput.value.length <= 0) {
        alert("Type Something");
      } else {
        sendData();
      }
    }
  };

  window.addEventListener("unload", function (event) {
    socket.emit("remoteUserClosed", {
      username: username,
      remoteUser: remoteUser,
    });
    if (navigator.userAgent.indexOf("Chrome") != -1) {
      $.ajax({
        url: "/leaving-user-update/" + username + "",
        type: "PUT",
        success: function (response) {
          console.log(response);
        },
      });
      $.ajax({
        url: "/update-on-otheruser-closing/" + remoteUser + "",
        type: "PUT",
        success: function (response) {
          console.log(response);
        },
      });
    } else if (navigator.userAgent.indexOf("Firefox") != -1) {
      $.ajax({
        url: "/leaving-user-update/" + username + "",
        type: "PUT",
        async: false,
        success: function (response) {
          console.log(response);
        },
      });

      $.ajax({
        url: "/update-on-otheruser-closing/" + remoteUser + "",
        type: "PUT",
        async: false,
        success: function (response) {
          console.log(response);
        },
      });
    } else {
      console.log("This is not Chrome or Firefox");
    }
  });
  async function closeConnection() {
    document.querySelector(".chat-text-area").innerHTML = "";
    const remotStream = peerConnection.getRemoteStreams()[0];
    remotStream.getTracks().forEach((track) => track.stop());
    const remoteVid = document.getElementById("user-2");
    if (remoteVid.srcObject) {
      remoteVid.srcObject.getTracks().forEach((track) => track.stop());
      remoteVid.srcObject = null;
    }
    ConnectedTexts.style.display = "none";
    document.getElementById("connectionStatus").style.display = "flex";
    document.getElementById("connectionStatus").innerHTML =
      "You Are Disconnected";
    document.getElementById("connectionStatus").style.color = "red";
    // document.querySelector(".loader").style.display = "block";
    document.getElementById("remote-dtl").style.display = "none";
    document.getElementById("R-name").textContent = "";
    document.getElementById("profileImage-R").src = "";

    peerConnection.onicecandidate = null;
    peerConnection.ontrack = null;
    peerConnection.onconnectionstatechange = null;
    peerConnection.oniceconnectionstatechange = null;

    await peerConnection.close();
    peerConnection = null; // Reset for new connection

    await socket.emit("remoteUserClosed", {
      username: username,
      remoteUser: remoteUser,
    });
    $.ajax({
      url: "/update-on-next/" + username + "",
      type: "PUT",
      success: function (response) {
        fetchNextUser(remoteUser);
      },
    });

    peerConnection = new RTCPeerConnection();
  }
  $(document).on("click", ".next-chat", function () {
    document.querySelector(".chat-text-area").innerHTML = "";
    console.log("From Next Chat button");
    closeConnection();
  });
  $(document).on("click", ".flued-close-2", function () {
    document.getElementById("game").innerHTML = "";
    document.getElementById("gamePopup").style.display = "none";
    currentRoom = null;
    playerId = null;
  });
  $(document).on("click", ".flued-close", function () {
    const closeGame = confirm(
      "Are you sure you want to close the game? You will lose your current progress."
    );
    if (closeGame) {
      document.getElementById("gamePopup").style.display = "none";
      document.getElementById("game").innerHTML = "";
      document.getElementById("player1Score").innerText = "0";
      document.getElementById("player2Score").innerText = "0";
      socket.emit("gameClosed", {
        roomId: currentRoom,
        playerId: playerId,
        remoteUser: remoteUser,
        reason: "Game closed by user",
      });
      currentRoom = null;
      playerId = null;
    }
  });
  socket.on("gameClosed", (data) => {
    document.getElementById("game").innerHTML = `
    <h3 style="font-size: 2rem;">Game Closed By Other User</h3>
    <div class="game-over-holder">
      YOU: ${data.scores[playerId] || 0} points<br>
      OPPONENT: ${
        data.scores[Object.keys(data.scores).find((id) => id !== playerId)] || 0
      } points
      <button class="flued-close-2">Close Game</button>
    </div>
  `;
    document.querySelector(".flued-close").style.pointerEvents = "none";
    document.querySelector(".scoreboard").style.display = "none";
  });

  document.getElementById("startGameBtn").addEventListener("click", () => {
    socket.emit("requestGame", { opponentId: remoteUser }); // set opponentId dynamically
  });

  // $(document).on("click", ".rep-chat", function () {
  //   socket.emit("report-user", {
  //     reportedId: remoteifF, // from your peer logic
  //     reason: "Inappropriate behavior",
  //   });
  //   // const reason = prompt("Why are you reporting this user?");
  //   // if (reason) {
  //   //   socket.emit("report-user", {
  //   //     reportedId: remoteifF, // You'll need to store this
  //   //     reason,
  //   //   });
  //   // }
  // });
  document.getElementById("submitReportBtn").addEventListener("click", () => {
    const reason = document.getElementById("reportReason").value;

    if (!reason) {
      alert("Please select a report reason.");
      return;
    }

    socket.emit("report-user", {
      reportedId: remoteifF, // set this properly
      reason,
    });

    alert("Report submitted. Thank you.");
  });
  $(document).on("click", ".stop-chat", function () {
    console.log("heheh");
    window.location.href = "/";
  });
}
function playMusic(type) {
  if (type === "correct") {
    const audio = new Audio("/img/correct.mp3");
    audio.play();
  } else if (type === "wrong") {
    const audio = new Audio("/img/wrong.mp3");
    audio.play();
  } else if (type === "winner") {
    const audio = new Audio("/img/Applause.mp3");
    audio.play();
  }
}
