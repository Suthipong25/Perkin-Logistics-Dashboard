const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const SERVICES = [
  { key: "SEA Import", name: "Sea Import", code: "SEA-IMP", color: "#0E7C66" },
  { key: "AIR Import", name: "Air Import", code: "AIR-IMP", color: "#1E4E8C" },
  { key: "SEA Export", name: "Sea Export", code: "SEA-EXP", color: "#B45309" },
  { key: "Air Export", name: "Air Export", code: "AIR-EXP", color: "#6D5BD0" },
];

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

const state = {
  page: "overview",
  jobs: [],
  transport: [],
  quality: null,
  q: "",
  service: "all",
  status: "all",
  overdue: false,
  pageNum: 1,
  pageSize: 25,
  transQ: "",
  transBucket: "all",
  transPage: 1,
  advQ: "",
  advState: "all",
  selected: null,
  editing: false,
  uploadBusy: false,
};

const PAGE_META = {
  overview: { title: "ภาพรวมงาน", sub: "ศูนย์ควบคุมสถานะงาน · 28 ต.ค. 2026" },
  jobs: { title: "งานทั้งหมด", sub: "ค้นหาและติดตามงานทุกบริการ" },
  upload: { title: "อัปโหลดข้อมูล FWD", sub: "อัปเดต Excel และเว็บจากไฟล์เดียว" },
  health: { title: "คุณภาพข้อมูล", sub: "ตรวจความครบถ้วนก่อนเชื่อถือตัวเลข" },
  transport: { title: "ขนส่ง", sub: "เที่ยวรถและตู้คอนเทนเนอร์" },
  advances: { title: "เบิกเงิน / Clearing", sub: "รายการเบิกเงินสำรองจ่าย" },
  settings: { title: "ตั้งค่า", sub: "ผู้ใช้ สิทธิ์ และการเชื่อมต่อ" },
};

/* ---------------- data helpers ---------------- */

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtNum(n) {
  return new Intl.NumberFormat("en-US").format(Number(n || 0));
}

function isValidIso(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return false;
  const y = Number(iso.slice(0, 4));
  return y >= 2000 && y <= 2100;
}

