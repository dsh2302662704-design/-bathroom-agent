// ===== 百炼 API 配置 =====
const BAILIAN_KEY = "sk-2e924699dabc4426aeacec6f4e909718";
const BAILIAN_APP = "779cf49642cb4f7f8f95bdf8f1d63ab1";
const BAILIAN_BASE = "https://dashscope.aliyuncs.com/api/v1";

// ===== DOM 引用 =====
const uploadArea = document.getElementById("uploadArea");
const uploadPlaceholder = document.getElementById("uploadPlaceholder");
const previewImg = document.getElementById("previewImg");
const btnRemove = document.getElementById("btnRemove");
const fileInput = document.getElementById("fileInput");
const descInput = document.getElementById("descInput");
const btnSubmit = document.getElementById("btnSubmit");
const tagGroup = document.getElementById("tagGroup");

const resultArea = document.getElementById("resultArea");
const resultEmpty = document.getElementById("resultEmpty");
const resultContent = document.getElementById("resultContent");

const riskStats = document.getElementById("riskStats");
const riskSummaryText = document.getElementById("riskSummaryText");
const priorityRisks = document.getElementById("priorityRisks");
const suggestionGrid = document.getElementById("suggestionGrid");
const resultImages = document.getElementById("resultImages");
const detailBody = document.getElementById("detailBody");
const cardImages = document.getElementById("cardImages");

const collapseDetail = document.getElementById("collapseDetail");
const btnRegenerate = document.getElementById("btnRegenerate");
const btnExport = document.getElementById("btnExport");
const btnChecklist = document.getElementById("btnChecklist");
const toast = document.getElementById("toast");

let imageData = null;
let lastResult = null; // 保存最近一次结果

// ===== 图片上传 =====
uploadArea.addEventListener("click", () => fileInput.click());
uploadArea.addEventListener("dragover", (e) => { e.preventDefault(); uploadArea.classList.add("drag-over"); });
uploadArea.addEventListener("dragleave", () => uploadArea.classList.remove("drag-over"));
uploadArea.addEventListener("drop", (e) => {
  e.preventDefault(); uploadArea.classList.remove("drag-over");
  const f = e.dataTransfer.files[0]; if (f) handleFile(f);
});
fileInput.addEventListener("change", () => { const f = fileInput.files[0]; if (f) handleFile(f); });
btnRemove.addEventListener("click", (e) => { e.stopPropagation(); clearImage(); });

function handleFile(file) {
  if (!file.type.startsWith("image/")) { alert("请上传图片文件"); return; }
  if (file.size > 10 * 1024 * 1024) { alert("图片大小不能超过 10MB"); return; }
  const reader = new FileReader();
  reader.onload = () => compressImage(reader.result, (c) => { imageData = c; previewImg.src = c; previewImg.classList.add("visible"); uploadPlaceholder.classList.add("hidden"); updateSubmit(); });
  reader.readAsDataURL(file);
}

function compressImage(dataUrl, cb) {
  const img = new Image();
  img.onload = () => {
    if (img.width <= 1200) return cb(dataUrl);
    const c = document.createElement("canvas"), r = 1200 / img.width;
    c.width = 1200; c.height = img.height * r;
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    cb(c.toDataURL("image/jpeg", .85));
  };
  img.src = dataUrl;
}

function clearImage() {
  imageData = null; previewImg.classList.remove("visible"); previewImg.src = "";
  uploadPlaceholder.classList.remove("hidden"); fileInput.value = ""; updateSubmit();
}

// ===== 快捷标签 =====
tagGroup.addEventListener("click", (e) => {
  const tag = e.target.closest(".tag");
  if (!tag) return;
  tag.classList.toggle("active");
  const texts = Array.from(tagGroup.querySelectorAll(".tag.active")).map((t) => t.dataset.text);
  descInput.value = texts.join("、");
  updateSubmit();
});

descInput.addEventListener("input", updateSubmit);
function updateSubmit() { btnSubmit.disabled = !(imageData && descInput.value.trim()); }

// ===== 提交流程 =====
btnSubmit.addEventListener("click", startAnalysis);

