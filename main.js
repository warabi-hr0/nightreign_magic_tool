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
  ime: {
    composingRowId: null
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
      const idx = Number(slot.valueIndex);
      if (Number.isNaN(idx) || effect.values[idx] == null) return null;
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
    searchKeyword: "",
    isMagicOpen: false,
    magicJustOpened: false
  };
}

function cloneRow(row) {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    magicId: row.magicId,
    castCount: row.castCount,
    castModes: [...row.castModes],
    hitCount: row.hitCount ?? 1,
    searchKeyword: "",
    isMagicOpen: false,
    magicJustOpened: false
  };
}

function getMagicCapabilities(magic) {
  return {
    supportsCharged: Boolean(magic && magic.frames.charged > 0 && magic.damage.charged > 0),
    supportsChain: Boolean(magic && magic.frames.chainNormal > 0),
    supportsHitCount: Boolean(magic && magic.maxHits > 1)
  };
}

function syncRowByMagic(row) {
  const magic = getMagicById(row.magicId);
  const caps = getMagicCapabilities(magic);

  if (!caps.supportsChain) {
    row.castCount = 1;
  }

  row.castCount = Math.max(1, Math.min(8, Number(row.castCount) || 1));

  const maxHits = caps.supportsHitCount ? Number(magic.maxHits) : 1;
  row.hitCount = Math.max(1, Math.min(maxHits, Number(row.hitCount) || 1));

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
  const appliedHitCount = caps.supportsHitCount ? row.hitCount : 1;

  const steps = row.castModes.map((mode, index) => {
    const base = getCastStep(magic, mode, index);
    const mult = getDamageMultiplier(effects, base.isCharged);
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
    appliedHitCount
  };
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
  const selectedMagicName = getMagicById(row.magicId)?.name || "";
  const keyword = row.magicJustOpened && row.searchKeyword === selectedMagicName
    ? ""
    : row.searchKeyword;

  const normalizedKeyword = normalizeSearchText(keyword);
  if (!normalizedKeyword) return magicData;

  return magicData.filter(magic =>
    normalizeSearchText(magic.name).includes(normalizedKeyword)
  );
}

function getMagicInputValue(row) {
  if (row.isMagicOpen) {
    return row.searchKeyword;
  }
  return getMagicById(row.magicId)?.name || "";
}

function createMagicPickerHtml(row) {
  const filteredList = getMagicOptionList(row);
  const selectedMagicName = getMagicById(row.magicId)?.name || "";

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
          ${row.isMagicOpen ? "" : "readonly"}
        >
        <button
          type="button"
          class="magic-combobox-toggle"
          data-role="magic-combobox-toggle"
          data-row-id="${row.id}"
          tabindex="-1"
          aria-label="魔術候補を開く"
        >▼</button>
      </div>
      <div class="magic-combobox-menu ${row.isMagicOpen ? "" : "hidden"}">
        ${filteredList.length > 0
          ? filteredList.map(magic => `
              <button
                type="button"
                class="magic-combobox-option ${magic.id === row.magicId ? "selected" : ""}"
                data-role="magic-option"
                data-row-id="${row.id}"
                data-magic-id="${magic.id}"
              >
                ${escapeHtml(magic.name)}
              </button>
            `).join("")
          : `<div class="magic-combobox-empty">一致する魔術がありません</div>`}
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

  const filteredList = getMagicOptionList(row);

  menu.innerHTML = filteredList.length > 0
    ? filteredList.map(magic => `
        <button
          type="button"
          class="magic-combobox-option ${magic.id === row.magicId ? "selected" : ""}"
          data-role="magic-option"
          data-row-id="${row.id}"
          data-magic-id="${magic.id}"
        >
          ${escapeHtml(magic.name)}
        </button>
      `).join("")
    : `<div class="magic-combobox-empty">一致する魔術がありません</div>`;
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
}

function closeMagicCombobox(rowId, rerenderPickerOnly = true) {
  const row = state.rows.find(item => item.id === rowId);
  if (!row) return;
  if (!row.isMagicOpen) return;

  row.isMagicOpen = false;
  row.magicJustOpened = false;
  row.searchKeyword = "";

  if (rerenderPickerOnly) {
    updateMagicPicker(rowId);
  }
}

function closeAllMagicComboboxes(exceptRowId = null) {
  state.rows.forEach(row => {
    if (row.id !== exceptRowId && row.isMagicOpen) {
      row.isMagicOpen = false;
      row.magicJustOpened = false;
      row.searchKeyword = "";
      updateMagicPicker(row.id);
    }
  });
}

function openMagicCombobox(rowId) {
  const row = state.rows.find(item => item.id === rowId);
  if (!row) return;

  closeAllMagicComboboxes(rowId);

  if (!row.isMagicOpen) {
    row.isMagicOpen = true;
    row.magicJustOpened = true;
    row.searchKeyword = getMagicById(row.magicId)?.name || "";
    updateMagicPicker(rowId, { focusInput: true, selectAll: true });
  } else {
    updateMagicPicker(rowId, { focusInput: true, selectAll: true });
  }
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
  row.magicJustOpened = false;

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

  state.rows.forEach(row => {
    const result = calculateRowResult(row);
    if (!result) return;

    const tr = document.createElement("tr");

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
          <div class="mini-label">タメ設定${result.supportsHitCount ? "/ヒット数" : ""}</div>
          <div class="control-inline">
            <select data-role="single-charge-mode" data-row-id="${row.id}">
              <option value="normal" ${row.castModes[0] === "normal" ? "selected" : ""}>通常</option>
              <option value="charged" ${row.castModes[0] === "charged" ? "selected" : ""}>タメ</option>
            </select>
            ${result.supportsHitCount ? `
              <select data-role="hit-count" data-row-id="${row.id}">
                ${Array.from({ length: result.magic.maxHits }, (_, i) => i + 1).map(n => {
                  const isFallingstar = result.magic.name === "降り注ぐ魔力";
                  const label = isFallingstar && n === result.magic.maxHits
                    ? `${n}hit（フルヒット）`
                    : `${n}hit`;
                  return `<option value="${n}" ${row.hitCount === n ? "selected" : ""}>${label}</option>`;
                }).join("")}
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
            <select data-role="hit-count" data-row-id="${row.id}">
              ${Array.from({ length: result.magic.maxHits }, (_, i) => i + 1).map(n => {
                const isFallingstar = result.magic.name === "降り注ぐ魔力";
                const label = isFallingstar && n === result.magic.maxHits
                  ? `${n}hit（フルヒット）`
                  : `${n}hit`;
                return `<option value="${n}" ${row.hitCount === n ? "selected" : ""}>${label}</option>`;
              }).join("")}
            </select>
          ` : ""}
        </div>
      `;
    } else if (result.supportsHitCount) {
      settingCell = `
        <div class="control-stack">
          <div class="mini-label">ヒット数</div>
          <button type="button" class="ghost-btn" data-role="open-sequence-modal" data-row-id="${row.id}">
            設定（${result.magic.name === "降り注ぐ魔力" && row.hitCount === result.magic.maxHits ? `${row.hitCount}hit（フルヒット）` : `${row.hitCount}hit`}）
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
            ? `<br>${result.magic.name === "降り注ぐ魔力" && row.hitCount === result.magic.maxHits
                ? `${row.hitCount}hit（フルヒット）`
                : `${row.hitCount}hit`}`
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
  state.modal.draftHitCount = row.hitCount || 1;

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
    hitCountSelect.innerHTML = Array.from({ length: magic.maxHits }, (_, i) => i + 1)
      .map(n => {
        const isFallingstar = magic.name === "降り注ぐ魔力";
        const label = isFallingstar && n === magic.maxHits
          ? `${n}hit（フルヒット）`
          : `${n}hit`;
        return `<option value="${n}" ${state.modal.draftHitCount === n ? "selected" : ""}>${label}</option>`;
      })
      .join("");
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
        row.magicJustOpened = false;
        row.searchKeyword = target.value;
        refreshMagicOptionsOnly(rowId);
      }
    });

    document.addEventListener("input", event => {
      const target = event.target;

      if (target.matches('[data-role="magic-combobox-input"]')) {
        const rowId = target.dataset.rowId;
        const row = state.rows.find(item => item.id === rowId);
        if (!row) return;

        if (!row.isMagicOpen) {
          row.isMagicOpen = true;
        }

        row.magicJustOpened = false;
        row.searchKeyword = target.value;

        if (state.ime.composingRowId === rowId) {
          return;
        }

        refreshMagicOptionsOnly(rowId);
        return;
      }
    });

    document.addEventListener("focusin", event => {
      const target = event.target;

      if (target.matches('[data-role="magic-combobox-input"]')) {
        const rowId = target.dataset.rowId;
        const row = state.rows.find(item => item.id === rowId);
        if (!row) return;

        if (!row.isMagicOpen) {
          openMagicCombobox(rowId);
        }
      }
    });

    document.addEventListener("focusout", event => {
      const target = event.target;

      if (target.matches('[data-role="magic-combobox-input"]')) {
        const rowId = target.dataset.rowId;
        const container = document.querySelector(`.magic-combobox[data-row-id="${rowId}"]`);
        const related = event.relatedTarget;

        if (container && related && container.contains(related)) {
          return;
        }

        window.setTimeout(() => {
          const row = state.rows.find(item => item.id === rowId);
          if (!row || !row.isMagicOpen) return;

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
        if (!row) return;

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
        row.hitCount = state.modal.draftHitCount;

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

    document.getElementById("sequenceModalBackdrop").addEventListener("click", event => {
      if (event.target.id === "sequenceModalBackdrop") {
        closeSequenceModal();
      }
    });
  } catch (error) {
    console.error(error);
    alert(error.message || "初期化に失敗しました。");
  }
}

initialize();