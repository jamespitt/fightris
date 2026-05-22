//  Battleships — MakeCode Arcade, two players via radio
//  7×7 grid, ships: 2, 2, 3, 3
//  ── Constants ────────────────────────────────────────────────────────────────
let GRID = 7
let CELL = 12
let STEP = CELL + 1
//  13px per cell (1px gap)
let OX = 35
//  grid origin x  (centres 91px grid on 160px screen)
let OY = 10
//  grid origin y
let C_GRID = 13
//  dark navy  — empty water
let C_SHIP = 6
//  green      — your ship (defence view)
let C_HIT = 2
//  red        — hit
let C_MISS = 1
//  white      — miss
let C_SUNK = 4
//  orange     — sunk ship
let C_CURSOR = 5
//  yellow     — cursor outline
let C_BG = 15
//  black      — background
let SHIPS = [2, 2, 3, 3]
let TOTAL_CELLS = 10
//  2+2+3+3
//  ── State ────────────────────────────────────────────────────────────────────
class Phase {
    static SETUP: number
    private ___SETUP_is_set: boolean
    private ___SETUP: number
    get SETUP(): number {
        return this.___SETUP_is_set ? this.___SETUP : Phase.SETUP
    }
    set SETUP(value: number) {
        this.___SETUP_is_set = true
        this.___SETUP = value
    }
    
    static WAITING: number
    private ___WAITING_is_set: boolean
    private ___WAITING: number
    get WAITING(): number {
        return this.___WAITING_is_set ? this.___WAITING : Phase.WAITING
    }
    set WAITING(value: number) {
        this.___WAITING_is_set = true
        this.___WAITING = value
    }
    
    static MY_TURN: number
    private ___MY_TURN_is_set: boolean
    private ___MY_TURN: number
    get MY_TURN(): number {
        return this.___MY_TURN_is_set ? this.___MY_TURN : Phase.MY_TURN
    }
    set MY_TURN(value: number) {
        this.___MY_TURN_is_set = true
        this.___MY_TURN = value
    }
    
    static PENDING: number
    private ___PENDING_is_set: boolean
    private ___PENDING: number
    get PENDING(): number {
        return this.___PENDING_is_set ? this.___PENDING : Phase.PENDING
    }
    set PENDING(value: number) {
        this.___PENDING_is_set = true
        this.___PENDING = value
    }
    
    static ENEMY_TURN: number
    private ___ENEMY_TURN_is_set: boolean
    private ___ENEMY_TURN: number
    get ENEMY_TURN(): number {
        return this.___ENEMY_TURN_is_set ? this.___ENEMY_TURN : Phase.ENEMY_TURN
    }
    set ENEMY_TURN(value: number) {
        this.___ENEMY_TURN_is_set = true
        this.___ENEMY_TURN = value
    }
    
    static DONE: number
    private ___DONE_is_set: boolean
    private ___DONE: number
    get DONE(): number {
        return this.___DONE_is_set ? this.___DONE : Phase.DONE
    }
    set DONE(value: number) {
        this.___DONE_is_set = true
        this.___DONE = value
    }
    
    public static __initPhase() {
        Phase.SETUP = 0
        Phase.WAITING = 1
        Phase.MY_TURN = 2
        Phase.PENDING = 3
        Phase.ENEMY_TURN = 4
        Phase.DONE = 5
    }
    
}

Phase.__initPhase()

let phase = Phase.SETUP
let viewMine = false
//  false = attack grid, true = my defence grid
//  Grids: 0=water 1=ship 2=miss 3=hit 4=sunk
let mine : number[][] = []
//  my board — ships + incoming shots
let atk : number[][] = []
//  my shots at the enemy
let shipIdx = 0
//  which ship we are currently placing (0–3)
let cx = 0
//  cursor column
let cy = 0
//  cursor row
let horiz = true
//  ship orientation during placement
let fireX = 0
//  position of the last shot fired
let fireY = 0
let mySerial = 0
let theirSerial = 0
let iSentReady = false
let theyAreReady = false
let hitCount = 0
//  cells I have hit on the enemy grid
//  ── Grid initialisation ──────────────────────────────────────────────────────
function resetGrids() {
    
    mine = []
    atk = []
    for (let r = 0; r < GRID; r++) {
        mine.push([0, 0, 0, 0, 0, 0, 0])
        atk.push([0, 0, 0, 0, 0, 0, 0])
    }
}

