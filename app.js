// ===== 拼豆识别器 - 核心逻辑 (增强版) =====
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };

  var BEADS = window.BEADS_COLORS || [];

  /* ---------- DOM ---------- */
  var dropZone = $("dropZone"), fileInput = $("fileInput");
  var previewWrap = $("previewWrap"), previewImg = $("previewImg"), changeImgBtn = $("changeImgBtn");
  var cameraBtn = $("cameraBtn"), pasteBtn = $("pasteBtn");
  var cameraWrap = $("cameraWrap"), cameraVideo = $("cameraVideo");
  var switchCamBtn = $("switchCamBtn"), snapBtn = $("snapBtn"), closeCamBtn = $("closeCamBtn");
  var sizePreset = $("sizePreset"), sizeW = $("sizeW"), sizeH = $("sizeH"), boardSizeEl = $("boardSize");
  var bgMode = $("bgMode"), alphaTh = $("alphaTh"), alphaThVal = $("alphaThVal");
  var showGrid = $("showGrid"), showLabels = $("showLabels"), showNumbers = $("showNumbers");
  var invEnable = $("invEnable"), invEditBtn = $("invEditBtn"), invPanel = $("invPanel");
  var invList = $("invList"), invAllBtn = $("invAllBtn"), invNoneBtn = $("invNoneBtn"), invSummary = $("invSummary");
  var generateBtn = $("generateBtn");
  var descInput = $("descInput"), descColor = $("descColor"), descGenBtn = $("descGenBtn"), descHint = $("descHint");
  var numberLegend = $("numberLegend");
  var resultCard = $("resultCard"), resultCanvas = $("resultCanvas");
  var downloadBtn = $("downloadBtn"), copyListBtn = $("copyListBtn");
  var flipHBtn = $("flipHBtn"), flipVBtn = $("flipVBtn");
  var heatmapToggle = $("heatmapToggle"), checkModeToggle = $("checkModeToggle");
  var progressWrap = $("progressWrap"), progressFill = $("progressFill"), progressText = $("progressText"), resetProgressBtn = $("resetProgressBtn");
  var boardMapWrap = $("boardMapWrap"), boardMap = $("boardMap"), boardInfo = $("boardInfo");
  var checkHint = $("checkHint");
  var statsSummary = $("statsSummary");
  var perPack = $("perPack"), price = $("price"), shopSummary = $("shopSummary");
  var colorList = $("colorList");

  /* ---------- 状态 ---------- */
  var currentImage = null;
  var lastResult = null;       // { grid, w, h, boards, boardSize, maxDist }
  var colorNumbers = null;     // { id -> number } 颜色编号映射
  var placed = null;           // 二维布尔 (整图尺寸) 进度打卡
  var boards = null;           // 分板数组
  var currentBoard = -1;       // -1 = 整图视图;否则为board索引
  var stream = null;           // 摄像头流
  var facing = "environment";  // 前/后摄

  /* ---------- 库存数据 ---------- */
  var invKey = "beads-inventory-v1";
  var invSet = loadInv();      // { id: {have:bool, qty:int} }
  function loadInv() {
    try { return JSON.parse(localStorage.getItem(invKey)) || {}; } catch (e) { return {}; }
  }
  function saveInv() { try { localStorage.setItem(invKey, JSON.stringify(invSet)); } catch (e) {} }
  function invHaveIds() {
    var ids = [];
    BEADS.forEach(function (c) {
      var e = invSet[c.id];
      if (e && e.have) ids.push(c.id);
    });
    return ids;
  }

  /* ---------- 颜色距离 ---------- */
  function colorDist(r1, g1, b1, r2, g2, b2) {
    var rm = (r1 + r2) / 2;
    var dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
    return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
  }
  function matchColor(r, g, b, allowIds) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < BEADS.length; i++) {
      var c = BEADS[i];
      if (allowIds && allowIds.indexOf(c.id) === -1) continue;
      var d = colorDist(r, g, b, c.r, c.g, c.b);
      if (d < bestD) { bestD = d; best = c; }
    }
    return { bead: best, dist: bestD };
  }
  function isLightBg(r, g, b) {
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    return (r + g + b) / 3 > 235 && (max - min) < 18;
  }

  /* ---------- 尺寸/阈值联动 ---------- */
  sizePreset.addEventListener("change", function () {
    var v = parseInt(sizePreset.value, 10);
    if (v > 0) { sizeW.value = v; sizeH.value = v; }
  });
  [sizeW, sizeH].forEach(function (el) {
    el.addEventListener("input", function () { sizePreset.value = "0"; });
  });
  alphaTh.addEventListener("input", function () { alphaThVal.textContent = alphaTh.value; });

  /* ================= 图片输入：文件 / 拖拽 / 粘贴 / 拍照 ================= */
  dropZone.addEventListener("click", function () { fileInput.click(); });
  changeImgBtn.addEventListener("click", function () { fileInput.click(); });
  dropZone.addEventListener("dragover", function (e) { e.preventDefault(); dropZone.classList.add("dragover"); });
  dropZone.addEventListener("dragleave", function () { dropZone.classList.remove("dragover"); });
  dropZone.addEventListener("drop", function (e) {
    e.preventDefault(); dropZone.classList.remove("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener("change", function () {
    if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
  });

  // Ctrl+V 粘贴图片
  document.addEventListener("paste", function (e) {
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image/") === 0) {
        var f = items[i].getAsFile();
        if (f) { handleFile(f); e.preventDefault(); return; }
      }
    }
  });
  pasteBtn.addEventListener("click", function () {
    // 尝试调用剪贴板API读取图片
    if (navigator.clipboard && navigator.clipboard.read) {
      navigator.clipboard.read().then(function (items) {
        for (var i = 0; i < items.length; i++) {
          var type = items[i].types && items[i].types[0];
          if (type && type.indexOf("image/") === 0) {
            items[i].getType(type).then(function (b) { handleFile(b); });
            return;
          }
        }
        alert("剪贴板里没有图片，可截图后按 Ctrl+V");
      }).catch(function () { alert("无法读取剪贴板，请直接按 Ctrl+V 粘贴图片"); });
    } else {
      alert("请直接按 Ctrl+V 粘贴图片");
    }
  });

  // 摄像头
  cameraBtn.addEventListener("click", function () {
    if (cameraWrap.hidden) startCamera(); else stopCamera();
  });
  closeCamBtn.addEventListener("click", stopCamera);
  switchCamBtn.addEventListener("click", function () {
    facing = facing === "environment" ? "user" : "environment";
    stopCameraTracks(); startCamera();
  });
  snapBtn.addEventListener("click", function () {
    if (!stream) return;
    var c = document.createElement("canvas");
    c.width = cameraVideo.videoWidth; c.height = cameraVideo.videoHeight;
    var ctx = c.getContext("2d");
    ctx.drawImage(cameraVideo, 0, 0, c.width, c.height);
    c.toBlob(function (b) {
      if (b) handleFile(b);
      stopCamera();
    });
  });
  function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { alert("此设备不支持摄像头"); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false })
      .then(function (s) {
        stream = s; cameraVideo.srcObject = s; cameraWrap.hidden = false; dropZone.style.display = "none";
      })
      .catch(function (err) { alert("无法开启摄像头：" + (err.message || err.name)); });
  }
  function stopCameraTracks() { if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; } }
  function stopCamera() { stopCameraTracks(); cameraWrap.hidden = true; if (!currentImage) dropZone.style.display = ""; }

  function handleFile(file) {
    if (!file || !file.type || !file.type.startsWith("image/")) { alert("请使用图片文件"); return; }
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        currentImage = img;
        previewImg.src = img.src;
        previewWrap.hidden = false;
        dropZone.style.display = "none";
        cameraWrap.hidden = true; stopCameraTracks();
        generateBtn.disabled = false;
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  /* ================= 库存面板 ================= */
  invEditBtn.addEventListener("click", function () { invPanel.hidden = !invPanel.hidden; if (!invPanel.hidden) renderInvPanel(); });
  invAllBtn.addEventListener("click", function () {
    BEADS.forEach(function (c) { if (!invSet[c.id]) invSet[c.id] = { have: true, qty: 0 }; invSet[c.id].have = true; });
    saveInv(); renderInvPanel();
  });
  invNoneBtn.addEventListener("click", function () {
    Object.keys(invSet).forEach(function (k) { if (invSet[k]) invSet[k].have = false; });
    saveInv(); renderInvPanel();
  });
  function renderInvPanel() {
    invList.innerHTML = "";
    BEADS.forEach(function (c) {
      var e = invSet[c.id] || { have: false, qty: 0 };
      var row = document.createElement("div"); row.className = "inv-row";
      var sw = "rgb(" + c.r + "," + c.g + "," + c.b + ")";
      row.innerHTML =
        '<input type="checkbox" class="inv-cb"' + (e.have ? " checked" : "") + " />" +
        '<span class="color-swatch inv-sw" style="background:' + sw + '"></span>' +
        '<span class="inv-name">' + c.name + ' <em>' + c.id + "</em></span>" +
        '<label class="inv-qty">库存<input type="number" min="0" value="' + (e.qty || 0) + '" /></label>';
      var cb = row.querySelector(".inv-cb");
      var qty = row.querySelector(".inv-qty input");
      cb.addEventListener("change", function () {
        if (!invSet[c.id]) invSet[c.id] = { have: false, qty: 0 };
        invSet[c.id].have = cb.checked; saveInv(); updateInvSummary();
      });
      qty.addEventListener("input", function () {
        if (!invSet[c.id]) invSet[c.id] = { have: false, qty: 0 };
        invSet[c.id].qty = Math.max(0, parseInt(qty.value, 10) || 0); saveInv();
      });
      invList.appendChild(row);
    });
    updateInvSummary();
  }
  function updateInvSummary() {
    var n = invHaveIds().length;
    invSummary.textContent = n > 0 ? "已拥有 " + n + " 种颜色" : "未选择任何颜色";
  }

  /* ================= 像素化 ================= */
  function pixelize(img, w, h, alphaThreshold, mode, allowIds) {
    var tmp = document.createElement("canvas");
    tmp.width = w; tmp.height = h;
    var ctx = tmp.getContext("2d");
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
    var iw = img.naturalWidth, ih = img.naturalHeight;
    var scale = Math.min(w / iw, h / ih);
    var dw = iw * scale, dh = ih * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    var data = ctx.getImageData(0, 0, w, h).data;
    var grid = [], maxDist = 0;
    for (var y = 0; y < h; y++) {
      var row = [];
      for (var x = 0; x < w; x++) {
        var idx = (y * w + x) * 4;
        var r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
        if (a < alphaThreshold) { row.push(null); continue; }
        if (mode === "trans" && isLightBg(r, g, b)) { row.push(null); continue; }
        if (mode === "white" && isLightBg(r, g, b)) {
          var whiteBead = BEADS[0];
          row.push({ bead: whiteBead, r: 255, g: 255, b: 255, dist: 0 }); continue;
        }
        var m = matchColor(r, g, b, allowIds);
        if (!m.bead) { row.push(null); continue; }
        if (m.dist > maxDist) maxDist = m.dist;
        row.push({ bead: m.bead, r: r, g: g, b: b, dist: m.dist });
      }
      grid.push(row);
    }
    return { grid: grid, maxDist: maxDist };
  }

  /* ================= 分板 ================= */
  function computeBoards(w, h, bsz) {
    if (!bsz || bsz <= 0 || (w <= bsz && h <= bsz)) return null;
    var cols = Math.ceil(w / bsz), rows = Math.ceil(h / bsz), arr = [];
    for (var r = 0; r < rows; r++)
      for (var c = 0; c < cols; c++)
        arr.push({ r: r, c: c, x0: c * bsz, y0: r * bsz, w: Math.min(bsz, w - c * bsz), h: Math.min(bsz, h - r * bsz) });
    return arr;
  }

  /* ================= 生成模板 ================= */
  generateBtn.addEventListener("click", function () {
    if (!currentImage) return;
    var w = clamp(parseInt(sizeW.value, 10) || 29, 2, 100);
    var h = clamp(parseInt(sizeH.value, 10) || 29, 2, 100);
    var bsz = Math.max(0, parseInt(boardSizeEl.value, 10) || 0);
    var aTh = parseInt(alphaTh.value, 10);
    var mode = bgMode.value;
    var allowIds = invEnable.checked ? invHaveIds() : null;
    if (invEnable.checked && allowIds.length === 0) {
      alert("已开启豆库模式，请先在「管理豆库」里勾选你拥有的颜色"); return;
    }
    var res = pixelize(currentImage, w, h, aTh, mode, allowIds);
    applyResult(res.grid, w, h, bsz, res.maxDist);
  });

  /* 生成结果统一应用：分板/编号/进度/渲染 */
  function applyResult(grid, w, h, bsz, maxDist) {
    boards = computeBoards(w, h, bsz);
    lastResult = { grid: grid, w: w, h: h, maxDist: maxDist || 0, boardSize: bsz };
    colorNumbers = assignColorNumbers(grid);
    placed = makeBool2D(w, h);
    currentBoard = boards ? 0 : -1;
    loadProgress(w, h);
    resultCard.hidden = false;
    renderBoardMap();
    renderView();
    renderStats();
    renderNumberLegend();
    updateProgress();
    if (boards) boardMapWrap.hidden = false; else boardMapWrap.hidden = true;
    progressWrap.hidden = false;
    resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function makeBool2D(w, h) { var a = []; for (var y = 0; y < h; y++) { a.push(new Array(w).fill(false)); } return a; }

  /* 给每种不同颜色分配数字编号（1,2,3…），按出现顺序 */
  function assignColorNumbers(grid) {
    var map = {}, n = 0;
    for (var y = 0; y < grid.length; y++) {
      for (var x = 0; x < grid[y].length; x++) {
        var c = grid[y][x];
        if (!c) continue;
        var id = c.bead.id;
        if (!(id in map)) map[id] = ++n;
      }
    }
    return map;
  }

  /* 当前视图区域 */
  function viewRect() {
    if (!lastResult) return null;
    if (currentBoard < 0 || !boards) return { x0: 0, y0: 0, w: lastResult.w, h: lastResult.h };
    var b = boards[currentBoard];
    return { x0: b.x0, y0: b.y0, w: b.w, h: b.h };
  }

  /* ================= 渲染模板 ================= */
  function renderView() {
    if (!lastResult) return;
    var vr = viewRect();
    var grid = lastResult.grid;
    var heat = heatmapToggle.checked;
    var labels = showLabels.checked;
    var numbers = showNumbers.checked;
    var cell = (labels || numbers) ? 26 : 16;
    var maxD = lastResult.maxDist || 1;
    var canvas = resultCanvas;
    canvas.width = vr.w * cell; canvas.height = vr.h * cell;
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (var ly = 0; ly < vr.h; ly++) {
      for (var lx = 0; lx < vr.w; lx++) {
        var gx = vr.x0 + lx, gy = vr.y0 + ly;
        var cell0 = grid[gy][gx];
        var px = lx * cell, py = ly * cell;
        if (!cell0) {
          ctx.fillStyle = ((lx + ly) % 2 === 0) ? "#f2f2f2" : "#e9e9e9";
          ctx.fillRect(px, py, cell, cell); continue;
        }
        var c = cell0.bead;
        if (heat) {
          var t = cell0.dist / maxD;
          ctx.fillStyle = heatColor(t);
        } else {
          ctx.fillStyle = "rgb(" + c.r + "," + c.g + "," + c.b + ")";
        }
        ctx.fillRect(px, py, cell, cell);
        ctx.beginPath();
        ctx.arc(px + cell / 2, py + cell / 2, cell * 0.42, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(px + cell / 2 - cell * 0.12, py + cell / 2 - cell * 0.12, cell * 0.1, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,.28)"; ctx.fill();
        // 颜色数字编号（中央大字）
        if (numbers && colorNumbers) {
          ctx.fillStyle = contrastColor(c.r, c.g, c.b);
          ctx.font = "bold " + Math.floor(cell * 0.42) + "px sans-serif";
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(colorNumbers[c.id] || "", px + cell / 2, py + cell / 2);
        }
        // 色号标签（底部小字）
        if (labels) {
          ctx.fillStyle = contrastColor(c.r, c.g, c.b);
          ctx.font = Math.floor(cell * 0.24) + "px sans-serif";
          ctx.textAlign = "center"; ctx.textBaseline = "bottom";
          ctx.fillText(c.id, px + cell / 2, py + cell - 2);
        }
        // 进度打卡遮罩
        if (placed && placed[gy][gx]) {
          ctx.fillStyle = "rgba(40,200,90,.45)";
          ctx.fillRect(px, py, cell, cell);
          ctx.strokeStyle = "#1f9d4d"; ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(px + cell * 0.28, py + cell * 0.52);
          ctx.lineTo(px + cell * 0.44, py + cell * 0.66);
          ctx.lineTo(px + cell * 0.72, py + cell * 0.34);
          ctx.stroke();
        }
      }
    }
    if (showGrid.checked) {
      ctx.strokeStyle = "rgba(0,0,0,.18)"; ctx.lineWidth = 1;
      for (var gx2 = 0; gx2 <= vr.w; gx2++) { ctx.beginPath(); ctx.moveTo(gx2 * cell + .5, 0); ctx.lineTo(gx2 * cell + .5, vr.h * cell); ctx.stroke(); }
      for (var gy2 = 0; gy2 <= vr.h; gy2++) { ctx.beginPath(); ctx.moveTo(0, gy2 * cell + .5); ctx.lineTo(vr.w * cell, gy2 * cell + .5); ctx.stroke(); }
    }
  }
  function heatColor(t) {
    var hue = 120 * (1 - t); // 绿(120)→红(0)
    return "hsl(" + hue + ",85%,55%)";
  }
  function contrastColor(r, g, b) { return (0.299 * r + 0.587 * g + 0.114 * b) > 140 ? "#222" : "#fff"; }

  /* ================= 分板地图 ================= */
  function renderBoardMap() {
    boardMap.innerHTML = "";
    if (!boards) { boardMapWrap.hidden = true; boardInfo.textContent = ""; return; }
    boardMapWrap.hidden = false;
    var cols = boards[boards.length - 1].c + 1;
    var rows = boards[boards.length - 1].r + 1;
    boardMap.style.gridTemplateColumns = "repeat(" + cols + ", 1fr)";
    boards.forEach(function (b, i) {
      var d = document.createElement("div");
      d.className = "board-cell" + (i === currentBoard ? " active" : "");
      d.textContent = (b.r * cols + b.c) + 1;
      d.title = "第" + (i + 1) + "块 " + b.w + "×" + b.h;
      d.addEventListener("click", function () { currentBoard = i; renderView(); renderStats(); updateProgress(); renderBoardMap(); });
      boardMap.appendChild(d);
    });
    boardInfo.textContent = "共 " + boards.length + " 块板（" + cols + "×" + rows + " 排列）";
  }

  /* ================= 进度打卡：点击 canvas ================= */
  checkModeToggle.addEventListener("change", function () {
    checkHint.hidden = !checkModeToggle.checked;
    resultCanvas.style.cursor = checkModeToggle.checked ? "pointer" : "default";
    renderView();
  });
  resultCanvas.addEventListener("click", function (e) {
    if (!checkModeToggle.checked || !lastResult || !placed) return;
    var rect = resultCanvas.getBoundingClientRect();
    var cell = resultCanvas.width / viewRect().w;
    var x = (e.clientX - rect.left) * (resultCanvas.width / rect.width);
    var y = (e.clientY - rect.top) * (resultCanvas.height / rect.height);
    var lx = Math.floor(x / cell), ly = Math.floor(y / cell);
    var vr = viewRect();
    if (lx < 0 || ly < 0 || lx >= vr.w || ly >= vr.h) return;
    var gx = vr.x0 + lx, gy = vr.y0 + ly;
    if (!lastResult.grid[gy][gx]) return;
    placed[gy][gx] = !placed[gy][gx];
    saveProgress();
    renderView(); updateProgress();
  });
  resetProgressBtn.addEventListener("click", function () {
    if (!placed) return;
    for (var y = 0; y < placed.length; y++) for (var x = 0; x < placed[0].length; x++) placed[y][x] = false;
    saveProgress(); renderView(); updateProgress();
  });
  function updateProgress() {
    if (!lastResult || !placed) return;
    var total = 0, done = 0;
    for (var y = 0; y < lastResult.h; y++) for (var x = 0; x < lastResult.w; x++) {
      if (lastResult.grid[y][x]) { total++; if (placed[y][x]) done++; }
    }
    var pct = total ? Math.round(done / total * 100) : 0;
    progressFill.style.width = pct + "%";
    progressText.textContent = done + " / " + total + "  (" + pct + "%)";
  }
  var progKey = "beads-progress-v1";
  function saveProgress() {
    if (!lastResult) return;
    try { localStorage.setItem(progKey, JSON.stringify({ w: lastResult.w, h: lastResult.h, placed: placed })); } catch (e) {}
  }
  function loadProgress(w, h) {
    try {
      var s = JSON.parse(localStorage.getItem(progKey));
      if (s && s.w === w && s.h === h && s.placed) placed = s.placed;
    } catch (e) {}
  }

  /* ================= 镜像 ================= */
  flipHBtn.addEventListener("click", function () { flip("h"); });
  flipVBtn.addEventListener("click", function () { flip("v"); });
  function flip(dir) {
    if (!lastResult) return;
    var g = lastResult.grid, h = g.length, w = g[0].length;
    var ng = [];
    for (var y = 0; y < h; y++) {
      var row = [];
      for (var x = 0; x < w; x++) {
        var sx = dir === "h" ? w - 1 - x : x;
        var sy = dir === "v" ? h - 1 - y : y;
        row.push(g[sy][sx]);
      }
      ng.push(row);
    }
    lastResult.grid = ng;
    placed = makeBool2D(w, h); // 镜像后重置进度
    colorNumbers = assignColorNumbers(ng);
    saveProgress();
    renderView(); renderStats(); renderNumberLegend(); updateProgress();
  }

  /* ================= 颜色编号对照表 ================= */
  function renderNumberLegend() {
    if (!lastResult || !colorNumbers) { numberLegend.innerHTML = ""; return; }
    var agg = gatherCounts(false);
    var items = Object.keys(colorNumbers).map(function (id) {
      return { id: id, num: colorNumbers[id], bead: (agg.counts[id] || {}).bead || findBead(id) };
    });
    items.sort(function (a, b) { return a.num - b.num; });
    numberLegend.innerHTML = "";
    items.forEach(function (it) {
      var b = it.bead; if (!b) return;
      var div = document.createElement("div");
      div.className = "legend-item";
      var sw = "rgb(" + b.r + "," + b.g + "," + b.b + ")";
      div.innerHTML =
        '<span class="legend-num">' + it.num + '</span>' +
        '<span class="color-swatch" style="background:' + sw + '"></span>' +
        '<span class="legend-name">' + b.name + '</span>' +
        '<span class="legend-cid">色号 ' + b.id + '</span>';
      numberLegend.appendChild(div);
    });
  }
  function findBead(id) {
    for (var i = 0; i < BEADS.length; i++) if (BEADS[i].id === id) return BEADS[i];
    return null;
  }

  /* ================= 清单 + 购物换算 ================= */
  function gatherCounts(viewOnly) {
    var vr = viewOnly ? viewRect() : { x0: 0, y0: 0, w: lastResult.w, h: lastResult.h };
    var counts = {}, total = 0;
    var grid = lastResult.grid;
    for (var ly = 0; ly < vr.h; ly++) {
      for (var lx = 0; lx < vr.w; lx++) {
        var c = grid[vr.y0 + ly][vr.x0 + lx];
        if (!c) continue;
        var id = c.bead.id;
        if (!counts[id]) counts[id] = { bead: c.bead, n: 0 };
        counts[id].n++; total++;
      }
    }
    return { counts: counts, total: total };
  }
  function renderStats() {
    if (!lastResult) return;
    var useView = currentBoard >= 0 && boards;
    var agg = gatherCounts(useView);
    var arr = Object.keys(agg.counts).map(function (k) { return agg.counts[k]; });
    arr.sort(function (a, b) { return b.n - a.n; });
    var viewDesc = useView ? ("（当前第 " + (currentBoard + 1) + "/" + boards.length + " 块板）") : "（整图）";
    statsSummary.textContent = viewDesc + " 共 " + arr.length + " 种颜色，合计 " + agg.total + " 颗豆子";

    // 购物换算（按整图统计）
    var whole = gatherCounts(false);
    var pk = Math.max(1, parseInt(perPack.value, 10) || 1000);
    var pr = parseFloat(price.value) || 0;
    var totalBags = 0, totalCost = 0, restockBags = 0;
    Object.keys(whole.counts).forEach(function (k) {
      var it = whole.counts[k];
      var bags = Math.ceil(it.n / pk);
      totalBags += bags;
      totalCost += bags * pr;
      var inv = invSet[k];
      var have = inv && inv.have ? inv.qty : 0;
      var need = Math.max(0, it.n - have);
      if (need > 0) restockBags += Math.ceil(need / pk);
    });
    shopSummary.innerHTML = "整图需 <b>" + totalBags + "</b> 袋，约 <b>¥" + totalCost.toFixed(1) + "</b>"
      + (invEnable.checked ? "　｜　库存不足需补 <b>" + restockBags + "</b> 袋" : "");

    // 清单渲染
    colorList.innerHTML = "";
    if (arr.length === 0) { colorList.innerHTML = '<div class="empty-tip">没有可识别区域，请调整背景处理或透明度</div>'; return; }
    var invOn = invEnable.checked;
    arr.forEach(function (it) {
      var b = it.bead;
      var pct = agg.total ? (it.n / agg.total * 100).toFixed(1) : "0";
      var inv = invSet[b.id];
      var have = invOn && inv && inv.have ? inv.qty : 0;
      var short = invOn && it.n > have;
      var restock = short ? (it.n - have) : 0;
      var div = document.createElement("div");
      div.className = "color-item" + (short ? " short" : "");
      var sw = "rgb(" + b.r + "," + b.g + "," + b.b + ")";
      div.innerHTML =
        '<div class="color-swatch" style="background:' + sw + '"></div>' +
        '<div class="color-info"><div class="name">' + b.name + (short ? ' <span class="tag-warn">缺货</span>' : "") + '</div>' +
        '<div class="cid">色号 ' + b.id + ' · RGB(' + b.r + ',' + b.g + ',' + b.b + ')' +
        (invOn ? ' · 库存' + have : "") + '</div></div>' +
        '<div><div class="color-count">×' + it.n + '</div>' +
        '<div class="color-pct">' + pct + '%' + (short ? ' · 补' + restock : "") + '</div></div>';
      colorList.appendChild(div);
    });
  }
  perPack.addEventListener("input", function () { if (lastResult) renderStats(); });
  price.addEventListener("input", function () { if (lastResult) renderStats(); });

  /* ================= 导出 / 复制 ================= */
  downloadBtn.addEventListener("click", function () {
    if (!lastResult) return;
    renderView();
    var url = resultCanvas.toDataURL("image/png");
    var a = document.createElement("a");
    a.href = url; a.download = "拼豆模板_" + lastResult.w + "x" + lastResult.h + ".png"; a.click();
  });
  copyListBtn.addEventListener("click", function () {
    if (!lastResult) return;
    var useView = currentBoard >= 0 && boards;
    var agg = gatherCounts(useView);
    var arr = Object.keys(agg.counts).map(function (k) { return agg.counts[k]; });
    arr.sort(function (a, b) { return b.n - a.n; });
    var head = (useView ? "第" + (currentBoard + 1) + "/" + boards.length + "块 " : "") + "拼豆清单 " + lastResult.w + "×" + lastResult.h + "（共" + agg.total + "颗）";
    var lines = [head, "－－－－－－"];
    arr.forEach(function (it) { lines.push(it.bead.id + " " + it.bead.name + " ×" + it.n); });
    var text = lines.join("\n");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { flash(copyListBtn, "✅ 已复制"); });
    } else {
      var ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); flash(copyListBtn, "✅ 已复制"); } catch (e) {}
      document.body.removeChild(ta);
    }
  });
  function flash(btn, msg) { var o = btn.textContent; btn.textContent = msg; setTimeout(function () { btn.textContent = o; }, 1500); }

  // 视图重绘触发
  showGrid.addEventListener("change", function () { if (lastResult) renderView(); });
  showLabels.addEventListener("change", function () { if (lastResult) renderView(); });
  showNumbers.addEventListener("change", function () { if (lastResult) renderView(); });
  heatmapToggle.addEventListener("change", function () { if (lastResult) renderView(); });

  // 初始化库存摘要
  updateInvSummary();

  /* ================= 文字描述生成模板 ================= */
  // 主色候选（用户选/从描述识别）
  var DESC_COLORS = {
    red:[225,40,40], pink:[255,105,180], orange:[255,130,30],
    yellow:[255,213,0], green:[80,180,80], blue:[60,130,230],
    purple:[140,80,200], black:[25,25,30], white:[255,255,255]
  };
  // 固定装饰色
  var FIXED_COLORS = {
    'Y':[255,213,0], 'K':[25,25,30], 'P':[255,105,180], 'D':[95,60,35]
  };
  // 图案库（'X'=主色占位，其余为装饰色，'.'或空=无豆）
  var PATTERNS = [
    { name:"心形", rows:[
      "..XX...XX..",".XXXXXXXXX.","XXXXXXXXXXX","XXXXXXXXXXX",
      ".XXXXXXXXX.","..XXXXXXX..","...XXXXX...","....XXX....",".....X....."
    ], w:11, h:9, def:"red" },
    { name:"爱心", rows:[
      "...XX...XX...",".XXXXXXXXXXX.","XXXXXXXXXXXXX","XXXXXXXXXXXXX",
      ".XXXXXXXXXXX.","..XXXXXXXXX..","...XXXXXXX...","....XXXXX....",
      ".....XXX.....","......X......","............."
    ], w:13, h:11, def:"pink" },
    { name:"星形", rows:[
      ".....X.....","....XXX....","...XXXXX...","XXXXXXXXXXX",
      ".XXXXXXXXX.","..XXXXXXX..","...XXXXX...","..XX...XX..",
      ".XX.....XX.","XX.......XX","X.........X"
    ], w:11, h:11, def:"yellow" },
    { name:"花朵", rows:[
      ".............",".............",".....XXX.....","...XXXXXXX...",
      ".XXXXXXXXXXX.","XXXXXYYYXXXXX","XXXXXYYYXXXXX","XXXXXXXXXXXXX",
      ".XXXXXXXXXXX.","...XXXXXXX...",".....XXX.....",".............","............."
    ], w:13, h:13, def:"pink" },
    { name:"笑脸", rows:[
      "....XXXXX....","..XXXXXXXXX..",".XXXXXXXXXXX.","XXXXXXXXXXXXX",
      "XXXXKXXXKXXXX","XXXXKXXXKXXXX","XXXXXXXXXXXXX","XXXK.....KXXX",
      "XXXXKKKKKXXXX",".XXXXXXXXXXX.","..XXXXXXXXX..","...XXXXXXX...",".....XXX....."
    ], w:13, h:13, def:"yellow" },
    { name:"猫脸", rows:[
      "XX.........XX","XXX.......XXX","XXXXXXXXXXXXX","XXXXXXXXXXXXX",
      "XXXXKKXKKXXXX","XXXXXXXXXXXXX","XXXXXXPXXXXXX","XXXXKKKKKXXXX",
      "XXXXXXXXXXXXX","XXXXXXXXXXXXX","XXXXXXXXXXXXX",".XXXXXXXXXXX.","..XXXXXXXXX.."
    ], w:13, h:13, def:"orange" },
    { name:"圣诞树", rows:[
      ".....X.....","....XXX....","...XXXXX...","..XXXXXXX..",
      ".XXXXXXXXX.","XXXXXXXXXXX",".XXXXXXXXX.","XXXXXXXXXXX",
      "...DDDDD...","...DDDDD...","...........","..........."
    ], w:11, h:12, def:"green" },
    { name:"雪花", rows:[
      "......X......",".....XXX.....","....XXXXX....","...XXXXXXX...",
      "..XXXXXXXXX..",".XXXXXXXXXXX.","XXXXXXXXXXXXX",".XXXXXXXXXXX.",
      "..XXXXXXXXX..","...XXXXXXX...","....XXXXX....",".....XXX.....","......X......"
    ], w:13, h:13, def:"blue" },
    { name:"鱼", rows:[
      "....XXXXX....","..XXXXXXXXX..",".XXXXXXXXXXX.","XXXXXXXXXXXK.",
      ".XXXXXXXXXXX.","..XXXXXXXXX..","....XXXXX....","............."
    ], w:13, h:8, def:"orange" },
    { name:"蝴蝶", rows:[
      ".............","XX....Y....XX","XXXX..Y..XXXX",".XXXX.Y.XXXX.",
      "..XXX.Y.XXX..",".XXXX.Y.XXXX.","XXXX..Y..XXXX","XX....Y....XX","............."
    ], w:13, h:9, def:"pink" }
  ];
  // 关键词 -> 图案索引（多字优先）
  var KW_MAP = [
    ["蝴蝶",9],["爱心",1],["心",0],["星",2],["花",3],
    ["笑",4],["猫",5],["树",6],["雪",7],["鱼",8]
  ];
  function matchPattern(desc) {
    for (var i=0;i<KW_MAP.length;i++){
      if (desc.indexOf(KW_MAP[i][0]) >= 0) return PATTERNS[KW_MAP[i][1]];
    }
    return null;
  }
  function parseColorWord(desc) {
    if (/红/.test(desc)) return "red";
    if (/粉/.test(desc)) return "pink";
    if (/橙/.test(desc)) return "orange";
    if (/黄/.test(desc)) return "yellow";
    if (/绿/.test(desc)) return "green";
    if (/蓝/.test(desc)) return "blue";
    if (/紫/.test(desc)) return "purple";
    if (/黑/.test(desc)) return "black";
    if (/白/.test(desc)) return "white";
    return null;
  }
  function generateFromDesc(desc) {
    var pat = matchPattern(desc);
    if (!pat) return null;
    var colorKey = descColor.value;
    if (colorKey === "auto" || !colorKey) colorKey = parseColorWord(desc) || pat.def;
    var mainRgb = DESC_COLORS[colorKey] || DESC_COLORS[pat.def];
    var w = pat.w, h = pat.h, grid = [];
    for (var y=0;y<h;y++){
      var row = [], line = pat.rows[y] || "";
      for (var x=0;x<w;x++){
        var ch = line.charAt(x);
        if (ch === "" || ch === "." || ch === " ") { row.push(null); continue; }
        var rgb = (ch === "X") ? mainRgb : FIXED_COLORS[ch];
        if (!rgb) { row.push(null); continue; }
        var m = matchColor(rgb[0], rgb[1], rgb[2], null);
        row.push({ bead: m.bead, r: rgb[0], g: rgb[1], b: rgb[2], dist: m.dist });
      }
      grid.push(row);
    }
    return { grid: grid, w: w, h: h, color: colorKey, name: pat.name };
  }
  // AI 文生图：调用 Pollinations.ai 免费文生图，生成真实图片后自动导入并生成模板
  function aiGenImage(prompt, styleKey, onOk, onErr) {
    var styleWord = styleKey === "cartoon"
      ? "cute cartoon illustration, flat shading, vibrant"
      : (styleKey === "real"
        ? "realistic photo, detailed, high quality"
        : "pixel art style, flat colors, simple, clean");
    var full = prompt + ", " + styleWord;
    var seed = Math.floor(Math.random() * 1e9);
    var url = "https://image.pollinations.ai/prompt/" + encodeURIComponent(full) +
      "?width=512&height=512&nologo=true&seed=" + seed + "&referrer=sunset0516.github.io";
    // 用 fetch + blob：blob 是同源，canvas 不会被污染，可正常读取像素
    // Pollinations 偶发限流/403，自动重试提升成功率
    function attempt(triesLeft) {
      var ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 60000) : null;
      fetch(url, { signal: ctrl ? ctrl.signal : undefined })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.blob(); })
        .then(function (blob) {
          if (timer) clearTimeout(timer);
          if (!blob || blob.size === 0) throw new Error("空响应");
          var objUrl = URL.createObjectURL(blob);
          var img = new Image();
          img.onload = function () { onOk(img, objUrl); };
          img.onerror = function () { onErr("图片解码失败"); };
          img.src = objUrl;
        })
        .catch(function (e) {
          if (timer) clearTimeout(timer);
          if (triesLeft > 0) { setTimeout(function () { attempt(triesLeft - 1); }, 2500); }
          else {
            var msg = (e && e.name === "AbortError") ? "生成超时"
              : "网络错误：" + (e && e.message ? e.message : "未知");
            onErr(msg);
          }
        });
    }
    attempt(2);
  }

  descGenBtn.addEventListener("click", function () {
    var desc = (descInput.value || "").trim();
    if (!desc) {
      descHint.hidden = false;
      descHint.textContent = "请输入画面描述，或点击下方预设";
      return;
    }
    descHint.hidden = false;
    descHint.textContent = "AI 正在生成图片，请稍候…（约 10–60 秒，请勿离开页面）";
    descGenBtn.disabled = true;
    aiGenImage(desc, descColor.value, function (img, objUrl) {
      descGenBtn.disabled = false;
      descHint.textContent = "图片生成完成，已自动导入并生成拼豆模板";
      // 复用图片导入流程：设为当前图片并显示预览
      currentImage = img;
      previewImg.src = objUrl;
      previewWrap.hidden = false;
      dropZone.style.display = "none";
      generateBtn.disabled = false;
      // 自动识别画面尺寸：默认 32×32，可后续在"设置模板"里调整
      sizeW.value = 32; sizeH.value = 32; sizePreset.value = "0";
      var bsz = Math.max(0, parseInt(boardSizeEl.value, 10) || 0);
      var aTh = parseInt(alphaTh.value, 10);
      var mode = bgMode.value;
      var allowIds = invEnable.checked ? invHaveIds() : null;
      if (invEnable.checked && allowIds.length === 0) {
        alert("已开启豆库模式，请先在「管理豆库」里勾选你拥有的颜色");
        return;
      }
      var res = pixelize(img, 32, 32, aTh, mode, allowIds);
      applyResult(res.grid, 32, 32, bsz, res.maxDist);
    }, function (msg) {
      descGenBtn.disabled = false;
      descHint.textContent = "生成失败：" + msg + "。可重试或换一个描述";
    });
  });
  // 预设图案按钮
  var presetChips = document.querySelectorAll(".preset-chip");
  for (var pi=0; pi<presetChips.length; pi++) {
    presetChips[pi].addEventListener("click", function () {
      descInput.value = this.getAttribute("data-desc");
      descGenBtn.click();
    });
  }

  /* ================= Service Worker ================= */
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }
})();