async function startAnalysis() {
  if (!imageData || !descInput.value.trim()) return;

  btnSubmit.classList.add("loading");
  btnSubmit.querySelector(".btn-text").classList.add("hidden");
  btnSubmit.querySelector(".btn-loading").classList.remove("hidden");
  resultContent.classList.add("hidden");
  resultEmpty.classList.add("hidden");

  try {
    const desc = descInput.value.trim();

    // Step 1: 调用百炼智能体 API 做文本分析
    const agentBody = {
      model: "",
      input: {
        prompt: `老人情况：${desc}\n\n请分析这张卫生间照片：\n1. 指出安全问题和风险点\n2. 给出适老化改造建议（具体位置和措施）\n3. 生成改造后的效果图`,
        image_list: [imageData],
      },
      parameters: {},
    };

    const agentRes = await fetch(
      `${BAILIAN_BASE}/apps/${BAILIAN_APP}/completion`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${BAILIAN_KEY}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(agentBody),
      }
    );

    if (!agentRes.ok) throw new Error("智能体分析失败 (" + agentRes.status + ")");
    const agentData = await agentRes.json();
    const text = agentData.output?.text || agentData.output?.choices?.[0]?.message?.content || "";

    // Step 2: 调用万相 API 生成效果图
    let images = [];
    try {
      images = await callWanx(imageData, desc);
    } catch (_) { /* 万相失败不影响文字结果 */ }

    lastResult = { text, images };
    resultEmpty.classList.add("hidden");
    resultContent.classList.remove("hidden");
    resultContent.scrollIntoView({ behavior: "smooth", block: "start" });

    const md = cleanMarkdown(text);
    renderAllCards(md, images);
  } catch (err) {
    showToast(err.message);
    resultEmpty.classList.remove("hidden");
  } finally {
    btnSubmit.classList.remove("loading");
    btnSubmit.querySelector(".btn-text").classList.remove("hidden");
    btnSubmit.querySelector(".btn-loading").classList.add("hidden");
    updateSubmit();
  }
}

async function callWanx(image, desc) {
  const hasWalking = /腿脚|行走|轮椅|拐杖|助行|步态|站立/.test(desc);
  const hasVision = /视力|白内障|盲|看.?见|眼|模糊/.test(desc);

  let ep = "在这间卫生间中添加以下适老化安全设施：马桶右侧安装不锈钢L型扶手，淋浴区墙面安装折叠式坐浴椅，";
  if (hasWalking) ep += "地面铺设防滑垫，马桶旁和淋浴区各安装一个紧急呼叫按钮，";
  if (hasVision) ep += "墙面和地面增加高对比度黄色防滑警示标识，洗手台和马桶区域提高照明亮度，";
  ep += "保持原有墙体、门窗、洁具位置和空间结构完全不变。真实照片风格。";

  const wanxRes = await fetch(
    `${BAILIAN_BASE}/services/aigc/multimodal-generation/generation`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${BAILIAN_KEY}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        model: "wan2.6-image",
        input: {
          messages: [{ role: "user", content: [{ text: ep }, { image }] }],
        },
        parameters: { n: 1, watermark: false, prompt_extend: false, size: "1K", enable_interleave: false },
      }),
    }
  );

  if (!wanxRes.ok) return [];
  const wanxData = await wanxRes.json();
  const imgs = [];
  for (const c of (wanxData.output?.choices || [])) {
    for (const it of (c.message?.content || [])) {
      if (it.image) imgs.push(it.image);
    }
  }
  return imgs;
}

function cleanMarkdown(text) {
  return text.replace(/!\[\]\(http:\/\/ds-restful-api[^)]+\)/g, "");
}

// ===== 结果渲染 =====
function renderAllCards(md, images) {
  // 解析各模块
  const riskData = extractRiskData(md);
  const priorityItems = extractPriorityRisks(md);
  const suggestions = extractSuggestions(md, riskData);

  renderRiskOverview(riskData);
  renderPriorityRisks(priorityItems);
  renderSuggestions(suggestions);
  renderImages(images);
  renderDetail(md);

  // 折叠区默认收起
  collapseDetail.parentElement.classList.remove("open");
  detailBody.classList.add("hidden");
}

// ===== A. 风险总览 =====
function extractRiskData(md) {
  const high = (md.match(/🔴|紧急|高风险/g) || []).length || (md.match(/如厕区|淋浴区|跌倒|滑倒|扶手/g) || []).length;
  const mid = (md.match(/🟡|重要|中风险/g) || []).length || Math.max(1, Math.round(high * 1.3));
  const low = (md.match(/🟢|可延后|低风险/g) || []).length || Math.max(1, Math.round(high * 0.6));
  // 提取判定文字
  const judgeMatch = md.match(/已初步判断.*?型\)/);
  const summary = judgeMatch ? judgeMatch[0] : "";
  return { high: Math.max(high, 2), medium: Math.max(mid, 3), low: Math.max(low, 1), summary };
}

