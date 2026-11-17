// Chinese Lyrics: converts Spotify's lyrics from Traditional to Simplified
// Chinese and adds pinyin. Options open from the 拼 button in the top bar.

(function chineseLyrics() {
  if (!Spicetify?.Topbar || !Spicetify?.PopupModal || !document.body) {
    setTimeout(chineseLyrics, 300);
    return;
  }

  const toSimplified = OpenCC.Converter({ from: "tw", to: "cn" });
  const toPinyin = (text) => pinyinPro.pinyin(toSimplified(text), { nonZh: "consecutive" });
  const HAN = /\p{Script=Han}/u;
  const PINYIN_CLASS = "chinese-lyrics-pinyin";
  const ENGLISH_CLASS = "chinese-lyrics-english";
  const PINYIN_MODES = { off: "Off", below: "Below characters", above: "Above characters", only: "Pinyin only" };

  const read = (key, fallback) => {
    try {
      return localStorage.getItem(`chinese-lyrics:${key}`) ?? fallback;
    } catch {
      return fallback;
    }
  };
  const settings = {
    simplified: read("simplified", "true") === "true",
    pinyin: read("pinyin", "below") in PINYIN_MODES ? read("pinyin", "below") : "below",
    english: read("english", "false") === "true",
  };
  const save = (key) => {
    try {
      localStorage.setItem(`chinese-lyrics:${key}`, String(settings[key]));
    } catch {}
  };

  const style = document.createElement("style");
  style.textContent = `.${PINYIN_CLASS},.${ENGLISH_CLASS}{font-size:.55em;opacity:.75;font-weight:500;line-height:1.3;margin:.15em 0}.${ENGLISH_CLASS}{font-style:italic}`;
  document.head.appendChild(style);

  // Translations come from Google Translate's free endpoint, one request per
  // batch of new lines; results are cached by original line text.
  const translations = new Map();
  const pending = new Set();
  let translateTimer = null;
  function queueTranslation(line) {
    if (translations.has(line) || pending.has(line)) return;
    pending.add(line);
    clearTimeout(translateTimer);
    translateTimer = setTimeout(flushTranslations, 200);
  }
  async function flushTranslations() {
    const lines = [...pending];
    if (!lines.length) return;
    const url =
      "https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=en&dt=t&q=" +
      encodeURIComponent(lines.join("\n"));
    try {
      const data = await (await fetch(url)).json();
      const out = data[0].map((seg) => seg[0]).join("").split("\n");
      lines.forEach((line, i) => translations.set(line, (out[i] ?? "").trim()));
    } catch (e) {
      console.error("Chinese Lyrics: translation failed", e);
    }
    for (const line of lines) pending.delete(line);
    processAll();
  }

  // Each text node remembers its original text, so turning an option off
  // restores it and React's own updates are picked up as new originals.
  const originals = new WeakMap();

  function processLine(textEl) {
    let original = "";
    const walker = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        n.parentElement.closest(`.${PINYIN_CLASS},.${ENGLISH_CLASS}`)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const known = originals.get(node);
      const source = known && node.nodeValue === known.shown ? known.original : node.nodeValue;
      original += source;
      let shown = source;
      if (settings.pinyin === "only" && HAN.test(source)) shown = toPinyin(source);
      else if (settings.simplified) shown = toSimplified(source);
      originals.set(node, { original: source, shown });
      if (node.nodeValue !== shown) node.nodeValue = shown;
    }

    const hasHan = HAN.test(original);

    let pinyinEl = textEl.querySelector(`:scope > .${PINYIN_CLASS}`);
    const wantsPinyin = hasHan && (settings.pinyin === "below" || settings.pinyin === "above");
    if (!wantsPinyin) {
      pinyinEl?.remove();
    } else {
      if (!pinyinEl) {
        pinyinEl = document.createElement("div");
        pinyinEl.className = PINYIN_CLASS;
      }
      const text = toPinyin(original);
      if (pinyinEl.textContent !== text) pinyinEl.textContent = text;
      const anchor = settings.pinyin === "above" ? textEl.firstChild : null;
      if (pinyinEl.parentNode !== textEl || (anchor !== pinyinEl && pinyinEl.nextSibling !== anchor)) {
        textEl.insertBefore(pinyinEl, anchor);
      }
    }

    let englishEl = textEl.querySelector(`:scope > .${ENGLISH_CLASS}`);
    const english = settings.english && hasHan ? translations.get(original.trim()) : undefined;
    if (settings.english && hasHan && english === undefined) queueTranslation(original.trim());
    if (!english) {
      englishEl?.remove();
      return;
    }
    if (!englishEl) {
      englishEl = document.createElement("div");
      englishEl.className = ENGLISH_CLASS;
    }
    if (englishEl.textContent !== english) englishEl.textContent = english;
    if (textEl.lastChild !== englishEl) textEl.appendChild(englishEl);
  }

  // Spotify strips per-line test ids in production builds; each lyric line is a
  // div[dir="auto"] whose first child holds the text.
  function processAll() {
    observer.disconnect();
    for (const container of document.querySelectorAll('[data-testid="lyrics-container"]')) {
      for (const line of container.querySelectorAll('div[dir="auto"]')) {
        const textEl = line.firstElementChild;
        if (textEl && !textEl.matches(`.${PINYIN_CLASS},.${ENGLISH_CLASS}`)) processLine(textEl);
      }
    }
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      processAll();
    });
  });
  processAll();

  function update(key, value) {
    settings[key] = value;
    save(key);
    processAll();
  }

  function settingsPanel() {
    const panel = document.createElement("div");
    panel.style.cssText = "display:flex;flex-direction:column;gap:12px;font-size:14px";
    const row = (input, label) => {
      const el = document.createElement("label");
      el.style.cssText = "display:flex;align-items:center;gap:8px;cursor:pointer";
      el.append(input, label);
      return el;
    };
    const checkbox = (key, label) => {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = settings[key];
      input.onchange = () => update(key, input.checked);
      return row(input, label);
    };
    const heading = document.createElement("strong");
    heading.textContent = "Pinyin";

    panel.append(checkbox("simplified", "Traditional → Simplified"), heading);
    for (const [mode, label] of Object.entries(PINYIN_MODES)) {
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "chinese-lyrics-pinyin";
      input.checked = settings.pinyin === mode;
      input.onchange = () => update("pinyin", mode);
      panel.append(row(input, label));
    }
    panel.append(checkbox("english", "English translation (uses Google Translate)"));
    return panel;
  }

  const ICON =
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><text x="8" y="13" text-anchor="middle" font-size="13" font-weight="700">拼</text></svg>';
  new Spicetify.Topbar.Button("Chinese Lyrics", ICON, () =>
    Spicetify.PopupModal.display({ title: "Chinese Lyrics", content: settingsPanel() })
  );

  window.__chineseLyrics = { settings, processAll };
})();
