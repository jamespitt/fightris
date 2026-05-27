//  Flightris — MakeCode Arcade, two players via radio
//  Simultaneous multiplayer Tetris with a real-time powerup economy

//  ── Constants ────────────────────────────────────────────────────────────────
let GRID_W = 10
let GRID_H = 20
let CELL = 3
let STEP = 4 // 3px cell + 1px gap
let OX = 10  // Local board origin X
let OY = 20  // Board origin Y
let OX2 = 110 // Opponent board origin X

// Colors
let C_BG = 15     // Black
let C_BORDER = 13 // Dark Navy/Tan border
let C_GRID_DOT = 11 // Subtle gray dot for empty cells
let C_GARBAGE = 8  // Gray for garbage blocks
let C_TEXT = 1    // White for generic text
let C_HIGHLIGHT = 5 // Yellow highlight

// Tetromino Types and Configurations
// 0: I, 1: O, 2: T, 3: S, 4: Z, 5: J, 6: L
const PIECE_SHAPES = [
    // 0: I
    [
        [[0, -1], [0, 0], [0, 1], [0, 2]],
        [[-1, 0], [0, 0], [1, 0], [2, 0]],
        [[0, -1], [0, 0], [0, 1], [0, 2]],
        [[-1, 0], [0, 0], [1, 0], [2, 0]]
    ],
    // 1: O
    [
        [[0, 0], [0, 1], [1, 0], [1, 1]],
        [[0, 0], [0, 1], [1, 0], [1, 1]],
        [[0, 0], [0, 1], [1, 0], [1, 1]],
        [[0, 0], [0, 1], [1, 0], [1, 1]]
    ],
    // 2: T
    [
        [[0, -1], [0, 0], [0, 1], [-1, 0]],
        [[-1, 0], [0, 0], [1, 0], [0, 1]],
        [[0, -1], [0, 0], [0, 1], [1, 0]],
        [[-1, 0], [0, 0], [1, 0], [0, -1]]
    ],
    // 3: S
    [
        [[0, 0], [0, 1], [-1, 1], [-1, 2]],
        [[-1, 0], [0, 0], [0, 1], [1, 1]],
        [[0, 0], [0, 1], [-1, 1], [-1, 2]],
        [[-1, 0], [0, 0], [0, 1], [1, 1]]
    ],
    // 4: Z
    [
        [[-1, 0], [-1, 1], [0, 1], [0, 2]],
        [[0, 0], [1, 0], [-1, 1], [0, 1]],
        [[-1, 0], [-1, 1], [0, 1], [0, 2]],
        [[0, 0], [1, 0], [-1, 1], [0, 1]]
    ],
    // 5: J
    [
        [[0, -1], [0, 0], [0, 1], [-1, 1]],
        [[-1, -1], [-1, 0], [0, 0], [1, 0]],
        [[0, -1], [0, 0], [0, 1], [1, -1]],
        [[-1, 0], [0, 0], [1, 0], [1, 1]]
    ],
    // 6: L
    [
        [[0, -1], [0, 0], [0, 1], [1, 1]],
        [[-1, 0], [0, 0], [1, 0], [1, -1]],
        [[0, -1], [0, 0], [0, 1], [-1, -1]],
        [[-1, 1], [-1, 0], [0, 0], [1, 0]]
    ]
]

// Colors for pieces: 0: I=9, 1: O=5, 2: T=10, 3: S=6, 4: Z=2, 5: J=7, 6: L=4
const PIECE_COLORS = [9, 5, 10, 6, 2, 7, 4]

// ── Game State Classes ──────────────────────────────────────────────────────
class Phase {
    static SETUP = 0
    static WAITING = 1
    static ACTIVE = 2
    static DONE = 3
}

let phase = Phase.SETUP
let localBoard: number[][] = []

// Active and Next piece state
let activeType = 0
let activeRotation = 0
let activeRow = 0
let activeCol = 4
let nextType = 0
let bag: number[] = []

// Player stats
let score = 0
let linesCleared = 0
let level = 1
let coins = 0
let gameOver = false
let gameWon = false

// Powerup states
let shopIndex = 0
let shopTimer = 7000 // ms per shop item
let freezeTimer = 0  // ms remaining of gravity freeze
const POWERUP_NAMES = ["Junk", "Clean", "Freeze"]
const POWERUP_COSTS = [2, 3, 4]

// Opponent State Shadows
let opponentHeights: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
let opponentScore = 0
let opponentGameOver = false

// Connection & Handshaking
let mySerial = 0
let theirSerial = 0
let iSentReady = false
let theyAreReady = false

// Timers
let lastTickTime = 0
let gravityInterval = 1000 // ms per drop