//  ── Drawing ──────────────────────────────────────────────────────────────────
function redraw() {
    let v: any;
    let col: number;
    
    let bg = scene.backgroundImage()
    bg.fill(C_BG)
    let grid = (phase == Phase.SETUP || viewMine) ? mine : atk
    let title = phase == Phase.SETUP ? "MY FLEET" : (viewMine ? "DEFENCE" : "ATTACK")
    bg.printCenter(title, 3, 15)
    for (let s = 0; s < GRID; s++) {
        for (let c = 0; c < GRID; c++) {
            v = grid[s][c]
            col = C_GRID
            if (v == 1) {
                col = (phase == Phase.SETUP || viewMine) ? C_SHIP : C_GRID
            } else if (v == 2) {
                col = C_MISS
            } else if (v == 3) {
                col = C_HIT
            } else if (v == 4) {
                col = C_SUNK
            }
            
            bg.fillRect(OX + c * STEP, OY + s * STEP, CELL, CELL, col)
        }
    }
    if (phase == Phase.MY_TURN || phase == Phase.PENDING || phase == Phase.ENEMY_TURN) {
        let borderCol = phase == Phase.MY_TURN ? 7 : (phase == Phase.PENDING ? 5 : 2)
        bg.drawRect(OX - 2, OY - 2, GRID * STEP + 3, GRID * STEP + 3, borderCol)
        bg.drawRect(OX - 1, OY - 1, GRID * STEP + 1, GRID * STEP + 1, borderCol)
    }

    if (phase == Phase.SETUP) {
        drawPlacement(bg)
    }

    if (phase == Phase.SETUP || (phase == Phase.MY_TURN && !viewMine)) {
        drawCursor(bg)
    }
    
    drawStatus(bg)
}

function drawCursor(bg2: Image) {
    bg2.drawRect(OX + cx * STEP - 1, OY + cy * STEP - 1, CELL + 2, CELL + 2, C_CURSOR)
}

function drawPlacement(bg3: Image) {
    let sc: number;
    let sr: number;
    if (shipIdx >= SHIPS.length) {
        return
    }
    
    let size = SHIPS[shipIdx]
    let ok = canPlace(cx, cy, size, horiz)
    for (let i = 0; i < size; i++) {
        sc = cx + (horiz ? i : 0)
        sr = cy + (horiz ? 0 : i)
        if (sc < GRID && sr < GRID) {
            bg3.fillRect(OX + sc * STEP, OY + sr * STEP, CELL, CELL, ok ? C_SHIP : C_HIT)
        }
        
    }
}

function drawStatus(bg4: Image) {
    let sy = OY + GRID * STEP + 3
    if (phase == Phase.SETUP) {
        bg4.print("Ship " + ("" + (shipIdx + 1)) + "/4 sz:" + ("" + SHIPS[shipIdx]), 4, sy, 15)
        bg4.print("A=place  B=rotate", 4, sy + 9, 11)
    } else if (phase == Phase.WAITING) {
        bg4.printCenter("Waiting...", sy + 4, 11)
    } else if (phase == Phase.MY_TURN) {
        bg4.print("Your turn   B=view", 4, sy, 5)
    } else if (phase == Phase.PENDING) {
        bg4.print("Waiting...  B=view", 4, sy, 5)
    } else if (phase == Phase.ENEMY_TURN) {
        bg4.print("Enemy turn  B=view", 4, sy, 2)
    }
    
}

//  ── Ship placement ───────────────────────────────────────────────────────────
function canPlace(x: number, y: number, size2: number, h: boolean): boolean {
    let sc2: number;
    let sr2: number;
    for (let j = 0; j < size2; j++) {
        sc2 = x + (h ? j : 0)
        sr2 = y + (h ? 0 : j)
        if (sc2 >= GRID || sr2 >= GRID || mine[sr2][sc2] != 0) {
            return false
        }
        
    }
    return true
}

function doPlace() {
    let sc3: number;
    let sr3: number;
    
    let size3 = SHIPS[shipIdx]
    if (!canPlace(cx, cy, size3, horiz)) {
        return
    }
    
    for (let k = 0; k < size3; k++) {
        sc3 = cx + (horiz ? k : 0)
        sr3 = cy + (horiz ? 0 : k)
        mine[sr3][sc3] = 1
    }
    soundPlace()
    shipIdx += 1
    if (shipIdx >= SHIPS.length) {
        readyUp()
    }
    
    redraw()
}

