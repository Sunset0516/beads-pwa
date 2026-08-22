// ===== 拼豆识别器 - 核心逻辑 (增强版) =====
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };

  var BEADS = window.BEADS_COLORS || [];
  /* ================= 多品牌色卡映射 ================= */
  var PALETTES = window.BEAD_PALETTES || { MARD: { label: "MARD", colors: BEADS } };
  var CURRENT_BRAND = "MARD";
  // 品牌品牌 -> { MARD_id -> {id, name, _fallback} }
  var BRAND_CODE_MAP = {};
  (function () {
    for (var k in PALETTES) {
      var m = {};
      var cs = PALETTES[k].colors || [];
      for (var i = 0; i < cs.length; i++) {
        var c = cs[i];
        var mid = c._mardId || c.id;
        m[mid] = { id: c.id, name: c.name || mid, fallback: !!c._fallback };
      }
      BRAND_CODE_MAP[k] = m;
    }
  })();
  function getBrandInfo(mardBeadOrId) {
    var mid = mardBeadOrId && typeof mardBeadOrId === "object" ? mardBeadOrId.id : mardBeadOrId;
    if (!mid) return { id: mid || "", name: "", fallback: false };
    var map = BRAND_CODE_MAP[CURRENT_BRAND] || {};
    return map[mid] || { id: mid, name: mid, fallback: true };
  }
  function getBrandId(mardBeadOrId) { return getBrandInfo(mardBeadOrId).id; }
  function getBrandName(mardBeadOrId, preferBeadName) {
    var b = getBrandInfo(mardBeadOrId);
    if (b && b.name && !/^[A-Z]+\d+$/.test(b.name)) return b.name;
    if (preferBeadName && typeof mardBeadOrId === "object" && mardBeadOrId.name) return mardBeadOrId.name;
    return b.id;
  }
  function paletteCoverage(brand) {
    var m = BRAND_CODE_MAP[brand] || {};
    var total = 0, exact = 0;
    for (var k in m) { total++; if (!m[k].fallback) exact++; }
    return { total: total, exact: exact };
  }
  // 缓存白珠（RGB≈255,255,255），避免依赖 BEADS[0]
  var WHITE_BEAD = (function () {
    var best = BEADS[0], bestD = Infinity;
    for (var i = 0; i < BEADS.length; i++) {
      var c = BEADS[i];
      var d = (c.r - 255) * (c.r - 255) + (c.g - 255) * (c.g - 255) + (c.b - 255) * (c.b - 255);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  })();

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
  var maskEnable = $("maskEnable"), maskEditBtn = $("maskEditBtn"), maskPanel = $("maskPanel");
  var maskList = $("maskList"), maskAllBtn = $("maskAllBtn"), maskNoneBtn = $("maskNoneBtn"), maskSummary = $("maskSummary");
  var generateBtn = $("generateBtn");
  var mandalaAxis = $("mandalaAxis"), mandalaTheme = $("mandalaTheme"), mandalaSize = $("mandalaSize"), mandalaBtn = $("mandalaBtn"), mandalaUseTpl = $("mandalaUseTpl");
  var textInput = $("textInput"), textColor = $("textColor"), textBtn = $("textBtn"), textBgMode = $("textBgMode"), textBg1 = $("textBg1"), textBg2 = $("textBg2"), textBgSolid = $("textBgSolid"), textUseTpl = $("textUseTpl");
  var gradC1 = $("gradC1"), gradC2 = $("gradC2"), gradN = $("gradN"), gradBtn = $("gradBtn"), gradShape = $("gradShape"), gradUseTpl = $("gradUseTpl");
  var calcSpec = $("calcSpec"), calcBoard = $("calcBoard"), calcBtn = $("calcBtn"), calcOut = $("calcOut");
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
  var paletteBrandSel = $("paletteBrand"), paletteHintEl = $("paletteHint");
  var patternNameEl = $("patternName"), savePatternBtn = $("savePatternBtn"), patternListEl = $("patternList");
  var printOrientEl = $("printOrient"), printCellEl = $("printCell"), printBtn = $("printBtn"), printPreviewEl = $("printPreview");

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

  /* ---------- 屏蔽颜色数据 ---------- */
  var maskKey = "beads-mask-v1";
  var maskSet = loadMask();      // { id: true }
  function loadMask() {
    try { return JSON.parse(localStorage.getItem(maskKey)) || {}; } catch (e) { return {}; }
  }
  function saveMask() { try { localStorage.setItem(maskKey, JSON.stringify(maskSet)); } catch (e) {} }
  function maskHaveIds() {
    var ids = [];
    BEADS.forEach(function (c) { if (maskSet[c.id]) ids.push(c.id); });
    return ids;
  }

  /* ---------- 颜色距离 ---------- */
  function colorDist(r1, g1, b1, r2, g2, b2) {
    var rm = (r1 + r2) / 2;
    var dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
    return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
  }
  function matchColor(r, g, b, allowIds, maskIds) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < BEADS.length; i++) {
      var c = BEADS[i];
      if (allowIds && allowIds.indexOf(c.id) === -1) continue;
      if (maskIds && maskIds.indexOf(c.id) !== -1) continue;
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
      var brandId = getBrandId(c);
      var brandName = getBrandName(c);
      var brandInfo = getBrandInfo(c);
      var fallbackTag = brandInfo.fallback ? ' <span style="font-size:11px;padding:1px 4px;background:#fff3e0;color:#e65100;border-radius:3px;">近似</span>' : "";
      row.innerHTML =
        '<input type="checkbox" class="inv-cb"' + (e.have ? " checked" : "") + " />" +
        '<span class="color-swatch inv-sw" style="background:' + sw + '"></span>' +
        '<span class="inv-name">' + brandName + fallbackTag + ' <em>' + brandId + "</em></span>" +
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

  /* ================= 屏蔽颜色面板 ================= */
  maskEditBtn.addEventListener("click", function () { maskPanel.hidden = !maskPanel.hidden; if (!maskPanel.hidden) renderMaskPanel(); });
  maskAllBtn.addEventListener("click", function () {
    BEADS.forEach(function (c) { maskSet[c.id] = true; });
    saveMask(); renderMaskPanel();
  });
  maskNoneBtn.addEventListener("click", function () {
    Object.keys(maskSet).forEach(function (k) { maskSet[k] = false; });
    saveMask(); renderMaskPanel();
  });
  function renderMaskPanel() {
    maskList.innerHTML = "";
    BEADS.forEach(function (c) {
      var on = !!maskSet[c.id];
      var row = document.createElement("div"); row.className = "inv-row";
      var sw = "rgb(" + c.r + "," + c.g + "," + c.b + ")";
      var brandId = getBrandId(c);
      var brandName = getBrandName(c);
      var brandInfo = getBrandInfo(c);
      var fallbackTag = brandInfo.fallback ? ' <span style="font-size:11px;padding:1px 4px;background:#fff3e0;color:#e65100;border-radius:3px;">近似</span>' : "";
      row.innerHTML =
        '<input type="checkbox" class="inv-cb"' + (on ? " checked" : "") + " />" +
        '<span class="color-swatch inv-sw" style="background:' + sw + '"></span>' +
        '<span class="inv-name">' + brandName + fallbackTag + ' <em>' + brandId + "</em></span>";
      var cb = row.querySelector(".inv-cb");
      cb.addEventListener("change", function () {
        maskSet[c.id] = cb.checked; saveMask(); updateMaskSummary();
      });
      maskList.appendChild(row);
    });
    updateMaskSummary();
  }
  function updateMaskSummary() {
    var n = maskHaveIds().length;
    maskSummary.textContent = n > 0 ? "已屏蔽 " + n + " 种颜色" : "未屏蔽任何颜色";
  }

  /* ================= 像素化 ================= */
  function pixelize(img, w, h, alphaThreshold, mode, allowIds, maskIds) {
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
          var whiteBead = WHITE_BEAD || BEADS[0];
          row.push({ bead: whiteBead, r: 255, g: 255, b: 255, dist: 0 }); continue;
        }
        var m = matchColor(r, g, b, allowIds, maskIds);
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
    if (!currentImage) {
      // Fallback: 如果 previewImg 已加载完成，允许直接使用（兼容手动设置 src / 粘贴后点击等场景）
      if (previewImg && previewImg.complete && previewImg.naturalWidth > 0) {
        var tmpImg = new Image();
        tmpImg.onload = function () {
          currentImage = tmpImg;
          runGenerate();
        };
        tmpImg.onerror = function () { alert("图片加载失败，请重新上传或粘贴图片"); };
        tmpImg.src = previewImg.src;
        return;
      }
      alert("请先上传或粘贴一张图片，再点击生成拼豆模板");
      return;
    }
    runGenerate();
    function runGenerate() {
      var w = clamp(parseInt(sizeW.value, 10) || 29, 2, 100);
      var h = clamp(parseInt(sizeH.value, 10) || 29, 2, 100);
      var bsz = Math.max(0, parseInt(boardSizeEl.value, 10) || 0);
      var aTh = parseInt(alphaTh.value, 10);
      var mode = bgMode.value;
      var allowIds = invEnable.checked ? invHaveIds() : null;
      if (invEnable.checked && allowIds.length === 0) {
        alert("已开启豆库模式，请先在「管理豆库」里勾选你拥有的颜色"); return;
      }
      var maskIds = maskEnable.checked ? maskHaveIds() : null;
      var res = pixelize(currentImage, w, h, aTh, mode, allowIds, maskIds);
      applyResult(res.grid, w, h, bsz, res.maxDist);
    }
  });

  /* 生成结果统一应用：分板/编号/进度/渲染 */
  function applyResult(grid, w, h, bsz, maxDist) {
    boards = computeBoards(w, h, bsz);
    lastResult = { grid: grid, w: w, h: h, maxDist: maxDist || 0, boardSize: bsz };
    colorNumbers = assignColorNumbers(grid);
    placed = makeBool2D(w, h);
    currentBoard = boards ? 0 : -1;
    // 重新生成图片：清空旧进度缓存 + 关闭打卡模式
    try { localStorage.removeItem(progKey); } catch (e) {}
    if (checkModeToggle){
      checkModeToggle.checked = false;
      checkHint.hidden = true;
      resultCanvas.style.cursor = "default";
    }
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
          ctx.fillText(getBrandId(c), px + cell / 2, py + cell - 2);
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
      var brandId = getBrandId(b);
      var brandName = getBrandName(b);
      var brandInfo = getBrandInfo(b);
      var fallbackTag = brandInfo.fallback ? ' <span class="tag-warn" style="font-size:11px;padding:1px 4px;background:#fff3e0;color:#e65100;border-radius:3px;">近似</span>' : "";
      div.innerHTML =
        '<span class="legend-num">' + it.num + '</span>' +
        '<span class="color-swatch" style="background:' + sw + '"></span>' +
        '<span class="legend-name">' + brandName + fallbackTag + '</span>' +
        '<span class="legend-cid">色号 ' + brandId + '</span>';
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
      var brandId = getBrandId(b);
      var brandName = getBrandName(b);
      var brandInfo = getBrandInfo(b);
      var fallbackTag = brandInfo.fallback ? ' <span class="tag-warn" style="font-size:11px;padding:1px 4px;background:#fff3e0;color:#e65100;border-radius:3px;">近似</span>' : "";
      div.innerHTML =
        '<div class="color-swatch" style="background:' + sw + '"></div>' +
        '<div class="color-info"><div class="name">' + brandName + fallbackTag + (short ? ' <span class="tag-warn">缺货</span>' : "") + '</div>' +
        '<div class="cid">色号 ' + brandId + ' · RGB(' + b.r + ',' + b.g + ',' + b.b + ')' +
        (invOn ? ' · 库存' + have : "") + '</div></div>' +
        '<div><div class="color-count">×' + it.n + '</div>' +
        '<div class="color-pct">' + pct + '%' + (short ? ' · 补' + restock : "") + '</div></div>';
      colorList.appendChild(div);
    });
  }
  perPack.addEventListener("input", function () { if (lastResult) renderStats(); });
  price.addEventListener("input", function () { if (lastResult) renderStats(); });

  /* ================= 导出 / 复制 ================= */
  // 构建高清导出 canvas：模板图 + 内嵌颜色对照表
  function buildExportCanvas(){
    if (!lastResult) return null;
    var vr = viewRect();
    var grid = lastResult.grid;
    var numbers = showNumbers.checked;
    var labels = showLabels.checked;
    var gridLines = showGrid.checked;
    var heat = heatmapToggle.checked;
    var maxD = lastResult.maxDist || 1;
    // 高清单元格：48 像素（比显示的 26 大近 2 倍，数字更清晰）
    var cell = 48;
    var tplW = vr.w * cell, tplH = vr.h * cell;

    // 收集颜色对照表
    var agg = gatherCounts(false);
    var legendItems = [];
    if (colorNumbers){
      legendItems = Object.keys(colorNumbers).map(function(id){
        var b = (agg.counts[id] || {}).bead || findBead(id);
        return { id: id, num: colorNumbers[id], bead: b, n: (agg.counts[id]||{}).n || 0 };
      }).filter(function(it){ return it.bead; });
      legendItems.sort(function(a,b){ return a.num - b.num; });
    }

    // 对照表布局：每行 4 列
    var legendCols = 4;
    var legendRows = Math.ceil(legendItems.length / legendCols) || 0;
    var swatch = 40;        // 色块尺寸
    var legendRowH = 56;    // 每行高
    var legendColW = Math.floor((tplW - 40) / legendCols);  // 每列宽（基于模板宽度，至少不窄于 220）
    if (legendColW < 220) legendColW = 220;
    var legendW = Math.max(tplW, legendCols * legendColW + 40);
    var legendH = legendRows > 0 ? (legendRows * legendRowH + 80) : 0;
    var padX = 20, padTop = 20, gapBetween = 30;

    var totalW = legendW + padX * 2;
    var totalH = padTop + tplH + (legendH > 0 ? (gapBetween + legendH) : 0) + 20;

    var c = document.createElement("canvas");
    c.width = totalW; c.height = totalH;
    var ctx = c.getContext("2d");
    // 白色底
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);

    // ---- 顶部：模板图 ----
    var ox = padX + (legendW - tplW) / 2;  // 模板水平居中（如果对照表更宽）
    if (ox < 0) ox = padX;
    var oy = padTop;
    // 透明棋盘格背景
    for (var ly = 0; ly < vr.h; ly++){
      for (var lx = 0; lx < vr.w; lx++){
        var gx = vr.x0 + lx, gy = vr.y0 + ly;
        var cell0 = grid[gy][gx];
        var px = ox + lx * cell, py = oy + ly * cell;
        if (!cell0){
          ctx.fillStyle = ((lx + ly) % 2 === 0) ? "#f2f2f2" : "#e9e9e9";
          ctx.fillRect(px, py, cell, cell); continue;
        }
        var b = cell0.bead;
        if (heat){
          var t = cell0.dist / maxD;
          ctx.fillStyle = heatColor(t);
        } else {
          ctx.fillStyle = "rgb(" + b.r + "," + b.g + "," + b.b + ")";
        }
        ctx.fillRect(px, py, cell, cell);
        // 立体圆点
        ctx.beginPath();
        ctx.arc(px + cell/2, py + cell/2, cell * 0.42, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(px + cell/2 - cell * 0.12, py + cell/2 - cell * 0.12, cell * 0.1, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,.28)"; ctx.fill();
        // 颜色数字编号（中央大字）
        if (numbers && colorNumbers){
          ctx.fillStyle = contrastColor(b.r, b.g, b.b);
          ctx.font = "bold " + Math.floor(cell * 0.48) + "px sans-serif";
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(colorNumbers[b.id] || "", px + cell/2, py + cell/2);
        }
        // 色号标签（底部小字）
        if (labels){
          ctx.fillStyle = contrastColor(b.r, b.g, b.b);
          ctx.font = Math.floor(cell * 0.22) + "px sans-serif";
          ctx.textAlign = "center"; ctx.textBaseline = "bottom";
          ctx.fillText(getBrandId(b), px + cell/2, py + cell - 4);
        }
        // 进度打卡遮罩
        if (placed && placed[gy][gx]){
          ctx.fillStyle = "rgba(40,200,90,.45)";
          ctx.fillRect(px, py, cell, cell);
          ctx.strokeStyle = "#1f9d4d"; ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(px + cell * 0.28, py + cell * 0.52);
          ctx.lineTo(px + cell * 0.44, py + cell * 0.66);
          ctx.lineTo(px + cell * 0.72, py + cell * 0.34);
          ctx.stroke();
        }
      }
    }
    // 网格线
    if (gridLines){
      ctx.strokeStyle = "rgba(0,0,0,.2)"; ctx.lineWidth = 1;
      for (var gx2 = 0; gx2 <= vr.w; gx2++){ ctx.beginPath(); ctx.moveTo(ox + gx2 * cell + .5, oy); ctx.lineTo(ox + gx2 * cell + .5, oy + vr.h * cell); ctx.stroke(); }
      for (var gy2 = 0; gy2 <= vr.h; gy2++){ ctx.beginPath(); ctx.moveTo(ox, oy + gy2 * cell + .5); ctx.lineTo(ox + vr.w * cell, oy + gy2 * cell + .5); ctx.stroke(); }
    }

    // ---- 底部：颜色对照表 ----
    if (legendItems.length > 0){
      var legendY = oy + vr.h * cell + gapBetween;
      // 标题
      ctx.fillStyle = "#222";
      ctx.font = "bold 28px sans-serif";
      ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillText("颜色对照表（共 " + legendItems.length + " 种颜色）", padX, legendY);
      legendY += 50;
      // 表头底色
      ctx.fillStyle = "#f5f6ff";
      ctx.fillRect(padX, legendY - 6, legendW, legendRows * legendRowH + 12);
      // 每项
      legendItems.forEach(function(it, idx){
        var col = idx % legendCols;
        var row = Math.floor(idx / legendCols);
        var x = padX + col * legendColW + 10;
        var y = legendY + row * legendRowH;
        var b = it.bead;
        var brandId = getBrandId(b);
        var brandName = getBrandName(b);
        var brandInfo = getBrandInfo(b);
        // 编号圆
        ctx.fillStyle = "rgb(" + b.r + "," + b.g + "," + b.b + ")";
        ctx.beginPath();
        ctx.arc(x + swatch/2, y + swatch/2, swatch/2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,.15)"; ctx.lineWidth = 1; ctx.stroke();
        // 编号数字
        ctx.fillStyle = contrastColor(b.r, b.g, b.b);
        ctx.font = "bold 22px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(it.num, x + swatch/2, y + swatch/2);
        // 名称 + 色号 + 数量
        ctx.fillStyle = "#222";
        ctx.font = "bold 18px sans-serif";
        ctx.textAlign = "left"; ctx.textBaseline = "top";
        ctx.fillText(brandName + (brandInfo.fallback ? " 近似" : ""), x + swatch + 12, y + 4);
        ctx.fillStyle = "#6b6a7d";
        ctx.font = "15px sans-serif";
        ctx.fillText("色号 " + brandId + "  ×" + it.n + " 颗", x + swatch + 12, y + 24);
      });
    }

    return c;
  }

  downloadBtn.addEventListener("click", function () {
    if (!lastResult) return;
    renderView();
    var c = buildExportCanvas();
    if (!c) return;
    var filename = "拼豆模板_" + lastResult.w + "x" + lastResult.h + ".png";
    // 优先用 Web Share API（可让用户直接保存到相册）
    if (c.toBlob && navigator.canShare && navigator.canShare({ files: [new File([""], "test.png", { type: "image/png" })] })){
      c.toBlob(function (blob) {
        var file = new File([blob], filename, { type: "image/png" });
        if (navigator.canShare({ files: [file] })){
          navigator.share({
            files: [file],
            title: "拼豆模板",
            text: "拼豆模板 " + lastResult.w + "×" + lastResult.h
          }).catch(function () {});
        } else {
          fallbackDownload(c, filename);
        }
      }, "image/png");
    } else {
      fallbackDownload(c, filename);
    }
  });
  function fallbackDownload(c, filename){
    var url = c.toDataURL("image/png");
    var a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    setTimeout(function () { URL.revokeObjectURL && URL.revokeObjectURL(url); }, 1000);
  }
  copyListBtn.addEventListener("click", function () {
    if (!lastResult) return;
    var useView = currentBoard >= 0 && boards;
    var agg = gatherCounts(useView);
    var arr = Object.keys(agg.counts).map(function (k) { return agg.counts[k]; });
    arr.sort(function (a, b) { return b.n - a.n; });
    var head = (useView ? "第" + (currentBoard + 1) + "/" + boards.length + "块 " : "") + "拼豆清单 " + lastResult.w + "×" + lastResult.h + "（共" + agg.total + "颗）";
    var lines = [head, "－－－－－－"];
    arr.forEach(function (it) {
      var brandId = getBrandId(it.bead);
      var brandName = getBrandName(it.bead);
      var brandInfo = getBrandInfo(it.bead);
      lines.push(brandId + " " + brandName + (brandInfo.fallback ? " (近似)" : "") + " ×" + it.n);
    });
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
  updateMaskSummary();

  /* ================= 色卡品牌切换 ================= */
  function refreshPaletteHint() {
    if (!paletteHintEl) return;
    var brand = CURRENT_BRAND;
    var info = paletteCoverage(brand);
    var exact = info.exact, total = info.total;
    var pct = total > 0 ? Math.round(exact / total * 100) : 0;
    var label = (PALETTES[brand] && PALETTES[brand].label) || brand;
    paletteHintEl.innerHTML = "当前色卡：<b>" + label + "</b>　精确匹配 <b>" + exact + "/" + total + "</b> 色（" + pct + "%），其余颜色使用相近色号对应";
  }
  if (paletteBrandSel) {
    paletteBrandSel.addEventListener("change", function () {
      CURRENT_BRAND = paletteBrandSel.value || "MARD";
      refreshPaletteHint();
      // 重新渲染所有涉及色号显示的部分
      if (lastResult) {
        colorNumbers = assignColorNumbers(lastResult.grid);
        renderView();
        renderNumberLegend();
        renderStats();
        renderInvPanel();
        renderMaskPanel();
      } else {
        renderInvPanel();
        renderMaskPanel();
      }
    });
  }
  refreshPaletteHint();

  /* ================= 创意工具箱 ================= */
  // 工具：hex 转 rgb；按 rgb 找拼豆格子
  function hexToRgb(h){ h=h.replace("#",""); return [parseInt(h.substr(0,2),16),parseInt(h.substr(2,2),16),parseInt(h.substr(4,2),16)]; }
  function cellOf(rgb){ var m=matchColor(rgb[0],rgb[1],rgb[2],null); return {bead:m.bead,r:rgb[0],g:rgb[1],b:rgb[2],dist:m.dist}; }

  // 配色主题（曼陀罗用）
  var THEMES = {
    rainbow:[[255,60,60],[255,140,40],[255,210,0],[80,180,80],[60,130,230],[140,80,200]],
    ocean:[[30,70,150],[60,130,230],[120,200,255],[180,230,240],[255,255,255]],
    warm:[[255,90,90],[255,130,40],[255,180,50],[255,210,0],[255,120,150]],
    forest:[[50,110,50],[80,160,70],[130,190,90],[200,180,80],[110,150,60]],
    mono:[[220,40,40],[185,30,35],[150,25,30],[115,20,25],[80,15,20]]
  };
  // 对称曼陀罗：按对称轴旋转复制，同角度同距离用同色，保证旋转对称
  function genMandala(axis, themeKey, size, seed){
    var theme = THEMES[themeKey] || THEMES.rainbow;
    var c = (size-1)/2;
    var grid = []; for (var y=0;y<size;y++) grid.push(new Array(size).fill(null));
    function h(n){ n=(Math.imul(n,2654435761)+seed*97)>>>0; n=(n^(n>>>15))>>>0; n=(Math.imul(n,2246822519))>>>0; n=(n^(n>>>13))>>>0; return n/4294967296; }
    var sw = Math.PI*2/axis;
    for (var y=0;y<size;y++){
      for (var x=0;x<size;x++){
        var dx=x-c, dy=y-c, dist=Math.sqrt(dx*dx+dy*dy);
        if (dist > c+0.5) continue;
        var ang=Math.atan2(dy,dx);
        var norm=(ang+Math.PI*2)%(Math.PI*2);
        var sector=Math.floor(norm/sw);
        var ang0=norm-sector*sw;
        var aq=Math.floor(ang0/sw*6);
        var dq=Math.floor(dist*2);
        var ci=Math.floor(h(aq*100+dq)*theme.length);
        if (ci>=theme.length) ci=theme.length-1;
        grid[y][x]=cellOf(theme[ci]);
      }
    }
    return grid;
  }

  // 5×7 像素字体（A–Z 0–9 空格）
  var FONT5x7 = {
    'A':["01110","10001","10001","11111","10001","10001","10001"],
    'B':["11110","10001","10001","11110","10001","10001","11110"],
    'C':["01111","10000","10000","10000","10000","10000","01111"],
    'D':["11110","10001","10001","10001","10001","10001","11110"],
    'E':["11111","10000","10000","11110","10000","10000","11111"],
    'F':["11111","10000","10000","11110","10000","10000","10000"],
    'G':["01111","10000","10000","10111","10001","10001","01111"],
    'H':["10001","10001","10001","11111","10001","10001","10001"],
    'I':["01110","00100","00100","00100","00100","00100","01110"],
    'J':["00111","00010","00010","00010","10010","10010","01100"],
    'K':["10001","10010","10100","11000","10100","10010","10001"],
    'L':["10000","10000","10000","10000","10000","10000","11111"],
    'M':["10001","11011","10101","10001","10001","10001","10001"],
    'N':["10001","11001","10101","10011","10001","10001","10001"],
    'O':["01110","10001","10001","10001","10001","10001","01110"],
    'P':["11110","10001","10001","11110","10000","10000","10000"],
    'Q':["01110","10001","10001","10001","10101","10010","01101"],
    'R':["11110","10001","10001","11110","10100","10010","10001"],
    'S':["01111","10000","10000","01110","00001","00001","11110"],
    'T':["11111","00100","00100","00100","00100","00100","00100"],
    'U':["10001","10001","10001","10001","10001","10001","01110"],
    'V':["10001","10001","10001","10001","10001","01010","00100"],
    'W':["10001","10001","10001","10001","10101","11011","10001"],
    'X':["10001","10001","01010","00100","01010","10001","10001"],
    'Y':["10001","10001","01010","00100","00100","00100","00100"],
    'Z':["11111","00001","00010","00100","01000","10000","11111"],
    '0':["01110","10001","10011","10101","11001","10001","01110"],
    '1':["00100","01100","00100","00100","00100","00100","01110"],
    '2':["01110","10001","00001","00010","00100","01000","11111"],
    '3':["01110","10001","00001","00110","00001","10001","01110"],
    '4':["00010","00110","01010","10010","11111","00010","00010"],
    '5':["11111","10000","11110","00001","00001","10001","01110"],
    '6':["01110","10000","10000","11110","10001","10001","01110"],
    '7':["11111","00001","00010","00100","01000","01000","01000"],
    '8':["01110","10001","10001","01110","10001","10001","01110"],
    '9':["01110","10001","10001","01111","00001","00001","01110"],
    ' ':["00000","00000","00000","00000","00000","00000","00000"]
  };
  function genText(s, rgb, bgMode, bg1, bg2){
    s = s.toUpperCase();
    var cw=5, ch=7, gap=1;
    var totalW = s.length*(cw+gap) - (s.length>0?gap:0);
    if (totalW < 1) totalW = 1;
    var grid = []; for (var y=0;y<ch;y++) grid.push(new Array(totalW).fill(null));
    // 先填背景
    if (bgMode !== "none"){
      for (var y=0;y<ch;y++){
        for (var x=0;x<totalW;x++){
          var bc;
          if (bgMode === "solid"){
            bc = bg1;
          } else { // grad（水平渐变）
            var t = totalW<=1?0:x/(totalW-1);
            var br = Math.round(bg1[0]+(bg2[0]-bg1[0])*t);
            var bg = Math.round(bg1[1]+(bg2[1]-bg1[1])*t);
            var bb = Math.round(bg1[2]+(bg2[2]-bg1[2])*t);
            bc = [br,bg,bb];
          }
          grid[y][x] = cellOf(bc);
        }
      }
    }
    // 再叠文字
    for (var i=0;i<s.length;i++){
      var g = FONT5x7[s.charAt(i)] || FONT5x7[' '];
      for (var r=0;r<7;r++){
        for (var c=0;c<5;c++){
          if (g[r].charAt(c) === "1"){
            grid[r][i*(cw+gap)+c] = cellOf(rgb);
          }
        }
      }
    }
    return { grid: grid, w: totalW, h: ch };
  }

  // 渐变色阶（多种形状）
  function genGradient(c1, c2, n, shape){
    n = Math.max(2, n);
    shape = shape || "h";
    function colorAt(t){
      var r = Math.round(c1[0]+(c2[0]-c1[0])*t);
      var g = Math.round(c1[1]+(c2[1]-c1[1])*t);
      var b = Math.round(c1[2]+(c2[2]-c1[2])*t);
      return cellOf([r,g,b]);
    }
    if (shape === "v"){
      var gv = [];
      for (var i=0;i<n;i++){ gv.push([colorAt(n===1?0:i/(n-1))]); }
      return { grid: gv, w: 1, h: n };
    }
    if (shape === "h"){
      var row = [];
      for (var i=0;i<n;i++){ row.push(colorAt(n===1?0:i/(n-1))); }
      return { grid: [row], w: n, h: 1 };
    }
    // d / block / circle：N×N 方阵
    var G = []; for (var y=0;y<n;y++) G.push(new Array(n).fill(null));
    var maxD = Math.sqrt(2)*((n-1)/2);
    for (var y=0;y<n;y++){
      for (var x=0;x<n;x++){
        var t;
        if (shape === "d"){
          t = (n<=1)?0:(x+y)/(2*(n-1));
        } else if (shape === "block"){
          t = (n<=1)?0:x/(n-1);
        } else { // circle
          var dx = x-(n-1)/2, dy = y-(n-1)/2;
          var dist = Math.sqrt(dx*dx+dy*dy);
          t = maxD===0?0:dist/maxD;
          if (t>1) t = 1;
        }
        G[y][x] = colorAt(t);
      }
    }
    return { grid: G, w: n, h: n };
  }

  // 通用：把生成的 grid 应用为模板结果
  function applyGenerated(grid, w, h){
    currentImage = null;
    previewWrap.hidden = true; dropZone.style.display = "";
    generateBtn.disabled = false;
    sizeW.value = w; sizeH.value = h; sizePreset.value = "0";
    var bsz = Math.max(0, parseInt(boardSizeEl.value, 10) || 0);
    applyResult(grid, w, h, bsz, 0);
  }

  // 对称曼陀罗按钮
  mandalaBtn.addEventListener("click", function(){
    var axis = parseInt(mandalaAxis.value,10)||6;
    var tk = mandalaTheme.value;
    var size;
    if (mandalaUseTpl && mandalaUseTpl.checked){
      var sw = clamp(parseInt(sizeW.value,10)||29, 2, 100);
      var sh = clamp(parseInt(sizeH.value,10)||29, 2, 100);
      size = Math.min(sw, sh);
    } else {
      size = parseInt(mandalaSize.value,10)||33;
    }
    if (size % 2 === 0) size += 1;
    if (size < 5) size = 5;
    var seed = Math.floor(Math.random()*1e9);
    var grid = genMandala(axis, tk, size, seed);
    applyGenerated(grid, size, size);
  });
  // 像素文字按钮
  textBtn.addEventListener("click", function(){
    var s = (textInput.value||"").toUpperCase().replace(/[^A-Z0-9 ]/g,"");
    if (!s.trim()){ alert("仅支持 A–Z、0–9 和空格，请重新输入"); return; }
    var rgb = hexToRgb(textColor.value || "#1a1a1a");
    var bgMode = textBgMode ? textBgMode.value : "none";
    var bg1 = hexToRgb((textBgSolid && textBgSolid.value) || "#ffe9a8");
    var bg2 = hexToRgb((textBg2 && textBg2.value) || "#ff8fab");
    // 跟随模板尺寸：扩展字牌高度
    var extraH = 0;
    if (textUseTpl && textUseTpl.checked){
      var sh = clamp(parseInt(sizeH.value,10)||7, 7, 100);
      extraH = Math.max(0, sh - 7);
    }
    var r = genText(s, rgb, bgMode, bg1, bg2);
    if (extraH > 0){
      // 在字牌底部加空白行（保持背景）
      for (var y=0;y<extraH;y++){
        var row = new Array(r.w).fill(null);
        if (bgMode !== "none"){
          for (var x=0;x<r.w;x++){
            var bc;
            if (bgMode === "solid") bc = bg1;
            else { var t = r.w<=1?0:x/(r.w-1);
              bc = [Math.round(bg1[0]+(bg2[0]-bg1[0])*t), Math.round(bg1[1]+(bg2[1]-bg1[1])*t), Math.round(bg1[2]+(bg2[2]-bg1[2])*t)];
            }
            row[x] = cellOf(bc);
          }
        }
        r.grid.push(row);
      }
      r.h = 7 + extraH;
    }
    applyGenerated(r.grid, r.w, r.h);
  });
  // 渐变色阶按钮
  gradBtn.addEventListener("click", function(){
    var c1 = hexToRgb(gradC1.value||"#ff3a3a");
    var c2 = hexToRgb(gradC2.value||"#3a6bff");
    var n = Math.max(2, Math.min(50, parseInt(gradN.value,10)||12));
    var shape = gradShape ? gradShape.value : "h";
    if (gradUseTpl && gradUseTpl.checked){
      var sw = clamp(parseInt(sizeW.value,10)||n, 2, 100);
      var sh = clamp(parseInt(sizeH.value,10)||n, 2, 100);
      // 根据形状决定用哪一边
      if (shape === "h") n = sw;
      else if (shape === "v") n = sh;
      else { // 方阵：用较小值保证能放下
        n = Math.min(sw, sh);
      }
      if (n < 2) n = 2;
    }
    var r = genGradient(c1, c2, n, shape);
    applyGenerated(r.grid, r.w, r.h);
  });
  // 实物尺寸计算器按钮
  calcBtn.addEventListener("click", function(){
    var bead = parseFloat(calcSpec.value)||5;
    var w = lastResult ? lastResult.w : (parseInt(sizeW.value,10)||29);
    var h = lastResult ? lastResult.h : (parseInt(sizeH.value,10)||29);
    var wcm = (w*bead/10).toFixed(1), hcm = (h*bead/10).toFixed(1);
    var totalW = (w*bead/10).toFixed(1);
    var totalH = (h*bead/10).toFixed(1);
    calcOut.hidden = false;
    calcOut.innerHTML =
      "<div class='calc-row'><b>宽 × 高</b><span>" + w + " × " + h + " 豆</span></div>" +
      "<div class='calc-row'><b>豆子规格</b><span>" + bead + " mm</span></div>" +
      "<div class='calc-row'><b>成品尺寸</b><span>" + wcm + " × " + hcm + " cm</span></div>" +
      "<div class='calc-row'><b>对角线</b><span>" + (Math.sqrt(w*w+h*h)*bead/10).toFixed(1) + " cm</span></div>";
  });

  /* ================= 图纸收藏夹 ================= */
  var patternsKey = "beads-patterns-v1";
  function loadPatterns() {
    try { return JSON.parse(localStorage.getItem(patternsKey)) || []; } catch (e) { return []; }
  }
  function savePatterns(arr) {
    try { localStorage.setItem(patternsKey, JSON.stringify(arr)); } catch (e) { alert("存储空间不足，请删除部分旧图纸"); }
  }

  // 生成缩略图 dataURL
  function gridToThumb(grid, w, h) {
    var s = Math.max(2, Math.floor(120 / Math.max(w, h)));
    var cv = document.createElement("canvas");
    cv.width = w * s; cv.height = h * s;
    var cx = cv.getContext("2d");
    cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var c = grid[y][x];
      if (!c) { cx.fillStyle = "#f0f0f0"; cx.fillRect(x * s, y * s, s, s); continue; }
      cx.fillStyle = "rgb(" + c.bead.r + "," + c.bead.g + "," + c.bead.b + ")";
      cx.fillRect(x * s, y * s, s, s);
    }
    return cv.toDataURL("image/png");
  }

  // 收藏当前模板
  savePatternBtn.addEventListener("click", function () {
    if (!lastResult) { alert("请先生成一个模板"); return; }
    var name = (patternNameEl.value || "").trim();
    if (!name) { alert("请输入图纸名称"); patternNameEl.focus(); return; }
    var patterns = loadPatterns();
    var thumb = gridToThumb(lastResult.grid, lastResult.w, lastResult.h);
    // 序列化 grid：只保存 bead id，加载时恢复
    var lightGrid = [];
    for (var y = 0; y < lastResult.h; y++) {
      var row = [];
      for (var x = 0; x < lastResult.w; x++) {
        var c = lastResult.grid[y][x];
        row.push(c ? { id: c.bead.id, d: c.dist || 0 } : null);
      }
      lightGrid.push(row);
    }
    patterns.unshift({
      id: Date.now(),
      name: name,
      w: lastResult.w, h: lastResult.h,
      bsz: lastResult.boardSize,
      maxDist: lastResult.maxDist,
      grid: lightGrid,
      thumb: thumb,
      time: new Date().toLocaleDateString("zh-CN")
    });
    // 最多保存 50 个
    if (patterns.length > 50) patterns = patterns.slice(0, 50);
    savePatterns(patterns);
    patternNameEl.value = "";
    renderPatternList();
  });

  // 恢复 grid（从 lightGrid 重建 cell 对象）
  function restoreGrid(lightGrid, w, h) {
    var grid = [];
    for (var y = 0; y < h; y++) {
      var row = [];
      for (var x = 0; x < w; x++) {
        var c = lightGrid[y][x];
        if (!c) { row.push(null); continue; }
        var bead = findBead(c.id);
        if (!bead) { row.push(null); continue; }
        row.push({ bead: bead, dist: c.d || 0 });
      }
      grid.push(row);
    }
    return grid;
  }

  // 渲染图纸列表
  function renderPatternList() {
    var patterns = loadPatterns();
    if (patterns.length === 0) {
      patternListEl.innerHTML = '<p class="hint" style="margin:8px 0">暂无收藏的图纸</p>';
      return;
    }
    var html = "";
    patterns.forEach(function (p) {
      html += '<div class="pattern-item">' +
        '<img src="' + p.thumb + '" class="pattern-thumb" alt="' + p.name + '">' +
        '<div class="pattern-info"><b>' + p.name + '</b><span>' + p.w + '×' + p.h + ' · ' + p.time + '</span></div>' +
        '<button class="btn-mini pattern-load" data-id="' + p.id + '">加载</button>' +
        '<button class="btn-icon pattern-del" data-id="' + p.id + '">🗑️</button>' +
        '</div>';
    });
    patternListEl.innerHTML = html;
  }

  // 列表点击事件（事件委托）
  patternListEl.addEventListener("click", function (e) {
    var btn = e.target.closest("button");
    if (!btn) return;
    var id = parseInt(btn.dataset.id);
    var patterns = loadPatterns();
    var p = patterns.find(function (x) { return x.id === id; });
    if (!p) return;
    if (btn.classList.contains("pattern-load")) {
      var grid = restoreGrid(p.grid, p.w, p.h);
      currentImage = null;
      previewWrap.hidden = true; dropZone.style.display = "";
      generateBtn.disabled = false;
      sizeW.value = p.w; sizeH.value = p.h; sizePreset.value = "0";
      applyResult(grid, p.w, p.h, p.bsz || 0, p.maxDist || 0);
    } else if (btn.classList.contains("pattern-del")) {
      if (!confirm("删除图纸「" + p.name + "」？")) return;
      patterns = patterns.filter(function (x) { return x.id !== id; });
      savePatterns(patterns);
      renderPatternList();
    }
  });

  // 页面加载时渲染列表
  renderPatternList();

  /* ================= 打印分页排版 ================= */
  printBtn.addEventListener("click", function () {
    if (!lastResult) { alert("请先生成一个模板"); return; }
    var cell = parseInt(printCellEl.value) || 24;
    var orient = printOrientEl.value;
    // A4 纸可打印像素区域（留 15mm 边距）
    // 纵向 180×262mm，横向 262×180mm，按 3.78px/mm
    var pW, pH;
    if (orient === "portrait") { pW = 180; pH = 252; }
    else { pW = 252; pH = 180; }
    var beadsPerRow = Math.floor((pW * 3.78 - 40) / cell);  // 留 40px 给页边信息
    var beadsPerCol = Math.floor((pH * 3.78 - 60) / cell);
    if (beadsPerRow < 5) beadsPerRow = 5;
    if (beadsPerCol < 5) beadsPerCol = 5;

    var grid = lastResult.grid;
    var totalW = lastResult.w, totalH = lastResult.h;
    var pagesW = Math.ceil(totalW / beadsPerRow);
    var pagesH = Math.ceil(totalH / beadsPerCol);
    var totalPages = pagesW * pagesH;

    var html = "";
    for (var py = 0; py < pagesH; py++) {
      for (var px = 0; px < pagesW; px++) {
        var page = py * pagesW + px + 1;
        var x0 = px * beadsPerRow, y0 = py * beadsPerCol;
        var w = Math.min(beadsPerRow, totalW - x0);
        var h = Math.min(beadsPerCol, totalH - y0);

        // 生成该页 canvas
        var cv = document.createElement("canvas");
        cv.width = w * cell + 40;
        cv.height = h * cell + 80;
        var cx = cv.getContext("2d");
        cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height);

        // 对齐标记
        cx.strokeStyle = "#888"; cx.lineWidth = 1.5;
        var mk = 12, ox = 20, oy = 30;
        // 左上
        cx.beginPath(); cx.moveTo(ox, oy + mk); cx.lineTo(ox, oy); cx.lineTo(ox + mk, oy); cx.stroke();
        // 右上
        cx.beginPath(); cx.moveTo(ox + w * cell - mk, oy); cx.lineTo(ox + w * cell, oy); cx.lineTo(ox + w * cell, oy + mk); cx.stroke();
        // 左下
        cx.beginPath(); cx.moveTo(ox, oy + h * cell - mk); cx.lineTo(ox, oy + h * cell); cx.lineTo(ox + mk, oy + h * cell); cx.stroke();
        // 右下
        cx.beginPath(); cx.moveTo(ox + w * cell - mk, oy + h * cell); cx.lineTo(ox + w * cell, oy + h * cell); cx.lineTo(ox + w * cell, oy + h * cell - mk); cx.stroke();

        // 网格线和颜色
        for (var gy = 0; gy < h; gy++) {
          for (var gx = 0; gx < w; gx++) {
            var c = grid[y0 + gy][x0 + gx];
            var dx = ox + gx * cell, dy = oy + gy * cell;
            if (!c) {
              // 透明：画棋盘格背景
              cx.fillStyle = ((gx + gy) % 2 === 0) ? "#f5f5f5" : "#e8e8e8";
              cx.fillRect(dx, dy, cell, cell);
            } else {
              cx.fillStyle = "rgb(" + c.bead.r + "," + c.bead.g + "," + c.bead.b + ")";
              cx.fillRect(dx, dy, cell, cell);
              // 编号
              if (colorNumbers && colorNumbers[c.bead.id]) {
                cx.fillStyle = contrastColor(c.bead.r, c.bead.g, c.bead.b);
                cx.font = Math.floor(cell * 0.35) + "px sans-serif";
                cx.textAlign = "center"; cx.textBaseline = "middle";
                cx.fillText(colorNumbers[c.bead.id], dx + cell / 2, dy + cell / 2);
              }
            }
            // 网格线
            cx.strokeStyle = "#ddd"; cx.lineWidth = 0.5;
            cx.strokeRect(dx, dy, cell, cell);
          }
        }

        // 页眉信息
        cx.fillStyle = "#333";
        cx.font = "14px sans-serif"; cx.textAlign = "left"; cx.textBaseline = "alphabetic";
        cx.fillText("拼豆模板 · " + totalW + "×" + totalH + " · 第 " + page + "/" + totalPages + " 页", 20, 20);
        // 区域信息
        cx.font = "12px sans-serif"; cx.fillStyle = "#888";
        cx.fillText("行 " + (y0 + 1) + "-" + (y0 + h) + " / 列 " + (x0 + 1) + "-" + (x0 + w), 20, cv.height - 15);

        // 本页颜色清单
        var pageColors = {};
        for (var gy2 = 0; gy2 < h; gy2++) for (var gx2 = 0; gx2 < w; gx2++) {
          var c2 = grid[y0 + gy2][x0 + gx2];
          if (!c2) continue;
          var id2 = c2.bead.id;
          if (!pageColors[id2]) pageColors[id2] = { bead: c2.bead, n: 0 };
          pageColors[id2].n++;
        }
        var colorArr = Object.keys(pageColors).map(function (k) { return pageColors[k]; });
        colorArr.sort(function (a, b) { return b.n - a.n; });
        var legendY = cv.height - 20;
        var legendX = ox + w * cell + 10;
        if (legendX + 120 > cv.width) legendX = 20;
        cx.font = "11px sans-serif";
        colorArr.forEach(function (it, i) {
          var bid = getBrandId(it.bead);
          var bname = getBrandName(it.bead);
          var row = Math.floor(i / 4);
          var col = i % 4;
          var lx = 20 + col * (cv.width - 40) / 4;
          var ly = cv.height - 20 + row * 16;
          if (ly < cv.height) {
            cx.fillStyle = "rgb(" + it.bead.r + "," + it.bead.g + "," + it.bead.b + ")";
            cx.fillRect(lx, ly - 10, 12, 12);
            cx.fillStyle = "#333";
            cx.fillText(bid + " " + bname + " ×" + it.n, lx + 16, ly);
          }
        });

        var dataUrl = cv.toDataURL("image/png");
        html += '<div class="print-page">' +
          '<img src="' + dataUrl + '" alt="第' + page + '页">' +
          '</div>';
      }
    }

    printPreviewEl.innerHTML = html +
      '<div class="print-actions">' +
      '<button onclick="window.print()" class="btn-primary">🖨️ 打印</button>' +
      '<span class="hint">共 ' + totalPages + ' 页，A4 ' + (orient === "portrait" ? "纵向" : "横向") + '</span>' +
      '</div>';
    printPreviewEl.hidden = false;
    printPreviewEl.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  /* ================= Service Worker ================= */
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }
})();
