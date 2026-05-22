# Battleships — MakeCode Arcade, two players via radio
# 7×7 grid, ships: 2, 2, 3, 3
# ── Constants ────────────────────────────────────────────────────────────────
GRID = 7
CELL = 12
STEP = CELL + 1
# 13px per cell (1px gap)
OX = 35
# grid origin x  (centres 91px grid on 160px screen)
OY = 14
# grid origin y
C_GRID = 13
# dark navy  — empty water
C_SHIP = 6
# green      — your ship (defence view)
C_HIT = 2
# red        — hit
C_MISS = 1
# white      — miss
C_SUNK = 4
# orange     — sunk ship
C_CURSOR = 5
# yellow     — cursor outline
C_BG = 15
# black      — background
SHIPS = [2, 2, 3, 3]
TOTAL_CELLS = 10
# 2+2+3+3
# ── State ────────────────────────────────────────────────────────────────────
class Phase(Enum):
    SETUP = 0
    WAITING = 1
    MY_TURN = 2
    PENDING = 3
    ENEMY_TURN = 4
    DONE = 5
phase = Phase.SETUP
viewMine = False
# false = attack grid, true = my defence grid
# Grids: 0=water 1=ship 2=miss 3=hit 4=sunk
mine: List[List[number]] = []
# my board — ships + incoming shots
atk: List[List[number]] = []
# my shots at the enemy
shipIdx = 0
# which ship we are currently placing (0–3)
cx = 0
# cursor column
cy = 0
# cursor row
horiz = True
# ship orientation during placement
fireX = 0
# position of the last shot fired
fireY = 0
mySerial = 0
theirSerial = 0
iSentReady = False
theyAreReady = False
hitCount = 0
# cells I have hit on the enemy grid
# ── Grid initialisation ──────────────────────────────────────────────────────
def resetGrids():
    global mine, atk
    mine = []
    atk = []
    for r in range(GRID):
        mine.append([0, 0, 0, 0, 0, 0, 0])
        atk.append([0, 0, 0, 0, 0, 0, 0])
# ── Drawing ──────────────────────────────────────────────────────────────────
def redraw():
    global viewMine
    bg = scene.background_image()
    bg.fill(C_BG)
    grid = mine if viewMine else atk
    title = "DEFENCE" if viewMine else "ATTACK"
    bg.print_center(title, 3, 15)
    for s in range(GRID):
        for c in range(GRID):
            v = grid[s][c]
            col = C_GRID
            if v == 1:
                col = C_SHIP if viewMine else C_GRID
            elif v == 2:
                col = C_MISS
            elif v == 3:
                col = C_HIT
            elif v == 4:
                col = C_SUNK
            bg.fill_rect(OX + c * STEP, OY + s * STEP, CELL, CELL, col)
    if phase == Phase.SETUP:
        drawPlacement(bg)
    if (phase == Phase.MY_TURN or phase == Phase.SETUP) and not viewMine:
        drawCursor(bg)
    drawStatus(bg)
def drawCursor(bg2: Image):
    bg2.draw_rect(OX + cx * STEP - 1,
        OY + cy * STEP - 1,
        CELL + 2,
        CELL + 2,
        C_CURSOR)
def drawPlacement(bg3: Image):
    if shipIdx >= len(SHIPS):
        return
    size = SHIPS[shipIdx]
    ok = canPlace(cx, cy, size, horiz)
    for i in range(size):
        sc = cx + (i if horiz else 0)
        sr = cy + (0 if horiz else i)
        if sc < GRID and sr < GRID:
            bg3.fill_rect(OX + sc * STEP,
                OY + sr * STEP,
                CELL,
                CELL,
                C_SHIP if ok else C_HIT)
