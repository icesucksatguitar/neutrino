"""
New York City Skyline at Night - Animated ASCII Art Simulation
Target: 120 columns x 40 rows, 10-15 FPS
Double-buffered terminal animation with ANSI truecolor / 256 colors.
Exit with 'q' or Ctrl+C.
"""

import sys
import time
import math
import random
import os
import signal

COLS = 120
ROWS = 40

# ANSI Escape Sequences
CLEAR_SCREEN = "\033[H\033[2J"
CURSOR_HOME = "\033[H"
HIDE_CURSOR = "\033[?25l"
SHOW_CURSOR = "\033[?25h"
RESET = "\033[0m"

# Color Escapes
COLOR_SKY = "\033[38;2;30;40;60m"
COLOR_STAR = "\033[38;2;254;240;138m\033[1m"
COLOR_MOON = "\033[38;2;253;224;71m\033[1m"
COLOR_SHOOTING = "\033[38;2;255;255;255m\033[1m"
COLOR_CLOUD = "\033[38;2;55;65;85m"
COLOR_BLDG_DARK = "\033[38;2;25;35;50m"
COLOR_BLDG_MID = "\033[38;2;45;55;75m"
COLOR_BLDG_LIGHT = "\033[38;2;80;95;120m"
COLOR_CHRYSLER = "\033[38;2;140;155;180m"
COLOR_ANTENNA = "\033[38;2;90;105;130m"
COLOR_BEACON = "\033[38;2;239;68;68m\033[1m"
COLOR_WINDOW_LIT = "\033[38;2;252;211;77m\033[1m"
COLOR_WINDOW_DIM = "\033[38;2;35;45;65m"
COLOR_WATER = "\033[38;2;2;132;199m"
COLOR_WATER_CREST = "\033[38;2;56;189;248m\033[1m"
COLOR_WATER_REFLECT = "\033[38;2;253;224;71m"
COLOR_FERRY = "\033[38;2;240;240;240m\033[1m"
COLOR_HELI = "\033[38;2;200;215;230m"
COLOR_ROTOR = "\033[38;2;56;189;248m\033[1m"
COLOR_TITLE = "\033[38;2;160;175;195m\033[1m"


class Canvas:
    def __init__(self, cols=COLS, rows=ROWS):
        self.cols = cols
        self.rows = rows
        self.chars = [[" " for _ in range(cols)] for _ in range(rows)]
        self.colors = [[COLOR_SKY for _ in range(cols)] for _ in range(rows)]

    def clear(self):
        for y in range(self.rows):
            for x in range(self.cols):
                self.chars[y][x] = " "
                self.colors[y][x] = COLOR_SKY

    def set_cell(self, x, y, char, color):
        if 0 <= x < self.cols and 0 <= y < self.rows:
            self.chars[y][x] = char
            self.colors[y][x] = color

    def draw_string(self, x, y, text, color):
        for i, ch in enumerate(text):
            self.set_cell(x + i, y, ch, color)

    def render(self):
        """Double buffering: format entire frame into single string and draw once."""
        output = [CURSOR_HOME]
        curr_color = ""
        for y in range(self.rows):
            line = []
            for x in range(self.cols):
                color = self.colors[y][x]
                if color != curr_color:
                    line.append(color)
                    curr_color = color
                line.append(self.chars[y][x])
            output.append("".join(line))
        output.append(RESET)
        sys.stdout.write("\n".join(output))
        sys.stdout.flush()


def generate_stars():
    stars = []
    random.seed(42)
    for i in range(80):
        x = random.randint(0, COLS - 1)
        y = random.randint(0, 22)
        stars.append((x, y, i))
    return stars


STARS = generate_stars()