//  ── Sync / turn order ────────────────────────────────────────────────────────
function readyUp() {
    
    mySerial = control.deviceSerialNumber()
    phase = Phase.WAITING
    iSentReady = true
    radio.sendString("READY:" + ("" + mySerial))
    if (theyAreReady) {
        decide()
    } else {
        redraw()
    }
    
}

function decide() {
    
    //  Tiebreak by serial number; if somehow equal, whoever sent first goes first.
    let iGoFirst = mySerial != theirSerial ? mySerial > theirSerial : iSentReady && !theyAreReady
    startBattle(iGoFirst)
}

function startBattle(first: boolean) {
    
    phase = first ? Phase.MY_TURN : Phase.ENEMY_TURN
    viewMine = false
    redraw()
    game.splash(first ? "You go first!" : "They go first!", "Good luck!")
    redraw()
}

//  ── Radio ────────────────────────────────────────────────────────────────────
radio.setGroup(42)
radio.onReceivedString(function my_function(msg: string) {
    let parts: string[];
    
    if (msg.length >= 6 && msg.substr(0, 6) == "READY:") {
        theirSerial = parseInt(msg.substr(6))
        theyAreReady = true
        if (iSentReady) {
            decide()
        }
        
    } else if (msg.length >= 5 && msg.substr(0, 5) == "FIRE:") {
        parts = msg.substr(5).split(",")
        incomingShot(parseInt(parts[0]), parseInt(parts[1]))
    } else if (msg == "HIT" || msg == "SUNK") {
        if (phase != Phase.PENDING) return
        atk[fireY][fireX] = 3
        hitCount += 1
        if (hitCount >= TOTAL_CELLS) {
            soundWin()
            phase = Phase.DONE
            game.over(true)
        } else {
            if (msg == "SUNK") { soundSunk() } else { soundHit() }
            phase = Phase.ENEMY_TURN
            redraw()
        }

    } else if (msg == "MISS") {
        if (phase != Phase.PENDING) return
        soundMiss()
        atk[fireY][fireX] = 2
        phase = Phase.ENEMY_TURN
        redraw()
    }
    
})
game.onUpdateInterval(2000, function () {
    if (phase == Phase.PENDING) {
        radio.sendString("FIRE:" + fireX + "," + fireY)
    }
})

function incomingShot(x2: number, y2: number) {
    let totalHit: any;
    // Duplicate FIRE (retry): resend the original response without reprocessing
    let existing = mine[y2][x2]
    if (existing == 2) { radio.sendString("MISS"); return }
    if (existing == 3) { radio.sendString("HIT"); return }
    if (existing == 4) { radio.sendString("SUNK"); return }

    let response = "MISS"
    if (mine[y2][x2] == 1) {
        mine[y2][x2] = 3
        if (shipSunk(x2, y2)) {
            markSunk(x2, y2)
            response = "SUNK"
            totalHit = countVal(mine, 3) + countVal(mine, 4)
            if (totalHit >= TOTAL_CELLS) {
                radio.sendString(response)
                soundLose()
                phase = Phase.DONE
                redraw()
                game.over(false)
                return
            }
            soundSunk()
        } else {
            soundHit()
            response = "HIT"
        }

    } else {
        soundMiss()
        mine[y2][x2] = 2
    }
    
    radio.sendString(response)
    phase = Phase.MY_TURN
    redraw()
}

function countVal(grid2: number[][], val: number): number {
    let n = 0
    for (let t = 0; t < GRID; t++) {
        for (let d = 0; d < GRID; d++) {
            if (grid2[t][d] == val) {
                n += 1
            }
            
        }
    }
    return n
}

//  Returns true if the ship occupying (x,y) has all its cells hit (value 3).
function shipSunk(x3: number, y3: number): boolean {
    let l: number;
    let lx = x3
    while (lx > 0 && (mine[y3][lx - 1] == 1 || mine[y3][lx - 1] == 3)) {
        lx -= 1
    }
    let rx = x3
    while (rx < GRID - 1 && (mine[y3][rx + 1] == 1 || mine[y3][rx + 1] == 3)) {
        rx += 1
    }
    if (rx > lx) {
        l = lx
        while (l <= rx) {
            if (mine[y3][l] != 3) {
                return false
            }
            
            l += 1
        }
        return true
    }
    
    let ty = y3
    while (ty > 0 && (mine[ty - 1][x3] == 1 || mine[ty - 1][x3] == 3)) {
        ty -= 1
    }
    let by = y3
    while (by < GRID - 1 && (mine[by + 1][x3] == 1 || mine[by + 1][x3] == 3)) {
        by += 1
    }
    let m = ty
    while (m <= by) {
        if (mine[m][x3] != 3) {
            return false
        }
        
        m += 1
    }
    return true
}

