// ABC Lyrics: converts Spotify's lyrics from Traditional to Simplified
// Chinese and adds pinyin. Options open from the 拼 button in the top bar.

(function abcLyrics() {
  if (!Spicetify?.Topbar || !Spicetify?.PopupModal || !document.body) {
    setTimeout(abcLyrics, 300);
    return;
  }

  const toSimplified = OpenCC.Converter({ from: "tw", to: "cn" });
  const toPinyin = (text) => pinyinPro.pinyin(toSimplified(text), { nonZh: "consecutive" });
  const HAN = /\p{Script=Han}/u;
  const PINYIN_CLASS = "abc-lyrics-pinyin";
  const ENGLISH_CLASS = "abc-lyrics-english";
  const PINYIN_MODES = { off: "Off", below: "Below characters", above: "Above characters", only: "Pinyin only" };

  const read = (key, fallback) => {
    try {
      return localStorage.getItem(`abc-lyrics:${key}`) ?? fallback;
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
      localStorage.setItem(`abc-lyrics:${key}`, String(settings[key]));
    } catch {}
  };

  const style = document.createElement("style");
  style.textContent = `
    .${PINYIN_CLASS}--above ruby{ruby-position:over}
    .${PINYIN_CLASS}--below ruby{ruby-position:under}
    .${PINYIN_CLASS} rt{font-size:.42em;font-weight:500;opacity:.75;letter-spacing:0}
    .${PINYIN_CLASS} ruby{margin:0 .04em}
    .${ENGLISH_CLASS}{font-size:.55em;opacity:.75;font-weight:500;line-height:1.3;margin:.15em 0;font-style:italic}`;
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
      console.error("ABC Lyrics: translation failed", e);
    }
    for (const line of lines) pending.delete(line);
    processAll();
  }

  // pinyin-pro reads each character in the context of its phrase; if OpenCC
  // changed the length, fall back to reading characters one by one.
  function rubyLine(text) {
    const chars = [...text];
    let readings = pinyinPro.pinyin(toSimplified(text), { type: "all" });
    if (readings.length !== chars.length) readings = chars.map((c) => pinyinPro.pinyin(toSimplified(c), { type: "all" })[0]);
    const el = document.createElement("span");
    el.className = `${PINYIN_CLASS} ${PINYIN_CLASS}--${settings.pinyin}`;
    chars.forEach((char, i) => {
      if (!readings[i]?.isZh) {
        el.append(char);
        return;
      }
      const r = document.createElement("ruby");
      const rt = document.createElement("rt");
      rt.textContent = readings[i].pinyin;
      r.append(char, rt);
      el.append(r);
    });
    return el;
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
    // Above/below: Spotify's text nodes are emptied and the line is redrawn as
    // <ruby>, so each syllable sits exactly over or under its character.
    const ruby = settings.pinyin === "below" || settings.pinyin === "above";
    let displayed = "";
    const parts = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const known = originals.get(node);
      const source = known && node.nodeValue === known.shown ? known.original : node.nodeValue;
      original += source;
      let shown = source;
      if (settings.pinyin === "only" && HAN.test(source)) shown = toPinyin(source);
      else if (settings.simplified) shown = toSimplified(source);
      displayed += shown;
      parts.push([node, source, shown]);
    }

    const hasHan = HAN.test(original);
    for (const [node, source, text] of parts) {
      const shown = ruby && hasHan ? "" : text;
      originals.set(node, { original: source, shown });
      if (node.nodeValue !== shown) node.nodeValue = shown;
    }

    let pinyinEl = textEl.querySelector(`:scope > .${PINYIN_CLASS}`);
    if (!ruby || !hasHan) {
      pinyinEl?.remove();
    } else {
      const key = `${settings.pinyin}|${displayed}`;
      if (pinyinEl?.dataset.key !== key) {
        pinyinEl?.remove();
        pinyinEl = rubyLine(displayed);
        pinyinEl.dataset.key = key;
      }
      if (pinyinEl.parentNode !== textEl || pinyinEl !== textEl.firstChild) {
        textEl.insertBefore(pinyinEl, textEl.firstChild);
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

  // Spotify strips the lyrics test ids and obfuscates class names, so lines are
  // found by shape: a div[dir="auto"] among 3+ such siblings, whose first child
  // holds the text and has no elements of its own besides ours.
  const OURS = `.${PINYIN_CLASS},.${ENGLISH_CLASS}`;
  function isLyricLine(line) {
    const textEl = line.firstElementChild;
    if (!textEl || textEl.tagName !== "DIV" || textEl.matches(OURS)) return false;
    if ([...textEl.children].some((c) => !c.matches(OURS))) return false;
    const siblings = line.parentElement.querySelectorAll(':scope > div[dir="auto"]');
    return siblings.length >= 3;
  }

  function processAll() {
    observer.disconnect();
    for (const line of document.querySelectorAll('div[dir="auto"]')) {
      if (isLyricLine(line)) processLine(line.firstElementChild);
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
      input.name = "abc-lyrics-pinyin";
      input.checked = settings.pinyin === mode;
      input.onchange = () => update("pinyin", mode);
      panel.append(row(input, label));
    }
    panel.append(checkbox("english", "English translation (uses Google Translate)"));
    return panel;
  }

  // 24px, the size Spotify gives the custom-app nav icons beside it.
  const ICON =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><text x="12" y="20" text-anchor="middle" font-size="21" font-weight="700">拼</text></svg>';
  const openSettings = () => Spicetify.PopupModal.display({ title: "ABC Lyrics", content: settingsPanel() });
  const topbarButton = new Spicetify.Topbar.Button("ABC Lyrics", ICON, openSettings);

  // Newer Spotify builds can lack the container Spicetify.Topbar mounts into.
  // Then copy a custom-app nav icon (Marketplace etc.) and keep our copy beside it.
  setInterval(() => {
    if (topbarButton.element.isConnected || document.querySelector(".abc-lyrics-navlink")) return;
    const model = document.querySelector("button.custom-navlink")?.parentElement;
    if (!model) return;
    const wrapper = model.cloneNode(true);
    const button = wrapper.querySelector("button");
    button.classList.add("abc-lyrics-navlink");
    button.setAttribute("aria-label", "ABC Lyrics");
    button.title = "ABC Lyrics";
    // Keep the copied icon's outer svg, which Spotify sizes, and swap its drawing.
    button.querySelector("span > svg").innerHTML = ICON;
    button.onclick = openSettings;
    model.parentElement.appendChild(wrapper);
  }, 1000);
})();
