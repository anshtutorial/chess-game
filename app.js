const express = require("express");
const socket = require("socket.io");
const http = require("http");
const { Chess } = require("chess.js");
const path = require("path");

const app = express();

const server = http.createServer(app);
const io = socket(server);

const chess = new Chess();
let players = {};
let currentPlayer = "w";

app.set("view engine", "ejs");
// app.use ,  using for static file like font js css images etcc......
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.render("index", { title: "Chess Game" });
});

let waitingPlayer = null;
io.on("connection", function(uniquesocket) {
    console.log("connected");

    uniquesocket.role = null;

    // when player clicks Play vs Human
    uniquesocket.on("requestHumanMatch", () => {
        if (!waitingPlayer) {
            // nobody waiting -> put this player in queue
            waitingPlayer = uniquesocket;
            uniquesocket.emit("waiting", "Waiting for another player...");
            return;
        }

        // Someone is already waiting -> match them
        const player1 = waitingPlayer;
        const player2 = uniquesocket;
        waitingPlayer = null;

        // reset chess game
        chess.reset();

        players.white = player1.id;
        players.black = player2.id;

        player1.role = "w";
        player2.role = "b";

        player1.emit("playerRole", "w");
        player2.emit("playerRole", "b");

        io.emit("boardState", chess.fen());
    });


    uniquesocket.on("disconnect", function() {
        if (waitingPlayer === uniquesocket) {
            waitingPlayer = null;
        }

        if (uniquesocket.id === players.white) delete players.white;
        if (uniquesocket.id === players.black) delete players.black;
    });

    uniquesocket.on("move", (move) => {
        try {
            if (chess.turn() === "w" && uniquesocket.id !== players.white) return;
            if (chess.turn() === "b" && uniquesocket.id !== players.black) return;

            const result = chess.move(move);
            if (result) {
                io.emit("move", move);
                io.emit("boardState", chess.fen());
            }
        } catch (err) {
            console.log(err);
        }
    });
});

// io.on("connection", function(uniquesocket) {
//     console.log("connected");

//     if (!players.white) {
//         players.white = uniquesocket.id;
//         uniquesocket.emit("playerRole", "w");
//     } else if (!players.black) {
//         players.black = uniquesocket.id;
//         uniquesocket.emit("playerRole", "b");
//     } else {
//         uniquesocket.emit("spectatorRole");
//     }

//     uniquesocket.on("disconnect", function() {
//         if (uniquesocket.id === players.white) {
//             delete players.white;
//         } else if (uniquesocket.id === players.black) {
//             delete players.black;
//         }
//     });

//     uniquesocket.on("move", (move) => {
//         try {
//             if (chess.turn() === "w" && uniquesocket.id !== players.white) return;
//             if (chess.turn() === "b" && uniquesocket.id !== players.black) return;

//             const result = chess.move(move);

//             if (result) {
//                 currentPlayer = chess.turn();
//                 io.emit("move", move);
//                 io.emit("boardState", chess.fen())
//             } else {
//                 console.log("invalid move: ", move);
//                 uniquesocket.emit("invalidMove", move);
//             }
//         } catch (err) {
//             console.log(err);
//             uniquesocket.emit("Invalid move: ", move);
//         }
//     })
// });

// server.listen(3000, function() {
//     console.log("listen on port 3000");
// });
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
    console.log("Server running on port " + PORT);
});