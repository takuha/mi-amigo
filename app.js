/* =========================================================================
 * Mi Amigo — アンティグア街おこし統合アプリ（プロトタイプ）
 * 多言語(日英西) / 言語選択(ログイン・マイページ) / 予約決済 / 歴史ミステリー謎解き
 * (ガイド連動・実写真投稿・5プラットフォーム共有) / 音声ガイド(再生中ハイライト) / マップ(GPS+Googleマップ)
 *
 * ⚠️ プロトタイプ: データは localStorage（端末内）。決済はモック。認証はフロント簡易実装。
 * ===================================================================== */
const DATA = window.MI_AMIGO_DATA;

/* ---------- localStorage ---------- */
const DB = {
  get(k, def){ try{ return JSON.parse(localStorage.getItem(k)) ?? def; }catch{ return def; } },
  set(k, v){ localStorage.setItem(k, JSON.stringify(v)); },
};
const K = { users:"ma_users", session:"ma_session", resv:"ma_reservations", album:"ma_album", stamps:"ma_stamps", lang:"ma_lang", chat:"ma_chat", groups:"ma_groups" };

/* ---------- 認証 ---------- */
async function sha256(s){ const b=await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join(""); }
function randSalt(){ const a=new Uint8Array(16); crypto.getRandomValues(a); return [...a].map(b=>b.toString(16).padStart(2,"0")).join(""); }
const Auth = {
  async register(name,email,password){ email=email.trim().toLowerCase(); const u=DB.get(K.users,{}); if(u[email]) throw new Error(t("err_exists")); const salt=randSalt(); u[email]={name:name.trim(),email,salt,passHash:await sha256(salt+password)}; DB.set(K.users,u); DB.set(K.session,email); return u[email]; },
  async login(email,password){ email=email.trim().toLowerCase(); const u=DB.get(K.users,{})[email]; if(!u) throw new Error(t("err_nouser")); if(u.passHash!==await sha256(u.salt+password)) throw new Error(t("err_pass")); DB.set(K.session,email); return u; },
  logout(){ localStorage.removeItem(K.session); },
  current(){ const e=DB.get(K.session,null); return e ? DB.get(K.users,{})[e]||null : null; },
};

/* ---------- 状態 ---------- */
const State = {
  user:null, view:"discover",
  cal:{year:0,month:0},
  lang: localStorage.getItem(K.lang) || "ja",
  speakingId:null,
  geo:null, // 現在地 {lat,lng}
  chatGroup:null, // 開いているグループid
};

/* ---------- プロフィール ---------- */
function userRec(){ return DB.get(K.users,{})[State.user.email] || State.user; }
function saveProfile(p){ const u=DB.get(K.users,{}); const r=u[State.user.email]; if(!r) return;
  if(p.nick) r.name=p.nick.trim();
  if(p.avatar!==undefined) r.avatar=p.avatar;
  if(p.bio!==undefined) r.bio=(p.bio||"").trim();
  if(p.age!==undefined) r.age=p.age;
  if(p.gender!==undefined) r.gender=p.gender;
  if(p.country!==undefined) r.country=p.country;
  if(p.prouds!==undefined) r.prouds=p.prouds;
  DB.set(K.users,u); State.user=r; }
function profileMeta(r){ const b=[]; if(r.country) b.push(countryFlag(r.country)+" "+countryName(r.country)); if(r.age) b.push(r.age); if(r.gender) b.push(t("g_"+r.gender)); let s=b.join(" · "); if(r.prouds&&r.prouds.length) s+=(s?"　":"")+"❤️ "+r.prouds.map(countryFlag).join(""); return s; }
function avatarHTML(rec, size){
  size=size||44;
  if(rec && rec.avatar) return `<div class="avatar" style="width:${size}px;height:${size}px;background-image:url('${rec.avatar}')"></div>`;
  if(rec && rec.emoji) return `<div class="avatar ph" style="width:${size}px;height:${size}px;font-size:${Math.round(size*0.5)}px">${rec.emoji}</div>`;
  const ch=((rec && (rec.name||rec.from)) || "?").trim()[0] || "?";
  return `<div class="avatar ph" style="width:${size}px;height:${size}px;font-size:${Math.round(size*0.42)}px">${esc(ch.toUpperCase())}</div>`;
}

