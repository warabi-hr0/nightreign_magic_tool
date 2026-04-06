const FPS = 60;

let magicData = [];
let effectData = [];

const state = {
  effects: Array.from({ length: 6 }, () => ({ effectId: "", valueIndex: "" })),
  rows: [],
  modal: {
    rowId: null,
    draftCastCount: 1,
    draftCastModes: ["normal"],
    draftHitCount: 1
  },
  expandAll: {
    includeCharged: false,
    maxCastCount: 1
  },
  ime: {
    composingRowId: null
  },
  sort: {
    key: "",
    direction: "desc"
  }
};

function framesToSeconds(frames) {
  return frames > 0 ? frames / FPS : 0;
}

function formatNumber(value, digits = 2) {
  return Number(value || 0).toFixed(digits);
}

function getMagicById(id) {
  return magicData.find(m => m.id === id) || null;
}

function getSelectedEffects() {
  return state.effects
    .map(slot => {
      const effect = effectData.find(item => item.id === slot.effectId);
      if (!effect) return null;
      if (slot.valueIndex === "" || slot.valueIndex == null) return null;

      const idx = Number(slot.valueIndex);
      if (!Number.isInteger(idx) || idx < 0 || effect.values[idx] == null) return null;

      return { ...effect, value: effect.values[idx] };
    })
    .filter(Boolean);
}

function getDamageMultiplier(selectedEffects, isCharged) {
  return selectedEffects.reduce((acc, effect) => {
    if (effect.appliesTo === "chargedOnly" && !isCharged) return acc;
    return acc * (1 + effect.value);
  }, 1);
}

function createDefaultRow() {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    magicId: magicData[0]?.id || "",
    castCount: 1,
    castModes: ["normal"],
    hitCount: 1,
    hitRatePercent: 100,
    searchKeyword: "",
    isMagicOpen: false,
    isMagicSearchMode: false
  };
}

function cloneRow(row) {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    magicId: row.magicId,
    castCount: row.castCount,
    castModes: [...row.castModes],
    hitCount: row.hitCount ?? 1,
    hitRatePercent: row.hitRatePercent ?? 100,
    searchKeyword: "",
    isMagicOpen: false,
    isMagicSearchMode: false
  };
}

function createExpandedMagicRows(options = {}) {
  const includeCharged = Boolean(options.includeCharged);
  const maxCastCount = Math.max(1, Math.min(8, Number(options.maxCastCount) || 1));
  const rows = [];

  magicData.forEach(magic => {
    const caps = getMagicCapabilities(magic);
    const maxCountForMagic = caps.supportsChain ? maxCastCount : 1;

    // 通常版
    for (let castCount = 1; castCount <= maxCountForMagic; castCount += 1) {
      const normalRow = createDefaultRow();
      normalRow.magicId = magic.id;
      normalRow.castCount = castCount;
      normalRow.castModes = Array.from({ length: castCount }, () => "normal");
      normalRow.hitCount = 1;
      syncRowByMagic(normalRow);
      rows.push(normalRow);
    }

    // タメ版
    // 連続詠唱ありなら
    // タメ
    // タメ→通常
    // タメ→通常→通常
    // ... の形で追加する
    if (includeCharged && caps.supportsCharged) {
      for (let castCount = 1; castCount <= maxCountForMagic; castCount += 1) {
        const chargedRow = createDefaultRow();
        chargedRow.magicId = magic.id;
        chargedRow.castCount = castCount;
        chargedRow.castModes = Array.from({ length: castCount }, (_, index) =>
          index === 0 ? "charged" : "normal"
        );
        chargedRow.hitCount = 1;
        syncRowByMagic(chargedRow);
        rows.push(chargedRow);
      }
    }
  });

  return rows;
}

function createAllMagicRowsWithCharged() {
  const rows = [];

  magicData.forEach(magic => {
    const normalRow = createDefaultRow();
    normalRow.magicId = magic.id;
    normalRow.castCount = 1;
    normalRow.castModes = ["normal"];
    normalRow.hitCount = 1;
    syncRowByMagic(normalRow);
    rows.push(normalRow);

    const caps = getMagicCapabilities(magic);
    if (caps.supportsCharged) {
      const chargedRow = createDefaultRow();
      chargedRow.magicId = magic.id;
      chargedRow.castCount = 1;
      chargedRow.castModes = ["charged"];
      chargedRow.hitCount = 1;
      syncRowByMagic(chargedRow);
      rows.push(chargedRow);
    }
  });

  return rows;
}

function getMagicCapabilities(magic) {
  return {
    supportsCharged: Boolean(magic && magic.frames.charged > 0 && magic.damage.charged > 0),
    supportsChain: Boolean(magic && magic.frames.chainNormal > 0),
    supportsHitCount: Boolean(magic && magic.maxHits > 1)
  };
}

function isFallingstarMagic(magic) {
  return Boolean(magic && magic.name === "降り注ぐ魔力");
}

