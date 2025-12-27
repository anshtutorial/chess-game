/* chessgame.js - with Medium AI (greedy + material eval) */
/* Works with chess.js v0.10.3 CDN and your existing server socket API */

const socket = io("/", {
    transports: ["websocket"],
    upgrade: false
});
const chess = new Chess();
const boardElement = document.querySelector(".chessboard");

let playerRole = null; // "w" or "b" when in multiplayer; in vsComputer mode player is "w"
let vsComputer = false; // when true -> play vs AI locally
let highlightedSquares = [];
let selectedSourceSquare = null; // "e2"
let selectedSourceCoord = null; // {row, col}

// ----------------------------- UI Buttons -----------------------------
const playHumanBtn = document.getElementById("playHuman");
const playComputerBtn = document.getElementById("playComputer");
const resetBtn = document.getElementById("resetBtn");
const modeLabel = document.getElementById("modeLabel");
const loadingOverlay = document.getElementById("loadingOverlay");


// playHumanBtn.addEventListener("click", () => {
//     vsComputer = false;
//     modeLabel.textContent = "Mode: Online (Human vs Human)";

//     loadingOverlay.style.display = "flex"; // ⬅ SHOW LOADING
//     socket.emit("requestHumanMatch"); // 👈 ask server for opponent
//     chess.reset();
//     socket.emit && socket.emit("requestNew");
//     selectedSourceSquare = null;
//     selectedSourceCoord = null;
//     clearHighlights();
//     renderBoard();
// });
playHumanBtn.addEventListener("click", () => {
    vsComputer = false;

    loadingOverlay.style.display = "flex"; // finding player UI

    socket.emit("requestHumanMatch"); // 👈 ask server for opponent
});


playComputerBtn.addEventListener("click", () => {
    vsComputer = true;
    modeLabel.textContent = "Mode: Play vs Computer (Medium)";
    chess.reset();
    // in computer mode player will be white; AI is black
    playerRole = "w";
    selectedSourceSquare = null;
    selectedSourceCoord = null;
    clearHighlights();
    renderBoard();
});

resetBtn.addEventListener("click", () => {
    chess.reset();
    selectedSourceSquare = null;
    selectedSourceCoord = null;
    clearHighlights();
    renderBoard();
});
// ----------------------------- end buttons -----------------------------