/* ---------- i18n ---------- */
const LANGS = [["ja","日本語"],["en","English"],["es","Español"]];
const LANG_CODE = { ja:"ja-JP", en:"en-US", es:"es-ES" };
const I18N = {
  ja:{ tab_discover:"探す", tab_quest:"謎解き", tab_guide:"ガイド", tab_map:"マップ", tab_album:"アルバム", tab_mypage:"マイ",
    tagline:"アンティグアを、もっと面白く歩こう。", register:"新規登録", login:"ログイン", name:"お名前 / ニックネーム", email:"メールアドレス", password:"パスワード", pw_ph:"6文字以上",
    create:"アカウント作成", login_btn:"ログイン", choose_lang:"言語を選択 / Language", proto_note:"プロトタイプ版です。データはこの端末内にのみ保存されます。",
    welcome:"ようこそ", discover_sub:"アンティグアの体験・カフェ・宿を予約", book:"予約する", per:"名", official:"公式サイト",
    pick_date:"日付を選ぶと、その日の空き枠が表示されます", booking_detail:"予約内容", remaining:"空き枠 残り", people:"名", total:"合計", pay_confirm:"💳 決済して予約を確定", no_charge:"※ プロトタイプのため実際の課金は発生しません", slots_max:"空き枠の上限です",
    pay_title:"💳 お支払い", plan:"プラン", date:"日付", num:"人数", cardno:"カード番号（ダミー）", expiry:"有効期限", pay_now:"を支払う", back:"戻る", processing:"処理中…", booked:"✅ 予約が確定しました！",
    quest_sub:"ガイドで語られる“場所”を探して写真を撮ろう", progress:"進捗", checkin:"チェックイン", photo:"写真", checked:"✅ 写真投稿ずみ", reward_done:"コンプリート!", reward_left:"報酬まであと",
    ck_take:"📷 写真を撮る / 選ぶ", ck_later:"あとで", ck_hint:"この場所で写真を撮ろう（顔出し不要）。撮った写真はアルバムに保存され、SNSに投稿して拡散できます。", ck_done:"📸 写真を投稿しました！スタンプGET", ck_fail:"写真の読み込みに失敗しました",
    guide_sub:"🎧 歩きながら聴ける音声ガイド", walk_route:"街歩きルート", listen_history:"歴史を聴く", play:"▶ 再生", stop:"■ 停止", tts_note:"※ 現在は端末の音声合成(TTS)で読み上げ。録音音声に差し替え予定。", reading:"読み上げ中…", replay:"↻ もう一度", close:"閉じる", no_tts:"この端末は音声読み上げに未対応です",
    map_sub:"GPSで現在地から、Googleマップで道案内", enable_loc:"📍 現在地を取得して近い順に並べる", locating:"現在地を取得中…", loc_fail:"現在地を取得できませんでした", go_here:"🧭 ここへ行く（Googleマップ）", open_map:"🗺️ 地図で開く", away:"約", km_away:"km先", all_route:"🗺️ ルート全体を地図で見る",
    album_sub:"投稿した写真を5つのSNSへ", album_empty:"まだ写真がありません。", go_quest:"謎解きへ", caption:"キャプション（SNS投稿文）", share_to:"投稿する（5プラットフォーム）", save_photo:"📥 写真を端末に保存", other_share:"その他のアプリで共有（写真つき）", delete_photo:"この写真を削除", taken:"に撮影", deleted:"削除しました", copied:"投稿文をコピーしました。アプリで貼り付けて投稿してください", shared:"共有しました！",
    mypage_sub:"", reservations:"予約一覧", no_resv:"まだ予約はありません。「探す」から予約してみましょう。", confirmed:"確定", logout:"ログアウト", language:"言語 / Language", proto_ver:"Mi Amigo プロトタイプ — Antigua, Guatemala 🌋",
    err_exists:"このメールアドレスは既に登録されています", err_nouser:"アカウントが見つかりません", err_pass:"パスワードが違います", err_email:"メールアドレスの形式が正しくありません", err_pwlen:"パスワードは6文字以上にしてください", err_name:"お名前を入力してください" },
  en:{ tab_discover:"Explore", tab_quest:"Rally", tab_guide:"Guide", tab_map:"Map", tab_album:"Album", tab_mypage:"Me",
    tagline:"Walk Antigua in a whole new way.", register:"Sign up", login:"Log in", name:"Name / Nickname", email:"Email", password:"Password", pw_ph:"6+ characters",
    create:"Create account", login_btn:"Log in", choose_lang:"Choose language / 言語", proto_note:"Prototype. Data is stored only on this device.",
    welcome:"Welcome", discover_sub:"Book experiences, cafes and stays in Antigua", book:"Book", per:"person", official:"Website",
    pick_date:"Pick a date to see that day's availability", booking_detail:"Booking", remaining:"left", people:"ppl", total:"Total", pay_confirm:"💳 Pay & confirm booking", no_charge:"※ Prototype — no real charge", slots_max:"No more slots available",
    pay_title:"💳 Payment", plan:"Plan", date:"Date", num:"People", cardno:"Card number (dummy)", expiry:"Expiry", pay_now:"Pay", back:"Back", processing:"Processing…", booked:"✅ Booking confirmed!",
    quest_sub:"Find the places told in the guide and photograph them", progress:"Progress", checkin:"Check in", photo:"Photo", checked:"✅ Posted", reward_done:"Completed!", reward_left:"left to reward",
    ck_take:"📷 Take / choose photo", ck_later:"Later", ck_hint:"Take a photo here (no face needed). It's saved to your album and you can share it to social media.", ck_done:"📸 Photo posted! Stamp earned", ck_fail:"Could not load photo",
    guide_sub:"🎧 Listen while you walk", walk_route:"Walking route", listen_history:"Listen: History", play:"▶ Play", stop:"■ Stop", tts_note:"※ Currently read by device text-to-speech. Recorded audio coming.", reading:"Reading…", replay:"↻ Again", close:"Close", no_tts:"This device does not support text-to-speech",
    map_sub:"Use GPS and get directions on Google Maps", enable_loc:"📍 Use my location & sort by nearest", locating:"Getting location…", loc_fail:"Could not get your location", go_here:"🧭 Go here (Google Maps)", open_map:"🗺️ Open in map", away:"~", km_away:"km away", all_route:"🗺️ See full route on map",
    album_sub:"Share your photos to 5 platforms", album_empty:"No photos yet.", go_quest:"To the rally", caption:"Caption (post text)", share_to:"Post (5 platforms)", save_photo:"📥 Save photo to device", other_share:"Share via other apps (with photo)", delete_photo:"Delete this photo", taken:"taken on", deleted:"Deleted", copied:"Caption copied. Paste it in the app to post", shared:"Shared!",
    mypage_sub:"", reservations:"Your bookings", no_resv:"No bookings yet. Try booking from Explore.", confirmed:"Confirmed", logout:"Log out", language:"Language / 言語", proto_ver:"Mi Amigo prototype — Antigua, Guatemala 🌋",
    err_exists:"This email is already registered", err_nouser:"Account not found", err_pass:"Wrong password", err_email:"Invalid email format", err_pwlen:"Password must be 6+ characters", err_name:"Please enter your name" },
  es:{ tab_discover:"Explorar", tab_quest:"Rally", tab_guide:"Guía", tab_map:"Mapa", tab_album:"Álbum", tab_mypage:"Yo",
    tagline:"Camina Antigua de una forma nueva.", register:"Registrarse", login:"Entrar", name:"Nombre / Apodo", email:"Correo", password:"Contraseña", pw_ph:"6+ caracteres",
    create:"Crear cuenta", login_btn:"Entrar", choose_lang:"Elige idioma / Language", proto_note:"Prototipo. Los datos se guardan solo en este dispositivo.",
    welcome:"Bienvenido", discover_sub:"Reserva experiencias, cafés y hospedaje en Antigua", book:"Reservar", per:"persona", official:"Sitio web",
    pick_date:"Elige una fecha para ver la disponibilidad", booking_detail:"Reserva", remaining:"libres", people:"pers", total:"Total", pay_confirm:"💳 Pagar y confirmar", no_charge:"※ Prototipo — sin cargo real", slots_max:"No hay más cupos",
    pay_title:"💳 Pago", plan:"Plan", date:"Fecha", num:"Personas", cardno:"Tarjeta (ficticia)", expiry:"Vence", pay_now:"Pagar", back:"Volver", processing:"Procesando…", booked:"✅ ¡Reserva confirmada!",
    quest_sub:"Encuentra los lugares de la guía y fotografíalos", progress:"Progreso", checkin:"Registrar", photo:"Foto", checked:"✅ Publicado", reward_done:"¡Completado!", reward_left:"para la recompensa",
    ck_take:"📷 Tomar / elegir foto", ck_later:"Después", ck_hint:"Toma una foto aquí (sin mostrar la cara). Se guarda en tu álbum y puedes compartirla en redes.", ck_done:"📸 ¡Foto publicada! Sello obtenido", ck_fail:"No se pudo cargar la foto",
    guide_sub:"🎧 Escucha mientras caminas", walk_route:"Ruta a pie", listen_history:"Escuchar: Historia", play:"▶ Reproducir", stop:"■ Parar", tts_note:"※ Por ahora lo lee la voz del dispositivo. Pronto audio grabado.", reading:"Leyendo…", replay:"↻ Otra vez", close:"Cerrar", no_tts:"Este dispositivo no admite lectura por voz",
    map_sub:"Usa GPS y obtén indicaciones en Google Maps", enable_loc:"📍 Usar mi ubicación y ordenar por cercanía", locating:"Obteniendo ubicación…", loc_fail:"No se pudo obtener tu ubicación", go_here:"🧭 Ir aquí (Google Maps)", open_map:"🗺️ Abrir en el mapa", away:"~", km_away:"km", all_route:"🗺️ Ver la ruta completa",
    album_sub:"Comparte tus fotos en 5 plataformas", album_empty:"Aún no hay fotos.", go_quest:"Al rally", caption:"Texto de la publicación", share_to:"Publicar (5 plataformas)", save_photo:"📥 Guardar foto en el dispositivo", other_share:"Compartir en otras apps (con foto)", delete_photo:"Eliminar esta foto", taken:"tomada el", deleted:"Eliminada", copied:"Texto copiado. Pégalo en la app para publicar", shared:"¡Compartido!",
    mypage_sub:"", reservations:"Tus reservas", no_resv:"Aún no hay reservas. Reserva desde Explorar.", confirmed:"Confirmada", logout:"Salir", language:"Idioma / Language", proto_ver:"Mi Amigo prototipo — Antigua, Guatemala 🌋",
    err_exists:"Este correo ya está registrado", err_nouser:"Cuenta no encontrada", err_pass:"Contraseña incorrecta", err_email:"Formato de correo inválido", err_pwlen:"La contraseña debe tener 6+ caracteres", err_name:"Ingresa tu nombre" },
};
// 追加i18n（なかま/チャット/プロフィール/位置共有）
Object.assign(I18N.ja,{ tab_community:"なかま", community_sub:"ツアーで出会った仲間とつながろう（ワールドホステル風）", groups:"グループ", create_group:"＋ グループを作成", new_group_ph:"グループ名を入力", group_created:"グループを作成しました", open_chat:"開く", msg_ph:"メッセージを入力…", send:"送信", you:"あなた", share_here:"📍 今ここにいるよ", here_now:"📍 今ここにいるよ！", here_shared:"現在地を共有しました", loc_link:"地図で見る", demo_chat_note:"プロトタイプ：メッセージはこの端末内のデモです。仲間とリアルタイム共有するにはサーバー連携が必要です。", profile:"プロフィール", edit_profile:"編集", amigo_name:"アミーゴネーム / ニックネーム", profile_photo:"プロフィール写真", add_photo:"📷 写真を選ぶ", bio:"ひとこと", bio_ph:"例: コーヒーと火山が好きな旅人", save:"保存", profile_saved:"プロフィールを保存しました" });
Object.assign(I18N.en,{ tab_community:"Amigos", community_sub:"Connect with fellow travelers from the tour (world-hostel vibe)", groups:"Groups", create_group:"＋ Create group", new_group_ph:"Enter group name", group_created:"Group created", open_chat:"Open", msg_ph:"Type a message…", send:"Send", you:"You", share_here:"📍 I'm here now", here_now:"📍 I'm here now!", here_shared:"Location shared", loc_link:"View on map", demo_chat_note:"Prototype: messages are a demo on this device. Real-time sharing needs a backend.", profile:"Profile", edit_profile:"Edit", amigo_name:"Amigo name / Nickname", profile_photo:"Profile photo", add_photo:"📷 Choose photo", bio:"About you", bio_ph:"e.g. A traveler who loves coffee and volcanoes", save:"Save", profile_saved:"Profile saved" });
Object.assign(I18N.es,{ tab_community:"Amigos", community_sub:"Conecta con viajeros del tour (estilo world-hostel)", groups:"Grupos", create_group:"＋ Crear grupo", new_group_ph:"Nombre del grupo", group_created:"Grupo creado", open_chat:"Abrir", msg_ph:"Escribe un mensaje…", send:"Enviar", you:"Tú", share_here:"📍 Estoy aquí", here_now:"📍 ¡Estoy aquí ahora!", here_shared:"Ubicación compartida", loc_link:"Ver en el mapa", demo_chat_note:"Prototipo: los mensajes son una demo en este dispositivo. Compartir en tiempo real requiere un servidor.", profile:"Perfil", edit_profile:"Editar", amigo_name:"Nombre Amigo / Apodo", profile_photo:"Foto de perfil", add_photo:"📷 Elegir foto", bio:"Sobre ti", bio_ph:"ej. Viajero que ama el café y los volcanes", save:"Guardar", profile_saved:"Perfil guardado" });