function getFallingstarResolvedHits(isCharged, hitRatePercent) {
  const percent = Math.max(10, Math.min(100, Number(hitRatePercent) || 100));
  const maxProjectiles = isCharged ? 45 : 25;
  const hitCap = isCharged ? 11 : 9;
  const rawHits = Math.round(maxProjectiles * (percent / 100));
  return Math.max(1, Math.min(hitCap, rawHits));
}

function getDisplayHitText(magic, row, isCharged) {
  if (!magic || !getMagicCapabilities(magic).supportsHitCount) {
    return "";
  }

  if (isFallingstarMagic(magic)) {
    const percent = Math.max(10, Math.min(100, Number(row.hitRatePercent) || 100));
    const resolvedHits = getFallingstarResolvedHits(isCharged, percent);
    return `${percent}%（${resolvedHits}hit相当）`;
  }

  return `${row.hitCount}hit`;
}

function syncRowByMagic(row) {
  const magic = getMagicById(row.magicId);
  const caps = getMagicCapabilities(magic);

  if (!caps.supportsChain) {
    row.castCount = 1;
  }

  row.castCount = Math.max(1, Math.min(8, Number(row.castCount) || 1));

  const next = [];
  for (let i = 0; i < row.castCount; i += 1) {
    const existing = row.castModes[i];
    if (caps.supportsCharged && existing === "charged") {
      next.push("charged");
    } else {
      next.push("normal");
    }
  }
  row.castModes = next;

  if (caps.supportsHitCount) {
    if (isFallingstarMagic(magic)) {
      row.hitRatePercent = Math.max(10, Math.min(100, Number(row.hitRatePercent) || 100));
      row.hitCount = getFallingstarResolvedHits(row.castModes.includes("charged"), row.hitRatePercent);
    } else {
      const maxHits = Number(magic.maxHits) || 1;
      row.hitCount = Math.max(1, Math.min(maxHits, Number(row.hitCount) || 1));
    }
  } else {
    row.hitCount = 1;
    row.hitRatePercent = 100;
  }
}

function getCastStep(magic, mode, index) {
  const isCharged = mode === "charged";
  const caps = getMagicCapabilities(magic);
  const useChain = caps.supportsChain && index > 0;

  const frames = isCharged
    ? (useChain && magic.frames.chainCharged > 0 ? magic.frames.chainCharged : magic.frames.charged)
    : (useChain && magic.frames.chainNormal > 0 ? magic.frames.chainNormal : magic.frames.normal);

  const damage = isCharged ? magic.damage.charged : magic.damage.normal;
  const fp = isCharged ? magic.fp.charged : magic.fp.normal;

  return { frames, damage, fp, isCharged };
}

function calculateRowResult(row) {
  const magic = getMagicById(row.magicId);
  if (!magic) return null;

  syncRowByMagic(row);

  const caps = getMagicCapabilities(magic);
  const effects = getSelectedEffects();

  const steps = row.castModes.map((mode, index) => {
    const base = getCastStep(magic, mode, index);
    const mult = getDamageMultiplier(effects, base.isCharged);

    let appliedHitCount = 1;
    if (caps.supportsHitCount) {
      if (isFallingstarMagic(magic)) {
        appliedHitCount = getFallingstarResolvedHits(base.isCharged, row.hitRatePercent);
      } else {
        appliedHitCount = row.hitCount;
      }
    }

    return {
      frames: base.frames,
      fp: base.fp,
      damage: base.damage * appliedHitCount * mult
    };
  });

  const totalFrames = steps.reduce((s, step) => s + step.frames, 0);
  const totalSeconds = framesToSeconds(totalFrames);
  const totalDamage = steps.reduce((s, step) => s + step.damage, 0);
  const totalFp = steps.reduce((s, step) => s + step.fp, 0);
  const dps = totalSeconds > 0 ? totalDamage / totalSeconds : 0;
  const fpEfficiency = totalFp > 0 ? totalDamage / totalFp : 0;

  return {
    magic,
    ...caps,
    totalSeconds,
    totalDamage,
    totalFp,
    dps,
    fpEfficiency,
    appliedHitCount: caps.supportsHitCount
      ? (isFallingstarMagic(magic)
          ? getFallingstarResolvedHits(row.castModes.includes("charged"), row.hitRatePercent)
          : row.hitCount)
      : 1
  };
}

function getSortedRows() {
  const rows = [...state.rows];
  const { key, direction } = state.sort;

  if (!key) {
    return rows;
  }

  const multiplier = direction === "asc" ? 1 : -1;

  rows.sort((a, b) => {
    const resultA = calculateRowResult(a);
    const resultB = calculateRowResult(b);

    const valueA = resultA?.[key] ?? 0;
    const valueB = resultB?.[key] ?? 0;

    if (valueA === valueB) {
      return 0;
    }

    return valueA > valueB ? multiplier : -multiplier;
  });

  return rows;
}