// ── Sounds ───────────────────────────────────────────────────────────────────
function soundPlace() {
    music.playTone(523, 80) // C5
}

function soundHit() {
    control.runInBackground(function () {
        music.playTone(587, 80) // D5
        music.playTone(659, 80) // E5
        music.playTone(784, 120) // G5
    })
}

function soundMiss() {
    music.playTone(196, 150) // G3 (garbage rows received)
}

function soundWin() {
    control.runInBackground(function () {
        music.playTone(523, 100)
        music.playTone(659, 100)
        music.playTone(784, 100)
        music.playTone(1047, 350)
    })
}

// ── Grid Initialisation ──────────────────────────────────────────────────────
function resetGrids() {
    localBoard = []
    for (let r = 0; r < GRID_H; r++) {
        let row: number[] = []
        for (let c = 0; c < GRID_W; c++) {
            row.push(0)
        }
        localBoard.push(row)
    }

    score = 0
    linesCleared = 0
    level = 1
    coins = 0
    gameOver = false
    gameWon = false
    freezeTimer = 0
    shopTimer = 7000
    shopIndex = 0
    opponentGameOver = false
    gravityInterval = 1000

    for (let i = 0; i < GRID_W; i++) {
        opponentHeights[i] = 0
    }
    opponentScore = 0
    bag = []
}

// ── 7-Bag Randomizer ────────────────────────────────────────────────────────
function nextPieceFromBag(): number {
    if (bag.length == 0) {
        for (let i = 0; i < 7; i++) {
            bag.push(i)
        }
        // Shuffle bag
        for (let i = bag.length - 1; i > 0; i--) {
            let j = Math.randomRange(0, i)
            let temp = bag[i]
            bag[i] = bag[j]
            bag[j] = temp
        }
    }
    return bag.pop()
}

// ── Game Logic ──────────────────────────────────────────────────────────────
function getPieceColor(type: number): number {
    if (type >= 0 && type < PIECE_COLORS.length) {
        return PIECE_COLORS[type]
    }
    return C_GARBAGE
}

function collides(type: number, rot: number, r: number, c: number): boolean {
    let offsets = PIECE_SHAPES[type][rot]
    for (let i = 0; i < 4; i++) {
        let nr = r + offsets[i][0]
        let nc = c + offsets[i][1]

        if (nc < 0 || nc >= GRID_W || nr < 0 || nr >= GRID_H) {
            return true
        }
        if (localBoard[nr][nc] != 0) {
            return true
        }
    }
    return false
}

function getGhostRow(): number {
    let gr = activeRow
    while (!collides(activeType, activeRotation, gr + 1, activeCol)) {
        gr++
    }
    return gr
}

function spawnPiece() {
    activeType = nextType
    nextType = nextPieceFromBag()
    activeRotation = 0
    activeRow = 1
    activeCol = 4

    if (collides(activeType, activeRotation, activeRow, activeCol)) {
        gameOver = true
        phase = Phase.DONE
        music.playTone(392, 150)
        music.playTone(330, 150)
        music.playTone(262, 350)
        radio.sendString("LOSE")
    }
}

function lockPiece() {
    let offsets = PIECE_SHAPES[activeType][activeRotation]
    for (let i = 0; i < 4; i++) {
        let nr = activeRow + offsets[i][0]
        let nc = activeCol + offsets[i][1]
        if (nr >= 0 && nr < GRID_H && nc >= 0 && nc < GRID_W) {
            localBoard[nr][nc] = activeType + 1
        }
    }

    soundPlace()
    checkLineClears()
    sendHeights()
    spawnPiece()
}

function checkLineClears() {
    let clearedThisTurn = 0
    for (let r = GRID_H - 1; r >= 0; r--) {
        let full = true
        for (let c = 0; c < GRID_W; c++) {
            if (localBoard[r][c] == 0) {
                full = false
                break
            }
        }
        if (full) {
            clearedThisTurn++
            // Shift rows down
            for (let tr = r; tr > 0; tr--) {
                for (let tc = 0; tc < GRID_W; tc++) {
                    localBoard[tr][tc] = localBoard[tr - 1][tc]
                }
            }
            // Clear top row
            for (let tc = 0; tc < GRID_W; tc++) {
                localBoard[0][tc] = 0
            }
            r++
        }
    }

    if (clearedThisTurn > 0) {
        linesCleared += clearedThisTurn
        let basePoints = [0, 100, 300, 500, 800]
        let points = basePoints[Math.min(clearedThisTurn, 4)] * level
        score += points
        coins += clearedThisTurn

        level = Math.floor(linesCleared / 10) + 1
        gravityInterval = Math.max(100, 1000 - (level - 1) * 100)

        soundHit()

        // Symmetrical garbage propagation
        let garbageToSend = 0
        if (clearedThisTurn == 2) garbageToSend = 1
        else if (clearedThisTurn == 3) garbageToSend = 2
        else if (clearedThisTurn >= 4) garbageToSend = 4

        if (garbageToSend > 0) {
            radio.sendString("G:" + garbageToSend)
        }
    }
}