def draw_sky(canvas, frame):
    """Draw dark sky with scattered twinkling stars, crescent moon, shooting star, and clouds."""
    # Twinkling stars
    for x, y, seed in STARS:
        cycle = (frame + seed * 7) % 40
        if cycle < 10:
            canvas.set_cell(x, y, ".", COLOR_STAR)
        elif cycle < 20:
            canvas.set_cell(x, y, "+", COLOR_STAR)
        elif cycle < 28:
            canvas.set_cell(x, y, "*", COLOR_STAR)

    # Crescent Moon (upper right)
    canvas.draw_string(104, 2, "  .-.  ", COLOR_MOON)
    canvas.draw_string(104, 3, " (   ) ", COLOR_MOON)
    canvas.draw_string(104, 4, "  `-'  ", COLOR_MOON)

    # Occasional shooting star streak
    shooting_cycle = frame % 60
    if shooting_cycle < 8:
        start_x = 20 + ((frame * 13) % 65)
        start_y = 2 + ((frame * 7) % 8)
        sx = start_x + shooting_cycle * 2
        sy = start_y + int(shooting_cycle * 0.8)
        canvas.set_cell(sx - 2, sy - 1, "\\", COLOR_SHOOTING)
        canvas.set_cell(sx - 1, sy, "*", COLOR_SHOOTING)
        canvas.set_cell(sx, sy, "+", COLOR_SHOOTING)

    # Slow-drifting parallax clouds
    c1 = int((frame * 0.15) % (COLS + 25)) - 20
    canvas.draw_string(c1, 4, "  (~~~~)   (~~~~~~)  ", COLOR_CLOUD)

    c2 = int((frame * 0.28) % (COLS + 25)) - 15
    canvas.draw_string(c2, 7, " (~~~~~~~~~~~) ", COLOR_CLOUD)

    c3 = int((frame * 0.1) % (COLS + 25)) - 10
    canvas.draw_string(c3, 10, "    (~~~~~)    ", COLOR_CLOUD)