// 追加i18n（プロフィール拡張・アミーゴカード）
Object.assign(I18N.ja,{ age:"年齢", gender:"性別", g_m:"男性", g_f:"女性", g_o:"その他", g_na:"無回答", from_country:"出身国", proud:"誇りに思う国（複数OK）", proud_hint:"あなたが大好き・誇りに思う国を選んで追加", add_country:"＋ 追加", select_ph:"選択…", optional:"（任意）",
  amigo_card:"アミーゴカード", make_card:"🎫 アミーゴカードを作る", save_card:"📥 画像を保存", share_card:"📲 シェアして拡散", card_from:"出身", card_loves:"大好きな国", card_stamps:"集めたスタンプ", card_made:"カードを保存しました", card_tagline:"アンティグアを歩こう" });
Object.assign(I18N.en,{ age:"Age", gender:"Gender", g_m:"Male", g_f:"Female", g_o:"Other", g_na:"Prefer not to say", from_country:"From", proud:"Countries you love (multiple)", proud_hint:"Add the countries you love or are proud of", add_country:"＋ Add", select_ph:"Select…", optional:"(optional)",
  amigo_card:"Amigo Card", make_card:"🎫 Make my Amigo Card", save_card:"📥 Save image", share_card:"📲 Share it", card_from:"From", card_loves:"Loves", card_stamps:"Stamps", card_made:"Card saved", card_tagline:"Walking Antigua" });
Object.assign(I18N.es,{ age:"Edad", gender:"Género", g_m:"Hombre", g_f:"Mujer", g_o:"Otro", g_na:"Prefiero no decir", from_country:"De", proud:"Países que amas (varios)", proud_hint:"Agrega los países que amas o de los que estás orgulloso", add_country:"＋ Agregar", select_ph:"Elegir…", optional:"(opcional)",
  amigo_card:"Tarjeta Amigo", make_card:"🎫 Crear mi Tarjeta Amigo", save_card:"📥 Guardar imagen", share_card:"📲 Compartir", card_from:"De", card_loves:"Ama", card_stamps:"Sellos", card_made:"Tarjeta guardada", card_tagline:"Caminando Antigua" });

// 追加i18n（電話番号認証）
Object.assign(I18N.ja,{ phone:"電話番号", phone_ph:"電話番号（ハイフン無し）", send_code:"認証コードを送信", code:"認証コード", code_ph:"6桁のコード", verify:"確認して続ける", nick_new:"お名前 / ニックネーム（新規の方）", demo_code:"デモ用コード", sms_note:"デモ版：実際のSMS送信には本番でサーバー連携(Firebase/Twilio等)が必要です。コードは画面に表示します。", code_sent:"認証コードを送信しました", err_phone:"電話番号を入力してください", err_code:"コードが正しくありません" });
Object.assign(I18N.en,{ phone:"Phone number", phone_ph:"Phone (no dashes)", send_code:"Send code", code:"Verification code", code_ph:"6-digit code", verify:"Verify & continue", nick_new:"Name / Nickname (new users)", demo_code:"Demo code", sms_note:"Demo: real SMS needs a backend (Firebase/Twilio). The code is shown on screen.", code_sent:"Code sent", err_phone:"Enter your phone number", err_code:"Incorrect code" });
Object.assign(I18N.es,{ phone:"Número de teléfono", phone_ph:"Teléfono (sin guiones)", send_code:"Enviar código", code:"Código de verificación", code_ph:"Código de 6 dígitos", verify:"Verificar y continuar", nick_new:"Nombre / Apodo (nuevos)", demo_code:"Código demo", sms_note:"Demo: el SMS real necesita un backend (Firebase/Twilio). El código se muestra en pantalla.", code_sent:"Código enviado", err_phone:"Ingresa tu número", err_code:"Código incorrecto" });
const DIAL={ JP:"+81",GT:"+502",US:"+1",CA:"+1",MX:"+52",ES:"+34",FR:"+33",DE:"+49",GB:"+44",IT:"+39",NL:"+31",CH:"+41",PT:"+351",IE:"+353",SE:"+46",NO:"+47",AU:"+61",NZ:"+64",BR:"+55",AR:"+54",CL:"+56",CO:"+57",PE:"+51",CR:"+506",SV:"+503",HN:"+504",NI:"+505",BZ:"+501",KR:"+82",CN:"+86",TW:"+886",TH:"+66",IN:"+91",IL:"+972",ZA:"+27",PL:"+48" };

function t(key){ const L=State.lang; return (I18N[L] && I18N[L][key]) || I18N.ja[key] || key; }
function country(code){ return (DATA.countries||[]).find(c=>c.c===code); }
function countryName(code){ const c=country(code); return c?(c[State.lang]||c.en):""; }
function countryFlag(code){ const c=country(code); return c?c.f:""; }
function L(obj){ if(obj==null) return ""; if(typeof obj==="string") return obj; return obj[State.lang] || obj.ja || ""; }
function setLang(code){ State.lang=code; localStorage.setItem(K.lang, code); }

/* ---------- ユーティリティ ---------- */
const $ = (s,r=document)=>r.querySelector(s);
const el = (h)=>{ const t=document.createElement("template"); t.innerHTML=h.trim(); return t.content.firstElementChild; };
const esc = (s)=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const fmtUSD = (n)=>"$"+n.toFixed(0);
const fmtJPY = (usd)=>"≈"+Math.round(usd*150).toLocaleString()+(State.lang==="ja"?"円":" JPY");
const dateKey = (y,m,d)=>`${y}-${m}-${d}`;
const thumbStyle = (it)=> it.img ? `background-image:url('${it.img}');background-size:cover;background-position:center;` : "background:linear-gradient(135deg,#fce9d4,#f6dbe5)";
const thumbInner = (it)=> it.img ? "" : it.emoji;

function seed(str){ let h=2166136261; for(let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619);} return ((h>>>0)%1000)/1000; }
function capacityFor(l,dk){ return Math.max(2, Math.round(l.maxSlots*(0.3+seed(l.id+dk)*0.7))); }
function bookedFor(id,dk){ return DB.get(K.resv,[]).filter(r=>r.listingId===id&&r.dateKey===dk).reduce((s,r)=>s+r.qty,0); }
function remainingFor(l,dk){ return Math.max(0, capacityFor(l,dk)-bookedFor(l.id,dk)); }

function toast(msg){ $(".toast")?.remove(); const t=el(`<div class="toast">${msg}</div>`); $(".phone").appendChild(t); setTimeout(()=>t.remove(),2600); }
function closeSheet(){ $(".sheet-back")?.remove(); }
function openSheet(html){ closeSheet(); const b=el(`<div class="sheet-back"><div class="sheet"><div class="grab"></div>${html}</div></div>`); b.addEventListener("click",e=>{ if(e.target===b) closeSheet(); }); $(".phone").appendChild(b); return b; }

function fileToResizedDataUrl(file,max=900,q=0.78){ return new Promise((res,rej)=>{ const img=new Image(),r=new FileReader(); r.onload=()=>img.src=r.result; r.onerror=rej; img.onload=()=>{ let{width:w,height:h}=img; if(w>h&&w>max){h=h*max/w;w=max;} else if(h>max){w=w*max/h;h=max;} const c=document.createElement("canvas"); c.width=w; c.height=h; c.getContext("2d").drawImage(img,0,0,w,h); res(c.toDataURL("image/jpeg",q)); }; img.onerror=rej; r.readAsDataURL(file); }); }

/* ---------- 音声(TTS) ---------- */
function stopSpeak(){ try{ window.speechSynthesis&&speechSynthesis.cancel(); }catch{} State.speakingId=null; }

/* =========================================================================
 * 描画
 * ===================================================================== */
function render(){
  const screen=$("#screen"), tabbar=$("#tabbar");
  // タブ名を言語反映
  tabbar.querySelectorAll(".tab").forEach(tb=>{ const lab=tb.querySelector(".tab-label"); if(lab) lab.textContent=t("tab_"+tb.dataset.view); });
  if(!State.user){ tabbar.classList.add("hidden"); screen.innerHTML=""; screen.appendChild(viewAuth()); return; }
  tabbar.classList.remove("hidden");
  tabbar.querySelectorAll(".tab").forEach(tb=>tb.classList.toggle("active", tb.dataset.view===State.view));
  screen.innerHTML="";
  const v={ discover:viewDiscover, quest:viewQuest, guide:viewGuide, map:viewMap, community:viewCommunity, album:viewAlbum, mypage:viewMyPage }[State.view]();
  screen.appendChild(v); screen.scrollTop=0;
}

/* 言語セグメント（共通） */
function langSeg(onPick){
  const seg=el(`<div class="langseg"></div>`);
  LANGS.forEach(([code,label])=>{ const b=el(`<button class="${code===State.lang?"on":""}">${label}</button>`); b.onclick=()=>{ stopSpeak(); setLang(code); onPick&&onPick(); }; seg.appendChild(b); });
  return seg;
}