function renderRiskOverview(d) {
  riskStats.innerHTML = `
    <div class="risk-stat high"><div class="risk-num">${d.high}</div><div class="risk-label">高风险项</div></div>
    <div class="risk-stat medium"><div class="risk-num">${d.medium}</div><div class="risk-label">中风险项</div></div>
    <div class="risk-stat low"><div class="risk-num">${d.low}</div><div class="risk-label">低风险项</div></div>
  `;
  riskSummaryText.textContent = d.summary;
}

// ===== B. 高优先级风险 =====
function extractPriorityRisks(md) {
  const items = [];
  const zones = [
    { re: /如厕区|马桶/, zone: "如厕区", cause: "缺少助力扶手，老人起坐困难，跌倒风险高", fix: "安装L型扶手 + 紧急呼叫按钮" },
    { re: /淋浴区|淋浴/, zone: "淋浴区", cause: "缺少防滑措施，湿滑环境下跌倒风险极高", fix: "铺设防滑垫 + 安装坐浴椅 + 恒温阀" },
    { re: /通行区|地面|门槛/, zone: "通行区", cause: "地面防滑不足，可能存在门槛高差，易绊倒", fix: "去除门槛 + 全域防滑处理" },
    { re: /照明|夜间|光线/, zone: "照明系统", cause: "夜间照明不足或开关位置不便", fix: "安装感应夜灯 + 双控开关" },
    { re: /紧急呼叫|求助|报警/, zone: "紧急呼叫", cause: "独居老人发生意外后无法及时求助", fix: "在如厕区和淋浴区各安装紧急呼叫按钮" },
    { re: /储物|收纳/, zone: "储物区", cause: "物品取放高度不合理，老人弯腰或踮脚有风险", fix: "调整收纳高度至 60-140cm 舒适区间" },
  ];

  for (const z of zones) {
    if (z.re.test(md)) items.push(z);
  }
  if (items.length === 0) {
    items.push({ zone: "全区域", cause: "需根据实际照片进一步评估", fix: "请上传清晰卫生间照片" });
  }
  return items.slice(0, 4);
}

function renderPriorityRisks(items) {
  priorityRisks.innerHTML = items.map((item, i) => `
    <div class="priority-risk-item">
      <div class="risk-header">
        <span class="risk-zone">${item.zone}</span>
        <span class="risk-badge${i > 1 ? ' medium' : ''}">${i < 2 ? '高' : '中'}优先级</span>
      </div>
      <div class="risk-detail">
        <span class="label">风险原因</span>${item.cause}<br>
        <span class="label">建议措施</span>${item.fix}
      </div>
    </div>
  `).join("");
}

// ===== C. 改造建议卡片 =====
function extractSuggestions(md, riskData) {
  const cards = [];
  const zones = [
    { zone: "如厕区", icon: "🚽", re: /如厕区|马桶/ },
    { zone: "淋浴区", icon: "🚿", re: /淋浴区|淋浴/ },
    { zone: "洗漱区", icon: "🪞", re: /洗漱区|洗手台/ },
    { zone: "通行区", icon: "🚶", re: /通行区|地面/ },
    { zone: "储物区", icon: "📦", re: /储物区|收纳/ },
  ];

  const defaults = {
    "如厕区": { problem: "缺少助力扶手，老人起坐困难", plan: "安装L型扶手 + 紧急呼叫按钮", budget: "¥300–¥800", difficulty: "低", people: "腿脚无力、轮椅转移、独居老人" },
    "淋浴区": { problem: "地面湿滑，缺少坐浴支撑", plan: "防滑垫 + 折叠坐浴椅 + 恒温阀", budget: "¥500–¥1,500", difficulty: "中", people: "平衡障碍、不能久站、轮椅使用者" },
    "洗漱区": { problem: "台面高度可能不合适，缺少支撑", plan: "安装台面扶手 + 调整镜柜高度", budget: "¥200–¥600", difficulty: "低", people: "轮椅使用者、身高较矮老人" },
    "通行区": { problem: "地面防滑不足，门槛形成高差", plan: "去除门槛 + 全域防滑处理", budget: "¥400–¥1,200", difficulty: "中", people: "所有行动不便老人" },
    "储物区": { problem: "物品取放高度不合理", plan: "调整收纳高度至60-140cm", budget: "¥100–¥400", difficulty: "低", people: "弯腰困难、轮椅使用者" },
  };

  for (const z of zones) {
    if (z.re.test(md)) {
      const d = defaults[z.zone];
      cards.push({
        zone: z.icon + " " + z.zone,
        problem: d.problem,
        plan: d.plan,
        budget: d.budget,
        difficulty: d.difficulty,
        people: d.people,
        priority: z.zone === "如厕区" || z.zone === "淋浴区" ? "high" : z.zone === "通行区" ? "medium" : "low",
      });
    }
  }
  return cards;
}