def draw_buildings(canvas, frame):
    """Draw silhouettes of NYC landmarks and generic towers."""
    beacon_on = (frame % 16) < 8

    # --- STATUE OF LIBERTY (cols 3-10, rows 22-30) ---
    canvas.draw_string(4, 26, " [====] ", COLOR_BLDG_MID)
    canvas.draw_string(3, 27, " /######\\ ", COLOR_BLDG_MID)
    canvas.draw_string(3, 28, " |######| ", COLOR_BLDG_MID)
    canvas.draw_string(2, 29, "[########]", COLOR_BLDG_MID)
    canvas.draw_string(2, 30, "[########]", COLOR_BLDG_MID)
    torch_char = "*" if (frame % 4 < 2) else "^"
    canvas.set_cell(4, 21, torch_char, COLOR_BEACON)
    canvas.draw_string(4, 22, "\\|/  ", COLOR_WINDOW_LIT)
    canvas.draw_string(4, 23, " 0   ", COLOR_BLDG_LIGHT)
    canvas.draw_string(3, 24, " /|\\ ", COLOR_BLDG_LIGHT)
    canvas.draw_string(3, 25, " / \\ ", COLOR_BLDG_LIGHT)

    # --- ONE WORLD TRADE CENTER (cols 14-25, rows 3-30) ---
    canvas.set_cell(19, 3, "*" if beacon_on else "|", COLOR_BEACON if beacon_on else COLOR_ANTENNA)
    canvas.draw_string(19, 4, "|", COLOR_ANTENNA)
    canvas.draw_string(19, 5, "|", COLOR_ANTENNA)
    canvas.draw_string(18, 6, "/|\\", COLOR_ANTENNA)
    canvas.draw_string(18, 7, "/|\\", COLOR_ANTENNA)
    canvas.draw_string(18, 8, "_/|\\_", COLOR_BLDG_LIGHT)
    canvas.draw_string(17, 9, "/░░|░░\\", COLOR_BLDG_LIGHT)
    for r in range(10, 31):
        w = min(12, 6 + int((r - 10) * 0.35))
        left = 19 - int(w / 2)
        for c in range(left, left + w + 1):
            canvas.set_cell(c, r, "█", COLOR_BLDG_DARK)
        canvas.set_cell(left, r, "/", COLOR_BLDG_MID)
        canvas.set_cell(left + w, r, "\\", COLOR_BLDG_MID)
        canvas.set_cell(19, r, "|", COLOR_BLDG_MID)

    # --- LOWER MANHATTAN TOWERS (cols 27-52) ---
    canvas.draw_string(30, 14, "[#]", COLOR_BLDG_LIGHT)
    for r in range(15, 31):
        for c in range(27, 36):
            canvas.set_cell(c, r, "▓", COLOR_BLDG_MID)
        canvas.set_cell(27, r, "|", COLOR_BLDG_MID)
        canvas.set_cell(35, r, "|", COLOR_BLDG_MID)

    canvas.set_cell(40, 10, "*" if beacon_on else "|", COLOR_BEACON if beacon_on else COLOR_ANTENNA)
    canvas.draw_string(40, 11, "|", COLOR_ANTENNA)
    for r in range(12, 31):
        for c in range(37, 45):
            canvas.set_cell(c, r, "▒", COLOR_BLDG_DARK)
        canvas.set_cell(37, r, "|", COLOR_BLDG_MID)
        canvas.set_cell(44, r, "|", COLOR_BLDG_MID)

    canvas.draw_string(48, 16, "/-\\", COLOR_BLDG_LIGHT)
    for r in range(17, 31):
        for c in range(46, 53):
            canvas.set_cell(c, r, "░", COLOR_BLDG_MID)
        canvas.set_cell(46, r, "|", COLOR_BLDG_MID)
        canvas.set_cell(52, r, "|", COLOR_BLDG_MID)

    # --- THE EMPIRE STATE BUILDING (cols 54-66, rows 1-30) ---
    canvas.set_cell(60, 1, "*" if beacon_on else "|", COLOR_BEACON if beacon_on else COLOR_ANTENNA)
    canvas.draw_string(60, 2, "|", COLOR_ANTENNA)
    canvas.draw_string(60, 3, "|", COLOR_ANTENNA)
    canvas.draw_string(60, 4, "|||", COLOR_ANTENNA)
    canvas.draw_string(59, 5, "|||||", COLOR_ANTENNA)
    canvas.draw_string(58, 6, "_/|||\\_", COLOR_BLDG_LIGHT)
    canvas.draw_string(57, 7, "|░░░░░░░|", COLOR_BLDG_LIGHT)
    canvas.draw_string(56, 8, "_/███████\\_", COLOR_BLDG_MID)
    canvas.draw_string(55, 9, "|░░░░░░░░░░░|", COLOR_BLDG_LIGHT)
    for r in range(10, 16):
        for c in range(56, 65):
            canvas.set_cell(c, r, "█", COLOR_BLDG_DARK)
        canvas.set_cell(56, r, "|", COLOR_BLDG_MID)
        canvas.set_cell(64, r, "|", COLOR_BLDG_MID)
        canvas.set_cell(60, r, "|", COLOR_BLDG_MID)

    canvas.draw_string(54, 16, "_/           \\_", COLOR_BLDG_LIGHT)
    for r in range(17, 31):
        for c in range(54, 67):
            canvas.set_cell(c, r, "█", COLOR_BLDG_DARK)
        canvas.set_cell(54, r, "|", COLOR_BLDG_MID)
        canvas.set_cell(66, r, "|", COLOR_BLDG_MID)
        canvas.set_cell(60, r, "|", COLOR_BLDG_MID)

    # --- MIDTOWN TOWERS (cols 68-75) ---
    canvas.draw_string(70, 13, "[O]", COLOR_BLDG_LIGHT)
    for r in range(14, 31):
        for c in range(68, 76):
            canvas.set_cell(c, r, "▓", COLOR_BLDG_MID)
        canvas.set_cell(68, r, "|", COLOR_BLDG_MID)
        canvas.set_cell(75, r, "|", COLOR_BLDG_MID)

    # --- THE CHRYSLER BUILDING (cols 77-89, rows 4-30) ---
    canvas.set_cell(83, 4, "*" if beacon_on else "|", COLOR_BEACON if beacon_on else COLOR_ANTENNA)
    canvas.draw_string(83, 5, "|", COLOR_ANTENNA)
    canvas.draw_string(83, 6, "|", COLOR_ANTENNA)
    canvas.draw_string(82, 7, "  /\\  ", COLOR_CHRYSLER)
    canvas.draw_string(81, 8, " /░░\\ ", COLOR_CHRYSLER)
    canvas.draw_string(80, 9, "/▒▒▒▒\\", COLOR_CHRYSLER)
    canvas.draw_string(79, 10, "/░░░░░░\\", COLOR_CHRYSLER)
    for r in range(11, 31):
        for c in range(78, 89):
            canvas.set_cell(c, r, "█", COLOR_BLDG_DARK)
        canvas.set_cell(78, r, "|", COLOR_BLDG_MID)
        canvas.set_cell(88, r, "|", COLOR_BLDG_MID)
        canvas.set_cell(83, r, "|", COLOR_BLDG_MID)

    # --- EAST RIVER TOWERS (cols 91-118, rows 13-30) ---
    canvas.draw_string(94, 15, "[===]", COLOR_BLDG_LIGHT)
    for r in range(16, 31):
        for c in range(91, 100):
            canvas.set_cell(c, r, "▒", COLOR_BLDG_MID)
        canvas.set_cell(91, r, "|", COLOR_BLDG_MID)
        canvas.set_cell(99, r, "|", COLOR_BLDG_MID)

    canvas.set_cell(105, 11, "*" if beacon_on else "|", COLOR_BEACON if beacon_on else COLOR_ANTENNA)
    canvas.draw_string(105, 12, "|", COLOR_ANTENNA)
    for r in range(13, 31):
        for c in range(101, 111):
            canvas.set_cell(c, r, "▓", COLOR_BLDG_DARK)
        canvas.set_cell(101, r, "|", COLOR_BLDG_MID)
        canvas.set_cell(110, r, "|", COLOR_BLDG_MID)

    for r in range(18, 31):
        for c in range(112, 119):
            canvas.set_cell(c, r, "░", COLOR_BLDG_MID)
        canvas.set_cell(112, r, "|", COLOR_BLDG_MID)
        canvas.set_cell(118, r, "|", COLOR_BLDG_MID)