function addGarbageRows(n: number) {
    if (n <= 0) return

    // Shift rows up
    for (let r = 0; r < GRID_H - n; r++) {
        for (let c = 0; c < GRID_W; c++) {
            localBoard[r][c] = localBoard[r + n][c]
        }
    }

    // Fill bottom with garbage (gray) with 1 random hole
    let hole = Math.randomRange(0, GRID_W - 1)
    for (let r = GRID_H - n; r < GRID_H; r++) {
        for (let c = 0; c < GRID_W; c++) {
            if (c == hole) {
                localBoard[r][c] = 0
            } else {
                localBoard[r][c] = 8 // Garbage
            }
        }
    }

    // Push active piece up if blocked
    if (collides(activeType, activeRotation, activeRow, activeCol)) {
        let pushed = false
        for (let dy = 1; dy <= n; dy++) {
            if (!collides(activeType, activeRotation, activeRow - dy, activeCol)) {
                activeRow -= dy
                pushed = true
                break
            }
        }
        if (!pushed) {
            gameOver = true
            phase = Phase.DONE
            music.playTone(392, 150)
            music.playTone(330, 150)
            music.playTone(262, 350)
            radio.sendString("LOSE")
        }
    }

    soundMiss()
    sendHeights()
}

function clearBottomRows(n: number) {
    if (n <= 0) return
    for (let r = GRID_H - 1; r >= n; r--) {
        for (let c = 0; c < GRID_W; c++) {
            localBoard[r][c] = localBoard[r - n][c]
        }
    }
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < GRID_W; c++) {
            localBoard[r][c] = 0
        }
    }
    sendHeights()
}

// ── Networking / Sync ───────────────────────────────────────────────────────
function sendHeights() {
    let heights: string[] = []
    for (let c = 0; c < GRID_W; c++) {
        let h = 0
        for (let r = GRID_H - 1; r >= 0; r--) {
            if (localBoard[r][c] != 0) {
                h = GRID_H - r
                break
            }
        }
        heights.push("" + h)
    }
    radio.sendString("H:" + heights.join(",") + ":" + score)
}

function buyPowerup() {
    let cost = POWERUP_COSTS[shopIndex]
    if (coins >= cost) {
        coins -= cost
        if (shopIndex == 0) {
            // Junk
            radio.sendString("G:2")
            music.playTone(523, 100)
        } else if (shopIndex == 1) {
            // Clean
            clearBottomRows(3)
            music.playTone(659, 100)
        } else if (shopIndex == 2) {
            // Freeze
            radio.sendString("P:FREEZE")
            music.playTone(784, 100)
        }
    }
}

function readyUp() {
    mySerial = control.deviceSerialNumber()
    phase = Phase.WAITING
    iSentReady = true
    radio.sendString("READY:" + mySerial)
    music.playTone(262, 80)
    if (theyAreReady) {
        startGame()
    } else {
        redraw()
    }
}

function startGame() {
    resetGrids()
    nextType = nextPieceFromBag()
    spawnPiece()
    phase = Phase.ACTIVE
    lastTickTime = game.runtime()
    redraw()
}

// ── Radio Handler ───────────────────────────────────────────────────────────
radio.setGroup(42)
radio.onReceivedString(function (msg: string) {
    if (msg.substr(0, 6) == "READY:") {
        theirSerial = parseInt(msg.substr(6))
        theyAreReady = true
        if (iSentReady) {
            startGame()
        }
    } else if (phase == Phase.ACTIVE) {
        if (msg.substr(0, 2) == "G:") {
            let count = parseInt(msg.substr(2))
            addGarbageRows(count)
            redraw()
        } else if (msg.substr(0, 2) == "H:") {
            let parts = msg.substr(2).split(":")
            let hStr = parts[0].split(",")
            for (let i = 0; i < GRID_W; i++) {
                opponentHeights[i] = parseInt(hStr[i])
            }
            if (parts.length > 1) {
                opponentScore = parseInt(parts[1])
            }
            redraw()
        } else if (msg == "P:FREEZE") {
            freezeTimer = 5000
            music.playTone(220, 300)
            redraw()
        } else if (msg == "LOSE") {
            phase = Phase.DONE
            gameWon = true
            soundWin()
            redraw()
        }
    }
})