/* ---------- 認証（電話番号＋認証コード／言語選択を最初に） ---------- */
function normPhone(dial,num){ return (dial+num).replace(/[^0-9+]/g,""); }
function viewAuth(){
  let sentCode=null, pendingKey=null, pendingDisplay=null, pendingNick="";
  const dialOpts=DATA.countries.map(c=>`<option value="${DIAL[c.c]||""}" ${c.c==="JP"?"selected":""}>${c.f} ${DIAL[c.c]||""}</option>`).join("");
  const wrap=el(`<div>
    <div class="auth-hero"><div class="volcano">🌋🌋🌋</div><h1>Mi Amigo</h1><p>${t("tagline")}</p></div>
    <div class="weave"></div>
    <div class="pad">
      <label class="field-label">${t("choose_lang")}</label>
      <div id="authLang"></div>
      <div id="authBody" style="margin-top:18px"></div>
    </div></div>`);
  $("#authLang",wrap).appendChild(langSeg(()=>render()));
  const body=$("#authBody",wrap);
  function renderPhone(){
    body.innerHTML=`
      <div class="field"><label>${t("phone")}</label>
        <div class="row" style="gap:8px"><select id="dial" style="width:135px">${dialOpts}</select><input id="phone" type="tel" inputmode="tel" style="flex:1" placeholder="${t("phone_ph")}" /></div></div>
      <div class="field"><label>${t("nick_new")}</label><input id="nick" placeholder="Taku" /></div>
      <p class="error" id="aErr"></p>
      <button class="btn" id="sendBtn">${t("send_code")}</button>
      <p class="hint" style="margin-top:12px">${t("sms_note")}</p>`;
    $("#sendBtn",body).onclick=()=>{ const num=$("#phone",body).value.trim(); if(!num){ $("#aErr",body).textContent=t("err_phone"); return; }
      const dial=$("#dial",body).value; pendingDisplay=dial+" "+num; pendingKey=normPhone(dial,num); pendingNick=$("#nick",body).value;
      sentCode=String(Math.floor(100000+Math.random()*900000)); toast(t("code_sent")); renderCode(); };
  }
  function renderCode(){
    body.innerHTML=`
      <div class="card" style="background:#f3ece0;border:none;margin-bottom:14px"><div class="card-body">
        <div class="muted" style="font-size:13px">📱 ${esc(pendingDisplay)}</div>
        <div style="margin-top:6px;font-size:14px">${t("demo_code")}: <b style="font-size:22px;letter-spacing:4px;color:var(--terra)">${sentCode}</b></div></div></div>
      <div class="field"><label>${t("code")}</label><input id="code" inputmode="numeric" maxlength="6" placeholder="${t("code_ph")}" /></div>
      <p class="error" id="aErr"></p>
      <button class="btn" id="verifyBtn">${t("verify")}</button>
      <button class="btn ghost" id="backBtn" style="margin-top:8px">${t("back")}</button>`;
    $("#code",body).value=sentCode; // デモ：自動入力
    $("#verifyBtn",body).onclick=()=>{ if($("#code",body).value.trim()!==sentCode){ $("#aErr",body).textContent=t("err_code"); return; }
      const all=DB.get(K.users,{}); let u=all[pendingKey];
      if(!u){ u={ id:pendingKey, email:pendingKey, phone:pendingDisplay, name:(pendingNick.trim()||pendingDisplay) }; all[pendingKey]=u; DB.set(K.users,all); }
      DB.set(K.session,pendingKey); State.user=u; State.view="discover"; toast(`${t("welcome")}, ${u.name}!`); render(); };
    $("#backBtn",body).onclick=renderPhone;
  }
  renderPhone();
  return wrap;
}

/* ---------- 探す（多言語） ---------- */
function viewDiscover(){
  const wrap=el(`<div><div class="topbar"><h1>${t("tab_discover")}</h1><p class="sub">${t("discover_sub")}</p></div><div class="pad" id="listings"></div></div>`);
  const labels={ exp:["exp",{ja:"体験",en:"Experience",es:"Experiencia"}], food:["food",{ja:"飲食",en:"Food",es:"Comida"}], stay:["stay",{ja:"宿",en:"Stay",es:"Hospedaje"}] };
  const root=$("#listings",wrap);
  DATA.listings.forEach(l=>{
    const [cls,jp]=labels[l.type]||labels.exp;
    const card=el(`<div class="card">
      <div class="thumb" style="${thumbStyle(l)}">${thumbInner(l)}</div>
      <div class="card-body">
        <span class="badge ${cls}">${L(jp)}</span>
        <h3 style="margin:8px 0 4px;font-size:17px">${esc(L(l.title))}</h3>
        <p class="muted" style="margin:0 0 6px;font-size:13px">${esc(L(l.desc))}</p>
        <p class="muted" style="margin:0 0 12px;font-size:12px">📍 ${esc(l.area||"")}${l.link?` · <a href="${l.link}" target="_blank" rel="noopener" style="color:var(--teal)">${t("official")}</a>`:""}</p>
        <div class="row"><div><span class="price">${fmtUSD(l.price)}</span> <span class="muted" style="font-size:12px">/ ${t("per")}　${fmtJPY(l.price)}</span></div><span class="spacer"></span><button class="btn sm" data-id="${l.id}">${t("book")}</button></div>
      </div></div>`);
    $("button",card).onclick=()=>openBooking(l); root.appendChild(card);
  });
  return wrap;
}

function openBooking(listing){
  const now=new Date(); State.cal={year:now.getFullYear(),month:now.getMonth()};
  let selected=null, qty=1;
  const back=openSheet(`<h2>${listing.emoji} ${esc(L(listing.title))}</h2><p class="muted" style="margin:-8px 0 14px;font-size:13px">${t("pick_date")}</p><div id="calMount"></div><div id="bookPanel"></div>`);
  function renderCal(){
    const {year,month}=State.cal; const first=new Date(year,month,1).getDay(); const days=new Date(year,month+1,0).getDate();
    const dows=({ja:["日","月","火","水","木","金","土"],en:["Su","Mo","Tu","We","Th","Fr","Sa"],es:["Do","Lu","Ma","Mi","Ju","Vi","Sa"]})[State.lang];
    const today=new Date(); today.setHours(0,0,0,0);
    let cells=dows.map(d=>`<div class="cal-dow">${d}</div>`).join("");
    for(let i=0;i<first;i++) cells+=`<div class="cal-cell empty"></div>`;
    for(let d=1;d<=days;d++){ const dk=dateKey(year,month,d); const cd=new Date(year,month,d); const past=cd<today; const rem=remainingFor(listing,dk); const full=rem<=0;
      const cls=["cal-cell",past?"past":"",full&&!past?"full":"",selected===dk?"sel":""].join(" ");
      const txt=past?"":(full?(State.lang==="ja"?"満":"x"):(State.lang==="ja"?"残"+rem:rem));
      cells+=`<div class="${cls}" data-dk="${past||full?"":dk}"><span class="d">${d}</span><span class="slots">${txt}</span>${!past&&!full?'<span class="dot"></span>':""}</div>`; }
    const m=$("#calMount",back); m.innerHTML=`<div class="cal"><div class="cal-head"><button id="pm">‹</button><strong>${year} / ${month+1}</strong><button id="nm">›</button></div><div class="cal-grid">${cells}</div></div>`;
    $("#pm",m).onclick=()=>{ State.cal.month--; if(State.cal.month<0){State.cal.month=11;State.cal.year--;} renderCal(); };
    $("#nm",m).onclick=()=>{ State.cal.month++; if(State.cal.month>11){State.cal.month=0;State.cal.year++;} renderCal(); };
    m.querySelectorAll(".cal-cell[data-dk]").forEach(c=>{ if(!c.dataset.dk) return; c.onclick=()=>{ selected=c.dataset.dk; qty=1; renderCal(); renderPanel(); }; });
  }
  function renderPanel(){
    const p=$("#bookPanel",back); if(!selected){ p.innerHTML=""; return; }
    const [y,mo,d]=selected.split("-").map(Number); const rem=remainingFor(listing,selected); const total=listing.price*qty;
    p.innerHTML=`<div class="section-title">${t("booking_detail")}</div>
      <div class="row" style="margin-bottom:12px"><div>📅 ${y}/${mo+1}/${d}<br><span class="muted" style="font-size:12px">${t("remaining")} ${rem}</span></div><span class="spacer"></span>
      <div class="row" style="gap:8px"><button class="btn secondary sm" id="minus" style="width:38px">−</button><strong style="min-width:30px;text-align:center">${qty}</strong><button class="btn secondary sm" id="plus" style="width:38px">＋</button></div></div>
      <div class="card" style="margin-bottom:14px"><div class="card-body"><div class="pay-row"><span>${esc(L(listing.title))}</span><span>${fmtUSD(listing.price)} × ${qty}</span></div>
      <div class="pay-total"><span>${t("total")}</span><span>${fmtUSD(total)} <span class="muted" style="font-size:13px;font-weight:500">${fmtJPY(total)}</span></span></div></div></div>
      <button class="btn teal" id="payBtn">${t("pay_confirm")}</button><p class="hint" style="text-align:center">${t("no_charge")}</p>`;
    $("#minus",p).onclick=()=>{ if(qty>1){qty--;renderPanel();} };
    $("#plus",p).onclick=()=>{ if(qty<rem){qty++;renderPanel();} else toast(t("slots_max")); };
    $("#payBtn",p).onclick=()=>openPayment(listing,selected,qty);
  }
  renderCal();
}

