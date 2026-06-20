/* =========================================================================
 * Mi Amigo — アンティグア街おこし統合アプリ（プロトタイプ）
 * 機能: ①アカウント登録/ログイン ②カレンダー予約＋決済 ③カフェチェックイン写真/アルバム/SNS共有
 *
 * ⚠️ プロトタイプ注記:
 *  - データはブラウザの localStorage に保存（端末内のみ）。本番では API/DB に置き換え。
 *  - パスワードは SHA-256 + ソルトでハッシュ化しているが、安全な認証はサーバー側で
 *    bcrypt/argon2 等が必須。ここはフロント検証用の簡易実装。
 *  - 「決済」はモック。本番では Stripe 等の決済APIに接続する。
 * ===================================================================== */

const DATA = window.MI_AMIGO_DATA;

/* ---------- localStorage 薄ラッパ ---------- */
const DB = {
  get(k, def) { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
};
const K = { users: "ma_users", session: "ma_session", resv: "ma_reservations", album: "ma_album", stamps: "ma_stamps" };

/* ---------- 認証 ---------- */
async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function randSalt() {
  const a = new Uint8Array(16); crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, "0")).join("");
}
const Auth = {
  async register(name, email, password) {
    email = email.trim().toLowerCase();
    const users = DB.get(K.users, {});
    if (users[email]) throw new Error("このメールアドレスは既に登録されています");
    const salt = randSalt();
    users[email] = { name: name.trim(), email, salt, passHash: await sha256(salt + password) };
    DB.set(K.users, users);
    DB.set(K.session, email);
    return users[email];
  },
  async login(email, password) {
    email = email.trim().toLowerCase();
    const u = DB.get(K.users, {})[email];
    if (!u) throw new Error("アカウントが見つかりません");
    if (u.passHash !== await sha256(u.salt + password)) throw new Error("パスワードが違います");
    DB.set(K.session, email);
    return u;
  },
  logout() { localStorage.removeItem(K.session); },
  current() {
    const email = DB.get(K.session, null);
    return email ? DB.get(K.users, {})[email] || null : null;
  },
};

/* ---------- 状態 ---------- */
const State = {
  user: null,
  view: "discover",
  cal: { year: 0, month: 0 }, // 表示中の年月
  lang: localStorage.getItem("ma_lang") || "ja", // 音声ガイドの言語
  speakingId: null, // 再生中のスポットid
};

/* ---------- ユーティリティ ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const fmtUSD = (n) => "$" + n.toFixed(0);
const fmtJPY = (usd) => "約" + Math.round(usd * 150).toLocaleString() + "円";
// 写真があれば背景画像、なければ emoji＋グラデーション
const thumbStyle = (item) => item.img
  ? `background-image:url('${item.img}');background-size:cover;background-position:center;`
  : "background:linear-gradient(135deg,#fce9d4,#f6dbe5)";
const thumbInner = (item) => item.img ? "" : item.emoji;
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const dateKey = (y, m, d) => `${y}-${m}-${d}`;

function seed(str) { // 文字列 → 0..1 の安定した擬似乱数
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}
function capacityFor(listing, dKey) { // その日の総枠数（安定）
  const s = seed(listing.id + dKey);
  return Math.max(2, Math.round(listing.maxSlots * (0.3 + s * 0.7)));
}
function bookedFor(listingId, dKey) {
  return DB.get(K.resv, []).filter(r => r.listingId === listingId && r.dateKey === dKey)
    .reduce((sum, r) => sum + r.qty, 0);
}
function remainingFor(listing, dKey) { return Math.max(0, capacityFor(listing, dKey) - bookedFor(listing.id, dKey)); }

function toast(msg) {
  $(".toast")?.remove();
  const t = el(`<div class="toast">${msg}</div>`);
  $(".phone").appendChild(t);
  setTimeout(() => t.remove(), 2200);
}
function closeSheet() { $(".sheet-back")?.remove(); }
function openSheet(innerHtml) {
  closeSheet();
  const back = el(`<div class="sheet-back"><div class="sheet"><div class="grab"></div>${innerHtml}</div></div>`);
  back.addEventListener("click", (e) => { if (e.target === back) closeSheet(); });
  $(".phone").appendChild(back);
  return back;
}

/* 画像を縮小して dataURL 化（localStorage 容量対策） */
function fileToResizedDataUrl(file, max = 900, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result; };
    reader.onerror = reject;
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > h && w > max) { h = h * max / w; w = max; }
      else if (h > max) { w = w * max / h; h = max; }
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* =========================================================================
 * 画面描画
 * ===================================================================== */
