# AGENTS.md

This file gives agentic coding agents operating in this repository the context they need: project layout, how to build/run/test, and the code conventions to follow.

## Project overview

ALERTIFY is a motorcycle anti-theft security system. It has two distinct parts living in the same directory:

1. **ESP32 firmware (Arduino `.ino` sketches)** — at the repository root. These run on ESP32/ESP32-S3 boards: WiFi Access Point + web control panel (`main.ino` / `main/main.ino`), an MJPEG camera stream server (`camera/`), and ultrasonic distance-measurement sketches (`super_sonic/`, `sim_test/`).
2. **Expo React Native mobile app** — in the `Alertify/` subdirectory. Built with Expo SDK 57, React Native 0.86, React 19, and `expo-router` (file-based routing). This is its own separate git repository.

Note: `Alertify/` is a git repo; the root directory is **not** a git repo.

## Key documentation requirement

**Expo has changed significantly.** Before writing any Expo/React Native code, read the versioned docs for the exact SDK in use:
https://docs.expo.dev/versions/v57.0.0/

Do not rely on memory or older React Native tutorials — API names, config keys, and plugin behavior differ between SDK versions.

## Repository layout

```
/                       ESP32 sketches + this file
  main.ino              ESP32 AP + WebServer control panel (canonical)
  main/main.ino         Duplicate of main.ino
  camera/camera.ino     ESP32-S3 camera MJPEG stream server
  camera/board_config.h Camera model selection
  camera/camera_pins.h  Pin definitions for the selected model
  super_sonic/          Ultrasonic distance sketch
  sim_test/             Ultrasonic distance-with-timeout sketch
  ALERTIFY DIAGRAMS.drawio  Architecture diagrams (draw.io source)
  Alertify/             Expo React Native app (separate git repo)
    app/                expo-router routes (file-based)
      _layout.js        Tab navigator layout
      index.js          Home/Overview screen
      control.js        Control panel screen
      notifications.js  Notifications list screen
    src/screens/LoginScreen.js  Standalone login screen (not routed)
    assets/             App icons, splash, futuristic_bg.jpg
    app.json            Expo app config
    package.json        Dependencies + scripts
```

## Build / run commands

### Expo mobile app (run from `Alertify/`)

All app commands must be run in the `Alertify/` directory:

```sh
npm install                 # install dependencies (node_modules already present)
npm start                   # start Expo dev server (default = expo start)
npm run android             # start on Android emulator/device
npm run ios                 # start on iOS simulator
npm run web                 # start in web browser
```

### ESP32 firmware (run from repo root)

Sketches are compiled/flashed with Arduino IDE or `arduino-cli`. Each sketch lives in its own folder (folder name must match the `.ino` filename):

```sh
# Compile example (verify with your installed board package/FQBN)
arduino-cli compile --fqbn esp32:esp32:esp32 main/
arduino-cli compile --fqbn esp32:esp32:esp32s3 camera/

# Upload to a connected board
arduino-cli upload -p COM3 --fqbn esp32:esp32:esp32 main/
```

Use the Arduino IDE's Serial Monitor at **115200 baud** for all sketches.

## Tests

**There is no test framework configured and no test files exist** (no Jest config, no `test` script in `package.json`). Do not attempt to run tests that don't exist.

If you add a test for the app, you must set up Jest first (`npx expo install jest-expo jest @types/jest` plus `"test": "jest"` in `package.json`) and add Expo's preset. Once Jest is configured, run **a single test file** with:

```sh
npm test -- path/to/TestName.test.js
```

or use `-t` to filter a single test name:

```sh
npm test -- -t "should do the thing"
```

There are no unit-test equivalents for the Arduino sketches — they are validated on hardware via Serial output.

## Lint / typecheck

- **No ESLint, Prettier, or TypeScript config** exists. No `lint`/`typecheck` scripts are defined.
- Files in `app/` and `src/` are plain JavaScript (`.js`), not TypeScript, even though `typescript` is a devDependency.
- Follow the conventions below manually; do not introduce a linter mid-task. If you add lint config, wire it up explicitly in `package.json` and use Prettier defaults (2-space, single quotes, semicolons) to match existing code.

## Code style — JavaScript / React Native (in `Alertify/`)

### Imports
- Order: `react` first, then `react-native`, then third-party/expo libraries, then local modules. Blank line between groups.
- Single quotes, semicolons, 2-space indentation. Trailing commas on multiline arrays/objects/function args.
- Example (match existing screens):
  ```js
  import React, { useState } from 'react';
  import { View, Text, StyleSheet, Pressable } from 'react-native';
  import Animated, { FadeInUp } from 'react-native-reanimated';
  import { Ionicons } from '@expo/vector-icons';
  ```