function openPayment(listing,dk,qty){
  const total=listing.price*qty; const [y,mo,d]=dk.split("-").map(Number);
  const back=openSheet(`<h2>${t("pay_title")}</h2>
    <div class="card"><div class="card-body">
      <div class="pay-row"><span class="muted">${t("plan")}</span><span>${esc(L(listing.title))}</span></div>
      <div class="pay-row"><span class="muted">${t("date")}</span><span>${y}/${mo+1}/${d}</span></div>
      <div class="pay-row"><span class="muted">${t("num")}</span><span>${qty}</span></div>
      <div class="pay-total"><span>${t("total")}</span><span>${fmtUSD(total)}</span></div></div></div>
    <div class="field"><label>${t("cardno")}</label><input inputmode="numeric" value="4242 4242 4242 4242" /></div>
    <div class="row" style="gap:12px"><div class="field" style="flex:1"><label>${t("expiry")}</label><input value="12 / 28" /></div><div class="field" style="width:110px"><label>CVC</label><input value="123" /></div></div>
    <button class="btn" id="cp">${fmtUSD(total)} ${t("pay_now")}</button><button class="btn ghost" id="cc" style="margin-top:8px">${t("back")}</button>`);
  $("#cc",back).onclick=closeSheet;
  $("#cp",back).onclick=()=>{ const b=$("#cp",back); b.disabled=true; b.textContent=t("processing");
    setTimeout(()=>{ const r=DB.get(K.resv,[]); r.push({id:"r"+Date.now(),userEmail:State.user.email,listingId:listing.id,title:L(listing.title),emoji:listing.emoji,dateKey:dk,qty,total,createdAt:Date.now()}); DB.set(K.resv,r); closeSheet(); toast(t("booked")); State.view="mypage"; render(); },900); };
}

/* ---------- 謎解き（ガイド連動・歴史ミステリー） ---------- */
function viewQuest(){
  const stops=DATA.guide.route.stops;
  const stamps=DB.get(K.stamps,{})[State.user.email]||{};
  const done=stops.filter(s=>stamps[s.id]).length;
  const wrap=el(`<div><div class="topbar"><h1>${esc(L(DATA.quest.title))}</h1><p class="sub">${t("quest_sub")}</p></div>
    <div class="pad">
      <div class="card"><div class="card-body">
        <div class="row"><strong>${t("progress")} ${done} / ${stops.length}</strong><span class="spacer"></span>
        <span class="badge exp">🎁 ${done===stops.length?t("reward_done"):t("reward_left")+" "+(stops.length-done)}</span></div>
        <div class="stamp" id="stamps"></div><p class="hint">${esc(L(DATA.quest.reward))}</p></div></div>
      <div id="qlist" style="margin-top:6px"></div></div></div>`);
  const sm=$("#stamps",wrap); stops.forEach(s=>sm.appendChild(el(`<div class="s ${stamps[s.id]?"on":""}">${stamps[s.id]?"✓":s.emoji}</div>`)));
  const list=$("#qlist",wrap);
  stops.forEach((s,i)=>{ const got=!!stamps[s.id];
    const item=el(`<div class="list-item"><div class="ava">${s.emoji}</div>
      <div style="flex:1"><strong>${i+1}. ${esc(L(s.title))}</strong>
        <div class="muted" style="font-size:12px;margin-top:3px">${got?t("checked"):"🔍 "+esc(L(s.riddle))}</div></div>
      <button class="btn sm ${got?"secondary":""}" data-id="${s.id}">${got?t("photo"):t("checkin")}</button></div>`);
    $("button",item).onclick=()=> got ? (State.view="album",render()) : openCheckin(s);
    list.appendChild(item);
  });
  return wrap;
}

function openCheckin(spot){
  const back=openSheet(`<h2>${spot.emoji} ${esc(L(spot.title))}</h2>
    <div class="card"><div class="card-body"><span class="badge cafe">🔍</span><p style="margin:8px 0 0">${esc(L(spot.riddle))}</p></div></div>
    <p class="muted" style="font-size:13px;margin:4px 2px 14px">${t("ck_hint")}</p>
    <label class="btn gold" for="camInput">${t("ck_take")}</label>
    <input id="camInput" type="file" accept="image/*" capture="environment" style="display:none" />
    <button class="btn ghost" id="ckLater" style="margin-top:8px">${t("ck_later")}</button>`);
  $("#ckLater",back).onclick=closeSheet;
  $("#camInput",back).onchange=async e=>{ const file=e.target.files[0]; if(!file) return; const lbl=back.querySelector('label[for="camInput"]'); lbl.textContent=t("processing");
    try{ const dataUrl=await fileToResizedDataUrl(file);
      const album=DB.get(K.album,[]); album.unshift({id:"p"+Date.now(),userEmail:State.user.email,spotId:spot.id,place:L(spot.title),dataUrl,caption:`${L(spot.title)} — Antigua, Guatemala 🌋 #MiAmigo #Antigua`,createdAt:Date.now()}); DB.set(K.album,album);
      const all=DB.get(K.stamps,{}); all[State.user.email]={...(all[State.user.email]||{}),[spot.id]:true}; DB.set(K.stamps,all);
      closeSheet(); toast(t("ck_done")); render();
    }catch{ toast(t("ck_fail")); lbl.textContent=t("ck_take"); }
  };
}

/* ---------- 音声ガイド（再生中の文章を前面に表示＋ハイライト） ---------- */
function viewGuide(){
  const g=DATA.guide;
  const wrap=el(`<div><div class="topbar"><h1>${esc(L(g.route.title))}</h1><p class="sub">${t("guide_sub")}</p><div id="gLang"></div></div>
    <div class="pad"><p class="muted" style="font-size:13px;margin:0 0 16px">${esc(L(g.route.intro))}</p>
      <div class="section-title">${t("walk_route")}（${g.route.stops.length}）</div><div class="route" id="route"></div>
      <div class="section-title">${t("listen_history")}</div><div id="history"></div>
      <p class="hint" style="text-align:center;margin-top:18px">${t("tts_note")}</p></div></div>`);
  $("#gLang",wrap).appendChild(langSeg(()=>render()));
  const route=$("#route",wrap);
  g.route.stops.forEach((s,i)=>{
    const item=el(`<div class="route-item"><div class="route-num">${i+1}</div>
      <div class="card" style="flex:1;margin:0 0 14px"><div class="card-body">
        <div class="row" style="align-items:flex-start"><div class="ava">${s.emoji}</div>
        <div style="flex:1"><strong>${esc(L(s.title))}</strong><p class="muted" style="font-size:13px;margin:6px 0 0">${esc(L(s.text))}</p></div></div>
        <button class="btn teal sm" style="width:100%;margin-top:12px">${t("play")}</button></div></div></div>`);
    $("button",item).onclick=()=>openPlayer(s);
    route.appendChild(item);
  });
  const hist=$("#history",wrap);
  g.history.forEach(h=>{
    const item=el(`<div class="card"><div class="card-body"><div class="row" style="align-items:flex-start"><div class="ava">${h.emoji}</div>
      <div style="flex:1"><strong>${esc(L(h.title))}</strong>${h.sensitive?`<div style="margin-top:4px"><span class="badge food">⚠️ ${State.lang==="ja"?"取り扱い注意・下書き":"draft"}</span></div>`:""}
      <p class="muted" style="font-size:13px;margin:8px 0 0">${esc(L(h.text))}</p></div></div>
      <button class="btn teal sm" style="width:100%;margin-top:12px">${t("play")}</button></div></div>`);
    $("button",item).onclick=()=>openPlayer(h);
    hist.appendChild(item);
  });
  return wrap;
}