function render() {
  const screen = $("#screen");
  const tabbar = $("#tabbar");
  if (!State.user) { tabbar.classList.add("hidden"); screen.innerHTML = ""; screen.appendChild(viewAuth()); return; }
  tabbar.classList.remove("hidden");
  [...tabbar.querySelectorAll(".tab")].forEach(t => t.classList.toggle("active", t.dataset.view === State.view));
  screen.innerHTML = "";
  const v = { discover: viewDiscover, quest: viewQuest, guide: viewGuide, album: viewAlbum, mypage: viewMyPage }[State.view]();
  screen.appendChild(v);
  screen.scrollTop = 0;
}

/* ---------- ① 認証画面 ---------- */
function viewAuth() {
  let mode = "register";
  const wrap = el(`<div>
    <div class="auth-hero">
      <div class="volcano">🌋🌋🌋</div>
      <h1>Mi Amigo</h1>
      <p>アンティグアを、もっと面白く歩こう。</p>
    </div>
    <div class="weave"></div>
    <div class="pad">
      <div class="auth-tabs">
        <button data-m="register" class="active">新規登録</button>
        <button data-m="login">ログイン</button>
      </div>
      <form id="authForm">
        <div class="field" id="nameField">
          <label>お名前 / ニックネーム</label>
          <input name="name" autocomplete="name" placeholder="Taku" />
        </div>
        <div class="field">
          <label>メールアドレス</label>
          <input name="email" type="email" autocomplete="email" placeholder="you@example.com" />
        </div>
        <div class="field">
          <label>パスワード</label>
          <input name="password" type="password" autocomplete="new-password" placeholder="6文字以上" />
        </div>
        <p class="error" id="authError"></p>
        <button class="btn" type="submit" id="authSubmit">アカウント作成</button>
        <p class="hint" style="text-align:center;margin-top:14px">
          プロトタイプ版です。データはこの端末内にのみ保存されます。
        </p>
      </form>
    </div>
  </div>`);

  const setMode = (m) => {
    mode = m;
    wrap.querySelectorAll(".auth-tabs button").forEach(b => b.classList.toggle("active", b.dataset.m === m));
    $("#nameField", wrap).style.display = m === "register" ? "" : "none";
    $("#authSubmit", wrap).textContent = m === "register" ? "アカウント作成" : "ログイン";
    $("#authError", wrap).textContent = "";
  };
  wrap.querySelectorAll(".auth-tabs button").forEach(b => b.onclick = () => setMode(b.dataset.m));

  $("#authForm", wrap).addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const name = f.name.value, email = f.email.value, pw = f.password.value;
    const err = $("#authError", wrap);
    err.textContent = "";
    if (!email.includes("@")) return err.textContent = "メールアドレスの形式が正しくありません";
    if (pw.length < 6) return err.textContent = "パスワードは6文字以上にしてください";
    if (mode === "register" && !name.trim()) return err.textContent = "お名前を入力してください";
    try {
      const u = mode === "register" ? await Auth.register(name, email, pw) : await Auth.login(email, pw);
      State.user = u; State.view = "discover";
      toast(`ようこそ、${u.name} さん！`);
      render();
    } catch (ex) { err.textContent = ex.message; }
  });
  return wrap;
}