def animate_windows(canvas, frame):
    """Animate dynamic grid of windows across buildings turning on and off."""
    bldgs = [
        (16, 23, 12, 29, 2, 2),  # 1 WTC
        (29, 34, 16, 29, 2, 2),  # Tower 1
        (39, 43, 14, 29, 2, 2),  # Tower 2
        (48, 51, 18, 29, 2, 2),  # Tower 3
        (57, 63, 11, 15, 2, 1),  # ESB Upper
        (56, 64, 18, 29, 2, 2),  # ESB Lower
        (70, 73, 16, 29, 2, 2),  # Midtown
        (80, 86, 12, 29, 2, 2),  # Chrysler
        (93, 97, 18, 29, 2, 2),  # East Tower 1
        (103, 108, 15, 29, 2, 2),  # East Tower 2
        (114, 117, 20, 29, 2, 2),  # East Tower 3
    ]

    for left, right, top, bottom, sx, sy in bldgs:
        for y in range(top, bottom + 1, sy):
            for x in range(left, right + 1, sx):
                h = math.sin(x * 12.9898 + y * 78.233 + (frame // 14)) * 43758.5453
                is_lit = (h - math.floor(h)) > 0.35
                if is_lit:
                    canvas.set_cell(x, y, "▪", COLOR_WINDOW_LIT)
                else:
                    canvas.set_cell(x, y, ".", COLOR_WINDOW_DIM)


def draw_water(canvas, frame):
    """Draw scrolling river waves with faint building reflections."""
    wave_offset = int(frame * 0.4) % 4
    for r in range(31, 37):
        for c in range(COLS):
            is_wave = (c + r + wave_offset) % 4 == 0
            wave_char = "≈" if is_wave else "~"

            is_under_1wtc = 14 <= c <= 25
            is_under_esb = 54 <= c <= 66
            is_under_chrysler = 78 <= c <= 88

            if (is_under_1wtc or is_under_esb or is_under_chrysler) and (c + frame) % 3 == 0:
                canvas.set_cell(c, r, wave_char, COLOR_WATER_REFLECT)
            else:
                color = COLOR_WATER_CREST if is_wave else COLOR_WATER
                canvas.set_cell(c, r, wave_char, color)


def draw_vehicles(canvas, frame):
    """Draw sailing ferry and flying helicopter."""
    # Ferry on water (rows 33-35)
    ferry_x = int((frame * 0.5) % (COLS + 30)) - 15
    if -12 <= ferry_x < COLS:
        canvas.draw_string(ferry_x + 4, 33, "__|__", COLOR_FERRY)
        canvas.draw_string(ferry_x, 34, "\\___o_o___/", COLOR_BLDG_LIGHT)
        canvas.set_cell(ferry_x + 4, 34, "o", COLOR_WINDOW_LIT)
        canvas.set_cell(ferry_x + 6, 34, "o", COLOR_WINDOW_LIT)

    # Helicopter in the sky (rows 5-7)
    heli_x = (COLS + 20) - int((frame * 0.8) % (COLS + 35))
    if -8 <= heli_x < COLS:
        rotor_chars = ["-", "\\", "|", "/"]
        rotor_ch = rotor_chars[frame % 4]
        canvas.draw_string(heli_x, 5, f"=={rotor_ch}==", COLOR_ROTOR)
        canvas.draw_string(heli_x + 1, 6, "[-+-]", COLOR_HELI)
        beacon_ch = "*" if (frame % 6 < 3) else "+"
        canvas.set_cell(heli_x + 3, 6, beacon_ch, COLOR_BEACON)
        canvas.draw_string(heli_x + 2, 7, "===", COLOR_HELI)

    # Title at bottom
    title = "· · ·   N E W   Y O R K   C I T Y   · · ·"
    title_start = (COLS - len(title)) // 2
    canvas.draw_string(title_start, 38, title, COLOR_TITLE)


def check_input():
    """Non-blocking keyboard check on Windows & POSIX."""
    try:
        if os.name == "nt":
            import msvcrt
            if msvcrt.kbhit():
                ch = msvcrt.getch()
                if ch in (b"q", b"Q", b"\x03"):
                    return True
        else:
            import select
            dr, _, _ = select.select([sys.stdin], [], [], 0)
            if dr:
                ch = sys.stdin.read(1)
                if ch.lower() == "q" or ch == "\x03":
                    return True
    except Exception:
        pass
    return False


def main():
    # Setup terminal: clear, hide cursor
    sys.stdout.write(CLEAR_SCREEN + HIDE_CURSOR)
    sys.stdout.flush()

    canvas = Canvas(COLS, ROWS)
    frame = 0

    def restore_and_exit(signum=None, frame_obj=None):
        sys.stdout.write(SHOW_CURSOR + RESET + "\n")
        sys.stdout.flush()
        sys.exit(0)

    signal.signal(signal.SIGINT, restore_and_exit)
    signal.signal(signal.SIGTERM, restore_and_exit)

    try:
        while True:
            # 1. Clear in-memory buffer
            canvas.clear()

            # 2. Draw back-to-front layers
            draw_sky(canvas, frame)
            draw_buildings(canvas, frame)
            animate_windows(canvas, frame)
            draw_water(canvas, frame)
            draw_vehicles(canvas, frame)

            # 3. Double buffer: draw once
            canvas.render()

            # 4. Check user input ('q' or Ctrl+C)
            if check_input():
                break

            # 5. Target ~12-15 FPS (80ms per frame)
            time.sleep(0.08)
            frame = (frame + 1) % 100000

    finally:
        restore_and_exit()


if __name__ == "__main__":
    main()