// ── Game Update Loop ────────────────────────────────────────────────────────
game.onUpdate(function () {
    if (phase == Phase.ACTIVE && !gameOver && !gameWon) {
        let now = game.runtime()
        let elapsed = now - lastTickTime

        if (freezeTimer > 0) {
            freezeTimer -= elapsed
            if (freezeTimer < 0) freezeTimer = 0
            // Reset standard gravity timer so piece doesn't drop immediately after unfreezing
            lastTickTime = now
        } else {
            if (now - lastTickTime >= gravityInterval) {
                lastTickTime = now
                if (!collides(activeType, activeRotation, activeRow + 1, activeCol)) {
                    activeRow++
                    redraw()
                } else {
                    lockPiece()
                }
            }
        }

        // Cycle the shop
        shopTimer -= elapsed
        if (shopTimer <= 0) {
            shopTimer = 7000
            shopIndex = (shopIndex + 1) % 3
            redraw()
        }
    }
})

// ── Drawing Engine ──────────────────────────────────────────────────────────
function redraw() {
    let bg = scene.backgroundImage()
    bg.fill(C_BG)

    if (phase == Phase.SETUP) {
        bg.printCenter("FLIGHTRIS", 25, C_HIGHLIGHT)
        bg.printCenter("P2P simultaneous Tetris", 45, C_TEXT)
        bg.printCenter("Press [A] to Ready", 80, C_HIGHLIGHT)
        return
    }

    if (phase == Phase.WAITING) {
        bg.printCenter("FLIGHTRIS", 25, C_HIGHLIGHT)
        bg.printCenter("Waiting for Player 2...", 55, C_TEXT)
        return
    }

    if (phase == Phase.DONE) {
        if (gameWon) {
            bg.printCenter("VICTORY!", 20, 6) // Green
            bg.printCenter("You crushed them!", 40, C_TEXT)
        } else {
            bg.printCenter("DEFEAT!", 20, 2) // Red
            bg.printCenter("Topped out...", 40, C_TEXT)
        }
        bg.printCenter("Your Score: " + score, 65, C_TEXT)
        bg.printCenter("Their Score: " + opponentScore, 75, C_TEXT)
        bg.printCenter("Press [A] to Retry", 95, C_HIGHLIGHT)
        return
    }

    // ── Phase.ACTIVE Gameplay Drawing ──────────────────────────────────────────
    // Borders
    bg.drawRect(OX - 1, OY - 1, GRID_W * STEP + 1, GRID_H * STEP + 1, C_BORDER)
    bg.drawRect(OX2 - 1, OY - 1, GRID_W * STEP + 1, GRID_H * STEP + 1, C_BORDER)

    // Local Board Matrix background grid & blocks
    for (let r = 0; r < GRID_H; r++) {
        for (let c = 0; c < GRID_W; c++) {
            let v = localBoard[r][c]
            let x = OX + c * STEP
            let y = OY + r * STEP
            if (v == 0) {
                // Subtle matrix grid dot in the center
                bg.setPixel(x + 1, y + 1, C_GRID_DOT)
            } else if (v == 8) {
                // Garbage row block
                bg.fillRect(x, y, CELL, CELL, C_GARBAGE)
            } else {
                // Regular block
                bg.fillRect(x, y, CELL, CELL, getPieceColor(v - 1))
            }
        }
    }

    // Ghost Piece (Hollow outlines)
    let gr = getGhostRow()
    let offsets = PIECE_SHAPES[activeType][activeRotation]
    for (let i = 0; i < 4; i++) {
        let r = gr + offsets[i][0]
        let c = activeCol + offsets[i][1]
        if (r >= 0 && r < GRID_H && c >= 0 && c < GRID_W) {
            bg.drawRect(OX + c * STEP, OY + r * STEP, CELL, CELL, C_GRID_DOT)
        }
    }

    // Active Piece
    for (let i = 0; i < 4; i++) {
        let r = activeRow + offsets[i][0]
        let c = activeCol + offsets[i][1]
        if (r >= 0 && r < GRID_H && c >= 0 && c < GRID_W) {
            bg.fillRect(OX + c * STEP, OY + r * STEP, CELL, CELL, getPieceColor(activeType))
        }
    }

    // Opponent Board (Contour Profile)
    for (let c = 0; c < GRID_W; c++) {
        let h = opponentHeights[c]
        for (let r = GRID_H - h; r < GRID_H; r++) {
            let x = OX2 + c * STEP
            let y = OY + r * STEP
            let col = (r == GRID_H - h) ? 2 : C_BORDER // Red line contour at the top, dark border color below
            bg.fillRect(x, y, CELL, CELL, col)
        }
    }

    // ── Middle Space Dashboard (x=50 to 110) ──────────────────────────────────
    // Title
    bg.print("FLIGHTRIS", 54, 4, C_HIGHLIGHT)

    // Next Piece box
    bg.drawRect(60, 18, 40, 26, C_BORDER)
    bg.print("NEXT", 69, 12, C_TEXT)
    let nextOffsets = PIECE_SHAPES[nextType][0]
    for (let i = 0; i < 4; i++) {
        let dr = nextOffsets[i][0]
        let dc = nextOffsets[i][1]
        bg.fillRect(78 + dc * STEP, 30 + dr * STEP, CELL, CELL, getPieceColor(nextType))
    }

    // Level, Score, Coins
    bg.print("LVL: " + level, 54, 48, C_TEXT)
    bg.print("COIN:" + coins, 54, 57, C_HIGHLIGHT)
    bg.print("SC:  " + score, 54, 66, C_TEXT)

    // Shop Item rotating display
    bg.print("SHOP", 68, 77, C_TEXT)
    let shopItemName = POWERUP_NAMES[shopIndex]
    let shopItemCost = POWERUP_COSTS[shopIndex]
    let isAffordable = coins >= shopItemCost
    bg.print(shopItemName, 54, 86, isAffordable ? 6 : 2) // Green if affordable, red if locked
    bg.print("Cost:" + shopItemCost, 54, 95, C_TEXT)

    // Shop Item cycle timer bar
    bg.drawRect(60, 105, 40, 3, C_BORDER)
    let barWidth = Math.floor((shopTimer / 7000) * 38)
    if (barWidth > 0) {
        bg.fillRect(61, 106, barWidth, 1, C_HIGHLIGHT)
    }

    // Freeze notification overlay
    if (freezeTimer > 0) {
        bg.print("FROZEN", 63, 111, 2)
    }
}