/* ---------- ② 探す（カレンダー予約＋決済） ---------- */
function viewDiscover() {
  const wrap = el(`<div>
    <div class="topbar"><h1>探す</h1><p class="sub">アンティグアの体験・カフェ・宿を予約</p></div>
    <div class="pad" id="listings"></div>
  </div>`);
  const labels = { exp: ["exp", "体験"], food: ["food", "飲食"], stay: ["stay", "宿"] };
  const root = $("#listings", wrap);
  DATA.listings.forEach(l => {
    const [cls, jp] = labels[l.type] || ["exp", "体験"];
    const card = el(`<div class="card">
      <div class="thumb" style="${thumbStyle(l)}">${thumbInner(l)}</div>
      <div class="card-body">
        <span class="badge ${cls}">${jp}</span>
        <h3 style="margin:8px 0 4px;font-size:17px">${l.title}</h3>
        <p class="muted" style="margin:0 0 6px;font-size:13px">${l.desc}</p>
        <p class="muted" style="margin:0 0 12px;font-size:12px">📍 ${l.area || ""}${l.link ? ` · <a href="${l.link}" target="_blank" rel="noopener" style="color:var(--teal)">公式サイト</a>` : ""}</p>
        <div class="row">
          <div><span class="price">${fmtUSD(l.price)}</span> <span class="muted" style="font-size:12px">/ 名　${fmtJPY(l.price)}</span></div>
          <span class="spacer"></span>
          <button class="btn sm" data-id="${l.id}">予約する</button>
        </div>
      </div>
    </div>`);
    $("button", card).onclick = () => openBooking(l);
    root.appendChild(card);
  });
  return wrap;
}

function openBooking(listing) {
  const now = new Date();
  State.cal = { year: now.getFullYear(), month: now.getMonth() };
  let selected = null; // dateKey
  let qty = 1;

  const back = openSheet(`<h2>${listing.emoji} ${listing.title}</h2>
    <p class="muted" style="margin:-8px 0 14px;font-size:13px">日付を選ぶと、その日の空き枠が表示されます</p>
    <div id="calMount"></div>
    <div id="bookPanel"></div>`);

  function renderCal() {
    const { year, month } = State.cal;
    const first = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    const dows = ["日","月","火","水","木","金","土"];
    const today = new Date(); today.setHours(0,0,0,0);

    let cells = dows.map(d => `<div class="cal-dow">${d}</div>`).join("");
    for (let i = 0; i < first; i++) cells += `<div class="cal-cell empty"></div>`;
    for (let d = 1; d <= days; d++) {
      const dk = dateKey(year, month, d);
      const cellDate = new Date(year, month, d);
      const isPast = cellDate < today;
      const rem = remainingFor(listing, dk);
      const isFull = rem <= 0;
      const cls = ["cal-cell", isPast ? "past" : "", isFull && !isPast ? "full" : "", selected === dk ? "sel" : ""].join(" ");
      const slotTxt = isPast ? "" : (isFull ? "満" : `残${rem}`);
      cells += `<div class="${cls}" data-dk="${isPast || isFull ? "" : dk}">
        <span class="d">${d}</span><span class="slots">${slotTxt}</span>
        ${!isPast && !isFull ? '<span class="dot"></span>' : ""}
      </div>`;
    }
    const mount = $("#calMount", back);
    mount.innerHTML = `<div class="cal">
      <div class="cal-head">
        <button id="prevM">‹</button>
        <strong>${year}年 ${month + 1}月</strong>
        <button id="nextM">›</button>
      </div>
      <div class="cal-grid">${cells}</div>
    </div>`;
    $("#prevM", mount).onclick = () => { State.cal.month--; if (State.cal.month < 0) { State.cal.month = 11; State.cal.year--; } renderCal(); };
    $("#nextM", mount).onclick = () => { State.cal.month++; if (State.cal.month > 11) { State.cal.month = 0; State.cal.year++; } renderCal(); };
    mount.querySelectorAll(".cal-cell[data-dk]").forEach(c => {
      if (!c.dataset.dk) return;
      c.onclick = () => { selected = c.dataset.dk; qty = 1; renderCal(); renderPanel(); };
    });
  }

  function renderPanel() {
    const panel = $("#bookPanel", back);
    if (!selected) { panel.innerHTML = ""; return; }
    const [y, m, d] = selected.split("-").map(Number);
    const rem = remainingFor(listing, selected);
    const total = listing.price * qty;
    panel.innerHTML = `
      <div class="section-title">予約内容</div>
      <div class="row" style="margin-bottom:12px">
        <div>📅 ${y}年${m + 1}月${d}日<br><span class="muted" style="font-size:12px">空き枠 残り ${rem}</span></div>
        <span class="spacer"></span>
        <div class="row" style="gap:8px">
          <button class="btn secondary sm" id="minus" style="width:38px">−</button>
          <strong style="min-width:24px;text-align:center">${qty}名</strong>
          <button class="btn secondary sm" id="plus" style="width:38px">＋</button>
        </div>
      </div>
      <div class="card" style="margin-bottom:14px"><div class="card-body">
        <div class="pay-row"><span>${listing.title}</span><span>${fmtUSD(listing.price)} × ${qty}</span></div>
        <div class="pay-total"><span>合計</span><span>${fmtUSD(total)} <span class="muted" style="font-size:13px;font-weight:500">${fmtJPY(total)}</span></span></div>
      </div></div>
      <button class="btn teal" id="payBtn">💳 決済して予約を確定</button>
      <p class="hint" style="text-align:center">※ プロトタイプのため実際の課金は発生しません</p>`;
    $("#minus", panel).onclick = () => { if (qty > 1) { qty--; renderPanel(); } };
    $("#plus", panel).onclick = () => { if (qty < rem) { qty++; renderPanel(); } else toast("空き枠の上限です"); };
    $("#payBtn", panel).onclick = () => openPayment(listing, selected, qty);
  }

  renderCal();
}

