// CNX RUN BIKE API (Netlify Function) — ใช้ Supabase เป็นฐานข้อมูล
// ตั้งค่า SUPABASE_URL และ SUPABASE_SECRET_KEY ใน Netlify > Environment variables
const CLASSES = [["Proud ไม่เกิน 3.0 ปี", "PR", 201, 36], ["Proud 3.1–4.0 ปี", "PR", 301, 48], ["Proud 4.1–5.0 ปี", "PR", 401, 60], ["Proud 5.1–6.0 ปี", "PR", 501, 72], ["Proud Open ไม่เกิน 8.0 ปี", "PRO", 101, 96], ["Racing ไม่เกิน 3.0 ปี", "R", 201, 36], ["Racing 3.1–3.6 ปี", "R", 301, 42], ["Racing 3.7–4.0 ปี", "R", 401, 48], ["Racing 4.1–4.6 ปี", "R", 501, 54], ["Racing 4.7–5.0 ปี", "R", 601, 60], ["Racing 5.1–5.6 ปี", "R", 701, 66], ["Racing 5.7–6.0 ปี", "R", 801, 72], ["Racing 6.1–7.0 ปี", "R", 901, 84], ["Racing Open Mini ไม่เกิน 5.0 ปี", "RM", 101, 60], ["Racing Open Big ไม่เกิน 7.0 ปี", "RB", 101, 84], ["Racing Open Extra ไม่เกิน 10.0 ปี", "RX", 101, 120], ["Super Mini Girl ไม่เกิน 5.0 ปี", "RG", 101, 60], ["Super Big Girl ไม่เกิน 7.0 ปี", "RG", 201, 84], ["Pedal ไม่เกิน 4.0 ปี", "P", 301, 48], ["Pedal 4.1–5.0 ปี", "P", 401, 60], ["Pedal 5.1–6.0 ปี", "P", 501, 72], ["Pedal Open ไม่เกิน 8.0 ปี", "PO", 801, 96]]; // [ชื่อรุ่น, prefix, เลขเริ่ม, อายุสูงสุด(เดือน)]
const CLOSE_AT = '2026-12-31T23:59:00'; // ปล่อยว่างเพื่อเปิดรับตลอด รูปแบบ 2026-12-31T23:59:00 (เวลาไทย)
const RACE_Y = 2026, RACE_M = 12; // ปี/เดือนที่ใช้คำนวณอายุ
const FIRST = 850, EXTRA = 350, MAX_FILE = 4 * 1024 * 1024;

const SB = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SECRET_KEY || '';
class UserError extends Error {}
const bad = m => { throw new UserError(m); };
const hdr = () => { const h = { apikey: KEY }; if (KEY.startsWith('eyJ')) h.Authorization = 'Bearer ' + KEY; return h; };

async function rest(path, { method = 'GET', body, prefer } = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    method,
    headers: { ...hdr(), 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
  if (!r.ok) { const e = new Error((j && j.message) || 'db error'); e.code = j && j.code; throw e; }
  return j;
}

const catOf = n => n.startsWith('Proud') ? 'Proud' : n.startsWith('Pedal') ? 'Pedal' : 'Racing';
const normGender = v => { v = String(v || '').trim(); return v === 'ชาย' || /^male$/i.test(v) ? 'ชาย' : v === 'หญิง' || /^female$/i.test(v) ? 'หญิง' : ''; };

function ageOf(dob) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dob || '').trim());
  if (!m) bad('วันเกิดไม่ถูกต้อง กรุณาเลือกวันเกิดใหม่');
  const [y, mo, d] = [+m[1], +m[2], +m[3]], c = new Date(Date.UTC(y, mo - 1, d));
  if (mo < 1 || mo > 12 || c.getUTCFullYear() !== y || c.getUTCMonth() !== mo - 1 || c.getUTCDate() !== d) bad('วันเกิดไม่ถูกต้อง กรุณาเลือกวันเกิดใหม่');
  const total = (RACE_Y - y) * 12 + (RACE_M - mo);
  if (total < 0) bad('วันเกิดอยู่หลังเดือนแข่งขัน กรุณาตรวจสอบวันเกิด');
  return { total, years: Math.floor(total / 12), months: total % 12 };
}
const okClass = (c, months, gender) => !( /^Super (Mini|Big) Girl/.test(c[0]) && gender !== 'หญิง') && months <= c[3];

function closeMs() { return CLOSE_AT ? Date.parse(CLOSE_AT + '+07:00') : null; }