def drawStatus(bg4: Image):
    sy = OY + GRID * STEP + 3
    if phase == Phase.SETUP:
        bg4.print("Ship " + str((shipIdx + 1)) + "/4 sz:" + str(SHIPS[shipIdx]),
            4,
            sy,
            15)
        bg4.print("A=place  B=rotate", 4, sy + 9, 11)
    elif phase == Phase.WAITING:
        bg4.print_center("Waiting...", sy + 4, 11)
    elif phase == Phase.MY_TURN:
        bg4.print("Your turn   B=view", 4, sy, 5)
    elif phase == Phase.PENDING:
        bg4.print("Waiting...  B=view", 4, sy, 5)
    elif phase == Phase.ENEMY_TURN:
        bg4.print("Enemy turn  B=view", 4, sy, 2)
# ── Ship placement ───────────────────────────────────────────────────────────
def canPlace(x: number, y: number, size2: number, h: bool):
    for j in range(size2):
        sc2 = x + (j if h else 0)
        sr2 = y + (0 if h else j)
        if sc2 >= GRID or sr2 >= GRID or mine[sr2][sc2] != 0:
            return False
    return True
def doPlace():
    global shipIdx
    size3 = SHIPS[shipIdx]
    if not canPlace(cx, cy, size3, horiz):
        return
    for k in range(size3):
        sc3 = cx + (k if horiz else 0)
        sr3 = cy + (0 if horiz else k)
        mine[sr3][sc3] = 1
    shipIdx += 1
    if shipIdx >= len(SHIPS):
        readyUp()
    redraw()
# ── Sync / turn order ────────────────────────────────────────────────────────
def readyUp():
    global mySerial, phase, iSentReady
    mySerial = control.device_serial_number()
    phase = Phase.WAITING
    iSentReady = True
    radio.sendString("READY:" + str(mySerial))
    if theyAreReady:
        decide()
    else:
        redraw()
def decide():
    global theyAreReady
    # Tiebreak by serial number; if somehow equal, whoever sent first goes first.
    iGoFirst = mySerial > theirSerial if mySerial != theirSerial else iSentReady and not theyAreReady
    startBattle(iGoFirst)
def startBattle(first: bool):
    global phase, viewMine
    phase = Phase.MY_TURN if first else Phase.ENEMY_TURN
    viewMine = False
    redraw()
    game.splash("You go first!" if first else "They go first!", "Good luck!")
    redraw()
# ── Radio ────────────────────────────────────────────────────────────────────
radio.setGroup(42)

def my_function(msg: str):
    global theirSerial, theyAreReady, hitCount, phase
    if len(msg) >= 6 and msg.substr(0, 6) == "READY:":
        theirSerial = int(msg.substr(6))
        theyAreReady = True
        if iSentReady:
            decide()
    elif len(msg) >= 5 and msg.substr(0, 5) == "FIRE:":
        parts = msg.substr(5).split(",")
        incomingShot(int(parts[0]), int(parts[1]))
    elif msg == "HIT" or msg == "SUNK":
        atk[fireY][fireX] = 3
        hitCount += 1
        if hitCount >= TOTAL_CELLS:
            phase = Phase.DONE
            game.over(True, effects.confetti)
        else:
            phase = Phase.ENEMY_TURN
            redraw()
    elif msg == "MISS":
        atk[fireY][fireX] = 2
        phase = Phase.ENEMY_TURN
        redraw()
radio.onReceivedString(my_function)

def incomingShot(x2: number, y2: number):
    global phase
    response = "MISS"
    if mine[y2][x2] == 1:
        mine[y2][x2] = 3
        if shipSunk(x2, y2):
            markSunk(x2, y2)
            response = "SUNK"
            totalHit = countVal(mine, 3) + countVal(mine, 4)
            if totalHit >= TOTAL_CELLS:
                radio.sendString(response)
                phase = Phase.DONE
                redraw()
                game.over(False)
                return
        else:
            response = "HIT"
    else:
        mine[y2][x2] = 2
    radio.sendString(response)
    phase = Phase.MY_TURN
    redraw()
def countVal(grid2: List[List[number]], val: number):
    n = 0
    for t in range(GRID):
        for d in range(GRID):
            if grid2[t][d] == val:
                n += 1
    return n