function openPayment(listing, dKey, qty) {
  const total = listing.price * qty;
  const [y, m, d] = dKey.split("-").map(Number);
  const back = openSheet(`<h2>💳 お支払い</h2>
    <div class="card"><div class="card-body">
      <div class="pay-row"><span class="muted">プラン</span><span>${listing.title}</span></div>
      <div class="pay-row"><span class="muted">日付</span><span>${y}/${m + 1}/${d}</span></div>
      <div class="pay-row"><span class="muted">人数</span><span>${qty}名</span></div>
      <div class="pay-total"><span>合計</span><span>${fmtUSD(total)}</span></div>
    </div></div>
    <div class="field"><label>カード番号（ダミー）</label><input id="cc" inputmode="numeric" placeholder="4242 4242 4242 4242" value="4242 4242 4242 4242" /></div>
    <div class="row" style="gap:12px">
      <div class="field" style="flex:1"><label>有効期限</label><input value="12 / 28" /></div>
      <div class="field" style="width:110px"><label>CVC</label><input value="123" /></div>
    </div>
    <button class="btn" id="confirmPay">${fmtUSD(total)} を支払う</button>
    <button class="btn ghost" id="cancelPay" style="margin-top:8px">戻る</button>`);

  $("#cancelPay", back).onclick = closeSheet;
  $("#confirmPay", back).onclick = () => {
    const btn = $("#confirmPay", back);
    btn.disabled = true; btn.textContent = "処理中…";
    setTimeout(() => {
      const resv = DB.get(K.resv, []);
      resv.push({ id: "r" + Date.now(), userEmail: State.user.email, listingId: listing.id,
        title: listing.title, emoji: listing.emoji, dateKey: dKey, qty, total, createdAt: Date.now() });
      DB.set(K.resv, resv);
      closeSheet();
      toast("✅ 予約が確定しました！");
      State.view = "mypage"; render();
    }, 900);
  };
}