// ----------------------------- RENDER BOARD -----------------------------
const renderBoard = () => {
    const board = chess.board();
    boardElement.innerHTML = "";

    board.forEach((row, rowIndex) => {
        row.forEach((square, colIndex) => {
            const squareElement = document.createElement("div");
            squareElement.classList.add("square", (rowIndex + colIndex) % 2 === 0 ? "light" : "dark");
            squareElement.dataset.row = rowIndex;
            squareElement.dataset.col = colIndex;

            // Click on square (for click-to-move)
            squareElement.addEventListener("click", () => {
                if (selectedSourceSquare && squareElement.classList.contains("highlight")) {
                    const target = { row: parseInt(squareElement.dataset.row), col: parseInt(squareElement.dataset.col) };
                    clearHighlights();
                    handleMove(selectedSourceCoord, target);
                    selectedSourceSquare = null;
                    selectedSourceCoord = null;
                    return;
                }

                if (selectedSourceSquare) {
                    clearHighlights();
                    selectedSourceSquare = null;
                    selectedSourceCoord = null;
                }
            });

            if (square) {
                const pieceElement = document.createElement("div");
                pieceElement.classList.add("piece", square.color === "w" ? "white" : "black");
                pieceElement.innerHTML = getPieceUnicode(square);

                pieceElement.addEventListener("click", (ev) => {
                    ev.stopPropagation(); // prevent square click

                    // If user clicked on an opponent piece that is highlighted (capture), perform capture
                    const parentSq = ev.target.parentElement;
                    if (selectedSourceSquare && parentSq.classList.contains("highlight")) {
                        const target = { row: parseInt(parentSq.dataset.row), col: parseInt(parentSq.dataset.col) };
                        clearHighlights();
                        handleMove(selectedSourceCoord, target);
                        selectedSourceSquare = null;
                        selectedSourceCoord = null;
                        return;
                    }

                    // Selecting player piece only
                    if (vsComputer) {
                        // in vsComputer mode player is white (playerRole may be set accordingly)
                        if (square.color !== "w") return;
                    } else {
                        if (!playerRole) {
                            // if no role assigned yet (spectator), don't allow select
                            return;
                        }
                        if (square.color !== playerRole) return;
                    }

                    const fromSquare = `${String.fromCharCode(97 + colIndex)}${8 - rowIndex}`;

                    // toggle off if clicking same piece
                    if (selectedSourceSquare === fromSquare) {
                        clearHighlights();
                        selectedSourceSquare = null;
                        selectedSourceCoord = null;
                        return;
                    }

                    selectedSourceSquare = fromSquare;
                    selectedSourceCoord = { row: rowIndex, col: colIndex };

                    clearHighlights();

                    // get SAN moves (CDN returns SANs)
                    const sanMoves = chess.moves({ square: fromSquare });

                    sanMoves.forEach(san => {
                        // castling
                        if (/^O-O(-O)?/.test(san)) {
                            const isWhite = square.color === 'w';
                            if (/O-O-O/.test(san)) {
                                const dest = isWhite ? 'c1' : 'c8';
                                highlightSquare(dest);
                            } else {
                                const dest = isWhite ? 'g1' : 'g8';
                                highlightSquare(dest);
                            }
                            return;
                        }

                        const m = san.match(/([a-h][1-8])$/);
                        if (m) {
                            highlightSquare(m[1]);
                        } else {
                            const sanitized = san.replace(/[+#]$/, '');
                            const m2 = sanitized.match(/([a-h][1-8])$/);
                            if (m2) highlightSquare(m2[1]);
                        }
                    });
                });

                squareElement.appendChild(pieceElement);
            }

            boardElement.appendChild(squareElement);
        });
    });

    if (playerRole === "b") boardElement.classList.add("flipped");
    else boardElement.classList.remove("flipped");
};
// ----------------------------- end render -----------------------------

// ----------------------------- handleMove -----------------------------
const handleMove = (source, target) => {
    if (!source || !target) return;

    const moveObj = {
        from: `${String.fromCharCode(97 + source.col)}${8 - source.row}`,
        to: `${String.fromCharCode(97 + target.col)}${8 - target.row}`,
        promotion: "q"
    };

    if (vsComputer) {
        // apply locally
        const result = chess.move(moveObj);
        if (result) {
            renderBoard();
            // AI move after short delay
            setTimeout(makeComputerMove, 300);
        } else {
            // invalid move: nothing to do (optionally show a small message)
            // re-render to keep UI synced
            renderBoard();
        }
        return;
    }

    // multiplayer: send to server
    socket.emit("move", moveObj);
};
// ----------------------------- end handleMove -----------------------------

// ----------------------------- HIGHLIGHT helpers -----------------------------
function highlightSquare(square) {
    const file = square[0];
    const rank = parseInt(square[1]);

    const col = file.charCodeAt(0) - 97;
    const row = 8 - rank;

    const el = document.querySelector(`.square[data-row="${row}"][data-col="${col}"]`);
    if (el) {
        el.classList.add("highlight");
        highlightedSquares.push(el);
    }
}

function clearHighlights() {
    highlightedSquares.forEach(el => el.classList.remove("highlight"));
    highlightedSquares = [];
}

function markCheckmateKing() {
    // remove old checkmate highlight
    document.querySelectorAll(".checkmate-king")
        .forEach(el => el.classList.remove("checkmate-king"));

    if (!chess.in_checkmate()) return;

    // the side to move is the side that is checkmated
    const loserColor = chess.turn();

    const board = chess.board();
    board.forEach((row, rowIndex) => {
        row.forEach((square, colIndex) => {
            if (!square) return;

            if (square.type === "k" && square.color === loserColor) {
                const el = document.querySelector(
                    `.square[data-row="${rowIndex}"][data-col="${colIndex}"]`
                );
                if (el) el.classList.add("checkmate-king");
            }
        });
    });
}

// ----------------------------- end highlight -----------------------------

// ----------------------------- piece unicode -----------------------------
function getPieceUnicode(piece) {
    const codes = {
        p: "♙", // black pawn
        r: "♜",
        n: "♞",
        b: "♝",
        q: "♛",
        k: "♚",

        P: "♙", // white pawn
        R: "♖",
        N: "♘",
        B: "♗",
        Q: "♕",
        K: "♔"
    };

    return codes[piece.color === "w" ? piece.type.toUpperCase() :
        piece.type.toLowerCase()];
}

// ----------------------------- end unicode -----------------------------

// ----------------------------- SIMPLE MEDIUM AI -----------------------------
/*
 Strategy:
  - Get list of SAN moves via chess.moves()
  - For each SAN: simulate move on a fresh Chess(chess.fen()) clone using tmp.move(san)
  - Evaluate material after move: score = whiteMaterial - blackMaterial
  - If AI is black -> choose move minimizing score; if AI is white -> maximize score
  - Give a boost to capture moves (SAN includes 'x') and promotions
  - Tie-break randomly among top moves
*/
const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function evaluateMaterial(boardArray) {
    // boardArray = tmp.board() returns array of rows with piece objects or null
    let white = 0,
        black = 0;
    boardArray.forEach(row => {
        row.forEach(cell => {
            if (!cell) return;
            const v = PIECE_VALUE[cell.type] || 0;
            if (cell.color === 'w') white += v;
            else black += v;
        });
    });
    return white - black;
}

function makeComputerMove() {
    if (chess.game_over()) return;

    const aiColor = chess.turn(); // 'w' or 'b' (after human moved this should be AI's turn)
    const sanMoves = chess.moves(); // SAN strings

    if (!sanMoves || sanMoves.length === 0) return;

    let bestScore = null;
    let bestMoves = [];

    sanMoves.forEach(san => {
        const tmp = new Chess(chess.fen());
        const res = tmp.move(san);
        if (!res) return; // sanity

        let score = evaluateMaterial(tmp.board());

        // prefer captures/promotions
        if (san.includes('x')) score += (aiColor === 'w' ? 0.5 : -0.5) * 1; // reward capture for white, penalize for black accordingly
        if (san.includes('=')) score += (aiColor === 'w' ? 1.0 : -1.0); // promotion reward

        // For AI playing black we want minimal (white-black smaller), for white we want maximal
        if (aiColor === 'b') {
            // invert for selection (we want smallest)
            if (bestScore === null || score < bestScore - 1e-9) {
                bestScore = score;
                bestMoves = [san];
            } else if (Math.abs(score - bestScore) < 1e-9) bestMoves.push(san);
        } else {
            if (bestScore === null || score > bestScore + 1e-9) {
                bestScore = score;
                bestMoves = [san];
            } else if (Math.abs(score - bestScore) < 1e-9) bestMoves.push(san);
        }
    });

    // fallback if something went wrong
    if (bestMoves.length === 0) {
        // random
        const r = Math.floor(Math.random() * sanMoves.length);
        chess.move(sanMoves[r]);
        renderBoard();
        return;
    }

    // pick random among best
    const chosen = bestMoves[Math.floor(Math.random() * bestMoves.length)];
    chess.move(chosen);
    renderBoard();
}
// ----------------------------- end AI -----------------------------

// ----------------------------- SOCKETS -----------------------------
socket.on("playerRole", (role) => {
    loadingOverlay.style.display = "none"; // ⬅ HIDE LOADING
    loadingOverlay.style.display = "none";

    playerRole = role;
    modeLabel.textContent = vsComputer ?
        "Mode: Play vs Computer (Medium)" :
        `Mode: Online — you are ${role === 'w' ? 'White' : 'Black'}`;
    renderBoard();
});

socket.on("spectatorRole", () => {
    loadingOverlay.style.display = "none"; // ⬅ HIDE LOADING

    playerRole = null;
    modeLabel.textContent = "Mode: Spectator";
    renderBoard();
});

socket.on("boardState", (fen) => {
    chess.load(fen);
    clearHighlights();
    selectedSourceSquare = null;
    selectedSourceCoord = null;
    renderBoard();
});

socket.on("move", (move) => {
    chess.move(move);
    clearHighlights();
    selectedSourceSquare = null;
    selectedSourceCoord = null;
    renderBoard();
});
// ----------------------------- end sockets -----------------------------
markCheckmateKing();

renderBoard();