function toggleSort(sortKey) {
  if (state.sort.key === sortKey) {
    state.sort.direction = state.sort.direction === "asc" ? "desc" : "asc";
  } else {
    state.sort.key = sortKey;
    state.sort.direction = "desc";
  }

  rerender();
}

function openExpandAllModal() {
  closeAllMagicComboboxes();
  closeSequenceModal();

  document.getElementById("expandIncludeCharged").checked = state.expandAll.includeCharged;
  document.getElementById("expandMaxCastCount").value = String(state.expandAll.maxCastCount);

  document.getElementById("expandAllModalBackdrop").classList.add("open");
}

function closeExpandAllModal() {
  document.getElementById("expandAllModalBackdrop").classList.remove("open");
}

function applyExpandAllModal() {
  const nextRows = createExpandedMagicRows({
    includeCharged: state.expandAll.includeCharged,
    maxCastCount: state.expandAll.maxCastCount
  });

  if (nextRows.length === 0) return;

  state.rows = nextRows;
  closeExpandAllModal();
  rerender();
}

function updateSortHeaderState() {
  document.querySelectorAll(".sortable-header").forEach(th => {
    const sortKey = th.dataset.sortKey;
    if (state.sort.key === sortKey) {
      th.dataset.sortDir = state.sort.direction;
    } else {
      th.removeAttribute("data-sort-dir");
    }
  });
}

function normalizeSearchText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/\s+/g, "")
    .trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getMagicOptionList(row) {
  const normalizedKeyword = normalizeSearchText(row.searchKeyword);
  if (!normalizedKeyword) return magicData;

  return magicData.filter(magic =>
    normalizeSearchText(magic.name).includes(normalizedKeyword)
  );
}

function getMagicInputValue(row) {
  if (row.isMagicSearchMode) {
    return row.searchKeyword;
  }
  return getMagicById(row.magicId)?.name || "";
}

function createMagicOptionsHtml(row) {
  const filteredList = getMagicOptionList(row);

  if (filteredList.length === 0) {
    return `<div class="magic-combobox-empty">一致する魔術がありません</div>`;
  }

  return filteredList.map(magic => `
    <button
      type="button"
      class="magic-combobox-option ${magic.id === row.magicId ? "selected" : ""}"
      data-role="magic-option"
      data-row-id="${row.id}"
      data-magic-id="${magic.id}"
    >
      ${escapeHtml(magic.name)}
    </button>
  `).join("");
}

function createMagicPickerHtml(row) {
  return `
    <div class="magic-combobox ${row.isMagicOpen ? "open" : ""}" data-row-id="${row.id}">
      <div class="magic-combobox-control">
        <input
          type="text"
          class="magic-combobox-input"
          data-role="magic-combobox-input"
          data-row-id="${row.id}"
          value="${escapeHtml(getMagicInputValue(row))}"
          placeholder="魔術を選択"
          autocomplete="off"
          ${row.isMagicSearchMode ? "" : "readonly"}
        >
        <button
          type="button"
          class="magic-combobox-search"
          data-role="magic-combobox-search"
          data-row-id="${row.id}"
          tabindex="-1"
          aria-label="魔術を検索"
          title="検索"
        >🔍</button>
        <button
          type="button"
          class="magic-combobox-toggle"
          data-role="magic-combobox-toggle"
          data-row-id="${row.id}"
          tabindex="-1"
          aria-label="魔術候補を開く"
          title="候補を開く"
        >▼</button>
      </div>
      <div class="magic-combobox-menu ${row.isMagicOpen ? "" : "hidden"}">
        ${createMagicOptionsHtml(row)}
      </div>
    </div>
  `;
}

function refreshMagicOptionsOnly(rowId) {
  const row = state.rows.find(item => item.id === rowId);
  if (!row) return;

  const combo = document.querySelector(`.magic-combobox[data-row-id="${rowId}"]`);
  if (!combo) return;

  const menu = combo.querySelector(".magic-combobox-menu");
  if (!menu) return;

  menu.innerHTML = createMagicOptionsHtml(row);
  positionMagicMenu(rowId);
  fitMagicMenuToViewport(rowId);
}

function positionMagicMenu(rowId) {
  const combo = document.querySelector(`.magic-combobox[data-row-id="${rowId}"]`);
  if (!combo) return;

  const menu = combo.querySelector(".magic-combobox-menu");
  if (!menu || menu.classList.contains("hidden")) return;

  const comboRect = combo.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const margin = 12;
  const gap = 4;
  const minMenuHeight = 140;
  const maxMenuHeight = 320;
  const estimatedMenuHeight = Math.min(menu.scrollHeight || 0, maxMenuHeight);
  const requiredHeight = Math.min(Math.max(estimatedMenuHeight, minMenuHeight), maxMenuHeight);
  const spaceBelow = viewportHeight - comboRect.bottom - margin;
  const spaceAbove = comboRect.top - margin;
  const shouldOpenUp = spaceBelow < requiredHeight && spaceAbove > spaceBelow;

  menu.style.position = "absolute";
  menu.style.left = "0";
  menu.style.right = "0";
  menu.style.width = "auto";

  if (shouldOpenUp) {
    combo.dataset.menuDirection = "up";
    menu.style.top = "auto";
    menu.style.bottom = `calc(100% + ${gap}px)`;
  } else {
    combo.dataset.menuDirection = "down";
    menu.style.top = `calc(100% + ${gap}px)`;
    menu.style.bottom = "auto";
  }
}