/* ---------- ③ 謎解き（カフェチェックイン＋写真） ---------- */
function viewQuest() {
  const stamps = DB.get(K.stamps, {})[State.user.email] || {};
  const done = DATA.quest.cafes.filter(c => stamps[c.id]).length;
  const wrap = el(`<div>
    <div class="topbar"><h1>謎解きラリー</h1><p class="sub">${DATA.quest.title}</p></div>
    <div class="pad">
      <div class="card"><div class="card-body">
        <div class="row"><strong>進捗 ${done} / ${DATA.quest.cafes.length}</strong><span class="spacer"></span>
        <span class="badge exp">🎁 ${done === DATA.quest.cafes.length ? "コンプリート!" : "報酬まであと" + (DATA.quest.cafes.length - done)}</span></div>
        <div class="stamp" id="stamps"></div>
        <p class="hint">${DATA.quest.reward}</p>
      </div></div>
      <div class="section-title">カフェをチェックイン</div>
      <div id="cafeList"></div>
    </div>
  </div>`);

  const sm = $("#stamps", wrap);
  DATA.quest.cafes.forEach(c => sm.appendChild(el(`<div class="s ${stamps[c.id] ? "on" : ""}">${stamps[c.id] ? "✓" : c.emoji}</div>`)));

  const list = $("#cafeList", wrap);
  DATA.quest.cafes.forEach((c, i) => {
    const got = !!stamps[c.id];
    const item = el(`<div class="list-item">
      <div class="ava">${c.emoji}</div>
      <div style="flex:1">
        <strong>${i + 1}. ${c.name}</strong>
        ${c.area ? `<div class="muted" style="font-size:12px;margin-top:2px">📍 ${c.area}</div>` : ""}
        <div class="muted" style="font-size:12px;margin-top:2px">${got ? "✅ チェックイン済み" : "🔍 " + c.riddle}</div>
      </div>
      <button class="btn sm ${got ? "secondary" : ""}" data-id="${c.id}">${got ? "写真" : "チェックイン"}</button>
    </div>`);
    $("button", item).onclick = () => got ? (State.view = "album", render()) : openCheckin(c);
    list.appendChild(item);
  });
  return wrap;
}

function openCheckin(cafe) {
  const back = openSheet(`<h2>${cafe.emoji} ${cafe.name}</h2>
    <div class="card"><div class="card-body">
      <span class="badge cafe">🔍 謎</span>
      <p style="margin:8px 0 0">${cafe.riddle}</p>
    </div></div>
    <p class="muted" style="font-size:13px;margin:4px 2px 14px">このカフェで写真を撮ってチェックインしよう。撮った写真はアルバムに保存され、SNSに投稿して宣伝できます。</p>
    <label class="btn gold" for="camInput">📷 写真を撮る / 選ぶ</label>
    <input id="camInput" type="file" accept="image/*" capture="environment" style="display:none" />
    <button class="btn ghost" id="cancelCk" style="margin-top:8px">あとで</button>`);

  $("#cancelCk", back).onclick = closeSheet;
  $("#camInput", back).onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const lbl = back.querySelector('label[for="camInput"]');
    lbl.textContent = "処理中…";
    try {
      const dataUrl = await fileToResizedDataUrl(file);
      const album = DB.get(K.album, []);
      album.unshift({ id: "p" + Date.now(), userEmail: State.user.email, cafeId: cafe.id,
        cafe: cafe.name, dataUrl, caption: `${cafe.name} でチェックイン！ #MiAmigo #Antigua`, createdAt: Date.now() });
      DB.set(K.album, album);
      const allStamps = DB.get(K.stamps, {});
      allStamps[State.user.email] = { ...(allStamps[State.user.email] || {}), [cafe.id]: true };
      DB.set(K.stamps, allStamps);
      closeSheet();
      toast("📸 チェックイン完了！スタンプGET");
      render();
    } catch { toast("写真の読み込みに失敗しました"); lbl.textContent = "📷 写真を撮る / 選ぶ"; }
  };
}

/* ---------- アルバム＋SNS共有 ---------- */
function viewAlbum() {
  const photos = DB.get(K.album, []).filter(p => p.userEmail === State.user.email);
  const wrap = el(`<div>
    <div class="topbar"><h1>アルバム</h1><p class="sub">チェックインした写真をSNSへ</p></div>
    <div class="pad" id="albumBody"></div>
  </div>`);
  const body = $("#albumBody", wrap);
  if (!photos.length) {
    body.appendChild(el(`<div class="empty-state"><div class="big">📸</div>
      <p>まだ写真がありません。<br>「謎解き」タブからカフェにチェックインしよう。</p>
      <button class="btn" id="goQuest" style="max-width:220px;margin:8px auto 0">謎解きへ</button></div>`));
    $("#goQuest", body).onclick = () => { State.view = "quest"; render(); };
    return wrap;
  }
  const grid = el(`<div class="album-grid"></div>`);
  photos.forEach(p => {
    const img = el(`<img class="ph" src="${p.dataUrl}" alt="${p.cafe}" />`);
    img.onclick = () => openPhoto(p);
    grid.appendChild(img);
  });
  body.appendChild(grid);
  return wrap;
}