// ── Controls ─────────────────────────────────────────────────────────────────
controller.left.onEvent(ControllerButtonEvent.Pressed, function () {
    if (phase == Phase.ACTIVE && !gameOver && !gameWon) {
        if (!collides(activeType, activeRotation, activeRow, activeCol - 1)) {
            activeCol--
            redraw()
        }
    }
})

controller.right.onEvent(ControllerButtonEvent.Pressed, function () {
    if (phase == Phase.ACTIVE && !gameOver && !gameWon) {
        if (!collides(activeType, activeRotation, activeRow, activeCol + 1)) {
            activeCol++
            redraw()
        }
    }
})

controller.down.onEvent(ControllerButtonEvent.Pressed, function () {
    if (phase == Phase.ACTIVE && !gameOver && !gameWon) {
        if (!collides(activeType, activeRotation, activeRow + 1, activeCol)) {
            activeRow++
            lastTickTime = game.runtime() // Soft drop resets gravity timer
            redraw()
        }
    }
})

controller.up.onEvent(ControllerButtonEvent.Pressed, function () {
    if (phase == Phase.ACTIVE && !gameOver && !gameWon) {
        let dropRows = 0
        while (!collides(activeType, activeRotation, activeRow + 1, activeCol)) {
            activeRow++
            dropRows++
        }
        if (dropRows > 0) {
            score += dropRows * 2
        }
        lockPiece()
        redraw()
    }
})

controller.A.onEvent(ControllerButtonEvent.Pressed, function () {
    if (phase == Phase.SETUP) {
        readyUp()
    } else if (phase == Phase.DONE) {
        // Retry
        phase = Phase.SETUP
        iSentReady = false
        theyAreReady = false
        redraw()
    } else if (phase == Phase.ACTIVE && !gameOver && !gameWon) {
        let nextRot = (activeRotation + 1) % 4
        // Rotation kicks: test normal, shift left, shift right
        if (!collides(activeType, nextRot, activeRow, activeCol)) {
            activeRotation = nextRot
            redraw()
        } else if (!collides(activeType, nextRot, activeRow, activeCol - 1)) {
            activeCol--
            activeRotation = nextRot
            redraw()
        } else if (!collides(activeType, nextRot, activeRow, activeCol + 1)) {
            activeCol++
            activeRotation = nextRot
            redraw()
        }
    }
})

controller.B.onEvent(ControllerButtonEvent.Pressed, function () {
    if (phase == Phase.ACTIVE && !gameOver && !gameWon) {
        buyPowerup()
        redraw()
    }
})

// ── Boot ─────────────────────────────────────────────────────────────────────
resetGrids()
phase = Phase.SETUP
redraw()
