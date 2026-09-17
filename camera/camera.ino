#include <Arduino.h>
#include "esp_camera.h"
#include "img_converters.h"
#include <WiFi.h>
#include "esp_http_server.h"

#include "board_config.h"

const char *ssid = "japee";
const char *password = "12345678";

httpd_handle_t stream_httpd = NULL;
bool camera_ready = false;

// JPEG quality per mode (lower number = better quality, bigger file, slower encode)
// Live:  fast encode, moderate quality
// 3s:    high quality, bigger files, buffered so speed doesn't matter
// 5s:    near-lossless, biggest files, 5s of buffer absorbs slow encode time
static const int mode_jpeg_quality[] = { 22, 10, 5 };
static const char* mode_labels[]     = { "Live Fast q22", "HD Sharp q10", "Ultra Best q5" };

// =============================================
// YouTube-Style Buffered Streaming Web Player
// =============================================
const char index_html[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ESP32-S3 Camera Stream</title>
  <style>
    :root {
      --bg: #0f1014;
      --card: #191b22;
      --accent: #3b82f6;
      --text: #f0f1f3;
      --text-muted: #868e9c;
      --border: #272a35;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body {
      background: var(--bg); color: var(--text);
      display: flex; flex-direction: column; align-items: center;
      min-height: 100vh; padding: 12px;
    }
    .header { text-align: center; margin-bottom: 12px; }
    .header h1 { font-size: 1.25rem; font-weight: 600; letter-spacing: -0.01em; }
    .header p { font-size: 0.78rem; color: var(--text-muted); margin-top: 2px; }

    /* Video container */
    .video-wrap {
      position: relative; background: #000; border-radius: 10px;
      overflow: hidden; max-width: 680px; width: 100%;
      box-shadow: 0 8px 30px rgba(0,0,0,0.65);
      border: 1px solid var(--border);
    }
    .video-inner { position: relative; width: 100%; aspect-ratio: 4/3; }
    canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }

    /* YouTube-style buffer bar at bottom of video */
    .buffer-track {
      position: absolute; bottom: 0; left: 0; right: 0;
      height: 4px; background: rgba(255,255,255,0.15);
      z-index: 5; transition: height 0.2s;
    }
    .video-wrap:hover .buffer-track { height: 6px; }
    .buffer-loaded {
      height: 100%; background: rgba(255,255,255,0.35);
      width: 0%; transition: width 0.3s linear;
    }
    .buffer-played {
      position: absolute; top: 0; left: 0;
      height: 100%; background: var(--accent);
      width: 0%; transition: width 0.3s linear;
    }

    /* Quality badge on video */
    .quality-badge {
      position: absolute; top: 10px; right: 10px;
      background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
      padding: 4px 10px; border-radius: 4px;
      font-size: 0.7rem; font-weight: 600; color: white;
      z-index: 6; letter-spacing: 0.03em;
    }

    /* Loading overlay */
    .overlay-loader {
      position: absolute; inset: 0;
      background: rgba(15,16,20,0.92); backdrop-filter: blur(8px);
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      z-index: 15; transition: opacity 0.35s ease;
    }
    .overlay-loader.hidden { opacity: 0; pointer-events: none; }
    .spinner {
      width: 48px; height: 48px;
      border: 3px solid rgba(255,255,255,0.1); border-top-color: var(--accent);
      border-radius: 50%; animation: spin 0.7s linear infinite;
      margin-bottom: 16px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .loader-title { font-size: 1rem; font-weight: 500; margin-bottom: 4px; }
    .loader-qual { font-size: 0.8rem; color: var(--accent); margin-bottom: 12px; font-weight: 500; }
    .progress-outer {
      width: 240px; height: 5px; background: var(--border);
      border-radius: 3px; overflow: hidden; margin-bottom: 8px;
    }
    .progress-inner { height: 100%; width: 0%; background: var(--accent); transition: width 0.15s linear; }
    .loader-detail { font-size: 0.72rem; color: var(--text-muted); }

    /* Controls */
    .controls {
      margin-top: 12px; background: var(--card);
      border: 1px solid var(--border); border-radius: 10px;
      padding: 12px; max-width: 680px; width: 100%;
    }
    .mode-row {
      display: flex; gap: 5px; background: var(--bg);
      padding: 3px; border-radius: 8px;
      border: 1px solid var(--border); margin-bottom: 10px;
    }
    .mode-btn {
      flex: 1; background: transparent; border: none;
      color: var(--text-muted); padding: 9px 6px;
      font-size: 0.72rem; font-weight: 500; line-height: 1.4;
      border-radius: 6px; cursor: pointer; transition: all 0.2s;
      text-align: center;
    }
    .mode-btn.active {
      background: var(--accent); color: white;
      box-shadow: 0 2px 10px rgba(59,130,246,0.35);
    }
    .mode-btn .sub { display: block; font-size: 0.62rem; opacity: 0.65; margin-top: 1px; }
    .mode-btn.active .sub { opacity: 0.85; }

    .stats-row {
      display: grid; grid-template-columns: repeat(5, 1fr);
      gap: 6px; margin-bottom: 10px;
    }
    .stat {
      background: var(--bg); border: 1px solid var(--border);
      border-radius: 7px; padding: 7px 4px; text-align: center;
    }
    .stat-label {
      font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.04em;
      color: var(--text-muted); margin-bottom: 2px;
    }
    .stat-val { font-size: 0.85rem; font-weight: 600; }

    .dot {
      display: inline-block; width: 7px; height: 7px;
      border-radius: 50%; margin-right: 3px; vertical-align: middle;
    }
    .dot-ok { background: var(--success); }
    .dot-warn { background: var(--warning); }
    .dot-err { background: var(--danger); }

    .btn-row { display: flex; gap: 8px; }
    .btn {
      flex: 1; padding: 8px; background: var(--bg);
      border: 1px solid var(--border); color: var(--text);
      border-radius: 7px; font-size: 0.78rem; font-weight: 500;
      cursor: pointer; text-align: center; transition: background 0.2s;
    }
    .btn:hover { background: #1f2230; }
    .error-bar {
      display: none; background: #7f1d1d; color: #fca5a5;
      padding: 8px 14px; border-radius: 8px; font-size: 0.8rem;
      margin-bottom: 8px; max-width: 680px; width: 100%; text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>ESP32-S3 HD Stream</h1>
    <p>Adaptive Quality &mdash; YouTube-style buffered playback</p>
  </div>

  <div class="error-bar" id="errBar"></div>

  <div class="video-wrap" id="videoWrap">
    <div class="video-inner">
      <canvas id="canvas"></canvas>

      <div class="quality-badge" id="qBadge">LIVE 640x480</div>

      <div class="overlay-loader hidden" id="loader">
        <div class="spinner"></div>
        <div class="loader-title" id="ldTitle">Buffering HD Stream...</div>
        <div class="loader-qual" id="ldQual">Capturing at max quality</div>
        <div class="progress-outer"><div class="progress-inner" id="ldBar"></div></div>
        <div class="loader-detail" id="ldDetail">Collecting frames...</div>
      </div>
    </div>

    <div class="buffer-track">
      <div class="buffer-loaded" id="bufLoaded"></div>
      <div class="buffer-played" id="bufPlayed"></div>
    </div>
  </div>

  <div class="controls">
    <div class="mode-row">
      <button class="mode-btn active" id="m0" onclick="setMode(0)">
        Live Direct<span class="sub">0s delay &bull; Fast</span>
      </button>
      <button class="mode-btn" id="m1" onclick="setMode(1)">
        3s HD Buffer<span class="sub">High quality &bull; Sharp</span>
      </button>
      <button class="mode-btn" id="m2" onclick="setMode(2)">
        5s Ultra Buffer<span class="sub">Best quality &bull; Smooth</span>
      </button>
    </div>

    <div class="stats-row">
      <div class="stat">
        <div class="stat-label">Status</div>
        <div class="stat-val" id="sStatus" style="font-size:0.72rem;"><span class="dot dot-ok"></span>Ready</div>
      </div>
      <div class="stat">
        <div class="stat-label">Quality</div>
        <div class="stat-val" id="sQual" style="font-size:0.72rem;">Fast</div>
      </div>
      <div class="stat">
        <div class="stat-label">FPS</div>
        <div class="stat-val" id="sFps">0</div>
      </div>
      <div class="stat">
        <div class="stat-label">Buffer</div>
        <div class="stat-val" id="sBuf">-</div>
      </div>
      <div class="stat">
        <div class="stat-label">Size</div>
        <div class="stat-val" id="sSize" style="font-size:0.72rem;">0 KB</div>
      </div>
    </div>

    <div class="btn-row">
      <button class="btn" onclick="snapshot()">Save Photo</button>
      <button class="btn" onclick="fullscreen()">Fullscreen</button>
    </div>
  </div>

  <script>
    var C = document.getElementById('canvas');
    var X = C.getContext('2d');

    // UI elements
    var loader    = document.getElementById('loader');
    var ldTitle   = document.getElementById('ldTitle');
    var ldQual    = document.getElementById('ldQual');
    var ldBar     = document.getElementById('ldBar');
    var ldDetail  = document.getElementById('ldDetail');
    var qBadge    = document.getElementById('qBadge');
    var errBar    = document.getElementById('errBar');
    var bufLoaded = document.getElementById('bufLoaded');
    var bufPlayed = document.getElementById('bufPlayed');
    var sStatus   = document.getElementById('sStatus');
    var sQual     = document.getElementById('sQual');
    var sFps      = document.getElementById('sFps');
    var sBuf      = document.getElementById('sBuf');
    var sSize     = document.getElementById('sSize');

    // State
    var mode = 0;                  // 0=live, 1=3s, 2=5s
    var bufferTargetMs = 0;        // 0, 3000, 5000
    var queue = [];                // { img, fetchTime, size }
    var playing = false;           // Has initial buffer filled?
    var fetching = false;
    var errors = 0;
    var rendered = 0;
    var fpsStart = performance.now();
    var lastDraw = 0;
    var lastFrameSize = 0;
    var totalFetched = 0;
    var totalPlayed = 0;

    var qualLabels = ['Fast', 'HD Sharp', 'Ultra Best'];
    var qualBadges = ['LIVE 640x480', 'HD 640x480', 'ULTRA 640x480'];
    var bufTargets = [0, 3000, 5000];

    function setMode(m) {
      mode = m;
      bufferTargetMs = bufTargets[m];

      for (var i = 0; i < 3; i++) {
        document.getElementById('m' + i).classList.toggle('active', i === m);
      }

      // Reset buffer state
      queue = [];
      totalFetched = 0;
      totalPlayed = 0;
      errors = 0;

      qBadge.innerText = qualBadges[m];
      sQual.innerText = qualLabels[m];

      if (m === 0) {
        // Live: no buffering needed
        playing = true;
        loader.classList.add('hidden');
        sStatus.innerHTML = '<span class="dot dot-ok"></span>Live';
        bufLoaded.style.width = '0%';
        bufPlayed.style.width = '0%';
      } else {
        // Buffer mode: show loading overlay
        playing = false;
        loader.classList.remove('hidden');
        ldTitle.innerText = m === 1 ? 'Buffering 3s HD Stream...' : 'Buffering 5s Ultra Stream...';
        ldQual.innerText = m === 1 ? 'Max sharpness JPEG quality' : 'Near-lossless JPEG quality';
        ldBar.style.width = '0%';
        ldDetail.innerText = 'Collecting high-quality frames...';
        sStatus.innerHTML = '<span class="dot dot-warn"></span>Buffering';
        bufLoaded.style.width = '0%';
        bufPlayed.style.width = '0%';
      }
    }

    // ========================================
    // YouTube-style fetch pipeline
    // ========================================
    function fetchFrame() {
      if (fetching) return;
      fetching = true;

      var img = new Image();
      var fetchStart = performance.now();

      img.onload = function() {
        fetching = false;
        errors = 0;
        errBar.style.display = 'none';

        var now = performance.now();
        var elapsed = now - fetchStart;
        // Estimate size from image dimensions (actual JPEG size isn't available from Image)
        var w = img.naturalWidth || 640;
        var h = img.naturalHeight || 480;

        if (mode === 0) {
          // LIVE: render immediately, no queueing
          drawFrame(img);
          rendered++;
          // Fetch next frame ASAP
          setTimeout(fetchFrame, 10);
        } else {
          // BUFFER: queue the frame
          queue.push({ img: img, time: now });
          totalFetched++;

          if (!playing) {
            // Still filling initial buffer
            var depth = queue.length > 1
              ? queue[queue.length - 1].time - queue[0].time : 0;
            var pct = Math.min(100, (depth / bufferTargetMs) * 100);
            ldBar.style.width = pct + '%';
            ldDetail.innerText = (depth / 1000).toFixed(1) + 's / ' +
              (bufferTargetMs / 1000) + 's (' + queue.length + ' frames)';

            // Start playback when buffer is full enough
            if (depth >= bufferTargetMs) {
              playing = true;
              loader.classList.add('hidden');
              sStatus.innerHTML = '<span class="dot dot-ok"></span>Playing';
              lastDraw = performance.now();
            }
          }

          // Keep fetching to fill/maintain buffer
          // Slightly slower fetch to avoid overwhelming ESP32 at high quality
          setTimeout(fetchFrame, 20);
        }
      };

      img.onerror = function() {
        fetching = false;
        errors++;
        if (errors > 5) {
          errBar.innerText = 'Connection issues (' + errors + ' errors). Retrying...';
          errBar.style.display = 'block';
        }
        var wait = Math.min(3000, 300 * Math.min(errors, 8));
        setTimeout(fetchFrame, wait);
      };

      // Tell ESP32 which quality mode to use
      img.src = '/capture?q=' + mode + '&t=' + Date.now();
    }

    // ========================================
    // Smooth playback engine (for buffer modes)
    // ========================================
    function playbackTick(ts) {
      if (mode > 0 && playing && queue.length > 0) {
        // Calculate adaptive frame interval based on actual buffer contents
        var targetFps = 10;  // Target playback FPS
        var interval = 1000 / targetFps;

        // If buffer is getting low, slow down playback slightly
        var bufDepth = queue.length > 1
          ? queue[queue.length - 1].time - queue[0].time : 0;
        if (bufDepth < bufferTargetMs * 0.4) {
          interval *= 1.3;  // Slow down to let buffer refill
        }
        // If buffer is overfull, speed up slightly
        if (bufDepth > bufferTargetMs * 2.0) {
          interval *= 0.8;
        }

        if (ts - lastDraw >= interval) {
          var frame = queue.shift();
          drawFrame(frame.img);
          rendered++;
          totalPlayed++;
          lastDraw = ts;
        }

        // Update YouTube-style buffer bar
        // "loaded" = how much is in the buffer
        // "played" = how much has been played relative to loaded
        if (queue.length > 0 && totalFetched > 0) {
          var loadPct = Math.min(100, (queue.length / (bufferTargetMs / 100)) * 100);
          bufLoaded.style.width = Math.min(100, loadPct) + '%';
          // played bar shows buffer health
          var playPct = totalPlayed > 0 ? Math.min(100, (totalPlayed / totalFetched) * 100) : 0;
          bufPlayed.style.width = playPct + '%';
        }

        // If buffer completely drains, pause and re-buffer
        if (queue.length === 0 && playing) {
          playing = false;
          loader.classList.remove('hidden');
          ldTitle.innerText = 'Re-buffering...';
          ldQual.innerText = 'Buffer ran empty, refilling';
          ldBar.style.width = '0%';
          sStatus.innerHTML = '<span class="dot dot-warn"></span>Rebuffering';
        }
      }

      requestAnimationFrame(playbackTick);
    }

    function drawFrame(img) {
      var w = img.naturalWidth || img.width || 640;
      var h = img.naturalHeight || img.height || 480;
      if (C.width !== w || C.height !== h) {
        C.width = w;
        C.height = h;
      }
      X.drawImage(img, 0, 0);
    }

    // ========================================
    // Telemetry
    // ========================================
    setInterval(function() {
      var now = performance.now();
      var elapsed = (now - fpsStart) / 1000;
      var fps = elapsed > 0 ? Math.round(rendered / elapsed) : 0;
      rendered = 0;
      fpsStart = now;

      sFps.innerText = fps;

      if (mode === 0) {
        sBuf.innerText = '-';
      } else {
        sBuf.innerText = queue.length + ' f';
      }
    }, 1000);

    function snapshot() {
      var a = document.createElement('a');
      a.download = 'capture_' + Date.now() + '.jpg';
      a.href = C.toDataURL('image/jpeg', 0.95);
      a.click();
    }

    function fullscreen() {
      var el = document.getElementById('videoWrap');
      if (!document.fullscreenElement) {
        el.requestFullscreen().catch(function(e) { alert(e.message); });
      } else {
        document.exitFullscreen();
      }
    }

    // Boot
    window.addEventListener('DOMContentLoaded', function() {
      fetchFrame();
      requestAnimationFrame(playbackTick);
    });
  </script>
</body>
</html>
)rawliteral";

// ========================
// HTTP Handlers
// ========================

static esp_err_t index_handler(httpd_req_t *req) {
  httpd_resp_set_type(req, "text/html");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  return httpd_resp_send(req, index_html, strlen(index_html));
}

// Capture handler: same resolution, different JPEG quality per mode
static esp_err_t capture_handler(httpd_req_t *req) {
  if (!camera_ready) {
    httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Camera not ready");
    return ESP_FAIL;
  }

  // Parse quality mode from ?q=0|1|2
  int qmode = 0;
  if (httpd_req_get_url_query_len(req) > 0) {
    char query[64] = {0};
    char val[8] = {0};
    httpd_req_get_url_query_str(req, query, sizeof(query));
    if (httpd_query_key_value(query, "q", val, sizeof(val)) == ESP_OK) {
      qmode = atoi(val);
      if (qmode < 0 || qmode > 2) qmode = 0;
    }
  }

  int jpeg_quality = mode_jpeg_quality[qmode];

  // Capture frame (resolution stays constant at VGA 640x480)
  camera_fb_t *fb = NULL;
  for (int i = 0; i < 3; i++) {
    fb = esp_camera_fb_get();
    if (fb) break;
    vTaskDelay(pdMS_TO_TICKS(80));
  }

  if (!fb) {
    httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "No frame");
    return ESP_FAIL;
  }

  pixformat_t fmt = fb->format;
  uint8_t *jpg_buf = NULL;
  size_t jpg_len = 0;
  bool need_free = false;

  if (fmt == PIXFORMAT_JPEG) {
    jpg_buf = fb->buf;
    jpg_len = fb->len;
  } else {
    // Software JPEG conversion at mode-specific quality
    bool ok = frame2jpg(fb, jpeg_quality, &jpg_buf, &jpg_len);
    if (!ok || !jpg_buf || jpg_len == 0) {
      Serial.printf("[CAPTURE] JPEG fail: %dx%d q=%d\n", fb->width, fb->height, jpeg_quality);
      esp_camera_fb_return(fb);
      if (jpg_buf) free(jpg_buf);
      httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "JPEG fail");
      return ESP_FAIL;
    }
    need_free = true;
  }

  esp_camera_fb_return(fb);
  fb = NULL;

  httpd_resp_set_type(req, "image/jpeg");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_hdr(req, "Cache-Control", "no-cache, no-store, must-revalidate");

  esp_err_t res = httpd_resp_send(req, (const char *)jpg_buf, jpg_len);
  if (need_free) free(jpg_buf);
  return res;
}