### Components
- One default-exported component per file, named after the route/file (e.g. `index.js` → `Home`, `control.js` → `Control`, `notifications.js` → `Notifications`).
- Functional components only; use hooks (`useState`, `useMemo`, `useEffect`) — do not use classes.
- Put `const styles = StyleSheet.create({ ... })` at the **bottom** of the file, after the component.
- Prefer `Pressable` over `TouchableOpacity` for new interactive elements; `Switch` for toggles.
- Use `Animated.View` with `FadeInUp` / `FadeIn` entry animations from `react-native-reanimated` for screen transitions, with `.delay(...)`/`.duration(...)`.
- Icons via `Ionicons` from `@expo/vector-icons`.

### Types
- No TypeScript in app code — do not add `.ts`/`.tsx` files to the existing `.js` routes.
- Data shapes are plain objects; use `useMemo` for derived data and keep mock data in UPPER_SNAKE constants at module scope (e.g. `MOCK_DATA`, `ITEMS_PER_PAGE`).

### Naming
- Components/files: `PascalCase` (`Notifications`, `LoginScreen.js`).
- Functions, variables, hooks, event handlers: `camelCase` (`currentPage`, `setSearchQuery`, `handleNextPage`).
- Constants: `UPPER_SNAKE_CASE`. Boolean state prefixed `is`/`has` (e.g. `isSystemOn`).

### Styling
- **Required dark theme palette** — reuse these exact hex values, never invent new colors:
  - Background: `#121212`; card/surface: `#1E1E1E`; border: `#3A3A3C`
  - Primary text: `#FFFFFF`; secondary text: `#8E8E93`; muted text: `#5C5C5E`
  - Accent/active: `#0A84FF`; success/active-on: `#34C759`; danger/off: `#FF3B30`; warning: `#FF9500`
  - Icon backgrounds use rgba tints of the accent (e.g. `rgba(10, 132, 255, 0.1)`)
- Screens use `padding: 24` and `paddingTop: 60` on the container.

### Error handling
- React Native: avoid `throw` in render paths; guard optional values before access. Clamp pagination bounds (as in `notifications.js`) before mutating state.
- Keep mock/async flows safe: if a value could be `undefined`, check it before use.

## Code style — Arduino / C++ (root sketches)

- Each sketch is standalone; no shared libraries besides Arduino/ESP32-provided headers (`WiFi.h`, `WebServer.h`, `esp_camera.h`, `esp_http_server.h`).
- 2-space indentation, braces on the same line, comments on the same line as code where short.
- Section banners in comments (e.g. `// ===== AP CONFIGURATION =====`, `// ===== ROUTE HANDLERS =====`).
- `setup()` then `loop()` at the end of the file; register routes/handlers in `setup()`.
- Naming: globals/state `camelCase` or `snake_case` (`alarmActive`, `wheelLocked`, `trigPin`), functions `camelCase` (`handleRoot`, `handleLock`, `startCameraServer`), constants/macros `UPPER_SNAKE_CASE`.
- Store large static content in PROGMEM with raw strings: `const char INDEX_HTML[] PROGMEM = R"rawliteral( ... )rawliteral";`
- Serial diagnostics with `[TAG]` prefixes (`[AP]`, `[WEB]`, `[ACTION]`, `[ERROR]`); Serial baud is always `115200`.
- Check return values (`!WiFi.softAP(...)`, `esp_camera_init` → `esp_err_t`) and print/log errors rather than silently failing.
- Camera pin configuration belongs in `board_config.h` + `camera_pins.h`; change camera models there, not in the `.ino`.

## Gotchas / things not to break

- Do not duplicate `.ino` files further — `main/` and root `main.ino` are already copies; edit `main.ino` (root) as canonical unless explicitly told otherwise.
- `Alertify/AGENTS.md` and `Alertify/CLAUDE.md` exist inside the app repo; they reiterate the Expo v57 docs requirement above.
- The `LoginScreen` in `src/screens/` is not wired into the router — don't "fix" it by moving it without confirming intent.
- Adding new screens: create a new file in `Alertify/app/` and register it as a `Tabs.Screen` in `Alertify/app/_layout.js`.
- Do not commit or expose the hardcoded WiFi password (`12345678`) in documentation or new code without flagging it as a security concern.