function fmtDate(iso) {
  if (!isValidIso(iso)) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function daysOpen(job) {
  if (!isValidIso(job.etd)) return null;
  const etd = new Date(`${job.etd.slice(0, 10)}T00:00:00+07:00`);
  const today = new Date("2026-10-28T00:00:00+07:00");
  return Math.floor((today - etd) / 86400000);
}

function fmtMonth(iso) {
  if (!iso) return "—";
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
}

function pct(a, b) {
  return b ? Math.round((a / b) * 1000) / 10 : 0;
}

function serviceMeta(job) {
  return SERVICES.find((s) => s.key === job.service) || { key: job.service, name: job.service, code: "—", color: "#5C6B77" };
}

function statusMeta(job) {
  if (job.status === "Completed") return { cls: "complete", label: "เสร็จสิ้น", key: "Completed" };
  if (job.status === "Cancelled") return { cls: "cancel", label: "ยกเลิก", key: "Cancelled" };
  if (job.statusDetail === "Waiting") return { cls: "waiting", label: "รอเอกสาร", key: "Waiting" };
  if (job.status === "Booking") return { cls: "booking", label: "จองแล้ว", key: "Booking" };
  return { cls: "control", label: "กำลังดำเนินการ", key: "Control" };
}

function isOpen(job) {
  return job.status === "In Progress" || job.status === "Booking";
}

function computeNext(job) {
  if (!isOpen(job)) return null;
  if (!job.draftCustoms) return "รอ Draft ใบขน";
  if (!job.customsFiled) return "รอยิงใบขนจริง";
  if (!job.doReleased) return "รอแลก DO";
  if (!job.cleared) return "รอ Clear & Pickup";
  if (!job.advanceDoc) return "รอเอกสารเบิกเงิน";
  return "ติดตามปิดงาน";
}

function getStats() {
  const jobs = state.jobs;
  const byStatus = { Completed: 0, "In Progress": 0, Cancelled: 0, Booking: 0 };
  const byDetail = { Control: 0, Waiting: 0, Completed: 0, Cancelled: 0 };
  let overdue = 0;
  const customers = new Set();

  for (const job of jobs) {
    byStatus[job.status] = (byStatus[job.status] || 0) + 1;
    if (job.statusDetail) byDetail[job.statusDetail] = (byDetail[job.statusDetail] || 0) + 1;
    if (job.customer) customers.add(job.customer);
    const age = daysOpen(job);
    if (isOpen(job) && age !== null && age > 0) overdue += 1;
  }

  const services = SERVICES.map((s) => {
    const list = jobs.filter((j) => j.service === s.key);
    return {
      ...s,
      total: list.length,
      completed: list.filter((j) => j.status === "Completed").length,
      control: list.filter((j) => j.statusDetail === "Control").length,
      waiting: list.filter((j) => j.statusDetail === "Waiting").length,
      cancelled: list.filter((j) => j.status === "Cancelled").length,
    };
  });

  const monthMap = new Map();
  for (const job of jobs) {
    if (!job.month) continue;
    if (!monthMap.has(job.month)) monthMap.set(job.month, { month: job.month, total: 0, completed: 0 });
    const m = monthMap.get(job.month);
    m.total += 1;
    if (job.status === "Completed") m.completed += 1;
  }
  const months = [...monthMap.values()]
    .filter((m) => m.month >= "2026-01" && m.month <= "2026-10")
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-7);

  const custMap = new Map();
  for (const job of jobs) {
    if (!job.customer) continue;
    if (/SAVE LOGISTICS/i.test(job.customer)) continue;
    custMap.set(job.customer, (custMap.get(job.customer) || 0) + 1);
  }
  const topCustomers = [...custMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const exceptions = jobs
    .map((j) => ({ ...j, _age: daysOpen(j) }))
    .filter((j) => isOpen(j) && j._age !== null && j._age > 0)
    .sort((a, b) => b._age - a._age)
    .slice(0, 8);

  const total = jobs.length;
  const completed = byStatus.Completed || 0;
  const open = (byStatus["In Progress"] || 0) + (byStatus.Booking || 0);
  const draft = jobs.filter((j) => j.draftCustoms).length;
  const customs = jobs.filter((j) => j.customsFiled).length;
  const dor = jobs.filter((j) => j.doReleased).length;
  const cleared = jobs.filter((j) => j.cleared).length;
  const advance = jobs.filter((j) => j.advanceDoc).length;
  const missingEtd = jobs.filter((j) => !j.etd).length;
  const duplicates = state.quality?.duplicateJobNumbers ? Object.keys(state.quality.duplicateJobNumbers).length : 8;

  return {
    total, completed, open, overdue, customers: customers.size, byStatus, byDetail,
    services, months, topCustomers, exceptions,
    fill: {
      draft: pct(draft, total), customs: pct(customs, total), dor: pct(dor, total),
      cleared: pct(cleared, total), advance: pct(advance, total),
    },
    missingEtd, duplicates,
  };
}

/* ---------------- charts ---------------- */

function trendSVG(months) {
  const W = 720, H = 232;
  const pad = { l: 36, r: 22, t: 14, b: 30 };
  const maxRaw = Math.max(1, ...months.map((m) => m.total));
  const step = maxRaw > 100 ? 100 : maxRaw > 50 ? 50 : 20;
  const max = Math.ceil(maxRaw / step) * step;
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const x = (i) => pad.l + (months.length <= 1 ? iw / 2 : (iw * i) / (months.length - 1));
  const y = (v) => pad.t + ih * (1 - v / max);

  const ticks = 4;
  let grid = "";
  for (let i = 0; i <= ticks; i++) {
    const value = (max / ticks) * i;
    const yy = y(value);
    grid += `<line x1="${pad.l}" y1="${yy}" x2="${W - pad.r}" y2="${yy}" stroke="#DCE2DC" stroke-width="1" stroke-dasharray="${i === 0 ? "0" : "2 4"}"/>`;
    grid += `<text x="${pad.l - 8}" y="${yy + 3}" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="8.5" fill="#7B8893">${Math.round(value)}</text>`;
  }

  const totalPts = months.map((m, i) => [x(i), y(m.total)]);
  const donePts = months.map((m, i) => [x(i), y(m.completed)]);
  const path = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

  let labels = "";
  months.forEach((m, i) => {
    labels += `<text x="${x(i)}" y="${H - 9}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="8.5" fill="#7B8893">${fmtMonth(m.month)}</text>`;
  });

  let dots = "";
  months.forEach((m, i) => {
    dots += `<circle cx="${x(i)}" cy="${y(m.total)}" r="2.6" fill="#0B1F33"><title>${fmtMonth(m.month)} · งานเข้า ${m.total}</title></circle>`;
    dots += `<circle cx="${x(i)}" cy="${y(m.completed)}" r="2.6" fill="#0E7C66"><title>${fmtMonth(m.month)} · ปิดได้ ${m.completed}</title></circle>`;
  });

  const area = `M${totalPts[0][0]},${pad.t + ih} ${path(totalPts).replace("M", "L")} L${totalPts[totalPts.length - 1][0]},${pad.t + ih} Z`;

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="แนวโน้มงานเข้าและงานที่ปิดได้รายเดือน">
    ${grid}
    <path d="${area}" fill="#0B1F33" opacity="0.035"/>
    <path d="${path(totalPts)}" fill="none" stroke="#0B1F33" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${path(donePts)}" fill="none" stroke="#0E7C66" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}
    ${labels}
  </svg>`;
}

function kpiBar(segments) {
  return `<div class="kpi-bar">${segments.map((s) => `<i class="${s.cls || ""}" style="width:${s.w}%;${s.bg ? `background:${s.bg}` : ""}"></i>`).join("")}</div>`;
}

/* ---------------- overview ---------------- */

function renderOverview() {
  const s = getStats();
  const totalSegments = s.services.map((sv) => ({ w: pct(sv.total, s.total), bg: sv.color }));
  const exceptions = s.exceptions;
  const maxCust = Math.max(1, ...s.topCustomers.map((c) => c.count));

  return `
    <div class="statusline">
      <div class="group">
        <span class="dot"></span>
        <span>FWD · รอบ 28 ต.ค. 10:32</span>
        <span class="sep">/</span>
        <span>${fmtNum(s.total)} งาน</span>
        <span class="sep">/</span>
        <span>Excel ตรงกัน</span>
      </div>
      <div class="group">JOB_Daily_2026 STATUS_Dashboard.xlsx</div>
    </div>

    <div class="kpis">
      <div class="kpi">
        <div class="kpi-label">งานทั้งหมด</div>
        <div class="kpi-value">${fmtNum(s.total)}</div>
        <div class="kpi-sub">${SERVICES.length} บริการ · ${fmtNum(s.customers)} ลูกค้า</div>
        ${kpiBar(totalSegments)}
      </div>
      <div class="kpi">
        <div class="kpi-label">อัตราปิดงาน</div>
        <div class="kpi-value">${pct(s.completed, s.total).toFixed(1)}<small>%</small></div>
        <div class="kpi-sub"><b>${fmtNum(s.completed)}</b> จาก ${fmtNum(s.total)} งาน</div>
        ${kpiBar([{ w: pct(s.completed, s.total) }])}
      </div>
      <div class="kpi">
        <div class="kpi-label">กำลังดำเนินการ</div>
        <div class="kpi-value">${fmtNum(s.open)}</div>
        <div class="kpi-sub">Control ${s.byDetail.Control || 0} · Waiting ${s.byDetail.Waiting || 0}</div>
        ${kpiBar([{ w: pct(s.open, s.total), cls: "amber" }])}
      </div>
      <div class="kpi">
        <div class="kpi-label">เกินกำหนด</div>
        <div class="kpi-value" style="color:var(--red)">${fmtNum(s.overdue)}</div>
        <div class="kpi-sub">ETD ผ่านแล้ว · ${pct(s.overdue, s.open)}% ของงานเปิด</div>
        ${kpiBar([{ w: pct(s.overdue, s.open), cls: "red" }])}
      </div>
    </div>

    <div class="grid">
      <section class="panel col-5" aria-labelledby="svcTitle">
        <div class="panel-head">
          <h2 class="panel-title" id="svcTitle">งานตามบริการ</h2>
          <span class="panel-meta">${fmtNum(s.total)} งาน</span>
        </div>
        <div class="panel-body">
          <div class="svc-list">
            ${s.services.map((sv) => `
              <div class="svc-row">
                <div class="svc-name">${sv.name}<small>${sv.code}</small></div>
                <div class="svc-bar" title="${sv.name}: ${sv.total} งาน">
                  <i style="width:${pct(sv.completed, sv.total)}%;background:#0E7C66"></i>
                  <i style="width:${pct(sv.control, sv.total)}%;background:#B45309"></i>
                  <i style="width:${pct(sv.waiting, sv.total)}%;background:#1E4E8C"></i>
                  <i style="width:${pct(sv.cancelled, sv.total)}%;background:#94A3B8"></i>
                </div>
                <div class="svc-total">${fmtNum(sv.total)}</div>
              </div>`).join("")}
          </div>
          <div class="legend">
            <span><i style="background:#0E7C66"></i>เสร็จสิ้น</span>
            <span><i style="background:#B45309"></i>กำลังทำ</span>
            <span><i style="background:#1E4E8C"></i>รอเอกสาร</span>
            <span><i style="background:#94A3B8"></i>ยกเลิก</span>
          </div>
        </div>
      </section>

      <section class="panel col-7" aria-labelledby="trendTitle">
        <div class="panel-head">
          <h2 class="panel-title" id="trendTitle">งานตามเดือน ETD</h2>
          <span class="panel-meta">8 เดือนล่าสุด</span>
        </div>
        <div class="trend-wrap">${trendSVG(s.months)}</div>
        <div class="trend-foot">
          <span><i style="background:#0B1F33"></i>งานเข้า</span>
          <span><i style="background:#0E7C66"></i>ปิดได้</span>
          <span style="margin-left:auto">ที่มา: ETD + สถานะปัจจุบัน</span>
        </div>
      </section>

      <section class="panel col-8" aria-labelledby="excTitle">
        <div class="panel-head">
          <h2 class="panel-title" id="excTitle">งานที่ต้องติดตาม</h2>
          <span class="panel-meta">${fmtNum(s.overdue)} งานเกินกำหนด</span>
          <button class="btn btn-ghost btn-sm" data-act="all-overdue" style="margin-left:auto">ดูทั้งหมด
            <svg width="14" height="14"><use href="#i-right"/></svg>
          </button>
        </div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr>
              <th>Job No</th><th>บริการ</th><th>ลูกค้า</th><th>ETD</th><th class="right">เกิน</th><th>ขั้นถัดไป</th>
            </tr></thead>
            <tbody>
              ${exceptions.map((j) => {
                const sm = serviceMeta(j);
                return `<tr data-job="${esc(j.jobNo)}" tabindex="0">
                  <td class="jobno">${esc(j.jobNo)}</td>
                  <td><span class="chip">${sm.code}</span></td>
                  <td class="wrap muted">${esc(j.customer || "—")}</td>
                  <td class="num">${fmtDate(j.etd)}</td>
                  <td class="right num days-red">${j._age} วัน</td>
                  <td class="muted">${esc(j.nextAction || "ติดตามปิดงาน")}</td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
      </section>

      <div class="col-4" style="display:flex;flex-direction:column;gap:16px">
        <section class="panel" aria-labelledby="statusTitle">
          <div class="panel-head"><h2 class="panel-title" id="statusTitle">สถานะงาน</h2><span class="panel-meta">รวม ${fmtNum(s.total)}</span></div>
          <div class="panel-body" style="padding-top:8px;padding-bottom:8px">
            <div class="ledger">
              ${[
                { label: "เสร็จสิ้น", count: s.byStatus.Completed || 0, color: "#0E7C66" },
                { label: "กำลังดำเนินการ", count: s.byDetail.Control || 0, color: "#B45309" },
                { label: "รอเอกสาร", count: s.byDetail.Waiting || 0, color: "#1E4E8C" },
                { label: "ยกเลิก", count: s.byStatus.Cancelled || 0, color: "#94A3B8" },
              ].map((row) => `
                <div class="ledger-row">
                  <span class="ledger-dot" style="background:${row.color}"></span>
                  <span class="ledger-name">${row.label}</span>
                  <span class="ledger-count">${fmtNum(row.count)}</span>
                  <span class="ledger-pct">${pct(row.count, s.total)}%</span>
                  <span class="ledger-bar"><i style="width:${pct(row.count, s.total)}%;background:${row.color}"></i></span>
                </div>`).join("")}
            </div>
          </div>
        </section>

        <section class="panel" aria-labelledby="custTitle">
          <div class="panel-head"><h2 class="panel-title" id="custTitle">ลูกค้าสูงสุด</h2><span class="panel-meta">ไม่รวมในเครือ</span></div>
          <div class="panel-body" style="padding-top:6px;padding-bottom:8px">
            <div class="cust-list">
              ${s.topCustomers.map((c, i) => `
                <div class="cust-row">
                  <span class="cust-rank">${String(i + 1).padStart(2, "0")}</span>
                  <span class="cust-name" title="${esc(c.name)}">${esc(c.name)}</span>
                  <span class="cust-count">${c.count}</span>
                  <span class="cust-bar"><i style="width:${pct(c.count, maxCust)}%"></i></span>
                </div>`).join("")}
            </div>
          </div>
        </section>

        <section class="panel" aria-labelledby="healthTitle">
          <div class="panel-head"><h2 class="panel-title" id="healthTitle">คุณภาพข้อมูล</h2><span class="panel-meta">ก่อนเชื่อตัวเลข</span></div>
          <div class="panel-body" style="padding-top:6px;padding-bottom:10px">
            <div class="health">
              <div class="health-row"><span class="dot" style="background:#0E7C66"></span>Excel sync<span class="val ok">10:32</span></div>
              <div class="health-row"><span class="dot" style="background:#B45309"></span>ไม่มี ETD<span class="val warn">${fmtNum(s.missingEtd)}</span></div>
              <div class="health-row"><span class="dot" style="background:#B45309"></span>เลขงานซ้ำ<span class="val warn">${fmtNum(s.duplicates)}</span></div>
              <div class="health-row"><span class="dot" style="background:#B45309"></span>Draft ครบ<span class="val warn">${s.fill.draft}%</span></div>
            </div>
            <button class="btn btn-ghost btn-sm" data-page="health" style="margin-top:8px;padding-left:0">ดูรายละเอียด
              <svg width="14" height="14"><use href="#i-right"/></svg>
            </button>
          </div>
        </section>
      </div>
    </div>`;
}

/* ---------------- jobs ---------------- */

function filteredJobs() {
  let list = [...state.jobs];
  if (state.service !== "all") list = list.filter((j) => j.service === state.service);
  if (state.status !== "all") {
    if (state.status === "Control" || state.status === "Waiting") list = list.filter((j) => j.statusDetail === state.status);
    else list = list.filter((j) => j.status === state.status);
  }
  if (state.overdue) list = list.filter((j) => {
    const a = daysOpen(j);
    return isOpen(j) && a !== null && a > 0;
  });
  if (state.q) {
    const q = state.q.toLowerCase();
    list = list.filter((j) =>
      [j.jobNo, j.customer, j.bl, j.consignee].some((v) => String(v || "").toLowerCase().includes(q))
    );
  }
  const priority = { "In Progress": 0, Booking: 1, Completed: 2, Cancelled: 3 };
  list.sort((a, b) => {
    const p = (priority[a.status] ?? 9) - (priority[b.status] ?? 9);
    if (p) return p;
    return String(b.etd || "").localeCompare(String(a.etd || ""));
  });
  return list;
}

function renderJobs() {
  const list = filteredJobs();
  const totalPages = Math.max(1, Math.ceil(list.length / state.pageSize));
  if (state.pageNum > totalPages) state.pageNum = totalPages;
  const start = (state.pageNum - 1) * state.pageSize;
  const rows = list.slice(start, start + state.pageSize);

  const pageBtns = [];
  const from = Math.max(1, state.pageNum - 2);
  const to = Math.min(totalPages, from + 4);
  for (let p = from; p <= to; p++) pageBtns.push(`<button data-page-num="${p}" class="${p === state.pageNum ? "on" : ""}" aria-label="หน้า ${p}">${p}</button>`);

  return `
    <div class="statusline">
      <div class="group"><span class="dot"></span><span>${fmtNum(list.length)} งานในมุมมองนี้</span><span class="sep">/</span><span>ทั้งหมด ${fmtNum(state.jobs.length)}</span></div>
      <div class="group">คลิกแถวเพื่อดูรายละเอียด · Enter เพื่อเปิด</div>
    </div>

    <section class="panel">
      <div class="toolbar">
        <div class="search">
          <svg width="15" height="15"><use href="#i-search"/></svg>
          <input id="jobSearch" type="search" placeholder="Job No, ลูกค้า, B/L…" value="${esc(state.q)}" aria-label="ค้นหางานในตาราง">
        </div>
        <div class="segmented" role="group" aria-label="กรองตามบริการ">
          <button data-service="all" class="${state.service === "all" ? "on" : ""}">ทั้งหมด</button>
          ${SERVICES.map((s) => `<button data-service="${s.key}" class="${state.service === s.key ? "on" : ""}">${s.code}</button>`).join("")}
        </div>
        <select class="select" id="statusFilter" aria-label="กรองตามสถานะ">
          ${[
            ["all", "ทุกสถานะ"], ["Control", "กำลังดำเนินการ"], ["Waiting", "รอเอกสาร"],
            ["Completed", "เสร็จสิ้น"], ["Cancelled", "ยกเลิก"],
          ].map(([v, l]) => `<option value="${v}" ${state.status === v ? "selected" : ""}>${l}</option>`).join("")}
        </select>
        <label class="check"><input type="checkbox" id="overdueFilter" ${state.overdue ? "checked" : ""}> เฉพาะเกินกำหนด</label>
        <span class="spacer"></span>
        <span class="count">${fmtNum(list.length)} รายการ</span>
      </div>

      <div class="table-wrap">
        <table class="data" style="min-width:860px">
          <thead><tr>
            <th>Job No</th><th>บริการ</th><th>ลูกค้า</th><th>สถานะ</th><th>ETD</th><th>ETA</th><th>ขั้นถัดไป</th><th>B/L</th>
          </tr></thead>
          <tbody>
            ${rows.map((j) => {
              const sm = serviceMeta(j);
              const st = statusMeta(j);
              return `<tr data-job="${esc(j.jobNo)}" tabindex="0">
                <td class="jobno">${esc(j.jobNo)}</td>
                <td><span class="chip">${sm.code}</span></td>
                <td class="wrap muted">${esc(j.customer || "—")}</td>
                <td><span class="status ${st.cls}"><i></i>${st.label}</span></td>
                <td class="num">${fmtDate(j.etd)}</td>
                <td class="num muted">${fmtDate(j.eta)}</td>
                <td class="muted">${esc(j.nextAction || "—")}</td>
                <td class="num muted">${esc(j.bl || "—")}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
        ${rows.length ? "" : `<div class="empty"><h3>ไม่พบงานที่ตรงกับตัวกรอง</h3><p>ลองล้างคำค้นหาหรือเลือกบริการอื่น</p></div>`}
      </div>

      <div class="pagination">
        <span>หน้า ${state.pageNum} / ${totalPages}</span>
        <span class="sep">·</span>
        <span>${fmtNum(start + 1)}–${fmtNum(Math.min(start + state.pageSize, list.length))} จาก ${fmtNum(list.length)}</span>
        <span class="spacer"></span>
        <div class="page-btns">
          <button data-page-num="${state.pageNum - 1}" ${state.pageNum <= 1 ? "disabled" : ""} aria-label="ก่อนหน้า">‹</button>
          ${pageBtns.join("")}
          <button data-page-num="${state.pageNum + 1}" ${state.pageNum >= totalPages ? "disabled" : ""} aria-label="ถัดไป">›</button>
        </div>
      </div>
    </section>`;
}

/* ---------------- upload ---------------- */

function renderUpload() {
  return `
    <div class="statusline">
      <div class="group"><span class="dot"></span><span>อัปโหลดแล้วระบบเริ่มประมวลผลทันที</span></div>
      <div class="group">Excel + เว็บอัปเดตจาก run เดียวกัน</div>
    </div>

    <div class="grid">
      <section class="panel col-8">
        <div class="panel-head"><h2 class="panel-title">ไฟล์ FWD</h2><span class="panel-meta">XLSX / CSV · ≤ 25 MB</span></div>
        <div class="panel-body">
          <div class="dropzone" id="dropzone" tabindex="0" role="button" aria-label="เลือกไฟล์ FWD">
            <div class="dz-icon"><svg width="20" height="20"><use href="#i-upload"/></svg></div>
            <h3>ลากไฟล์มาวาง หรือเลือกไฟล์</h3>
            <p>ระบบจะตรวจรูปแบบก่อน แล้วอัปเดต Excel และฐานข้อมูลให้อัตโนมัติ</p>
            <div class="dz-actions">
              <button class="btn btn-primary" id="pickFile">เลือกไฟล์</button>
              <button class="btn btn-secondary" id="demoFile">ใช้ไฟล์ตัวอย่าง</button>
            </div>
            <div class="file-spec">
              <span><i></i>.xlsx / .csv</span><span><i></i>≤ 25 MB</span><span><i></i>≤ 50,000 แถว</span><span><i></i>ไม่รองรับ macro</span>
            </div>
          </div>
          <input type="file" id="fileInput" accept=".xlsx,.csv" hidden>
          <div id="uploadRun" style="margin-top:16px"></div>
        </div>
      </section>

      <section class="panel col-4">
        <div class="panel-head"><h2 class="panel-title">ขั้นตอน</h2><span class="panel-meta">Run #2841</span></div>
        <div class="panel-body">
          <div class="steps" id="uploadSteps">
            <div class="step" data-step="0"><span class="st-dot"></span><span>ตรวจไฟล์และรูปแบบ</span><span class="st-state">รอ</span></div>
            <div class="step" data-step="1"><span class="st-dot"></span><span>แปลงและตรวจข้อมูล</span><span class="st-state">รอ</span></div>
            <div class="step" data-step="2"><span class="st-dot"></span><span>เขียน Excel (Graph)</span><span class="st-state">รอ</span></div>
            <div class="step" data-step="3"><span class="st-dot"></span><span>Sync เว็บ (PostgreSQL)</span><span class="st-state">รอ</span></div>
          </div>
          <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line);font-size:11px;color:var(--muted)">
            ใช้เวลาเฉลี่ย <span class="mono" style="color:var(--ink)">28 วินาที</span> · ถ้า Excel ถูกล็อก ระบบจะรอและลองใหม่
          </div>
        </div>
      </section>
    </div>

    <section class="panel" style="margin-top:16px">
      <div class="panel-head"><h2 class="panel-title">ประวัติการอัปโหลด</h2><span class="panel-meta">ตัวอย่าง</span></div>
      <div class="table-wrap">
        <table class="data" style="min-width:720px">
          <thead><tr><th>ไฟล์</th><th>เมื่อ</th><th class="right">แถว</th><th>ผล</th><th>ใช้เวลา</th><th>โดย</th></tr></thead>
          <tbody>
            <tr><td class="mono">FWD_Booking_20261028_0930.xlsx</td><td class="num">28 ต.ค. 09:31</td><td class="right num">989</td><td><span class="status complete"><i></i>สำเร็จ</span></td><td class="num">24 วิ</td><td class="muted">OP</td></tr>
            <tr><td class="mono">FWD_Booking_20261027_1715.xlsx</td><td class="num">27 ต.ค. 17:16</td><td class="right num">984</td><td><span class="status complete"><i></i>สำเร็จ</span></td><td class="num">31 วิ</td><td class="muted">OP</td></tr>
            <tr><td class="mono">FWD_Booking_20261027_0900.xlsx</td><td class="num">27 ต.ค. 09:02</td><td class="right num">—</td><td><span class="status cancel"><i></i>ไม่ผ่าน validation</span></td><td class="num">6 วิ</td><td class="muted">OP</td></tr>
          </tbody>
        </table>
      </div>
    </section>`;
}

/* ---------------- health ---------------- */

function renderHealth() {
  const s = getStats();
  const fill = [
    { label: "Draft ใบขน", value: s.fill.draft },
    { label: "ยิงใบขนจริง", value: s.fill.customs },
    { label: "แลก DO", value: s.fill.dor },
    { label: "Clear & Pickup", value: s.fill.cleared },
    { label: "เอกสารเบิกเงิน", value: s.fill.advance },
  ];

  return `
    <div class="statusline">
      <div class="group"><span class="dot" style="background:var(--amber)"></span><span>ข้อมูลครบ 100% หรือยัง</span></div>
      <div class="group">ตรวจจากไฟล์จริง 989 งาน</div>
    </div>

    <div class="grid">
      <section class="panel col-6">
        <div class="panel-head"><h2 class="panel-title">ความครบของฟิลด์</h2><span class="panel-meta">ก่อนใช้ KPI</span></div>
        <div class="panel-body">
          <div class="health">
            <div class="health-row"><span class="dot" style="background:#0E7C66"></span>งานทั้งหมด<span class="val ok">${fmtNum(s.total)}</span></div>
            <div class="health-row"><span class="dot" style="background:#B45309"></span>ไม่มี ETD<span class="val warn">${fmtNum(s.missingEtd)}</span></div>
            <div class="health-row"><span class="dot" style="background:#B45309"></span>เลขงานซ้ำ<span class="val warn">${fmtNum(s.duplicates)}</span></div>
            <div class="health-row"><span class="dot" style="background:#B45309"></span>ไม่มีลูกค้า<span class="val warn">3</span></div>
            <div class="health-row"><span class="dot" style="background:#0E7C66"></span>Excel ตรงกับ DB<span class="val ok">ใช่</span></div>
          </div>
          <p style="margin:14px 0 0;font-size:11px;color:var(--muted);line-height:1.55">
            ตัวเลข KPI จะเชื่อถือได้เมื่อฟิลด์หลักครบ · ระบบจะเตือนเมื่อสัดส่วนข้อมูลขาดเกิน 2%
          </p>
        </div>
      </section>

      <section class="panel col-6">
        <div class="panel-head"><h2 class="panel-title">ความครบของ milestone</h2><span class="panel-meta">ทั้งไฟล์</span></div>
        <div class="panel-body">
          <div class="ledger">
            ${fill.map((f) => `
              <div class="ledger-row">
                <span class="ledger-dot" style="background:${f.value >= 60 ? "#0E7C66" : "#B45309"}"></span>
                <span class="ledger-name">${f.label}</span>
                <span class="ledger-count">${f.value}%</span>
                <span class="ledger-pct"></span>
                <span class="ledger-bar"><i style="width:${f.value}%;background:${f.value >= 60 ? "#0E7C66" : "#B45309"}"></i></span>
              </div>`).join("")}
          </div>
          <p style="margin:14px 0 0;font-size:11px;color:var(--muted);line-height:1.55">
            ช่องว่างอาจหมายถึง “ยังไม่ทำ” หรือ “ไม่ได้บันทึก” — ระบบจะไม่เดาสถานะถัดไปจากช่องว่าง
          </p>
        </div>
      </section>

      <section class="panel col-12">
        <div class="panel-head"><h2 class="panel-title">Sync log</h2><span class="panel-meta">ตัวอย่าง</span></div>
        <div class="table-wrap">
          <table class="data" style="min-width:700px">
            <thead><tr><th>เวลา</th><th>แหล่ง</th><th class="right">แถว</th><th class="right">เปลี่ยน</th><th>ผล</th><th>หมายเหตุ</th></tr></thead>
            <tbody>
              <tr><td class="num">28 ต.ค. 10:32</td><td>Excel → DB</td><td class="right num">989</td><td class="right num">12</td><td><span class="status complete"><i></i>สำเร็จ</span></td><td class="muted">Graph range update</td></tr>
              <tr><td class="num">28 ต.ค. 10:17</td><td>Excel → DB</td><td class="right num">989</td><td class="right num">0</td><td><span class="status complete"><i></i>สำเร็จ</span></td><td class="muted">ไม่มีการเปลี่ยนแปลง</td></tr>
              <tr><td class="num">28 ต.ค. 09:31</td><td>FWD → Excel</td><td class="right num">989</td><td class="right num">24</td><td><span class="status complete"><i></i>สำเร็จ</span></td><td class="muted">Run #2841</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>`;
}

/* ---------------- transport, advances, settings ---------------- */

const ADVANCE_ROWS = [
  { advNo: "AV26070112", jobNo: "SHSI26070062", customer: "SAVE LOGISTICS(THAILAND) CO.,LTD.", payTo: "กรมศุลกากร (พักรายได้)", branch: "HEAD OFFICE", advDate: "2026-07-14", amount: 18500, cleared: 0, clearNo: "—", shipping: "APIRAK", ageDays: 5, state: "overdue", note: "รอใบเสร็จตัวจริงจากท่าเรือ" },
  { advNo: "AV26070056", jobNo: "SHAI26070008", customer: "SAVE LOGISTICS(THAILAND) CO.,LTD.", payTo: "SHIPPING ANUCHA", branch: "HEAD OFFICE", advDate: "2026-07-07", amount: 4200, cleared: 0, clearNo: "—", shipping: "ANUCHA", ageDays: 9, state: "overdue", note: "ปิดบัญชี 16/7 รอตรวจ" },
  { advNo: "AV26070076", jobNo: "SHAI26070012", customer: "SAVE LOGISTICS(THAILAND) CO.,LTD.", payTo: "SHIPPING ANUCHA", branch: "HEAD OFFICE", advDate: "2026-07-09", amount: 3500, cleared: 0, clearNo: "—", shipping: "ANUCHA", ageDays: 7, state: "overdue", note: "รออนุมัติ Clearing" },
  { advNo: "AV26070130", jobNo: "SHAE26070001", customer: "CN LOGISTICS (THAILAND) CO.,LTD.", payTo: "SHIPPING ANUCHA", branch: "SUVARNABHUMI", advDate: "2026-07-18", amount: 6800, cleared: 0, clearNo: "CL26070208", shipping: "ANUCHA", ageDays: 5, state: "overdue", note: "เกินกำหนด 5 วัน · แจ้งเตือน CS" },
  { advNo: "AV26070140", jobNo: "SHSI26070079", customer: "SAVE LOGISTICS(THAILAND) CO.,LTD.", payTo: "GDL INTERTRANSPORT CO.,LTD.", branch: "HEAD OFFICE", advDate: "2026-07-20", amount: 2000, cleared: 0, clearNo: "—", shipping: "APIRAK", ageDays: 1, state: "pending", note: "Paid Adv. Not Post Batch" },
  { advNo: "AV26070138", jobNo: "SHSI26070074", customer: "SAVE LOGISTICS(THAILAND) CO.,LTD.", payTo: "นายเอกพงศ์ ศรีทอง (หัวลาก)", branch: "HEAD OFFICE", advDate: "2026-07-20", amount: 3000, cleared: 0, clearNo: "—", shipping: "APIRAK", ageDays: 1, state: "pending", note: "เบิกเพื่อทำงานหน้าท่า" },
  { advNo: "AV26070162", jobNo: "SHAI26070040", customer: "CH.KARNCHANG PUBLIC COMPANY LIMITED", payTo: "SHIPPING ANUCHA", branch: "SUVARNABHUMI", advDate: "2026-07-15", amount: 9400, cleared: 0, clearNo: "—", shipping: "ANUCHA", ageDays: 4, state: "pending", note: "รอเอกสาร DO แนบชุดเบิก" },
  { advNo: "AV26070157", jobNo: "SHAI26070044", customer: "SAVE LOGISTICS(THAILAND) CO.,LTD.", payTo: "SHIPPING ANUCHA", branch: "SUVARNABHUMI", advDate: "2026-07-22", amount: 2800, cleared: 0, clearNo: "—", shipping: "ANUCHA", ageDays: 2, state: "pending", note: "กำลังรวบรวมใบเสร็จ" },
  { advNo: "AV26070160", jobNo: "SHAI26070045", customer: "SAVE LOGISTICS(THAILAND) CO.,LTD.", payTo: "SHIPPING ANUCHA", branch: "SUVARNABHUMI", advDate: "2026-07-22", amount: 3100, cleared: 0, clearNo: "—", shipping: "ANUCHA", ageDays: 2, state: "pending", note: "รอลูกค้ายืนยันค่าธรรมเนียม" },
  { advNo: "AV26070121", jobNo: "SHAI26070022", customer: "KAWASAKI TRADING (THAILAND) CO.,LTD.", payTo: "SHIPPING ANUCHA", branch: "SUVARNABHUMI", advDate: "2026-07-14", amount: 5200, cleared: 0, clearNo: "—", shipping: "ANUCHA", ageDays: 2, state: "pending", note: "CS แก้เลข Job ในใบขนเป็น SHSI" },
  { advNo: "AV26070143", jobNo: "SHAI26070035", customer: "SAVE LOGISTICS(THAILAND) CO.,LTD.", payTo: "SHIPPING ANUCHA", branch: "SUVARNABHUMI", advDate: "2026-07-19", amount: 4500, cleared: 4500, clearNo: "CL26070205", shipping: "ANUCHA", ageDays: 0, state: "cleared", note: "เคลียร์ครบตามใบเสร็จ" },
  { advNo: "AV26070147", jobNo: "SHAI26070039", customer: "SAVE LOGISTICS(THAILAND) CO.,LTD.", payTo: "SHIPPING ANUCHA", branch: "SUVARNABHUMI", advDate: "2026-07-21", amount: 3800, cleared: 3800, clearNo: "CL26070202", shipping: "ANUCHA", ageDays: 0, state: "cleared", note: "ปิดชุดบัญชีแล้ว" },
  { advNo: "AV26070158", jobNo: "SHAI26070041", customer: "Maxis products co.,ltd.", payTo: "SHIPPING ANUCHA", branch: "SUVARNABHUMI", advDate: "2026-07-15", amount: 6100, cleared: 6100, clearNo: "CL26070201", shipping: "ANUCHA", ageDays: 0, state: "cleared", note: "ปิดชุดบัญชีแล้ว" },
  { advNo: "AV26070154", jobNo: "SHAI26070042", customer: "SAVE LOGISTICS(THAILAND) CO.,LTD.", payTo: "SHIPPING ANUCHA", branch: "SUVARNABHUMI", advDate: "2026-07-21", amount: 2950, cleared: 2950, clearNo: "CL26070204", shipping: "ANUCHA", ageDays: 0, state: "cleared", note: "ปิดชุดบัญชีแล้ว" },
  { advNo: "AV26070155", jobNo: "SHAI26070043", customer: "SAVE LOGISTICS(THAILAND) CO.,LTD.", payTo: "SHIPPING ANUCHA", branch: "SUVARNABHUMI", advDate: "2026-07-21", amount: 3400, cleared: 3400, clearNo: "CL26070203", shipping: "ANUCHA", ageDays: 0, state: "cleared", note: "ปิดชุดบัญชีแล้ว" },
  { advNo: "AV26070114", jobNo: "SHAI26070018", customer: "SAVE LOGISTICS(THAILAND) CO.,LTD.", payTo: "SHIPPING ANUCHA", branch: "SUVARNABHUMI", advDate: "2026-07-14", amount: 4900, cleared: 4900, clearNo: "CL26070198", shipping: "ANUCHA", ageDays: 0, state: "cleared", note: "เคลียร์ 15.07.69" },
  { advNo: "AV26070110", jobNo: "SHAI26070020", customer: "SAVE LOGISTICS(THAILAND) CO.,LTD.", payTo: "SHIPPING ANUCHA", branch: "SUVARNABHUMI", advDate: "2026-07-14", amount: 3250, cleared: 3250, clearNo: "CL26070195", shipping: "ANUCHA", ageDays: 0, state: "cleared", note: "ปิดชุดบัญชี 16.07.69" },
];

function classifyContainer(c) {
  const low = String(c || "").toLowerCase();
  if (low.includes("40") && low.includes("hc")) return "40' HC";
  if (low.includes("40")) return "40'";
  if (low.includes("20")) return "20'";
  if (low.includes("wheel")) return "รถยนต์ 4/6 ล้อ";
  return "อื่น ๆ";
}

function renderTransport() {
  const rows = state.transport || [];
  const buckets = { "รถยนต์ 4/6 ล้อ": 0, "40' HC": 0, "20'": 0, "40'": 0, "อื่น ๆ": 0 };
  let completed = 0, cancelled = 0, linked = 0;

  for (const r of rows) {
    const b = classifyContainer(r.container);
    buckets[b] = (buckets[b] || 0) + 1;
    if (/complete/i.test(r.status)) completed += 1;
    else if (/cancel/i.test(r.status)) cancelled += 1;
    if (r.jobNo) linked += 1;
  }

  let filtered = rows.filter((r) => {
    if (state.transBucket !== "all" && classifyContainer(r.container) !== state.transBucket) return false;
    if (state.transQ) {
      const q = state.transQ.toLowerCase();
      return [r.transportNo, r.jobNo, r.customer, r.container].some((v) => String(v || "").toLowerCase().includes(q));
    }
    return true;
  });

  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  if (state.transPage > totalPages) state.transPage = totalPages;
  const start = (state.transPage - 1) * pageSize;
  const slice = filtered.slice(start, start + pageSize);

  return `
    <div class="statusline">
      <div class="group"><span class="dot"></span><span>ชีต Transport · ${fmtNum(rows.length)} เที่ยวขนส่ง</span><span class="sep">/</span><span>เชื่อม Job No แล้ว ${fmtNum(linked)} เที่ยว</span></div>
      <div class="group">ปกปิดข้อมูลบัตรประชาชนคนขับตาม PDPA</div>
    </div>

    <div class="kpis">
      <div class="kpi">
        <div class="kpi-label">เที่ยวขนส่งทั้งหมด</div>
        <div class="kpi-value">${fmtNum(rows.length)}</div>
        <div class="kpi-sub">เชื่อม Job หลัก <b>${fmtNum(linked)}</b> เที่ยว (${pct(linked, rows.length)}%)</div>
        ${kpiBar([{ w: pct(linked, rows.length) }])}
      </div>
      <div class="kpi">
        <div class="kpi-label">รถบรรทุก 4 / 6 ล้อ</div>
        <div class="kpi-value">${fmtNum(buckets["รถยนต์ 4/6 ล้อ"])}</div>
        <div class="kpi-sub">${pct(buckets["รถยนต์ 4/6 ล้อ"], rows.length)}% ของเที่ยววิ่งทั้งหมด</div>
        ${kpiBar([{ w: pct(buckets["รถยนต์ 4/6 ล้อ"], rows.length), cls: "blue" }])}
      </div>
      <div class="kpi">
        <div class="kpi-label">ตู้คอนเทนเนอร์ 40' HC / 20'</div>
        <div class="kpi-value">${fmtNum(buckets["40' HC"] + buckets["20'"] + buckets["40'"])}</div>
        <div class="kpi-sub">40' HC ${buckets["40' HC"]} · 20' ${buckets["20'"]} · 40' ${buckets["40'"]}</div>
        ${kpiBar([{ w: pct(buckets["40' HC"] + buckets["20'"], rows.length), cls: "amber" }])}
      </div>
      <div class="kpi">
        <div class="kpi-label">สถานะส่งมอบ</div>
        <div class="kpi-value">${pct(completed, rows.length).toFixed(1)}<small>%</small></div>
        <div class="kpi-sub">เสร็จสิ้น <b>${fmtNum(completed)}</b> · ยกเลิก ${fmtNum(cancelled)}</div>
        ${kpiBar([{ w: pct(completed, rows.length) }])}
      </div>
    </div>

    <section class="panel">
      <div class="toolbar">
        <div class="search">
          <svg width="15" height="15"><use href="#i-search"/></svg>
          <input id="transSearch" type="search" placeholder="ค้นหา TS No, Job No, ลูกค้า, ขนาดตู้…" value="${esc(state.transQ)}" aria-label="ค้นหาเที่ยวขนส่ง">
        </div>
        <div class="segmented" role="group" aria-label="กรองตามประเภทรถและตู้">
          ${[
            ["all", "ทั้งหมด"],
            ["รถยนต์ 4/6 ล้อ", "รถ 4/6 ล้อ"],
            ["40' HC", "40' HC"],
            ["20'", "20' DC"],
          ].map(([k, label]) => `<button data-trans-bucket="${k}" class="${state.transBucket === k ? "on" : ""}">${label}</button>`).join("")}
        </div>
        <span class="spacer"></span>
        <span class="count">${fmtNum(filtered.length)} เที่ยว</span>
      </div>

      <div class="table-wrap">
        <table class="data" style="min-width:820px">
          <thead><tr>
            <th>Transport No</th><th>Job No ที่เชื่อม</th><th>ลูกค้า</th><th>ประเภทตู้ / รถ</th><th>วันที่ส่งมอบ</th><th>สถานะ</th>
          </tr></thead>
          <tbody>
            ${slice.map((r) => {
              const isDone = /complete/i.test(r.status);
              const isCancel = /cancel/i.test(r.status);
              const stCls = isDone ? "complete" : isCancel ? "cancel" : "control";
              const stTxt = isDone ? "ส่งมอบแล้ว" : isCancel ? "ยกเลิก" : (r.status || "กำลังวิ่ง");
              const hasJob = r.jobNo && state.jobs.some((j) => j.jobNo === r.jobNo);
              return `<tr ${hasJob ? `data-job="${esc(r.jobNo)}" tabindex="0"` : ""}>
                <td class="jobno">${esc(r.transportNo || "—")}</td>
                <td class="mono">${hasJob ? `<span class="chip em">${esc(r.jobNo)}</span>` : `<span class="muted">${esc(r.jobNo || "ไม่ระบุ")}</span>`}</td>
                <td class="wrap muted">${esc(r.customer || "—")}</td>
                <td class="mono">${esc(r.container || "—")}</td>
                <td class="num">${fmtDate(r.deliver)}</td>
                <td><span class="status ${stCls}"><i></i>${esc(stTxt)}</span></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>

      <div class="pagination">
        <span>หน้า ${state.transPage} / ${totalPages}</span>
        <span class="sep">·</span>
        <span>แสดง ${fmtNum(start + 1)}–${fmtNum(Math.min(start + pageSize, filtered.length))} จาก ${fmtNum(filtered.length)}</span>
        <span class="spacer"></span>
        <div class="page-btns">
          <button data-trans-page="${state.transPage - 1}" ${state.transPage <= 1 ? "disabled" : ""}>‹</button>
          <button class="on">${state.transPage}</button>
          <button data-trans-page="${state.transPage + 1}" ${state.transPage >= totalPages ? "disabled" : ""}>›</button>
        </div>
      </div>
    </section>`;
}

function renderAdvances() {
  const totalAmt = ADVANCE_ROWS.reduce((s, r) => s + r.amount, 0);
  const outstandingAmt = ADVANCE_ROWS.filter((r) => r.state !== "cleared").reduce((s, r) => s + (r.amount - r.cleared), 0);
  const overdueRows = ADVANCE_ROWS.filter((r) => r.state === "overdue");
  const pendingRows = ADVANCE_ROWS.filter((r) => r.state === "pending");
  const clearedRows = ADVANCE_ROWS.filter((r) => r.state === "cleared");

  const list = ADVANCE_ROWS.filter((r) => {
    if (state.advState !== "all" && r.state !== state.advState) return false;
    if (state.advQ) {
      const q = state.advQ.toLowerCase();
      return [r.advNo, r.jobNo, r.customer, r.payTo, r.clearNo].some((v) => String(v || "").toLowerCase().includes(q));
    }
    return true;
  });

  return `
    <div class="statusline">
      <div class="group"><span class="dot" style="background:var(--amber)"></span><span>SHIPPING ORDER CONTROL LIST · ADVANCE &amp; CLEARING</span></div>
      <div class="group">อ้างอิงชีต clearing และ Sheet1/Sheet2</div>
    </div>

    <div class="kpis">
      <div class="kpi">
        <div class="kpi-label">ยอดเบิกสำรองจ่ายรวม</div>
        <div class="kpi-value">฿${fmtNum(totalAmt)}</div>
        <div class="kpi-sub">${ADVANCE_ROWS.length} รายการในรอบตรวจ</div>
        ${kpiBar([{ w: 100, cls: "blue" }])}
      </div>
      <div class="kpi">
        <div class="kpi-label">ค้างเคลียร์ (Outstanding)</div>
        <div class="kpi-value" style="color:var(--amber)">฿${fmtNum(outstandingAmt)}</div>
        <div class="kpi-sub">${overdueRows.length + pendingRows.length} รายการยังไม่ปิดชุด</div>
        ${kpiBar([{ w: pct(outstandingAmt, totalAmt), cls: "amber" }])}
      </div>
      <div class="kpi">
        <div class="kpi-label">เกินกำหนด (&gt; 5 วัน)</div>
        <div class="kpi-value" style="color:var(--red)">${overdueRows.length}</div>
        <div class="kpi-sub">ต้องเร่งใบเสร็จ / ใบขนเพื่อปิดชุดบัญชี</div>
        ${kpiBar([{ w: pct(overdueRows.length, ADVANCE_ROWS.length), cls: "red" }])}
      </div>
      <div class="kpi">
        <div class="kpi-label">เคลียร์แล้ว</div>
        <div class="kpi-value">${clearedRows.length}</div>
        <div class="kpi-sub">ออกเลข CL ครบถ้วน · ${pct(clearedRows.length, ADVANCE_ROWS.length)}%</div>
        ${kpiBar([{ w: pct(clearedRows.length, ADVANCE_ROWS.length) }])}
      </div>
    </div>

    <section class="panel">
      <div class="toolbar">
        <div class="search">
          <svg width="15" height="15"><use href="#i-search"/></svg>
          <input id="advSearch" type="search" placeholder="ค้นหา Adv No, Job No, ผู้รับเงิน, CL No…" value="${esc(state.advQ)}" aria-label="ค้นหารายการเบิกเงิน">
        </div>
        <div class="segmented" role="group" aria-label="กรองตามสถานะการเคลียร์">
          ${[
            ["all", "ทั้งหมด"],
            ["overdue", "เกินกำหนด"],
            ["pending", "รอเคลียร์"],
            ["cleared", "เคลียร์แล้ว"],
          ].map(([k, label]) => `<button data-adv-state="${k}" class="${state.advState === k ? "on" : ""}">${label}</button>`).join("")}
        </div>
        <span class="spacer"></span>
        <span class="count">${list.length} รายการ</span>
      </div>

      <div class="table-wrap">
        <table class="data" style="min-width:920px">
          <thead><tr>
            <th>Adv. No</th><th>Job No</th><th>ผู้รับเงิน / Shipping</th><th>ลูกค้า</th><th>วันที่เบิก</th><th class="right">ยอดเบิก (฿)</th><th>Clearing No</th><th>สถานะ</th><th>หมายเหตุ</th>
          </tr></thead>
          <tbody>
            ${list.map((r) => {
              const st = r.state === "Cleared" || r.state === "cleared"
                ? { cls: "complete", txt: "เคลียร์แล้ว" }
                : r.state === "overdue"
                ? { cls: "cancel", txt: `เกิน ${r.ageDays} วัน` }
                : { cls: "control", txt: `รอเคลียร์ (${r.ageDays} วัน)` };
              return `<tr data-job="${esc(r.jobNo)}" tabindex="0">
                <td class="jobno">${esc(r.advNo)}</td>
                <td><span class="chip">${esc(r.jobNo)}</span></td>
                <td class="muted">${esc(r.payTo)}</td>
                <td class="wrap muted">${esc(r.customer)}</td>
                <td class="num">${fmtDate(r.advDate)}</td>
                <td class="right num">${fmtNum(r.amount)}</td>
                <td class="mono muted">${esc(r.clearNo)}</td>
                <td><span class="status ${st.cls}"><i></i>${st.txt}</span></td>
                <td class="muted">${esc(r.note)}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </section>`;
}

function renderSettings() {
  return `
    <div class="statusline">
      <div class="group"><span class="dot"></span><span>สถาปัตยกรรม v0.3.1 · Graph Excel API + PostgreSQL Read Model</span></div>
      <div class="group">OneDrive Master Workbook</div>
    </div>

    <div class="grid">
      <section class="panel col-6">
        <div class="panel-head"><h2 class="panel-title">การเชื่อมต่อ Microsoft Graph &amp; Excel</h2><span class="panel-meta">ACTIVE</span></div>
        <div class="panel-body">
          <div class="health">
            <div class="health-row"><span class="dot" style="background:#0E7C66"></span>Workbook เป้าหมาย<span class="val ok">JOB_Daily_2026 STATUS_Dashboard.xlsx</span></div>
            <div class="health-row"><span class="dot" style="background:#0E7C66"></span>โหมดการเขียน<span class="val ok">Graph Range PATCH ($batch ≤ 20)</span></div>
            <div class="health-row"><span class="dot" style="background:#0E7C66"></span>การคำนวณสูตร Dashboard<span class="val ok">POST /workbook/calculate (Full)</span></div>
            <div class="health-row"><span class="dot" style="background:#0E7C66"></span>ผู้เขียนไฟล์ (Single Writer)<span class="val ok">n8n Service Account (Files.ReadWrite)</span></div>
            <div class="health-row"><span class="dot" style="background:#B45309"></span>ตำแหน่งเก็บไฟล์ปัจจุบัน<span class="val warn">OneDrive (แนะนำย้ายเข้า Team Site ก่อน Go-live)</span></div>
          </div>
        </div>
      </section>

      <section class="panel col-6">
        <div class="panel-head"><h2 class="panel-title">สิทธิ์การใช้งานและ Field Ownership</h2><span class="panel-meta">RBAC</span></div>
        <div class="panel-body">
          <div class="health">
            <div class="health-row"><span class="dot" style="background:#0E7C66"></span>Viewer (ผู้บริหาร / ทีมงานทั่วไป)<span class="val">ดูภาพรวม ค้นหา และดาวน์โหลด Excel</span></div>
            <div class="health-row"><span class="dot" style="background:#0E7C66"></span>Operations (CS / Shipping)<span class="val ok">อัปโหลด FWD + แก้ไข Milestone &amp; Remark</span></div>
            <div class="health-row"><span class="dot" style="background:#1E4E8C"></span>Admin (หัวหน้างาน / ระบบ)<span class="val">แก้ไข Customer / BL + Resolve Conflict</span></div>
            <div class="health-row"><span class="dot" style="background:#0E7C66"></span>การคุ้มครองข้อมูลส่วนบุคคล (PDPA)<span class="val ok">กรองเลขบัตร ปชช. คนขับ + Mask เบอร์โทร</span></div>
            <div class="health-row"><span class="dot" style="background:#0E7C66"></span>Retention Policy<span class="val">FWD ดิบ 90 วัน · Audit Log 1 ปี</span></div>
          </div>
        </div>
      </section>
    </div>`;
}

/* ---------------- drawer ---------------- */

function renderDrawer() {
  const job = state.selected;
  if (!job) return;
  const sm = serviceMeta(job);
  const st = statusMeta(job);
  const steps = [
    { done: job.draftCustoms, date: job.draftDate, name: "Draft ใบขน", hint: "ออก Draft โดย CS" },
    { done: job.customsFiled, date: job.customsDate, name: "ยิงใบขนจริง", hint: "ส่งข้อมูลเข้าศุลกากร" },
    { done: job.doReleased, date: job.doDate, name: "แลก DO", hint: "ปล่อยตู้ / รับสินค้า" },
    { done: job.cleared, date: job.clearDate, name: "Clear & Pickup", hint: "เคลียร์และส่งมอบ" },
    { done: job.advanceDoc, date: job.advanceDate, name: "เอกสารเบิกเงิน", hint: "ปิดชุดบัญชี" },
  ];

  const timeline = steps.map((s) => {
    let cls = "wait";
    let dateText = "รอดำเนินการ";
    if (s.done) {
      cls = "done";
      dateText = s.date ? fmtDate(s.date) : "บันทึกแล้ว";
    } else if (job.status === "Completed") {
      cls = "";
      dateText = "ไม่บันทึก";
    }
    return `<div class="tl-item ${cls}">
      <span class="tl-dot"></span>
      <div class="tl-name">${s.name}</div>
      <div class="tl-date">${dateText}${s.done && !s.date ? " · " + s.hint : ""}</div>
    </div>`;
  }).join("");

  const history = [
    { time: "วันนี้ 10:12", what: "แก้ไขสถานะ → <b>เสร็จสิ้น</b>", who: "OP" },
    { time: "เมื่อวาน 16:40", what: "Sync จาก Excel · 12 ฟิลด์", who: "SYSTEM" },
    { time: "27 ต.ค. 09:31", what: "อัปโหลด FWD · Run #2841", who: "OP" },
  ];

  const body = state.editing ? `
    <div class="edit-note">
      <svg width="15" height="15"><use href="#i-alert"/></svg>
      <div>บันทึกจะเขียน <b>Excel ก่อน</b> แล้ว sync เว็บ · ใช้เวลา ~2–3 วินาที</div>
    </div>
    <form id="editForm">
      <div class="form-grid">
        <div class="field full">
          <label for="f-status">สถานะงาน</label>
          <select id="f-status" name="status">
            ${[["Completed", "เสร็จสิ้น"], ["Control", "กำลังดำเนินการ"], ["Waiting", "รอเอกสาร"], ["Cancelled", "ยกเลิก"]]
              .map(([v, l]) => `<option value="${v}" ${st.key === v ? "selected" : ""}>${l}</option>`).join("")}
          </select>
        </div>
        <div class="field"><label for="f-etd">ETD</label><input id="f-etd" name="etd" type="date" value="${esc(job.etd || "")}"></div>
        <div class="field"><label for="f-eta">ETA</label><input id="f-eta" name="eta" type="date" value="${esc(job.eta || "")}"></div>
        <div class="field"><label for="f-draft">Draft ใบขน</label><input id="f-draft" name="draftDate" type="date" value="${esc(job.draftDate || "")}"></div>
        <div class="field"><label for="f-customs">ยิงใบขนจริง</label><input id="f-customs" name="customsDate" type="date" value="${esc(job.customsDate || "")}"></div>
        <div class="field"><label for="f-do">แลก DO</label><input id="f-do" name="doDate" type="date" value="${esc(job.doDate || "")}"></div>
        <div class="field"><label for="f-clear">Clear & Pickup</label><input id="f-clear" name="clearDate" type="date" value="${esc(job.clearDate || "")}"></div>
        <div class="field"><label for="f-adv">เอกสารเบิกเงิน</label><input id="f-adv" name="advanceDate" type="date" value="${esc(job.advanceDate || "")}"></div>
        <div class="field full"><label for="f-remark">หมายเหตุ</label><textarea id="f-remark" name="remark" placeholder="เช่น ปิดชุดบัญชีแล้ว / รอลูกค้ายืนยัน">${esc(job.remark || "")}</textarea><span class="hint">≤ 500 ตัวอักษร · แสดงใน Excel คอลัมน์ Remark</span></div>
      </div>
    </form>` : `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      <span class="status ${st.cls}"><i></i>${st.label}</span>
      <span class="chip">${sm.code}</span>
      <span class="chip">${esc(job.service)} · แถว ${esc(job.sourceRow || "—")}</span>
      <span class="mono" style="margin-left:auto;font-size:10px;color:var(--muted)">ETD ${fmtDate(job.etd)}</span>
    </div>

    <div class="section-label">เส้นทางงาน</div>
    <div class="timeline">${timeline}</div>

    <div class="section-label">ข้อมูลงาน</div>
    <dl class="info-grid">
      <div><dt>ลูกค้า</dt><dd>${esc(job.customer || "—")}</dd></div>
      <div><dt>Consignee</dt><dd>${esc(job.consignee || "—")}</dd></div>
      <div><dt>B/L</dt><dd class="mono">${esc(job.bl || "—")}</dd></div>
      <div><dt>แหล่งข้อมูล</dt><dd class="mono">${esc(job.service)} · แถว ${esc(job.sourceRow || "—")}</dd></div>
      <div><dt>ETD</dt><dd class="mono">${fmtDate(job.etd)}</dd></div>
      <div><dt>ETA</dt><dd class="mono">${fmtDate(job.eta)}</dd></div>
    </dl>

    <div class="section-label">ประวัติการแก้ไข <span style="color:var(--muted-2);text-transform:none;letter-spacing:0">(ตัวอย่าง)</span></div>
    <div class="history">
      ${history.map((h) => `<div class="hist-row"><span class="hist-time">${h.time}</span><span class="hist-what">${h.what}</span><span class="hist-who">${h.who}</span></div>`).join("")}
    </div>`;

  const foot = state.editing ? `
    <button class="btn btn-secondary" data-act="cancel-edit">ยกเลิก</button>
    <span class="spacer"></span>
    <span class="hint">Excel + Web</span>
    <button class="btn btn-primary" data-act="save" id="saveBtn">บันทึก → Excel + Web</button>` : `
    <button class="btn btn-secondary" data-act="close-drawer">ปิด</button>
    <span class="spacer"></span>
    <button class="btn btn-primary" data-act="edit">
      <svg width="14" height="14"><use href="#i-edit"/></svg> แก้ไขข้อมูล
    </button>`;

  $("#drawer").innerHTML = `
    <div class="drawer-head">
      <div class="dh-main">
        <h2 id="drawerTitle">${esc(job.jobNo)}</h2>
        <div class="dh-cust">${esc(job.customer || "ไม่ระบุลูกค้า")}</div>
      </div>
      <button class="icon-btn" data-act="close-drawer" aria-label="ปิดรายละเอียด">
        <svg width="18" height="18"><use href="#i-x"/></svg>
      </button>
    </div>
    <div class="drawer-body">${body}</div>
    <div class="drawer-foot">${foot}</div>`;
}

function openDrawer(jobNo) {
  const job = state.jobs.find((j) => j.jobNo === jobNo);
  if (!job) return;
  state.selected = job;
  state.editing = false;
  renderDrawer();
  $("#drawer").classList.add("on");
  $("#drawer").setAttribute("aria-hidden", "false");
  $("#scrim").classList.add("on");
  document.body.style.overflow = "hidden";
  setTimeout(() => $("#drawer").querySelector("[data-act=close-drawer]")?.focus(), 50);
}

function closeDrawer() {
  state.selected = null;
  state.editing = false;
  $("#drawer").classList.remove("on");
  $("#drawer").setAttribute("aria-hidden", "true");
  $("#scrim").classList.remove("on");
  document.body.style.overflow = "";
}

function saveEdit() {
  const form = $("#editForm");
  if (!form) return;
  const fd = new FormData(form);
  const statusVal = String(fd.get("status") || "Control");
  const job = state.selected;
  if (!job) return;

  const btn = $("#saveBtn");
  if (btn) { btn.disabled = true; btn.textContent = "กำลังอัปเดต Excel…"; }

  setTimeout(() => {
    job.status = statusVal === "Completed" ? "Completed" : statusVal === "Cancelled" ? "Cancelled" : "In Progress";
    job.statusDetail = statusVal === "Completed" ? "Completed" : statusVal === "Cancelled" ? "Cancelled" : statusVal;
    job.etd = fd.get("etd") || null;
    job.eta = fd.get("eta") || null;
    job.draftDate = fd.get("draftDate") || null;
    job.customsDate = fd.get("customsDate") || null;
    job.doDate = fd.get("doDate") || null;
    job.clearDate = fd.get("clearDate") || null;
    job.advanceDate = fd.get("advanceDate") || null;
    job.draftCustoms = !!job.draftDate;
    job.customsFiled = !!job.customsDate;
    job.doReleased = !!job.doDate;
    job.cleared = !!job.clearDate;
    job.advanceDoc = !!job.advanceDate;
    job.remark = String(fd.get("remark") || "").slice(0, 500);
    job.nextAction = computeNext(job);

    state.editing = false;
    renderDrawer();
    render();
    toast("บันทึกแล้ว · Excel และเว็บตรงกัน");
  }, 1150);
}

/* ---------------- upload behaviour ---------------- */

function setStep(index, stateName) {
  const el = document.querySelector(`[data-step="${index}"]`);
  if (!el) return;
  el.classList.remove("done", "run");
  if (stateName === "done") el.classList.add("done");
  if (stateName === "run") el.classList.add("run");
  const st = el.querySelector(".st-state");
  if (st) st.textContent = stateName === "done" ? "เสร็จ" : stateName === "run" ? "กำลังทำ" : "รอ";
}

async function runUpload(file) {
  if (state.uploadBusy) return;
  const name = file?.name || "FWD_Booking_20261028_1030.xlsx";
  const size = file?.size ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "2.4 MB";
  state.uploadBusy = true;
  const run = $("#uploadRun");
  if (run) {
    run.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:12px 14px;border:1px solid var(--line);background:var(--surface-2)">
      <svg width="16" height="16"><use href="#i-file"/></svg>
      <div style="min-width:0"><div class="mono" style="font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(name)}</div>
      <div style="font-size:10px;color:var(--muted)">${size} · กำลังประมวลผล</div></div>
      <span class="chip em" style="margin-left:auto">RUN #2842</span></div>`;
  }
  for (let i = 0; i < 4; i++) {
    setStep(i, "run");
    await new Promise((r) => setTimeout(r, i === 2 ? 900 : 500));
    setStep(i, "done");
  }
  state.uploadBusy = false;
  if (run) {
    run.insertAdjacentHTML("beforeend", `<div style="margin-top:12px;padding:14px;border:1px solid rgba(14,124,102,.28);background:var(--emerald-soft)">
      <div style="display:flex;align-items:center;gap:8px;color:var(--emerald-2);font-weight:600;font-size:12px">
        <svg width="15" height="15"><use href="#i-check"/></svg> อัปเดตสำเร็จ · Excel + Web ตรงกัน
      </div>
      <div style="display:flex;gap:18px;margin-top:8px;font-family:var(--font-mono);font-size:9px;color:var(--emerald-2);text-transform:uppercase;letter-spacing:.05em">
        <span>ทั้งหมด 989</span><span>เพิ่ม 6</span><span>อัปเดต 18</span><span>ปฏิเสธ 0</span><span>28 วินาที</span>
      </div></div>`);
  }
  toast("อัปเดต Excel และเว็บเรียบร้อย");
}

/* ---------------- pages ---------------- */

function render() {
  const view = $("#view");
  if (state.page === "overview") view.innerHTML = renderOverview();
  else if (state.page === "jobs") view.innerHTML = renderJobs();
  else if (state.page === "upload") view.innerHTML = renderUpload();
  else if (state.page === "health") view.innerHTML = renderHealth();
  else if (state.page === "transport") view.innerHTML = renderTransport();
  else if (state.page === "advances") view.innerHTML = renderAdvances();
  else view.innerHTML = renderSettings();

  $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.page === state.page));
  const meta = PAGE_META[state.page] || PAGE_META.overview;
  $("#pageTitle").textContent = meta.title;
  $("#pageSub").textContent = meta.sub;

  bindView();
}

function navigate(page) {
  if (!PAGE_META[page]) return;
  state.page = page;
  state.pageNum = 1;
  $("#sidebar").classList.remove("open");
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
  $("#view").focus({ preventScroll: true });
}

function bindView() {
  $$("[data-job]", $("#view")).forEach((row) => {
    row.addEventListener("click", () => openDrawer(row.dataset.job));
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDrawer(row.dataset.job); }
    });
  });

  $$("[data-page]", $("#view")).forEach((el) => el.addEventListener("click", () => navigate(el.dataset.page)));

  const allOverdue = $("[data-act=all-overdue]", $("#view"));
  if (allOverdue) allOverdue.addEventListener("click", () => {
    state.overdue = true;
    state.status = "all";
    navigate("jobs");
  });

  const search = $("#jobSearch");
  if (search) {
    let timer;
    search.addEventListener("input", (e) => {
      state.q = e.target.value;
      clearTimeout(timer);
      timer = setTimeout(() => {
        state.pageNum = 1;
        const pos = state.q.length;
        render();
        const next = $("#jobSearch");
        if (next) { next.focus(); next.setSelectionRange(pos, pos); }
      }, 160);
    });
  }

  $$("[data-service]", $("#view")).forEach((btn) => btn.addEventListener("click", () => {
    state.service = btn.dataset.service;
    state.pageNum = 1;
    render();
  }));

  const statusFilter = $("#statusFilter");
  if (statusFilter) statusFilter.addEventListener("change", (e) => {
    state.status = e.target.value;
    state.pageNum = 1;
    render();
  });

  const overdueFilter = $("#overdueFilter");
  if (overdueFilter) overdueFilter.addEventListener("change", (e) => {
    state.overdue = e.target.checked;
    state.pageNum = 1;
    render();
  });

  $$("[data-page-num]", $("#view")).forEach((btn) => btn.addEventListener("click", () => {
    const n = Number(btn.dataset.pageNum);
    if (!Number.isFinite(n)) return;
    state.pageNum = n;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }));

  const transSearch = $("#transSearch");
  if (transSearch) {
    let timer;
    transSearch.addEventListener("input", (e) => {
      state.transQ = e.target.value;
      clearTimeout(timer);
      timer = setTimeout(() => {
        state.transPage = 1;
        const pos = state.transQ.length;
        render();
        const next = $("#transSearch");
        if (next) { next.focus(); next.setSelectionRange(pos, pos); }
      }, 160);
    });
  }

  $$("[data-trans-bucket]", $("#view")).forEach((btn) => btn.addEventListener("click", () => {
    state.transBucket = btn.dataset.transBucket;
    state.transPage = 1;
    render();
  }));

  $$("[data-trans-page]", $("#view")).forEach((btn) => btn.addEventListener("click", () => {
    const n = Number(btn.dataset.transPage);
    if (!Number.isFinite(n)) return;
    state.transPage = n;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }));

  const advSearch = $("#advSearch");
  if (advSearch) {
    let timer;
    advSearch.addEventListener("input", (e) => {
      state.advQ = e.target.value;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const pos = state.advQ.length;
        render();
        const next = $("#advSearch");
        if (next) { next.focus(); next.setSelectionRange(pos, pos); }
      }, 160);
    });
  }

  $$("[data-adv-state]", $("#view")).forEach((btn) => btn.addEventListener("click", () => {
    state.advState = btn.dataset.advState;
    render();
  }));

  if (state.page === "upload") {
    const dz = $("#dropzone");
    const input = $("#fileInput");
    if (dz && input) {
      dz.addEventListener("click", (e) => { if (e.target.closest("button")) return; input.click(); });
      dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
      ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("drag"); }));
      ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("drag"); }));
      dz.addEventListener("drop", (e) => {
        const file = e.dataTransfer?.files?.[0];
        if (file) runUpload(file);
      });
      input.addEventListener("change", () => { if (input.files?.[0]) runUpload(input.files[0]); });
      $("#pickFile")?.addEventListener("click", (e) => { e.stopPropagation(); input.click(); });
      $("#demoFile")?.addEventListener("click", (e) => { e.stopPropagation(); runUpload(null); });
    }
  }
}