// 再生プレイヤー：読み上げ文を大きく前面に。読み上げ位置をハイライトして自動スクロール。
function openPlayer(item){
  const text=L(item.text);
  // 文単位に分割（日本語の「。」・欧文の .!? と改行）
  const parts=text.match(/[^。．.!?！？\n]+[。．.!?！？]?/g) || [text];
  const sentences=parts.map(p=>p.trim()).filter(Boolean);
  let offs=[]; { let pos=0; sentences.forEach(s=>{ const idx=text.indexOf(s,pos); offs.push(idx<0?pos:idx); pos=(idx<0?pos:idx)+s.length; }); }
  const spans=sentences.map((s,i)=>`<span class="sent" data-i="${i}">${esc(s)} </span>`).join("");
  const back=openSheet(`<div class="player">
    <div class="row" style="align-items:center"><div class="ava" style="font-size:26px">${item.emoji}</div><h2 style="margin:0 0 0 6px;flex:1">${esc(L(item.title))}</h2></div>
    <div class="player-text" id="ptext">${spans}</div>
    <div class="player-ctl"><button class="btn teal" id="pToggle">${t("stop")}</button><button class="btn secondary" id="pClose">${t("close")}</button></div>
  </div>`);
  const textBox=$("#ptext",back); const spanEls=[...textBox.querySelectorAll(".sent")];
  const highlight=(i)=>{ spanEls.forEach((e,j)=>e.classList.toggle("active",j===i)); const a=spanEls[i]; if(a) a.scrollIntoView({block:"center",behavior:"smooth"}); };
  const sentenceForChar=(ci)=>{ let idx=0; for(let i=0;i<offs.length;i++){ if(ci>=offs[i]) idx=i; else break; } return idx; };
  let toggled=true;
  function start(){
    if(!("speechSynthesis" in window)){ toast(t("no_tts")); highlight(0); return; }
    speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(text); u.lang=LANG_CODE[State.lang]||"ja-JP"; u.rate=0.97;
    State.speakingId=item.id; highlight(0);
    u.onboundary=(e)=>{ if(e.charIndex!=null) highlight(sentenceForChar(e.charIndex)); };
    u.onend=()=>{ State.speakingId=null; toggled=false; const b=$("#pToggle",back); if(b) b.textContent=t("replay"); spanEls.forEach(e=>e.classList.remove("active")); };
    speechSynthesis.speak(u);
  }
  $("#pToggle",back).onclick=()=>{ if(toggled){ stopSpeak(); toggled=false; $("#pToggle",back).textContent=t("replay"); spanEls.forEach(e=>e.classList.remove("active")); } else { toggled=true; $("#pToggle",back).textContent=t("stop"); start(); } };
  $("#pClose",back).onclick=()=>{ stopSpeak(); closeSheet(); };
  back.addEventListener("click",e=>{ if(e.target===back) stopSpeak(); });
  start();
}

/* ---------- マップ（GPS＋Googleマップ） ---------- */
function gmapsDir(lat,lng){ const o=State.geo?`&origin=${State.geo.lat},${State.geo.lng}`:""; return `https://www.google.com/maps/dir/?api=1${o}&destination=${lat},${lng}`; }
function gmapsView(lat,lng,label){ return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`; }
function distKm(a,b){ const R=6371,dLat=(b.lat-a.lat)*Math.PI/180,dLng=(b.lng-a.lng)*Math.PI/180,la=a.lat*Math.PI/180,lb=b.lat*Math.PI/180; const x=Math.sin(dLat/2)**2+Math.cos(la)*Math.cos(lb)*Math.sin(dLng/2)**2; return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x)); }
function viewMap(){
  const stops=DATA.guide.route.stops;
  // ルート全体の埋め込み（複数ピンは無料埋め込みでは中心＋検索のみ→代表点で表示）
  const center=stops[0];
  const embed=`https://maps.google.com/maps?q=${center.lat},${center.lng}&z=15&output=embed`;
  const wrap=el(`<div><div class="topbar"><h1>${t("tab_map")}</h1><p class="sub">${t("map_sub")}</p></div>
    <div class="pad">
      <div class="mapbox"><iframe src="${embed}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>
      <a class="btn secondary" href="${gmapsView(center.lat,center.lng)}" target="_blank" rel="noopener" style="margin:12px 0">${t("all_route")}</a>
      <button class="btn gold" id="geoBtn">${t("enable_loc")}</button>
      <div id="spotList" style="margin-top:10px"></div>
    </div></div>`);
  const render2=()=>{
    let list=stops.map((s,i)=>({s,i}));
    if(State.geo) list.sort((a,b)=>distKm(State.geo,a.s)-distKm(State.geo,b.s));
    const box=$("#spotList",wrap); box.innerHTML="";
    list.forEach(({s,i})=>{
      const dist=State.geo?`<span class="badge stay">${t("away")}${distKm(State.geo,s).toFixed(distKm(State.geo,s)<10?1:0)} ${t("km_away")}</span>`:"";
      const item=el(`<div class="list-item"><div class="ava">${s.emoji}</div>
        <div style="flex:1"><strong>${i+1}. ${esc(L(s.title))}</strong> ${dist}
          <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
            <a class="btn sm teal" href="${gmapsDir(s.lat,s.lng)}" target="_blank" rel="noopener">${t("go_here")}</a>
            <a class="btn sm secondary" href="${gmapsView(s.lat,s.lng)}" target="_blank" rel="noopener">${t("open_map")}</a>
          </div></div></div>`);
      box.appendChild(item);
    });
  };
  $("#geoBtn",wrap).onclick=()=>{ const b=$("#geoBtn",wrap); if(!navigator.geolocation){ toast(t("loc_fail")); return; } b.textContent=t("locating"); b.disabled=true;
    navigator.geolocation.getCurrentPosition(p=>{ State.geo={lat:p.coords.latitude,lng:p.coords.longitude}; b.textContent="📍 "+(State.lang==="ja"?"現在地ON（近い順）":State.lang==="es"?"Ubicación activa":"Located"); render2(); },
      ()=>{ toast(t("loc_fail")); b.textContent=t("enable_loc"); b.disabled=false; }, {enableHighAccuracy:true,timeout:8000}); };
  render2();
  return wrap;
}

/* ---------- なかま（グループチャット・位置共有） ---------- */
function allGroups(){ return [...DATA.community.groups, ...DB.get(K.groups,[])]; }
function groupMsgs(gid){
  const g=allGroups().find(x=>x.id===gid);
  const seed=(g&&g.seed||[]).map((m,i)=>({...m, id:"seed"+gid+i, ts:0, seed:true}));
  const mine=DB.get(K.chat,{})[gid]||[];
  return [...seed, ...mine];
}
function addMsg(gid,msg){ const all=DB.get(K.chat,{}); all[gid]=[...(all[gid]||[]), msg]; DB.set(K.chat,all); }

function viewCommunity(){
  if(State.chatGroup) return viewChat(State.chatGroup);
  const wrap=el(`<div><div class="topbar"><h1>${t("tab_community")}</h1><p class="sub">${t("community_sub")}</p></div>
    <div class="pad">
      <div class="row" style="gap:8px;margin-bottom:14px">
        <input id="ngName" placeholder="${t("new_group_ph")}" style="flex:1;padding:12px 14px;border:1.5px solid var(--line);border-radius:12px;font-size:15px" />
        <button class="btn sm" id="ngBtn" style="white-space:nowrap">${t("create_group")}</button>
      </div>
      <div class="section-title" style="margin-top:6px">${t("groups")}</div>
      <div id="glist"></div>
      <p class="hint" style="margin-top:16px">${t("demo_chat_note")}</p>
    </div></div>`);
  const list=$("#glist",wrap);
  allGroups().forEach(g=>{
    const msgs=groupMsgs(g.id); const last=msgs[msgs.length-1];
    const item=el(`<div class="list-item"><div class="ava">${g.emoji}</div>
      <div style="flex:1"><strong>${esc(L(g.name))}</strong>
        <div class="muted" style="font-size:12px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px">${last?esc((last.me?t("you")+": ":(last.from?esc(last.from)+": ":""))+(last.text||"")):""}</div></div>
      <button class="btn sm secondary" data-id="${g.id}">${t("open_chat")}</button></div>`);
    $("button",item).onclick=()=>{ State.chatGroup=g.id; render(); };
    list.appendChild(item);
  });
  $("#ngBtn",wrap).onclick=()=>{ const v=$("#ngName",wrap).value.trim(); if(!v) return; const ug=DB.get(K.groups,[]); const id="ug"+Date.now(); ug.push({id,emoji:"🌟",name:v,seed:[]}); DB.set(K.groups,ug); toast(t("group_created")); State.chatGroup=id; render(); };
  return wrap;
}