function updateMagicPicker(rowId, options = {}) {
  const {
    focusInput = false,
    selectAll = false,
    moveCursorToEnd = false
  } = options;

  const row = state.rows.find(item => item.id === rowId);
  if (!row) return;

  const current = document.querySelector(`.magic-combobox[data-row-id="${rowId}"]`);
  if (!current) return;

  current.outerHTML = createMagicPickerHtml(row);

  if (focusInput) {
    const nextInput = document.querySelector(
      `.magic-combobox[data-row-id="${rowId}"] [data-role="magic-combobox-input"]`
    );
    if (nextInput) {
      nextInput.focus();
      if (selectAll) {
        nextInput.select();
      } else if (moveCursorToEnd) {
        const length = nextInput.value.length;
        nextInput.setSelectionRange(length, length);
      }
    }
  }

  positionMagicMenu(rowId);
  fitMagicMenuToViewport(rowId);
}

function fitMagicMenuToViewport(rowId) {
  const combo = document.querySelector(`.magic-combobox[data-row-id="${rowId}"]`);
  if (!combo) return;

  const menu = combo.querySelector(".magic-combobox-menu");
  if (!menu || menu.classList.contains("hidden")) return;

  const comboRect = combo.getBoundingClientRect();
  const margin = 12;
  const viewportHeight = window.innerHeight;
  const direction = combo.dataset.menuDirection === "up" ? "up" : "down";

  const availableHeight = direction === "up"
    ? Math.max(140, Math.floor(comboRect.top - margin))
    : Math.max(140, Math.floor(viewportHeight - comboRect.bottom - margin));

  menu.style.maxHeight = `${availableHeight}px`;
}

function closeMagicCombobox(rowId, rerenderPickerOnly = true) {
  const row = state.rows.find(item => item.id === rowId);
  if (!row || !row.isMagicOpen) return;

  row.isMagicOpen = false;
  row.isMagicSearchMode = false;
  row.searchKeyword = "";

  if (state.ime.composingRowId === rowId) {
    state.ime.composingRowId = null;
  }

  if (rerenderPickerOnly) {
    updateMagicPicker(rowId);
  }
}

function closeAllMagicComboboxes(exceptRowId = null) {
  state.rows.forEach(row => {
    if (row.id !== exceptRowId && row.isMagicOpen) {
      row.isMagicOpen = false;
      row.isMagicSearchMode = false;
      row.searchKeyword = "";
      if (state.ime.composingRowId === row.id) {
        state.ime.composingRowId = null;
      }
      updateMagicPicker(row.id);
    }
  });
}

function openMagicCombobox(rowId) {
  const row = state.rows.find(item => item.id === rowId);
  if (!row) return;

  closeAllMagicComboboxes(rowId);

  row.isMagicOpen = true;
  row.isMagicSearchMode = false;
  row.searchKeyword = "";
  updateMagicPicker(rowId);
}

function enableMagicSearchMode(rowId) {
  const row = state.rows.find(item => item.id === rowId);
  if (!row) return;

  closeAllMagicComboboxes(rowId);

  row.isMagicOpen = true;
  row.isMagicSearchMode = true;
  row.searchKeyword = "";
  updateMagicPicker(rowId, { focusInput: true });
}

function selectMagicForRow(rowId, magicId) {
  const row = state.rows.find(item => item.id === rowId);
  if (!row) return;

  row.magicId = magicId;
  row.castCount = 1;
  row.castModes = ["normal"];
  row.hitCount = 1;
  row.searchKeyword = "";
  row.isMagicOpen = false;
  row.isMagicSearchMode = false;

  if (state.ime.composingRowId === rowId) {
    state.ime.composingRowId = null;
  }

  syncRowByMagic(row);
  rerender();
}

