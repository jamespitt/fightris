// Battleships — MakeCode Arcade, two players via radio
// 7×7 grid, ships: 2, 2, 3, 3

// ── Constants ────────────────────────────────────────────────────────────────
const GRID = 7
const CELL = 12
const STEP = CELL + 1          // 13px per cell (1px gap)
const OX = 35                  // grid origin x  (centres 91px grid on 160px screen)
const OY = 14                  // grid origin y

const C_GRID   = 13   // dark navy  — empty water
const C_SHIP   = 6    // green      — your ship (defence view)
const C_HIT    = 2    // red        — hit
const C_MISS   = 1    // white      — miss
const C_SUNK   = 4    // orange     — sunk ship
const C_CURSOR = 5    // yellow     — cursor outline
const C_BG     = 15   // black      — background

const SHIPS = [2, 2, 3, 3]
const TOTAL_CELLS = 10         // 2+2+3+3

// ── State ────────────────────────────────────────────────────────────────────
enum Phase { SETUP, WAITING, MY_TURN, PENDING, ENEMY_TURN, DONE }

let phase = Phase.SETUP
let viewMine = false   // false = attack grid, true = my defence grid

// Grids: 0=water 1=ship 2=miss 3=hit 4=sunk
let mine: number[][] = []   // my board — ships + incoming shots
let atk: number[][] = []    // my shots at the enemy

let shipIdx = 0     // which ship we are currently placing (0–3)
let cx = 0          // cursor column
let cy = 0          // cursor row
let horiz = true    // ship orientation during placement

let fireX = 0       // position of the last shot fired
let fireY = 0

let mySerial = 0
let theirSerial = 0
let iSentReady = false
let theyAreReady = false
let hitCount = 0    // cells I have hit on the enemy grid

// ── Grid initialisation ──────────────────────────────────────────────────────
function resetGrids() {
    mine = []
    atk = []
    for (let r = 0; r < GRID; r++) {
        mine.push([0, 0, 0, 0, 0, 0, 0])
        atk.push([0, 0, 0, 0, 0, 0, 0])
    }
}

// ── Drawing ──────────────────────────────────────────────────────────────────
function redraw() {
    const bg = scene.backgroundImage()
    bg.fill(C_BG)

    const grid = viewMine ? mine : atk
    const title = viewMine ? "DEFENCE" : "ATTACK"
    bg.printCenter(title, 3, 15)

    for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
            const v = grid[r][c]
            let col = C_GRID
            if (v === 1) col = viewMine ? C_SHIP : C_GRID
            else if (v === 2) col = C_MISS
            else if (v === 3) col = C_HIT
            else if (v === 4) col = C_SUNK
            bg.fillRect(OX + c * STEP, OY + r * STEP, CELL, CELL, col)
        }
    }

    if (phase === Phase.SETUP) drawPlacement(bg)
    if ((phase === Phase.MY_TURN || phase === Phase.SETUP) && !viewMine) drawCursor(bg)
    drawStatus(bg)
}

function drawCursor(bg: Image) {
    bg.drawRect(OX + cx * STEP - 1, OY + cy * STEP - 1, CELL + 2, CELL + 2, C_CURSOR)
}

function drawPlacement(bg: Image) {
    if (shipIdx >= SHIPS.length) return
    const size = SHIPS[shipIdx]
    const ok = canPlace(cx, cy, size, horiz)
    for (let i = 0; i < size; i++) {
        const sc = cx + (horiz ? i : 0)
        const sr = cy + (horiz ? 0 : i)
        if (sc < GRID && sr < GRID)
            bg.fillRect(OX + sc * STEP, OY + sr * STEP, CELL, CELL, ok ? C_SHIP : C_HIT)
    }
}

function drawStatus(bg: Image) {
    const sy = OY + GRID * STEP + 3
    if (phase === Phase.SETUP) {
        bg.print("Ship " + (shipIdx + 1) + "/4 sz:" + SHIPS[shipIdx], 4, sy, 15)
        bg.print("A=place  B=rotate", 4, sy + 9, 11)
    } else if (phase === Phase.WAITING) {
        bg.printCenter("Waiting...", sy + 4, 11)
    } else if (phase === Phase.MY_TURN) {
        bg.print("Your turn   B=view", 4, sy, 5)
    } else if (phase === Phase.PENDING) {
        bg.print("Waiting...  B=view", 4, sy, 5)
    } else if (phase === Phase.ENEMY_TURN) {
        bg.print("Enemy turn  B=view", 4, sy, 2)
    }
}

// ── Ship placement ───────────────────────────────────────────────────────────
function canPlace(x: number, y: number, size: number, h: boolean): boolean {
    for (let i = 0; i < size; i++) {
        const sc = x + (h ? i : 0)
        const sr = y + (h ? 0 : i)
        if (sc >= GRID || sr >= GRID || mine[sr][sc] !== 0) return false
    }
    return true
}

function doPlace() {
    const size = SHIPS[shipIdx]
    if (!canPlace(cx, cy, size, horiz)) return
    for (let i = 0; i < size; i++) {
        const sc = cx + (horiz ? i : 0)
        const sr = cy + (horiz ? 0 : i)
        mine[sr][sc] = 1
    }
    shipIdx++
    if (shipIdx >= SHIPS.length) readyUp()
    redraw()
}

// ── Sync / turn order ────────────────────────────────────────────────────────
function readyUp() {
    mySerial = control.deviceSerialNumber()
    phase = Phase.WAITING
    iSentReady = true
    radio.sendString("READY:" + mySerial)
    if (theyAreReady) decide()
    else redraw()
}