# Returns true if the ship occupying (x,y) has all its cells hit (value 3).
def shipSunk(x3: number, y3: number):
    lx = x3
    while lx > 0 and (mine[y3][lx - 1] == 1 or mine[y3][lx - 1] == 3):
        lx -= 1
    rx = x3
    while rx < GRID - 1 and (mine[y3][rx + 1] == 1 or mine[y3][rx + 1] == 3):
        rx += 1
    if rx > lx:
        l = lx
        while l <= rx:
            if mine[y3][l] != 3:
                return False
            l += 1
        return True
    ty = y3
    while ty > 0 and (mine[ty - 1][x3] == 1 or mine[ty - 1][x3] == 3):
        ty -= 1
    by = y3
    while by < GRID - 1 and (mine[by + 1][x3] == 1 or mine[by + 1][x3] == 3):
        by += 1
    m = ty
    while m <= by:
        if mine[m][x3] != 3:
            return False
        m += 1
    return True
# Changes all hit (3) cells of the ship at (x,y) to sunk (4).
def markSunk(x4: number, y4: number):
    lx2 = x4
    while lx2 > 0 and (mine[y4][lx2 - 1] == 3 or mine[y4][lx2 - 1] == 4):
        lx2 -= 1
    rx2 = x4
    while rx2 < GRID - 1 and (mine[y4][rx2 + 1] == 3 or mine[y4][rx2 + 1] == 4):
        rx2 += 1
    if rx2 > lx2:
        o = lx2
        while o <= rx2:
            mine[y4][o] = 4
            o += 1
        return
    ty2 = y4
    while ty2 > 0 and (mine[ty2 - 1][x4] == 3 or mine[ty2 - 1][x4] == 4):
        ty2 -= 1
    by2 = y4
    while by2 < GRID - 1 and (mine[by2 + 1][x4] == 3 or mine[by2 + 1][x4] == 4):
        by2 += 1
    p = ty2
    while p <= by2:
        mine[p][x4] = 4
        p += 1
# ── Controls ─────────────────────────────────────────────────────────────────

def on_left_pressed():
    global cx
    if cx > 0:
        cx -= 1
        redraw()
controller.left.on_event(ControllerButtonEvent.PRESSED, on_left_pressed)

def on_right_pressed():
    global cx
    if cx < GRID - 1:
        cx += 1
        redraw()
controller.right.on_event(ControllerButtonEvent.PRESSED, on_right_pressed)

def on_up_pressed():
    global cy
    if cy > 0:
        cy -= 1
        redraw()
controller.up.on_event(ControllerButtonEvent.PRESSED, on_up_pressed)

def on_down_pressed():
    global cy
    if cy < GRID - 1:
        cy += 1
        redraw()
controller.down.on_event(ControllerButtonEvent.PRESSED, on_down_pressed)

def on_a_pressed():
    global viewMine, fireX, fireY, phase
    if phase == Phase.SETUP:
        doPlace()
    elif phase == Phase.MY_TURN and not viewMine:
        if atk[cy][cx] == 0:
            fireX = cx
            fireY = cy
            radio.sendString("FIRE:" + str(cx) + "," + str(cy))
            phase = Phase.PENDING
            redraw()
controller.A.on_event(ControllerButtonEvent.PRESSED, on_a_pressed)

def on_b_pressed():
    global horiz, viewMine
    if phase == Phase.SETUP:
        horiz = not horiz
        redraw()
    elif phase != Phase.DONE:
        viewMine = not viewMine
        redraw()
controller.B.on_event(ControllerButtonEvent.PRESSED, on_b_pressed)

# ── Boot ─────────────────────────────────────────────────────────────────────
game.splash("BATTLESHIPS", "Place your fleet!")
resetGrids()
phase = Phase.SETUP
shipIdx = 0
cx = 0
cy = 0
horiz = True
iSentReady = False
theyAreReady = False
hitCount = 0
redraw()