function openPhoto(p) {
  const d = new Date(p.createdAt);
  const back = openSheet(`<h2>📸 ${p.cafe}</h2>
    <img src="${p.dataUrl}" style="width:100%;border-radius:16px;margin-bottom:12px" />
    <div class="field"><label>キャプション（SNS投稿文）</label>
      <input id="cap" value="${p.caption.replace(/"/g, "&quot;")}" /></div>
    <p class="muted" style="font-size:12px;margin:-6px 2px 14px">${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} に撮影</p>
    <button class="btn teal" id="share">📲 SNSに投稿して宣伝する</button>
    <button class="btn secondary" id="del" style="margin-top:8px">この写真を削除</button>`);

  $("#share", back).onclick = async () => {
    const caption = $("#cap", back).value;
    try {
      if (navigator.share) {
        // 画像つき共有（対応端末）
        const blob = await (await fetch(p.dataUrl)).blob();
        const file = new File([blob], "miamigo.jpg", { type: "image/jpeg" });
        const payload = { title: "Mi Amigo", text: caption };
        if (navigator.canShare && navigator.canShare({ files: [file] })) payload.files = [file];
        await navigator.share(payload);
        toast("共有しました！");
      } else {
        await navigator.clipboard?.writeText(caption);
        toast("（プロトタイプ）投稿文をコピーしました");
      }
    } catch { /* ユーザーがキャンセル */ }
  };
  $("#del", back).onclick = () => {
    DB.set(K.album, DB.get(K.album, []).filter(x => x.id !== p.id));
    closeSheet(); toast("削除しました"); render();
  };
}

/* ---------- 音声ウォーキングガイド（日英西・TTS） ---------- */
const LANG_LABEL = { ja: "日本語", en: "English", es: "Español" };
const LANG_CODE = { ja: "ja-JP", en: "en-US", es: "es-ES" };

function stopSpeak() {
  try { window.speechSynthesis && speechSynthesis.cancel(); } catch {}
  State.speakingId = null;
}
function speak(text, lang, onend) {
  if (!("speechSynthesis" in window)) { toast("この端末は音声読み上げに未対応です"); return false; }
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LANG_CODE[lang] || "ja-JP";
    u.rate = 0.98; u.pitch = 1;
    u.onend = () => { State.speakingId = null; onend && onend(); };
    speechSynthesis.speak(u);
    return true;
  } catch { return false; }
}