function viewChat(gid){
  const g=allGroups().find(x=>x.id===gid);
  const wrap=el(`<div class="chat-screen">
    <div class="topbar chat-top"><button class="chat-back" id="cBack">‹</button><div class="ava" style="width:34px;height:34px;font-size:18px">${g?g.emoji:"💬"}</div><div style="flex:1"><h1 style="font-size:18px;margin:0">${esc(L(g?g.name:""))}</h1></div></div>
    <div class="chat-body" id="cbody"></div>
    <div class="chat-bar">
      <button class="btn gold sm" id="here" style="width:auto;white-space:nowrap">${t("share_here")}</button>
      <input id="cmsg" placeholder="${t("msg_ph")}" />
      <button class="btn sm" id="csend" style="width:auto">${t("send")}</button>
    </div>
  </div>`);
  const body=$("#cbody",wrap);
  function paint(){
    body.innerHTML="";
    groupMsgs(gid).forEach(m=>{
      const me=!!m.me;
      const who = me ? userRec() : {name:m.from, emoji:m.emoji};
      const locHtml = m.loc ? `<a href="${gmapsView(m.loc.lat,m.loc.lng)}" target="_blank" rel="noopener" class="loc-chip">🗺️ ${t("loc_link")}</a>` : "";
      const bubble=el(`<div class="msg ${me?"me":""}">
        ${me?"":avatarHTML(who,34)}
        <div class="bubble">${me?"":`<div class="who">${esc(m.from||"")}</div>`}<div class="txt">${esc(m.text||"")}</div>${locHtml}</div>
        ${me?avatarHTML(who,34):""}
      </div>`);
      body.appendChild(bubble);
    });
    body.scrollTop=body.scrollHeight;
  }
  paint();
  $("#cBack",wrap).onclick=()=>{ State.chatGroup=null; render(); };
  const send=()=>{ const inp=$("#cmsg",wrap); const v=inp.value.trim(); if(!v) return; addMsg(gid,{id:"m"+Date.now(),me:true,text:v,ts:Date.now()}); inp.value=""; paint(); };
  $("#csend",wrap).onclick=send;
  $("#cmsg",wrap).addEventListener("keydown",e=>{ if(e.key==="Enter") send(); });
  $("#here",wrap).onclick=()=>{ if(!navigator.geolocation){ toast(t("loc_fail")); return; } const b=$("#here",wrap); b.textContent=t("locating");
    navigator.geolocation.getCurrentPosition(p=>{ const loc={lat:p.coords.latitude,lng:p.coords.longitude}; State.geo=loc; addMsg(gid,{id:"m"+Date.now(),me:true,text:t("here_now"),loc,ts:Date.now()}); toast(t("here_shared")); paint(); b.textContent=t("share_here"); },
      ()=>{ toast(t("loc_fail")); b.textContent=t("share_here"); }, {enableHighAccuracy:true,timeout:8000}); };
  setTimeout(()=>{ body.scrollTop=body.scrollHeight; },50);
  return wrap;
}

function openProfile(){
  const r=userRec(); let avatar=r.avatar||""; let prouds=[...(r.prouds||[])];
  const cOpts=(sel)=>`<option value="">${t("select_ph")}</option>`+DATA.countries.map(c=>`<option value="${c.c}" ${sel===c.c?"selected":""}>${c.f} ${esc(c[State.lang]||c.en)}</option>`).join("");
  const gOpts=`<option value="">${t("select_ph")}</option>`+["m","f","o","na"].map(g=>`<option value="${g}" ${r.gender===g?"selected":""}>${t("g_"+g)}</option>`).join("");
  const back=openSheet(`<h2>${t("edit_profile")}</h2>
    <div style="display:flex;justify-content:center;margin:6px 0 14px"><div id="pAva">${avatarHTML(r,84)}</div></div>
    <label class="btn secondary" for="avaInput">${t("add_photo")}</label>
    <input id="avaInput" type="file" accept="image/*" style="display:none" />
    <div class="field" style="margin-top:14px"><label>${t("amigo_name")}</label><input id="pNick" value="${esc(r.name||"")}" /></div>
    <div class="row" style="gap:12px">
      <div class="field" style="width:120px"><label>${t("age")} <span class="muted">${t("optional")}</span></label><input id="pAge" type="number" inputmode="numeric" value="${r.age!=null?esc(r.age):""}" /></div>
      <div class="field" style="flex:1"><label>${t("gender")} <span class="muted">${t("optional")}</span></label><select id="pGender">${gOpts}</select></div>
    </div>
    <div class="field"><label>${t("from_country")}</label><select id="pCountry">${cOpts(r.country)}</select></div>
    <div class="field"><label>${t("proud")}</label>
      <div class="chips" id="proudChips"></div>
      <div class="row" style="gap:8px;margin-top:8px"><select id="proudSel" style="flex:1">${cOpts("")}</select><button class="btn sm secondary" id="proudAdd" type="button" style="white-space:nowrap">${t("add_country")}</button></div>
      <p class="hint">${t("proud_hint")}</p></div>
    <div class="field"><label>${t("bio")}</label><input id="pBio" value="${esc(r.bio||"")}" placeholder="${t("bio_ph")}" /></div>
    <button class="btn" id="pSave">${t("save")}</button>`);
  const paintChips=()=>{ const box=$("#proudChips",back); box.innerHTML=prouds.length?prouds.map(c=>`<span class="chip" data-c="${c}">${countryFlag(c)} ${esc(countryName(c))} <b>✕</b></span>`).join(""):`<span class="muted" style="font-size:13px">—</span>`; box.querySelectorAll(".chip").forEach(ch=>ch.onclick=()=>{ prouds=prouds.filter(x=>x!==ch.dataset.c); paintChips(); }); };
  paintChips();
  $("#proudAdd",back).onclick=()=>{ const v=$("#proudSel",back).value; if(v&&!prouds.includes(v)){ prouds.push(v); paintChips(); } };
  $("#avaInput",back).onchange=async e=>{ const f=e.target.files[0]; if(!f) return; try{ avatar=await fileToResizedDataUrl(f,400,0.8); $("#pAva",back).innerHTML=avatarHTML({avatar},84); }catch{ toast(t("ck_fail")); } };
  $("#pSave",back).onclick=()=>{ saveProfile({nick:$("#pNick",back).value, avatar, bio:$("#pBio",back).value, age:$("#pAge",back).value?Number($("#pAge",back).value):null, gender:$("#pGender",back).value, country:$("#pCountry",back).value, prouds}); closeSheet(); toast(t("profile_saved")); render(); };
}

/* アミーゴカード（拡散用シェア画像） */
function loadImg(src){ return new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=src; }); }
function roundRect(x,a,b,w,h,r){ x.beginPath(); x.moveTo(a+r,b); x.arcTo(a+w,b,a+w,b+h,r); x.arcTo(a+w,b+h,a,b+h,r); x.arcTo(a,b+h,a,b,r); x.arcTo(a,b,a+w,b,r); x.closePath(); }
async function drawAmigoCard(){
  const r=userRec(); const stops=DATA.guide.route.stops; const stamps=DB.get(K.stamps,{})[State.user.email]||{}; const done=stops.filter(s=>stamps[s.id]).length;
  const W=1080,H=1350; const cv=document.createElement("canvas"); cv.width=W; cv.height=H; const x=cv.getContext("2d");
  const g=x.createLinearGradient(0,0,W,H); g.addColorStop(0,"#c0397a"); g.addColorStop(.5,"#c8543b"); g.addColorStop(1,"#e8a93c"); x.fillStyle=g; x.fillRect(0,0,W,H);
  const cols=["#c0397a","#e8a93c","#1d7a73","#c8543b"]; for(let i=0;i<Math.ceil(W/40);i++){ x.fillStyle=cols[i%4]; x.fillRect(i*40,0,40,20); x.fillRect(i*40,H-20,40,20); }
  x.fillStyle="rgba(251,244,232,0.96)"; roundRect(x,70,150,W-140,H-300,40); x.fill();
  x.textAlign="center";
  x.fillStyle="#c8543b"; x.font="800 46px sans-serif"; x.fillText("MI AMIGO", W/2, 250);
  x.fillStyle="#8a7d72"; x.font="600 26px sans-serif"; x.fillText("AMIGO CARD · ANTIGUA", W/2, 296);
  const cx=W/2, cy=450, rad=110;
  x.save(); x.beginPath(); x.arc(cx,cy,rad,0,Math.PI*2); x.closePath(); x.clip();
  if(r.avatar){ try{ const im=await loadImg(r.avatar); x.drawImage(im,cx-rad,cy-rad,rad*2,rad*2);}catch{} } else { x.fillStyle="#f3e4d2"; x.fillRect(cx-rad,cy-rad,rad*2,rad*2); x.fillStyle="#8a5a22"; x.font="800 110px sans-serif"; x.textBaseline="middle"; x.fillText(((r.name||"?").trim()[0]||"?").toUpperCase(),cx,cy); x.textBaseline="alphabetic"; }
  x.restore();
  x.lineWidth=8; x.strokeStyle="#fff"; x.beginPath(); x.arc(cx,cy,rad,0,Math.PI*2); x.stroke();
  x.fillStyle="#2a211c"; x.font="900 58px sans-serif"; x.fillText(r.name||"Amigo", W/2, 660);
  let yy=735; x.font="600 34px sans-serif"; x.fillStyle="#5b4f45";
  if(r.country){ x.fillText(`${t("card_from")}: ${countryFlag(r.country)} ${countryName(r.country)}`, W/2, yy); yy+=56; }
  if(r.prouds&&r.prouds.length){ x.fillText(`${t("card_loves")}: ${r.prouds.slice(0,8).map(countryFlag).join(" ")}`, W/2, yy); yy+=56; }
  if(r.bio){ let bio=r.bio; if(bio.length>26) bio=bio.slice(0,25)+"…"; x.font="400 28px sans-serif"; x.fillStyle="#8a7d72"; x.fillText(bio, W/2, yy); }
  x.fillStyle="#1d7a73"; roundRect(x,W/2-200,1070,400,92,46); x.fill();
  x.fillStyle="#fff"; x.font="800 38px sans-serif"; x.fillText(`🎯 ${t("card_stamps")} ${done}/${stops.length}`, W/2, 1128);
  x.fillStyle="rgba(255,255,255,0.95)"; x.font="600 28px sans-serif"; x.fillText("takuha.github.io/mi-amigo", W/2, H-58);
  return cv.toDataURL("image/png");
}
async function openAmigoCard(){
  const back=openSheet(`<h2>${t("amigo_card")}</h2><div class="cardprev" id="cardPrev"><div class="muted" style="padding:50px;text-align:center">…</div></div>
    <button class="btn gold" id="cardSave" style="margin-top:14px">${t("save_card")}</button>
    <button class="btn teal" id="cardShare" style="margin-top:8px">${t("share_card")}</button>`);
  let url; try{ url=await drawAmigoCard(); }catch{ toast(t("ck_fail")); return; }
  $("#cardPrev",back).innerHTML=`<img src="${url}" style="width:100%;border-radius:16px;display:block" />`;
  $("#cardSave",back).onclick=()=>{ const a=document.createElement("a"); a.href=url; a.download="mi_amigo_card.png"; a.click(); toast(t("card_made")); };
  $("#cardShare",back).onclick=async()=>{ try{ if(navigator.share){ const blob=await (await fetch(url)).blob(); const file=new File([blob],"mi_amigo_card.png",{type:"image/png"}); const p={text:`Mi Amigo — ${t("card_tagline")} 🌋 ${location.origin+location.pathname}`}; if(navigator.canShare&&navigator.canShare({files:[file]})) p.files=[file]; await navigator.share(p); } else { await navigator.clipboard?.writeText(location.origin+location.pathname); toast(t("copied")); } }catch{} };
}