function renderEffects() {
  const root = document.getElementById("effectsList");
  root.innerHTML = "";

  state.effects.forEach((slot, index) => {
    const effect = effectData.find(item => item.id === slot.effectId);
    const selectedValue = effect && slot.valueIndex !== "" ? effect.values[Number(slot.valueIndex)] : null;

    const el = document.createElement("div");
    el.className = "effect-slot";
    el.innerHTML = `
      <div class="slot-label">
        <span>付帯効果 ${index + 1}</span>
        <span class="slot-value">${selectedValue != null ? `+${Math.round(selectedValue * 100)}%` : "未設定"}</span>
      </div>
      <select data-effect-slot="${index}" data-role="effect">
        <option value="">未選択</option>
        ${effectData.map(item => `
          <option value="${item.id}" ${item.id === slot.effectId ? "selected" : ""}>
            ${item.name}
          </option>
        `).join("")}
      </select>
      <select data-effect-slot="${index}" data-role="value" ${effect ? "" : "disabled"}>
        <option value="">効果量を選択</option>
        ${effect
          ? effect.values.map((value, valueIndex) => `
              <option value="${valueIndex}" ${String(valueIndex) === String(slot.valueIndex) ? "selected" : ""}>
                ${Math.round(value * 100)}%
              </option>
            `).join("")
          : ""}
      </select>
    `;
    root.appendChild(el);
  });
}