/* ---------------- global ---------------- */

function toast(message, isError = false) {
  const el = $("#toast");
  $("#toastText").textContent = message;
  el.classList.toggle("error", isError);
  el.classList.add("on");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("on"), 3200);
}

function bindGlobal() {
  $$(".nav-item").forEach((btn) => btn.addEventListener("click", () => navigate(btn.dataset.page)));
  $("#uploadBtn").addEventListener("click", () => navigate("upload"));
  $("#menuBtn").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
  $("#scrim").addEventListener("click", closeDrawer);

  $("#globalSearch").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      state.q = e.target.value;
      state.overdue = false;
      state.status = "all";
      state.service = "all";
      navigate("jobs");
    }
  });

  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      $("#globalSearch").focus();
      $("#globalSearch").select();
    }
    if (e.key === "Escape") {
      if ($("#drawer").classList.contains("on")) closeDrawer();
      else $("#sidebar").classList.remove("open");
    }
  });

  $("#drawer").addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act) return;
    if (act === "close-drawer") closeDrawer();
    if (act === "edit") { state.editing = true; renderDrawer(); $("#f-status")?.focus(); }
    if (act === "cancel-edit") { state.editing = false; renderDrawer(); }
    if (act === "save") saveEdit();
  });

  $("#drawer").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveEdit(); }
  });
}