const API = {
  async getClasses() {
    const r = { Proud: [], Racing: [], Pedal: [] };
    CLASSES.forEach(c => r[catOf(c[0])].push(c[0]));
    return r;
  },

  async getRegistrationStatus() {
    const ms = closeMs();
    if (!ms) return { open: true, message: 'เปิดรับสมัครอยู่', closeAt: '', closeAtMs: null };
    if (isNaN(ms)) throw new Error('bad CLOSE_AT');
    if (Date.now() >= ms) return { open: false, message: 'ปิดรับสมัครแล้ว', closeAt: CLOSE_AT, closeAtMs: ms };
    const t = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms)).replace(',', '');
    return { open: true, message: 'เปิดรับสมัครถึง ' + t + ' น.', closeAt: CLOSE_AT, closeAtMs: ms };
  },

  async getEligibleClasses([dobValue, genderValue]) {
    const gender = normGender(genderValue);
    if (!dobValue) bad('กรุณากรอกวันเกิดนักแข่ง');
    if (!gender) bad('กรุณาเลือกเพศนักแข่ง');
    const a = ageOf(dobValue);
    const eligible = CLASSES.filter(c => okClass(c, a.total, gender)).map(c => c[0]);
    const by = { Proud: 0, Racing: 0, Pedal: 0 };
    eligible.forEach(n => by[catOf(n)]++);
    return { ageYears: a.years, ageMonths: a.months, ageText: a.years + '.' + a.months, ageDescription: a.years + ' ปี ' + a.months + ' เดือน', totalMonths: a.total, raceMonthLabel: RACE_M + '/' + RACE_Y, eligibleClasses: eligible, eligibleByCategory: by };
  },

  async submitRegistration([data], event) {
    data = data || {};
    if (data.acceptedRules !== true) bad('กรุณาอ่านและกดยอมรับกติกาการแข่งขันก่อนสมัคร');
    const s = (v, n) => String(v || '').trim().slice(0, n);
    const name = s(data.name, 120), nth = s(data.nicknameTh, 60), nen = s(data.nicknameEn, 60), team = s(data.team, 80);
    const dob = s(data.dob, 10), gender = normGender(data.gender), parent = s(data.parentName || data.guardian, 120), phone = s(data.phone, 30);
    if (!name || !nth || !nen || !dob || !parent || !phone || !gender) bad('กรุณากรอกข้อมูลให้ครบทุกช่อง รวมถึงชื่อเล่นภาษาไทยและภาษาอังกฤษ');
    const chosen = [...new Set((Array.isArray(data.classes) ? data.classes : []).filter(v => typeof v === 'string').map(v => v.trim()).filter(Boolean))];
    if (!chosen.length) bad('กรุณาเลือกอย่างน้อย 1 รุ่น');
    const known = new Map(CLASSES.map(c => [c[0], c]));
    const unknown = chosen.filter(n => !known.has(n));
    if (unknown.length) bad('พบชื่อรุ่นที่ไม่ตรงกับระบบ กรุณาโหลดหน้าเว็บใหม่: ' + unknown.join(', '));
    const age = ageOf(dob);
    const wrong = chosen.filter(n => !okClass(known.get(n), age.total, gender));
    if (wrong.length) bad('รุ่นต่อไปนี้ไม่ตรงกับอายุหรือเพศของนักแข่ง (อายุ ' + age.years + '.' + age.months + ' ปี ณ เดือนแข่งขัน): ' + wrong.join(', ') + ' กรุณาเลือกเฉพาะรุ่นที่ระบบแสดง');
    const st = await API.getRegistrationStatus();
    if (!st.open) bad('ปิดรับสมัครแล้ว ไม่สามารถส่งใบสมัครได้');

    const same = await rest(`racers?select=*&birth_date=eq.${dob}`);
    let racer = same.find(r => r.name.trim().toLowerCase() === name.toLowerCase()) || null;
    let have = [];
    if (racer) {
      have = (await rest(`entries?select=class_name&racer_id=eq.${racer.id}`)).map(r => r.class_name);
      const dup = chosen.filter(n => have.includes(n));
      if (dup.length) bad('นักแข่งสมัครรุ่นนี้แล้ว: ' + dup.join(', '));
      if (team && !racer.team) await rest(`racers?id=eq.${racer.id}`, { method: 'PATCH', body: { team } });
    }
    const seen = new Set(have.map(catOf)), fees = []; let total = 0;
    chosen.forEach(n => { const c = catOf(n), fee = seen.has(c) ? EXTRA : FIRST; seen.add(c); fees.push({ class_name: n, fee }); total += fee; });

    let created = false;
    if (!racer) {
      const [, prefix, start] = known.get(chosen[0]);
      for (let tries = 0; tries < 4 && !racer; tries++) {
        const code = await nextCode(prefix, start);
        try {
          racer = (await rest('racers', { method: 'POST', prefer: 'return=representation', body: { racer_code: code, name, birth_date: dob, gender, parent_name: parent, phone, nickname_th: nth, nickname_en: nen, team: team || null } }))[0];
          created = true;
        } catch (e) {
          if (e.code !== '23505') throw e;
          if (!/racer_code/.test(e.message)) bad('มีการสมัครซ้ำ กรุณารอสักครู่แล้วลองใหม่');
        }
      }
      if (!racer) throw new Error('cannot allocate racer code');
    }
    try {
      await rest('entries', { method: 'POST', body: fees.map(f => ({ racer_id: racer.id, ...f })) });
      const pay = (await rest('payments', { method: 'POST', prefer: 'return=representation', body: { racer_id: racer.id, classes: chosen.join(', '), amount: total } }))[0];
      const origin = process.env.URL || ('https://' + (event.headers.host || ''));
      return { success: true, message: 'สมัครสำเร็จ', racerId: racer.racer_code, classes: chosen, newClasses: chosen, totalFee: total, amount: total, paymentUrl: origin.replace(/\/+$/, '') + '/payment.html?token=' + pay.token };
    } catch (e) {
      if (created) await rest(`racers?id=eq.${racer.id}`, { method: 'DELETE' }).catch(() => {});
      if (e.code === '23505') bad('นักแข่งสมัครรุ่นนี้แล้ว');
      throw e;
    }
  },

  async getPaymentRequest([token]) {
    token = String(token || '').trim();
    if (!/^[a-f0-9]{64}$/i.test(token)) bad('ลิงก์แจ้งชำระเงินไม่ถูกต้อง');
    const r = (await rest(`payments?select=classes,amount,status,racers(racer_code,name)&token=eq.${token}`))[0];
    if (!r) bad('ไม่พบคำขอชำระเงินนี้');
    const rc = Array.isArray(r.racers) ? r.racers[0] : r.racers;
    return { racerId: rc.racer_code, name: rc.name, classes: r.classes, amount: r.amount, status: r.status, slipUrl: '' };
  },

  async submitPaymentSlip([token, fileName, mimeType, b64]) {
    token = String(token || '').trim(); mimeType = String(mimeType || '').toLowerCase();
    if (!/^[a-f0-9]{64}$/i.test(token)) bad('ลิงก์แจ้งชำระเงินไม่ถูกต้อง');
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[mimeType];
    if (!ext) bad('รองรับเฉพาะ JPG, PNG, WEBP หรือ PDF');
    if (!b64 || typeof b64 !== 'string') bad('ไม่พบข้อมูลไฟล์ กรุณาเลือกไฟล์ใหม่');
    const bytes = Buffer.from(b64, 'base64');
    if (bytes.length > MAX_FILE) bad('ไฟล์ต้องมีขนาดไม่เกิน 4 MB');
    const sig = { jpg: [0xff, 0xd8], png: [0x89, 0x50], pdf: [0x25, 0x50], webp: [0x52, 0x49] }[ext];
    if (bytes[0] !== sig[0] || bytes[1] !== sig[1]) bad('ไฟล์ไม่ตรงกับชนิดที่เลือก กรุณาเลือกไฟล์ใหม่');
    const p = (await rest(`payments?select=status,racers(racer_code)&token=eq.${token}`))[0];
    if (!p) bad('ไม่พบคำขอชำระเงินนี้');
    if (p.status === 'ชำระแล้ว') bad('คำขอนี้ได้รับการยืนยันชำระเงินแล้ว');
    const rc = Array.isArray(p.racers) ? p.racers[0] : p.racers;
    const path = `${rc.racer_code}/${Date.now()}.${ext}`;
    const up = await fetch(`${SB}/storage/v1/object/slips/${path}`, { method: 'POST', headers: { ...hdr(), 'Content-Type': mimeType }, body: bytes });
    if (!up.ok) throw new Error('upload failed ' + up.status + ' ' + await up.text());
    await rest(`payments?token=eq.${token}`, { method: 'PATCH', body: { status: 'รอตรวจสอบ', slip_path: path, slip_sent_at: new Date().toISOString() } });
    return { success: true, message: 'ส่งหลักฐานเรียบร้อยแล้ว กรุณารอเจ้าหน้าที่ตรวจสอบ' };
  }
};

async function nextCode(prefix, start) {
  for (let b = start; b < start + 5000; b += 50) {
    const c = Array.from({ length: 50 }, (_, i) => prefix + (b + i));
    const used = new Set((await rest(`racers?select=racer_code&racer_code=in.(${c.join(',')})`)).map(r => r.racer_code));
    const f = c.find(x => !used.has(x)); if (f) return f;
  }
  throw new Error('no free racer code');
}

exports.handler = async event => {
  const send = (code, o) => ({ statusCode: code, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(o) });
  if (event.httpMethod !== 'POST') return send(405, { error: 'Method not allowed' });
  if (!SB || !KEY) return send(500, { error: 'ระบบยังไม่ได้ตั้งค่าฐานข้อมูล' });
  try {
    const { fn, args = [] } = JSON.parse(event.body || '{}');
    if (!Object.prototype.hasOwnProperty.call(API, fn)) return send(404, { error: 'ไม่พบคำสั่ง' });
    return send(200, { result: await API[fn](args, event) });
  } catch (e) {
    if (e instanceof UserError) return send(400, { error: e.message });
    console.error(e);
    return send(500, { error: 'ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง' });
  }
};