function renderRows() {
  const tbody = document.getElementById("rowsTbody");
  tbody.innerHTML = "";

  getSortedRows().forEach(row => {
    const result = calculateRowResult(row);
    if (!result) return;

    const tr = document.createElement("tr");

    // タメが含まれるか判定
    if (row.castModes.includes("charged")) {
      tr.classList.add("row-charged");
    }

    let settingCell = "";
    if (result.supportsCharged && result.supportsChain) {
      settingCell = `
        <div class="control-stack">
          <div class="mini-label">タメ/連続詠唱数${result.supportsHitCount ? "/ヒット数" : ""}</div>
          <button type="button" class="ghost-btn" data-role="open-sequence-modal" data-row-id="${row.id}">
            設定${result.supportsHitCount ? `（${row.hitCount}hit）` : ""}
          </button>
        </div>
      `;
    } else if (result.supportsCharged) {
      settingCell = `
        <div class="control-stack">
          <div class="mini-label">タメ設定${result.supportsHitCount ? "/命中率" : ""}</div>
          <div class="control-inline">
            <select data-role="single-charge-mode" data-row-id="${row.id}">
              <option value="normal" ${row.castModes[0] === "normal" ? "selected" : ""}>通常</option>
              <option value="charged" ${row.castModes[0] === "charged" ? "selected" : ""}>タメ</option>
            </select>
            ${result.supportsHitCount ? `
              <select data-role="${isFallingstarMagic(result.magic) ? "hit-rate" : "hit-count"}" data-row-id="${row.id}">
                ${isFallingstarMagic(result.magic)
                  ? [10,20,30,40,50,60,70,80,90,100].map(percent => `
                      <option value="${percent}" ${Number(row.hitRatePercent) === percent ? "selected" : ""}>${percent}%</option>
                    `).join("")
                  : Array.from({ length: result.magic.maxHits }, (_, i) => i + 1).map(n => `
                      <option value="${n}" ${row.hitCount === n ? "selected" : ""}>${n}hit</option>
                    `).join("")
                }
              </select>
            ` : ""}
          </div>
        </div>
      `;
    } else if (result.supportsChain) {
      settingCell = `
        <div class="control-stack">
          <div class="mini-label">連続詠唱数${result.supportsHitCount ? "/ヒット数" : ""}</div>
          <select data-role="chain-count" data-row-id="${row.id}">
            ${[1, 2, 3, 4, 5, 6, 7, 8].map(n => `
              <option value="${n}" ${row.castCount === n ? "selected" : ""}>${n}回</option>
            `).join("")}
          </select>
          ${result.supportsHitCount ? `
            <select data-role="${isFallingstarMagic(result.magic) ? "hit-rate" : "hit-count"}" data-row-id="${row.id}">
              ${isFallingstarMagic(result.magic)
                ? [10,20,30,40,50,60,70,80,90,100].map(percent => `
                    <option value="${percent}" ${Number(row.hitRatePercent) === percent ? "selected" : ""}>${percent}%</option>
                  `).join("")
                : Array.from({ length: result.magic.maxHits }, (_, i) => i + 1).map(n => `
                    <option value="${n}" ${row.hitCount === n ? "selected" : ""}>${n}hit</option>
                  `).join("")
              }
            </select>
          ` : ""}
        </div>
      `;
    } else if (result.supportsHitCount) {
      settingCell = `
        <div class="control-stack">
          <div class="mini-label">${isFallingstarMagic(result.magic) ? "命中率" : "ヒット数"}</div>
          <button type="button" class="ghost-btn" data-role="open-sequence-modal" data-row-id="${row.id}">
            設定（${getDisplayHitText(result.magic, row, row.castModes.includes("charged"))}）
          </button>
        </div>
      `;
    } else {
      settingCell = `<div class="mini-label">設定なし</div>`;
    }

    tr.innerHTML = `
      <td>${settingCell}</td>
      <td>
        ${createMagicPickerHtml(row)}
      </td>
      <td><div class="metric-cell">${formatNumber(result.dps, 1)}</div></td>
      <td><div class="metric-cell">${formatNumber(result.fpEfficiency, 1)}</div></td>
      <td><div class="metric-cell">${formatNumber(result.totalDamage, 0)}</div></td>
      <td><div class="metric-cell">${formatNumber(result.totalFp, 0)}</div></td>
      <td><div class="metric-cell">${formatNumber(result.totalSeconds, 2)}</div></td>
      <td>
        <div class="metric-cell" style="white-space:normal; line-height:1.3; font-size:12px;">
          ${row.castModes.map(mode => mode === "charged" ? "タメ" : "通常").join(" → ")}
          ${result.supportsHitCount
            ? `<br>${getDisplayHitText(result.magic, row, row.castModes.includes("charged"))}`
            : ""}
        </div>
      </td>
      <td>
        <div class="action-buttons">
          <button type="button" class="ghost-btn" data-role="copy-row" data-row-id="${row.id}">コピー</button>
          <button type="button" class="danger-btn" data-role="remove-row" data-row-id="${row.id}">削除</button>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

function rerender() {
  renderEffects();
  renderRows();
  updateSortHeaderState();
}

function openSequenceModal(rowId) {
  const row = state.rows.find(item => item.id === rowId);
  if (!row) return;

  const magic = getMagicById(row.magicId);
  const caps = getMagicCapabilities(magic);
  if (!(caps.supportsCharged || caps.supportsHitCount || caps.supportsChain)) return;

  state.modal.rowId = rowId;
  state.modal.draftCastCount = row.castCount;
  state.modal.draftCastModes = [...row.castModes];
  state.modal.draftHitCount = isFallingstarMagic(magic)
    ? (row.hitRatePercent || 100)
    : (row.hitCount || 1);

  document.getElementById("modalMagicName").textContent = magic.name;
  renderModalContents();
  document.getElementById("sequenceModalBackdrop").classList.add("open");
}

function closeSequenceModal() {
  document.getElementById("sequenceModalBackdrop").classList.remove("open");
  state.modal.rowId = null;
}

function renderModalContents() {
  const row = state.rows.find(item => item.id === state.modal.rowId);
  if (!row) return;

  const magic = getMagicById(row.magicId);
  const caps = getMagicCapabilities(magic);

  const castCountWrap =
    document.getElementById("modalCastCount")?.closest(".control-stack") ||
    document.getElementById("modalCastCountWrap");

  const castCountSelect = document.getElementById("modalCastCount");
  const hitCountWrap = document.getElementById("modalHitCountWrap");
  const hitCountSelect = document.getElementById("modalHitCount");
  const sequenceGrid = document.getElementById("modalSequenceGrid");

  if (castCountWrap) {
    castCountWrap.style.display = caps.supportsChain ? "" : "none";
  }

  if (castCountSelect) {
    castCountSelect.innerHTML = [1, 2, 3, 4, 5, 6, 7, 8]
      .map(n => `<option value="${n}" ${state.modal.draftCastCount === n ? "selected" : ""}>${n}回</option>`)
      .join("");
  }

  const effectiveCastCount = caps.supportsChain ? state.modal.draftCastCount : 1;
  state.modal.draftCastCount = effectiveCastCount;

  if (caps.supportsHitCount && hitCountWrap && hitCountSelect) {
    hitCountWrap.style.display = "";

    const isCharged = state.modal.draftCastModes.includes("charged");

    if (isFallingstarMagic(magic)) {
      hitCountWrap.querySelector(".mini-label").textContent = "命中率";
      hitCountSelect.innerHTML = [10,20,30,40,50,60,70,80,90,100]
        .map(percent => `
          <option value="${percent}" ${Number(state.modal.draftHitCount || state.modal.draftHitRatePercent || 100) === percent ? "selected" : ""}>
            ${percent}%
          </option>
        `)
        .join("");
    } else {
      hitCountWrap.querySelector(".mini-label").textContent = "ヒット数";
      hitCountSelect.innerHTML = Array.from({ length: magic.maxHits }, (_, i) => i + 1)
        .map(n => `<option value="${n}" ${state.modal.draftHitCount === n ? "selected" : ""}>${n}hit</option>`)
        .join("");
    }
  } else if (hitCountWrap && hitCountSelect) {
    hitCountWrap.style.display = "none";
    hitCountSelect.innerHTML = "";
    state.modal.draftHitCount = 1;
  }

  const nextModes = [];
  for (let i = 0; i < effectiveCastCount; i += 1) {
    nextModes.push(
      caps.supportsCharged && state.modal.draftCastModes[i] === "charged"
        ? "charged"
        : "normal"
    );
  }
  state.modal.draftCastModes = nextModes;

  if (sequenceGrid) {
    sequenceGrid.innerHTML = state.modal.draftCastModes
      .map((mode, index) => `
        <div class="control-stack">
          <div class="mini-label">${index + 1}詠唱目</div>
          <select data-role="modal-cast-mode" data-index="${index}" ${caps.supportsCharged ? "" : "disabled"}>
            <option value="normal" ${mode === "normal" ? "selected" : ""}>通常</option>
            <option value="charged" ${mode === "charged" ? "selected" : ""}>タメ</option>
          </select>
        </div>
      `)
      .join("");
  }
}

async function loadData() {
  const [magicResponse, effectResponse] = await Promise.all([
    fetch("./magicData.json"),
    fetch("./effectData.json")
  ]);

  if (!magicResponse.ok) {
    throw new Error("magicData.json の読み込みに失敗しました。");
  }
  if (!effectResponse.ok) {
    throw new Error("effectData.json の読み込みに失敗しました。");
  }

  magicData = await magicResponse.json();
  effectData = await effectResponse.json();
}

async function initialize() {
  try {
    await loadData();

    state.rows = [createDefaultRow()];
    rerender();

    document.getElementById("addRowBtn").addEventListener("click", () => {
      state.rows.push(createDefaultRow());
      rerender();
    });

    document.querySelectorAll(".sortable-header").forEach(header => {
      header.addEventListener("click", () => {
        toggleSort(header.dataset.sortKey);
      });
    });

    document.getElementById("expandAllRowsBtn").addEventListener("click", () => {
      openExpandAllModal();
    });

    document.getElementById("expandIncludeCharged").addEventListener("change", event => {
      state.expandAll.includeCharged = event.target.checked;
    });

    document.getElementById("expandMaxCastCount").addEventListener("change", event => {
      state.expandAll.maxCastCount = Number(event.target.value) || 1;
    });

    document.getElementById("closeExpandAllModalBtn").addEventListener("click", () => {
      closeExpandAllModal();
    });

    document.getElementById("cancelExpandAllModalBtn").addEventListener("click", () => {
      closeExpandAllModal();
    });

    document.getElementById("applyExpandAllModalBtn").addEventListener("click", () => {
      applyExpandAllModal();
    });

    document.addEventListener("compositionstart", event => {
      const target = event.target;
      if (target.matches('[data-role="magic-combobox-input"]')) {
        state.ime.composingRowId = target.dataset.rowId || null;
      }
    });

    document.addEventListener("compositionend", event => {
      const target = event.target;
      if (target.matches('[data-role="magic-combobox-input"]')) {
        const rowId = target.dataset.rowId;
        const row = state.rows.find(item => item.id === rowId);
        if (!row) return;

        state.ime.composingRowId = null;
        row.searchKeyword = target.value;
        refreshMagicOptionsOnly(rowId);
      }
    });

    document.addEventListener("input", event => {
      const target = event.target;

      if (target.matches('[data-role="magic-combobox-input"]')) {
        const rowId = target.dataset.rowId;
        const row = state.rows.find(item => item.id === rowId);
        if (!row || !row.isMagicSearchMode) return;

        row.searchKeyword = target.value;

        if (state.ime.composingRowId === rowId) {
          return;
        }

        refreshMagicOptionsOnly(rowId);
        return;
      }
    });

    document.addEventListener("focusout", event => {
      const target = event.target;

      if (target.matches('[data-role="magic-combobox-input"]')) {
        const rowId = target.dataset.rowId;
        const row = state.rows.find(item => item.id === rowId);
        if (!row) return;

        if (!row.isMagicSearchMode) {
          return;
        }

        const container = document.querySelector(`.magic-combobox[data-row-id="${rowId}"]`);
        const related = event.relatedTarget;

        if (container && related && container.contains(related)) {
          return;
        }

        window.setTimeout(() => {
          const latestRow = state.rows.find(item => item.id === rowId);
          if (!latestRow || !latestRow.isMagicOpen || !latestRow.isMagicSearchMode) return;

          const active = document.activeElement;
          const latestContainer = document.querySelector(`.magic-combobox[data-row-id="${rowId}"]`);
          if (latestContainer && active && latestContainer.contains(active)) {
            return;
          }

          closeMagicCombobox(rowId, true);
        }, 0);
      }
    });

    document.addEventListener("keydown", event => {
      const target = event.target;

      if (target.matches('[data-role="magic-combobox-input"]')) {
        const rowId = target.dataset.rowId;
        const row = state.rows.find(item => item.id === rowId);
        if (!row || !row.isMagicSearchMode) return;

        if (event.key === "Enter") {
          event.preventDefault();
          const firstMagic = getMagicOptionList(row)[0];
          if (firstMagic) {
            selectMagicForRow(rowId, firstMagic.id);
          }
          return;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          closeMagicCombobox(rowId, true);
          target.blur();
          return;
        }
      }
    });

    document.addEventListener("change", event => {
      const target = event.target;

      if (target.matches("[data-effect-slot]")) {
        const slotIndex = Number(target.dataset.effectSlot);
        const role = target.dataset.role;
        const slot = state.effects[slotIndex];
        if (!slot) return;

        if (role === "effect") {
          slot.effectId = target.value;
          slot.valueIndex = "";
        } else if (role === "value") {
          slot.valueIndex = target.value;
        }

        rerender();
        return;
      }

      if (target.id === "modalCastCount") {
        state.modal.draftCastCount = Number(target.value) || 1;
        renderModalContents();
        return;
      }

      if (target.id === "modalHitCount") {
        state.modal.draftHitCount = Number(target.value) || 1;
        return;
      }

      if (target.matches('[data-role="modal-cast-mode"]')) {
        const index = Number(target.dataset.index);
        state.modal.draftCastModes[index] = target.value;
        return;
      }

      const rowId = target.dataset.rowId;
      if (!rowId) return;

      const row = state.rows.find(item => item.id === rowId);
      if (!row) return;

      switch (target.dataset.role) {
        case "single-charge-mode":
          row.castCount = 1;
          row.castModes = [target.value];
          break;
        case "chain-count":
          row.castCount = Number(target.value) || 1;
          break;
        case "hit-count":
          row.hitCount = Number(target.value) || 1;
          break;
        case "hit-rate":
          row.hitRatePercent = Number(target.value) || 100;
          break;
        default:
          return;
      }

      syncRowByMagic(row);
      rerender();
    });

    document.addEventListener("click", event => {
      const optionButton = event.target.closest('[data-role="magic-option"]');
      if (optionButton) {
        selectMagicForRow(optionButton.dataset.rowId, optionButton.dataset.magicId);
        return;
      }

      const searchButton = event.target.closest('[data-role="magic-combobox-search"]');
      if (searchButton) {
        enableMagicSearchMode(searchButton.dataset.rowId);
        return;
      }

      const toggleButton = event.target.closest('[data-role="magic-combobox-toggle"]');
      if (toggleButton) {
        const rowId = toggleButton.dataset.rowId;
        const row = state.rows.find(item => item.id === rowId);
        if (!row) return;

        if (row.isMagicOpen) {
          closeMagicCombobox(rowId, true);
        } else {
          openMagicCombobox(rowId);
        }
        return;
      }

      const input = event.target.closest('[data-role="magic-combobox-input"]');
      if (input) {
        const rowId = input.dataset.rowId;
        const row = state.rows.find(item => item.id === rowId);
        if (!row) return;

        if (!row.isMagicOpen) {
          openMagicCombobox(rowId);
          return;
        }

        if (!row.isMagicSearchMode) {
          closeMagicCombobox(rowId, true);
          return;
        }

        return;
      }

      const button = event.target.closest("button");
      if (!button) {
        if (!event.target.closest(".magic-combobox")) {
          closeAllMagicComboboxes();
        }
        return;
      }

      if (button.id === "closeModalBtn" || button.id === "cancelModalBtn") {
        closeSequenceModal();
        return;
      }

      if (button.id === "saveModalBtn") {
        const row = state.rows.find(item => item.id === state.modal.rowId);
        if (!row) return;

        row.castCount = state.modal.draftCastCount;
        row.castModes = [...state.modal.draftCastModes];

        const currentMagic = getMagicById(row.magicId);
        if (isFallingstarMagic(currentMagic)) {
          row.hitRatePercent = Number(state.modal.draftHitCount) || 100;
        } else {
          row.hitCount = Number(state.modal.draftHitCount) || 1;
        }

        syncRowByMagic(row);
        closeSequenceModal();
        rerender();
        return;
      }

      const rowId = button.dataset.rowId;
      if (!rowId) return;

      const rowIndex = state.rows.findIndex(item => item.id === rowId);
      if (rowIndex < 0) return;

      switch (button.dataset.role) {
        case "copy-row":
          state.rows.splice(rowIndex + 1, 0, cloneRow(state.rows[rowIndex]));
          rerender();
          break;
        case "remove-row":
          if (state.rows.length === 1) {
            state.rows = [createDefaultRow()];
          } else {
            state.rows.splice(rowIndex, 1);
          }
          rerender();
          break;
        case "open-sequence-modal":
          openSequenceModal(rowId);
          break;
        default:
          break;
      }
    });

    window.addEventListener("resize", () => {
      state.rows.forEach(row => {
        if (row.isMagicOpen) {
          positionMagicMenu(row.id);
        }
      });
    });

    window.addEventListener("scroll", () => {
      state.rows.forEach(row => {
        if (row.isMagicOpen) {
          positionMagicMenu(row.id);
        }
      });
    }, true);

    document.getElementById("sequenceModalBackdrop").addEventListener("click", event => {
      if (event.target.id === "sequenceModalBackdrop") {
        closeSequenceModal();
      }
    });

    document.getElementById("expandAllModalBackdrop").addEventListener("click", event => {
      if (event.target.id === "expandAllModalBackdrop") {
        closeExpandAllModal();
      }
    });
  } catch (error) {
    console.error(error);
    alert(error.message || "初期化に失敗しました。");
  }
}

initialize();