static esp_err_t status_handler(httpd_req_t *req) {
  char buf[200];
  snprintf(buf, sizeof(buf),
    "{\"camera\":%s,\"heap\":%u,\"psram\":%u,\"clients\":%d}",
    camera_ready ? "true" : "false",
    ESP.getFreeHeap(), ESP.getFreePsram(),
    WiFi.softAPgetStationNum());
  httpd_resp_set_type(req, "application/json");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  return httpd_resp_send(req, buf, strlen(buf));
}

// ========================
// Server
// ========================

void startCameraServer() {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = 80;
  config.core_id = 0;
  config.stack_size = 20480;       // 20KB — headroom for high-quality JPEG
  config.max_open_sockets = 4;
  config.lru_purge_enable = true;
  config.recv_wait_timeout = 10;
  config.send_wait_timeout = 10;

  httpd_uri_t index_uri   = { .uri = "/",        .method = HTTP_GET, .handler = index_handler,   .user_ctx = NULL };
  httpd_uri_t capture_uri = { .uri = "/capture",  .method = HTTP_GET, .handler = capture_handler, .user_ctx = NULL };
  httpd_uri_t status_uri  = { .uri = "/status",   .method = HTTP_GET, .handler = status_handler,  .user_ctx = NULL };

  if (httpd_start(&stream_httpd, &config) == ESP_OK) {
    httpd_register_uri_handler(stream_httpd, &index_uri);
    httpd_register_uri_handler(stream_httpd, &capture_uri);
    httpd_register_uri_handler(stream_httpd, &status_uri);
    Serial.println("[SERVER] Started on port 80");
  }
}