/* ---------------- boot ---------------- */

async function boot() {
  try {
    const res = await fetch("data/jobs.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.jobs = data.jobs || [];
    try {
      const q = await fetch("data/quality.json");
      if (q.ok) state.quality = await q.json();
    } catch {}
    try {
      const tr = await fetch("data/transport.json");
      if (tr.ok) {
        const td = await tr.json();
        state.transport = td.rows || [];
      }
    } catch {}
    const params = new URLSearchParams(window.location.search);
    const pPage = params.get("page");
    if (pPage && PAGE_META[pPage]) state.page = pPage;
    bindGlobal();
    render();
    const pJob = params.get("job");
    if (pJob) openDrawer(pJob);
    if (params.get("edit") === "1" && state.selected) {
      state.editing = true;
      renderDrawer();
    }
    $("#loading")?.remove();
  } catch (error) {
    $("#loading")?.remove();
    $("#view").innerHTML = `<section class="panel" style="margin-top:8px">
      <div class="panel-head"><h2 class="panel-title">โหลดข้อมูลไม่ได้</h2><span class="panel-meta">PROTOTYPE</span></div>
      <div class="panel-body" style="padding:28px">
        <p style="margin:0 0 10px;font-size:13px">เปิดไฟล์ผ่าน local server เพื่อให้โหลด <span class="mono">data/jobs.json</span> ได้</p>
        <pre class="mono" style="background:var(--ink);color:#fff;padding:12px;font-size:11px;overflow:auto">cd design
python -m http.server 8080</pre>
        <p style="margin:12px 0 0;font-size:11px;color:var(--muted)">แล้วเปิด http://localhost:8080 · ${esc(error.message)}</p>
      </div>
    </section>`;
  }
}

boot();