function viewGuide() {
  const g = DATA.guide, L = State.lang;
  const wrap = el(`<div>
    <div class="topbar">
      <h1>${g.route.title[L]}</h1>
      <p class="sub">🎧 歩きながら聴ける音声ガイド</p>
      <div class="langseg" id="langseg"></div>
    </div>
    <div class="pad">
      <p class="muted" style="font-size:13px;margin:0 0 16px">${g.route.intro[L]}</p>
      <div class="section-title">街歩きルート（${g.route.stops.length}スポット）</div>
      <div class="route" id="route"></div>
      <div class="section-title">歴史を聴く</div>
      <div id="history"></div>
      <p class="hint" style="text-align:center;margin-top:18px">※ 現在は端末の音声合成(TTS)で読み上げています。録音音声に差し替え予定。</p>
    </div>
  </div>`);

  // 言語切替
  const seg = $("#langseg", wrap);
  ["ja", "en", "es"].forEach(code => {
    const b = el(`<button class="${code === L ? "on" : ""}">${LANG_LABEL[code]}</button>`);
    b.onclick = () => { stopSpeak(); State.lang = code; localStorage.setItem("ma_lang", code); render(); };
    seg.appendChild(b);
  });

  // スポット（ルート）
  const route = $("#route", wrap);
  g.route.stops.forEach((s, i) => {
    const playing = State.speakingId === s.id;
    const item = el(`<div class="route-item">
      <div class="route-num">${i + 1}</div>
      <div class="card" style="flex:1;margin:0 0 14px">
        <div class="card-body">
          <div class="row" style="align-items:flex-start">
            <div class="ava">${s.emoji}</div>
            <div style="flex:1">
              <strong>${s.title[L]}</strong>
              <p class="muted" style="font-size:13px;margin:6px 0 0">${s.text[L]}</p>
            </div>
          </div>
          <button class="btn ${playing ? "secondary" : "teal"} sm" data-id="${s.id}" style="width:100%;margin-top:12px">
            ${playing ? "■ 停止" : "▶ 再生"}
          </button>
        </div>
      </div>
    </div>`);
    $("button", item).onclick = () => {
      if (State.speakingId === s.id) { stopSpeak(); render(); return; }
      State.speakingId = s.id;
      speak(s.text[L], L, () => render());
      render();
    };
    route.appendChild(item);
  });

  // 歴史を聴く
  const hist = $("#history", wrap);
  g.history.forEach(h => {
    const playing = State.speakingId === h.id;
    const item = el(`<div class="card"><div class="card-body">
      <div class="row" style="align-items:flex-start">
        <div class="ava">${h.emoji}</div>
        <div style="flex:1">
          <strong>${h.title[L]}</strong>
          ${h.sensitive ? `<div style="margin-top:4px"><span class="badge food">⚠️ 取り扱い注意・下書き</span></div>` : ""}
          <p class="muted" style="font-size:13px;margin:8px 0 0">${h.text[L]}</p>
        </div>
      </div>
      <button class="btn ${playing ? "secondary" : "teal"} sm" data-id="${h.id}" style="width:100%;margin-top:12px">
        ${playing ? "■ 停止" : "▶ 再生"}
      </button>
    </div></div>`);
    $("button", item).onclick = () => {
      if (State.speakingId === h.id) { stopSpeak(); render(); return; }
      State.speakingId = h.id;
      speak(h.text[L], L, () => render());
      render();
    };
    hist.appendChild(item);
  });

  return wrap;
}

/* ---------- マイページ（予約一覧＋ログアウト） ---------- */
function viewMyPage() {
  const resv = DB.get(K.resv, []).filter(r => r.userEmail === State.user.email).sort((a, b) => b.createdAt - a.createdAt);
  const wrap = el(`<div>
    <div class="topbar"><h1>マイページ</h1><p class="sub">${State.user.name} さん（${State.user.email}）</p></div>
    <div class="pad">
      <div class="section-title">予約一覧</div>
      <div id="resvList"></div>
      <button class="btn secondary" id="logout" style="margin-top:24px">ログアウト</button>
      <p class="hint" style="text-align:center;margin-top:18px">Mi Amigo プロトタイプ v0.1 — Antigua, Guatemala 🌋</p>
    </div>
  </div>`);
  const list = $("#resvList", wrap);
  if (!resv.length) {
    list.appendChild(el(`<p class="muted" style="padding:8px 2px">まだ予約はありません。「探す」から予約してみましょう。</p>`));
  } else {
    resv.forEach(r => {
      const [y, m, d] = r.dateKey.split("-").map(Number);
      list.appendChild(el(`<div class="list-item">
        <div class="ava">${r.emoji}</div>
        <div style="flex:1"><strong>${r.title}</strong>
          <div class="muted" style="font-size:12px;margin-top:2px">${y}/${m + 1}/${d}・${r.qty}名・${fmtUSD(r.total)}</div></div>
        <span class="badge stay">確定</span>
      </div>`));
    });
  }
  $("#logout", wrap).onclick = () => { Auth.logout(); State.user = null; render(); };
  return wrap;
}

/* ---------- 起動 ---------- */
document.querySelectorAll("#tabbar .tab").forEach(t => {
  t.onclick = () => { stopSpeak(); State.view = t.dataset.view; render(); };
});
State.user = Auth.current();
render();