// ========================
// Setup
// ========================

void setup() {
  Serial.begin(115200);
  Serial.setDebugOutput(true);
  delay(2000);
  Serial.println("\n==========================================");
  Serial.println("  ESP32-S3 Adaptive Quality Camera");
  Serial.println("==========================================");

  Serial.printf("[DIAG] Chip: %s Rev%d\n", ESP.getChipModel(), ESP.getChipRevision());
  Serial.printf("[DIAG] Heap: %u | PSRAM: %u\n", ESP.getFreeHeap(), ESP.getPsramSize());

  if (ESP.getPsramSize() == 0) {
    Serial.println("!!! PSRAM NOT ENABLED - go to Tools -> PSRAM -> QSPI PSRAM !!!");
  }

  // ---- WiFi ----
  WiFi.disconnect(true);
  WiFi.mode(WIFI_AP);
  IPAddress ip(192, 168, 4, 1), gw(192, 168, 4, 1), sn(255, 255, 255, 0);
  WiFi.softAPConfig(ip, gw, sn);
  WiFi.softAP(ssid, password, 1, 0, 4);
  WiFi.setSleep(false);
  Serial.printf("[WIFI] AP: %s @ %s\n", ssid, WiFi.softAPIP().toString().c_str());

  // ---- Camera: Initialize at VGA 640x480 (stable, no dynamic switching) ----
  bool has_psram = (ESP.getPsramSize() > 0);

  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
  config.pin_d0       = Y2_GPIO_NUM;
  config.pin_d1       = Y3_GPIO_NUM;
  config.pin_d2       = Y4_GPIO_NUM;
  config.pin_d3       = Y5_GPIO_NUM;
  config.pin_d4       = Y6_GPIO_NUM;
  config.pin_d5       = Y7_GPIO_NUM;
  config.pin_d6       = Y8_GPIO_NUM;
  config.pin_d7       = Y9_GPIO_NUM;
  config.pin_xclk     = XCLK_GPIO_NUM;
  config.pin_pclk     = PCLK_GPIO_NUM;
  config.pin_vsync    = VSYNC_GPIO_NUM;
  config.pin_href     = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn     = PWDN_GPIO_NUM;
  config.pin_reset    = RESET_GPIO_NUM;
  config.xclk_freq_hz = 10000000;

  if (has_psram) {
    config.pixel_format  = PIXFORMAT_RGB565;
    config.frame_size    = FRAMESIZE_VGA;        // 640x480 - stable and good quality
    config.fb_location   = CAMERA_FB_IN_PSRAM;
    config.fb_count      = 2;
    config.grab_mode     = CAMERA_GRAB_LATEST;
    config.jpeg_quality  = 12;
    Serial.println("[CAM] Config: VGA 640x480, PSRAM, 2 buffers");
  } else {
    config.pixel_format  = PIXFORMAT_RGB565;
    config.frame_size    = FRAMESIZE_QVGA;
    config.fb_location   = CAMERA_FB_IN_DRAM;
    config.fb_count      = 1;
    config.grab_mode     = CAMERA_GRAB_LATEST;
    config.jpeg_quality  = 25;
    Serial.println("[CAM] Config: QVGA 320x240, DRAM (enable PSRAM for better quality!)");
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("[CAM] INIT FAILED: 0x%x\n", err);

    // If VGA failed, try HVGA as fallback
    if (has_psram && config.frame_size == FRAMESIZE_VGA) {
      Serial.println("[CAM] Trying HVGA 480x320 fallback...");
      config.frame_size = FRAMESIZE_HVGA;
      err = esp_camera_init(&config);
      if (err == ESP_OK) {
        Serial.println("[CAM] HVGA fallback OK!");
      }
    }
  }

  if (err == ESP_OK) {
    sensor_t *s = esp_camera_sensor_get();
    if (s) {
      Serial.printf("[CAM] Sensor PID: 0x%04X\n", s->id.PID);
      s->set_brightness(s, 1);
      s->set_contrast(s, 1);
      s->set_saturation(s, 0);
    }

    // Test each quality level
    Serial.println("[CAM] Testing JPEG quality levels...");
    for (int m = 0; m < 3; m++) {
      camera_fb_t *tf = esp_camera_fb_get();
      if (tf) {
        uint8_t *tj = NULL;
        size_t tl = 0;
        unsigned long t0 = millis();
        bool ok = frame2jpg(tf, mode_jpeg_quality[m], &tj, &tl);
        unsigned long dt = millis() - t0;
        Serial.printf("[CAM]   %s: %dx%d -> %s (%u bytes, %lu ms)\n",
                      mode_labels[m], tf->width, tf->height,
                      ok ? "OK" : "FAIL", tl, dt);
        if (tj) free(tj);
        esp_camera_fb_return(tf);
      }
    }

    camera_ready = true;
    Serial.println("[CAM] *** CAMERA READY ***");
  } else {
    camera_ready = false;
    Serial.println("[CAM] *** CAMERA FAILED ***");
  }

  Serial.printf("[DIAG] Post-init: heap=%u psram=%u\n", ESP.getFreeHeap(), ESP.getFreePsram());

  startCameraServer();

  Serial.println("==========================================");
  Serial.println("  Quality Modes:");
  Serial.println("    Live Direct  -> q22 (fast encode, real-time)");
  Serial.println("    3s HD Buffer -> q10 (high quality, buffered)");
  Serial.println("    5s Ultra     -> q5  (near-lossless, buffered)");
  Serial.println("------------------------------------------");
  Serial.printf("  URL: http://%s\n", WiFi.softAPIP().toString().c_str());
  Serial.println("==========================================");
}

void loop() {
  static unsigned long last = 0;
  if (millis() - last > 15000) {
    last = millis();
    Serial.printf("[HEALTH] heap=%u psram=%u clients=%d\n",
                  ESP.getFreeHeap(), ESP.getFreePsram(), WiFi.softAPgetStationNum());
  }
  delay(1000);
}