function renderSuggestions(cards) {
  const priLabel = { high: "高", medium: "中", low: "低" };
  suggestionGrid.innerHTML = cards.map((c) => `
    <div class="suggestion-card">
      <div class="sug-header">
        <span class="sug-zone">${c.zone}</span>
        <span class="sug-priority ${c.priority}">${priLabel[c.priority]}优先级</span>
      </div>
      <div class="sug-field"><span class="f-label">当前问题</span><span class="f-value">${c.problem}</span></div>
      <div class="sug-field"><span class="f-label">推荐方案</span><span class="f-value">${c.plan}</span></div>
      <div class="sug-field"><span class="f-label">适配人群</span><span class="f-value">${c.people}</span></div>
      <div class="sug-field"><span class="f-label">预算区间</span><span class="f-value">${c.budget}</span></div>
      <div class="sug-field"><span class="f-label">施工难度</span><span class="f-value">${c.difficulty}</span></div>
    </div>
  `).join("");
}

// ===== 效果图 =====
function renderImages(images) {
  if (!images || images.length === 0) {
    cardImages.classList.add("hidden");
    return;
  }
  cardImages.classList.remove("hidden");
  resultImages.innerHTML = images.map((url) => `<img src="${url}" alt="改造效果图" onclick="openLightbox('${url}')">`).join("");
}

// ===== D. 详细分析折叠区 =====
function renderDetail(md) {
  detailBody.innerHTML = marked.parse(md);
}

collapseDetail.addEventListener("click", () => {
  const card = collapseDetail.parentElement;
  const open = !card.classList.contains("open");
  card.classList.toggle("open", open);
  detailBody.classList.toggle("hidden", !open);
});

// ===== E. 操作按钮 =====
btnRegenerate.addEventListener("click", () => {
  if (!imageData || !descInput.value.trim()) { showToast("请先上传照片并填写老人情况"); return; }
  showToast("正在重新生成效果图…");
  startAnalysis();
});

btnExport.addEventListener("click", () => {
  if (!lastResult) { showToast("请先完成分析"); return; }
  const blob = new Blob([lastResult.text], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "卫生间适老化改造报告_" + new Date().toISOString().slice(0, 10) + ".txt";
  a.click();
  showToast("报告已下载");
});

btnChecklist.addEventListener("click", () => {
  if (!lastResult) { showToast("请先完成分析"); return; }
  // 从分析文本中提取采购项
  const items = extractChecklist(lastResult.text);
  const text = "卫生间适老化改造采购清单\n" + "=".repeat(40) + "\n\n" + items.join("\n");
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "适老化改造采购清单_" + new Date().toISOString().slice(0, 10) + ".txt";
  a.click();
  showToast("采购清单已下载");
});

function extractChecklist(md) {
  const items = [];
  const re = /(?:推荐|安装|铺设|配置|更换|增加)([^，。,\n]{2,40})/g;
  let m;
  while ((m = re.exec(md)) !== null) {
    const item = m[0].replace(/[*-]\s*/g, "").trim();
    if (!items.includes(item)) items.push(item);
  }
  if (items.length === 0) {
    items.push("L型助力扶手 ×1", "防滑地垫 ×1", "折叠坐浴椅 ×1", "紧急呼叫按钮 ×2", "感应夜灯 ×1");
  }
  return items.map((s, i) => `${i + 1}. ${s}`);
}

// ===== Toast =====
function showToast(msg) {
  toast.textContent = msg; toast.classList.remove("hidden");
  clearTimeout(toast._t); toast._t = setTimeout(() => toast.classList.add("hidden"), 2500);
}

// ===== 图片灯箱 =====
function openLightbox(url) {
  const lb = document.createElement("div"); lb.className = "lightbox";
  const img = document.createElement("img"); img.src = url;
  lb.appendChild(img); lb.addEventListener("click", () => lb.remove());
  document.body.appendChild(lb);
}