//  Changes all hit (3) cells of the ship at (x,y) to sunk (4).
function markSunk(x4: number, y4: number) {
    let o: number;
    let lx2 = x4
    while (lx2 > 0 && (mine[y4][lx2 - 1] == 3 || mine[y4][lx2 - 1] == 4)) {
        lx2 -= 1
    }
    let rx2 = x4
    while (rx2 < GRID - 1 && (mine[y4][rx2 + 1] == 3 || mine[y4][rx2 + 1] == 4)) {
        rx2 += 1
    }
    if (rx2 > lx2) {
        o = lx2
        while (o <= rx2) {
            mine[y4][o] = 4
            o += 1
        }
        return
    }
    
    let ty2 = y4
    while (ty2 > 0 && (mine[ty2 - 1][x4] == 3 || mine[ty2 - 1][x4] == 4)) {
        ty2 -= 1
    }
    let by2 = y4
    while (by2 < GRID - 1 && (mine[by2 + 1][x4] == 3 || mine[by2 + 1][x4] == 4)) {
        by2 += 1
    }
    let p = ty2
    while (p <= by2) {
        mine[p][x4] = 4
        p += 1
    }
}

//  ── Sounds ───────────────────────────────────────────────────────────────────
function soundPlace() {
    music.playTone(523, 80)
}

function soundFire() {
    control.runInBackground(function () {
        music.playTone(880, 50)
        music.playTone(660, 50)
        music.playTone(440, 80)
    })
}

function soundHit() {
    control.runInBackground(function () {
        music.playTone(220, 100)
        music.playTone(165, 160)
    })
}

function soundMiss() {
    music.playTone(196, 200)
}

function soundSunk() {
    control.runInBackground(function () {
        music.playTone(262, 70)
        music.playTone(330, 70)
        music.playTone(392, 70)
        music.playTone(523, 220)
    })
}

function soundWin() {
    control.runInBackground(function () {
        music.playTone(523, 100)
        music.playTone(659, 100)
        music.playTone(784, 100)
        music.playTone(1047, 350)
    })
}

function soundLose() {
    control.runInBackground(function () {
        music.playTone(392, 150)
        music.playTone(330, 150)
        music.playTone(262, 200)
        music.playTone(196, 350)
    })
}

//  ── Controls ─────────────────────────────────────────────────────────────────
controller.left.onEvent(ControllerButtonEvent.Pressed, function on_left_pressed() {
    
    if (cx > 0) {
        cx -= 1
        redraw()
    }
    
})
controller.right.onEvent(ControllerButtonEvent.Pressed, function on_right_pressed() {
    
    if (cx < GRID - 1) {
        cx += 1
        redraw()
    }
    
})
controller.up.onEvent(ControllerButtonEvent.Pressed, function on_up_pressed() {
    
    if (cy > 0) {
        cy -= 1
        redraw()
    }
    
})
controller.down.onEvent(ControllerButtonEvent.Pressed, function on_down_pressed() {
    
    if (cy < GRID - 1) {
        cy += 1
        redraw()
    }
    
})
controller.A.onEvent(ControllerButtonEvent.Pressed, function on_a_pressed() {
    
    if (phase == Phase.SETUP) {
        doPlace()
    } else if (phase == Phase.MY_TURN && !viewMine) {
        if (atk[cy][cx] == 0) {
            fireX = cx
            fireY = cy
            soundFire()
            radio.sendString("FIRE:" + ("" + cx) + "," + ("" + cy))
            phase = Phase.PENDING
            redraw()
        }
        
    }
    
})
controller.B.onEvent(ControllerButtonEvent.Pressed, function on_b_pressed() {
    
    if (phase == Phase.SETUP) {
        horiz = !horiz
        redraw()
    } else if (phase != Phase.DONE) {
        viewMine = !viewMine
        redraw()
    }
    
})
//  ── Boot ─────────────────────────────────────────────────────────────────────
resetGrids()
phase = Phase.SETUP
shipIdx = 0
cx = 0
cy = 0
horiz = true
iSentReady = false
theyAreReady = false
hitCount = 0
game.splash("BATTLESHIPS", "Place your fleet!")
redraw()