function decide() {
    // Tiebreak by serial number; if somehow equal, whoever sent first goes first.
    const iGoFirst = mySerial !== theirSerial ? mySerial > theirSerial : iSentReady && !theyAreReady
    startBattle(iGoFirst)
}

function startBattle(first: boolean) {
    phase = first ? Phase.MY_TURN : Phase.ENEMY_TURN
    viewMine = false
    redraw()
    game.splash(first ? "You go first!" : "They go first!", "Good luck!")
    redraw()
}

// ── Radio ────────────────────────────────────────────────────────────────────
radio.setGroup(42)

radio.onReceivedString(function (msg: string) {
    if (msg.length >= 6 && msg.substr(0, 6) === "READY:") {
        theirSerial = parseInt(msg.substr(6))
        theyAreReady = true
        if (iSentReady) decide()

    } else if (msg.length >= 5 && msg.substr(0, 5) === "FIRE:") {
        const parts = msg.substr(5).split(",")
        incomingShot(parseInt(parts[0]), parseInt(parts[1]))

    } else if (msg === "HIT" || msg === "SUNK") {
        atk[fireY][fireX] = 3
        hitCount++
        if (hitCount >= TOTAL_CELLS) {
            phase = Phase.DONE
            game.over(true, effects.confetti)
        } else {
            phase = Phase.ENEMY_TURN
            redraw()
        }

    } else if (msg === "MISS") {
        atk[fireY][fireX] = 2
        phase = Phase.ENEMY_TURN
        redraw()
    }
})

function incomingShot(x: number, y: number) {
    let response = "MISS"
    if (mine[y][x] === 1) {
        mine[y][x] = 3
        if (shipSunk(x, y)) {
            markSunk(x, y)
            response = "SUNK"
            const totalHit = countVal(mine, 3) + countVal(mine, 4)
            if (totalHit >= TOTAL_CELLS) {
                radio.sendString(response)
                phase = Phase.DONE
                redraw()
                game.over(false)
                return
            }
        } else {
            response = "HIT"
        }
    } else {
        mine[y][x] = 2
    }
    radio.sendString(response)
    phase = Phase.MY_TURN
    redraw()
}

function countVal(grid: number[][], val: number): number {
    let n = 0
    for (let r = 0; r < GRID; r++)
        for (let c = 0; c < GRID; c++)
            if (grid[r][c] === val) n++
    return n
}

// Returns true if the ship occupying (x,y) has all its cells hit (value 3).
function shipSunk(x: number, y: number): boolean {
    let lx = x; while (lx > 0 && (mine[y][lx - 1] === 1 || mine[y][lx - 1] === 3)) lx--
    let rx = x; while (rx < GRID - 1 && (mine[y][rx + 1] === 1 || mine[y][rx + 1] === 3)) rx++
    if (rx > lx) {
        for (let i = lx; i <= rx; i++) if (mine[y][i] !== 3) return false
        return true
    }
    let ty = y; while (ty > 0 && (mine[ty - 1][x] === 1 || mine[ty - 1][x] === 3)) ty--
    let by = y; while (by < GRID - 1 && (mine[by + 1][x] === 1 || mine[by + 1][x] === 3)) by++
    for (let i = ty; i <= by; i++) if (mine[i][x] !== 3) return false
    return true
}

// Changes all hit (3) cells of the ship at (x,y) to sunk (4).
function markSunk(x: number, y: number) {
    let lx = x; while (lx > 0 && (mine[y][lx - 1] === 3 || mine[y][lx - 1] === 4)) lx--
    let rx = x; while (rx < GRID - 1 && (mine[y][rx + 1] === 3 || mine[y][rx + 1] === 4)) rx++
    if (rx > lx) { for (let i = lx; i <= rx; i++) mine[y][i] = 4; return }
    let ty = y; while (ty > 0 && (mine[ty - 1][x] === 3 || mine[ty - 1][x] === 4)) ty--
    let by = y; while (by < GRID - 1 && (mine[by + 1][x] === 3 || mine[by + 1][x] === 4)) by++
    for (let i = ty; i <= by; i++) mine[i][x] = 4
}

// ── Controls ─────────────────────────────────────────────────────────────────
controller.left.onEvent(ControllerButtonEvent.Pressed, function () {
    if (cx > 0) { cx--; redraw() }
})
controller.right.onEvent(ControllerButtonEvent.Pressed, function () {
    if (cx < GRID - 1) { cx++; redraw() }
})
controller.up.onEvent(ControllerButtonEvent.Pressed, function () {
    if (cy > 0) { cy--; redraw() }
})
controller.down.onEvent(ControllerButtonEvent.Pressed, function () {
    if (cy < GRID - 1) { cy++; redraw() }
})

controller.A.onEvent(ControllerButtonEvent.Pressed, function () {
    if (phase === Phase.SETUP) {
        doPlace()
    } else if (phase === Phase.MY_TURN && !viewMine) {
        if (atk[cy][cx] === 0) {
            fireX = cx
            fireY = cy
            radio.sendString("FIRE:" + cx + "," + cy)
            phase = Phase.PENDING
            redraw()
        }
    }
})

controller.B.onEvent(ControllerButtonEvent.Pressed, function () {
    if (phase === Phase.SETUP) {
        horiz = !horiz
        redraw()
    } else if (phase !== Phase.DONE) {
        viewMine = !viewMine
        redraw()
    }
})

// ── Boot ─────────────────────────────────────────────────────────────────────
game.splash("BATTLESHIPS", "Place your fleet!")
resetGrids()
phase = Phase.SETUP
shipIdx = 0
cx = 0
cy = 0
horiz = true
iSentReady = false
theyAreReady = false
hitCount = 0
redraw()