/* ---------- アルバム＋5プラットフォーム共有 ---------- */
function viewAlbum(){
  const photos=DB.get(K.album,[]).filter(p=>p.userEmail===State.user.email);
  const wrap=el(`<div><div class="topbar"><h1>${t("tab_album")}</h1><p class="sub">${t("album_sub")}</p></div><div class="pad" id="ab"></div></div>`);
  const body=$("#ab",wrap);
  if(!photos.length){ const es=el(`<div class="empty-state"><div class="big">📸</div><p>${t("album_empty")}</p><button class="btn" id="gq" style="max-width:220px;margin:8px auto 0">${t("go_quest")}</button></div>`); $("#gq",es).onclick=()=>{State.view="quest";render();}; body.appendChild(es); return wrap; }
  const grid=el(`<div class="album-grid"></div>`); photos.forEach(p=>{ const img=el(`<img class="ph" src="${p.dataUrl}" alt="${esc(p.place)}" />`); img.onclick=()=>openPhoto(p); grid.appendChild(img); }); body.appendChild(grid);
  return wrap;
}

const PLATFORMS=[
  { key:"instagram", label:"Instagram", emoji:"📷", bg:"#E1306C" },
  { key:"facebook",  label:"Facebook",  emoji:"👍", bg:"#1877F2" },
  { key:"x",         label:"X",         emoji:"✖️", bg:"#000000" },
  { key:"tiktok",    label:"TikTok",    emoji:"🎵", bg:"#111111" },
  { key:"whatsapp",  label:"WhatsApp",  emoji:"💬", bg:"#25D366" },
];
async function shareToPlatform(plat, caption, photo){
  const url=location.origin+location.pathname;
  const txt=encodeURIComponent(caption+"\n"+url);
  const open=(u)=>window.open(u,"_blank","noopener");
  if(plat==="x") return open(`https://twitter.com/intent/tweet?text=${txt}`);
  if(plat==="facebook") return open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(caption)}`);
  if(plat==="whatsapp") return open(`https://wa.me/?text=${txt}`);
  // Instagram / TikTok は Web投稿APIが無い → 写真つきネイティブ共有を試し、無ければキャプションをコピーしてアプリを開く
  try{
    if(navigator.share){ const blob=await (await fetch(photo.dataUrl)).blob(); const file=new File([blob],"miamigo.jpg",{type:"image/jpeg"});
      if(navigator.canShare&&navigator.canShare({files:[file]})){ await navigator.share({text:caption,files:[file]}); return; } }
  }catch{}
  try{ await navigator.clipboard?.writeText(caption); }catch{}
  toast(t("copied"));
  open(plat==="instagram"?"https://www.instagram.com/":"https://www.tiktok.com/upload");
}
function openPhoto(p){
  const d=new Date(p.createdAt);
  const platBtns=PLATFORMS.map(pl=>`<button class="plat" data-k="${pl.key}" style="background:${pl.bg}"><span>${pl.emoji}</span><span>${pl.label}</span></button>`).join("");
  const back=openSheet(`<h2>📸 ${esc(p.place)}</h2>
    <img src="${p.dataUrl}" style="width:100%;border-radius:16px;margin-bottom:12px" />
    <div class="field"><label>${t("caption")}</label><input id="cap" value="${esc(p.caption)}" /></div>
    <p class="muted" style="font-size:12px;margin:-6px 2px 12px">${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${t("taken")}</p>
    <div class="section-title" style="margin-top:0">${t("share_to")}</div>
    <div class="plat-grid">${platBtns}</div>
    <button class="btn secondary" id="save" style="margin-top:14px">${t("save_photo")}</button>
    <button class="btn ghost" id="other" style="margin-top:8px">${t("other_share")}</button>
    <button class="btn ghost" id="del" style="margin-top:4px;color:var(--danger)">${t("delete_photo")}</button>`);
  back.querySelectorAll(".plat").forEach(b=>b.onclick=()=>shareToPlatform(b.dataset.k, $("#cap",back).value, p));
  $("#save",back).onclick=()=>{ const a=document.createElement("a"); a.href=p.dataUrl; a.download=`miamigo_${p.spotId||"photo"}.jpg`; a.click(); };
  $("#other",back).onclick=async()=>{ try{ if(navigator.share){ const blob=await (await fetch(p.dataUrl)).blob(); const file=new File([blob],"miamigo.jpg",{type:"image/jpeg"}); const pl={text:$("#cap",back).value}; if(navigator.canShare&&navigator.canShare({files:[file]})) pl.files=[file]; await navigator.share(pl); toast(t("shared")); } else { await navigator.clipboard?.writeText($("#cap",back).value); toast(t("copied")); } }catch{} };
  $("#del",back).onclick=()=>{ DB.set(K.album, DB.get(K.album,[]).filter(x=>x.id!==p.id)); closeSheet(); toast(t("deleted")); render(); };
}

/* ---------- マイページ（言語変更＋予約一覧） ---------- */
function viewMyPage(){
  const resv=DB.get(K.resv,[]).filter(r=>r.userEmail===State.user.email).sort((a,b)=>b.createdAt-a.createdAt);
  const wrap=el(`<div><div class="topbar"><h1>${t("tab_mypage")}</h1><p class="sub">${esc(userRec().name)}　📱 ${esc(userRec().phone||userRec().email)}</p></div>
    <div class="pad">
      <div class="card" style="margin-bottom:6px"><div class="card-body">
        <div class="row" style="align-items:center">
          ${avatarHTML(userRec(),60)}
          <div style="flex:1;margin-left:4px"><strong style="font-size:18px">${esc(userRec().name||"")}</strong>
            <div class="muted" style="font-size:13px;margin-top:3px">${profileMeta(userRec())||"<span style=\"opacity:.6\">—</span>"}</div></div>
          <button class="btn sm secondary" id="editProfile">${t("edit_profile")}</button>
        </div>
        ${userRec().bio?`<p class="muted" style="font-size:13px;margin:10px 0 0">${esc(userRec().bio)}</p>`:""}
        <button class="btn gold sm" id="makeCard" style="width:100%;margin-top:12px">${t("make_card")}</button>
      </div></div>
      <div class="section-title">${t("language")}</div><div id="myLang"></div>
      <div class="section-title">${t("reservations")}</div><div id="rl"></div>
      <button class="btn secondary" id="logout" style="margin-top:24px">${t("logout")}</button>
      <p class="hint" style="text-align:center;margin-top:18px">${t("proto_ver")}</p></div></div>`);
  $("#editProfile",wrap).onclick=openProfile;
  $("#makeCard",wrap).onclick=openAmigoCard;
  $("#myLang",wrap).appendChild(langSeg(()=>render()));
  const list=$("#rl",wrap);
  if(!resv.length){ list.appendChild(el(`<p class="muted" style="padding:8px 2px">${t("no_resv")}</p>`)); }
  else resv.forEach(r=>{ const [y,mo,d]=r.dateKey.split("-").map(Number); list.appendChild(el(`<div class="list-item"><div class="ava">${r.emoji}</div><div style="flex:1"><strong>${esc(r.title)}</strong><div class="muted" style="font-size:12px;margin-top:2px">${y}/${mo+1}/${d}・${r.qty}・${fmtUSD(r.total)}</div></div><span class="badge stay">${t("confirmed")}</span></div>`)); });
  $("#logout",wrap).onclick=()=>{ Auth.logout(); State.user=null; render(); };
  return wrap;
}

/* ---------- 起動 ---------- */
document.querySelectorAll("#tabbar .tab").forEach(tb=>{ tb.onclick=()=>{ stopSpeak(); State.chatGroup=null; State.view=tb.dataset.view; render(); }; });
State.user=Auth.current();
render();
