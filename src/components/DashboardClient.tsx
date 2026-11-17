"use client";

/**
 * ============================================================================
 * PERKIN LOGISTICS DASHBOARD — MAIN CLIENT ORCHESTRATOR
 * ============================================================================
 * ไฟล์คอมโพเนนต์หลักที่ทำหน้าที่เป็น Orchestrator ควบคุมหน้าจอทั้งหมดของ Dashboard
 * 
 * สถาปัตยกรรมและการแบ่งโมดูล (Component Architecture):
 * 1. OverviewView: ภาพรวม KPI, สัดส่วนบริการ 5 หมวด, กราฟแนวโน้ม, และคิวงานค้าง
 * 2. JobsTable: ตารางงานทั้งหมด ค้นหา กรองเดือน กรองบริการ กรองสถานะ และ Pagination
 * 3. TransportTable: ตารางเดินรถในประเทศ แยกขนาดตู้ 40' HC/DC, 20' DC, รถบรรทุก
 * 4. SafetyRecoveryView: ระบบความปลอดภัย สำรอง Snapshot กู้คืน และตรวจจับจุดกรอกผิด
 * 5. JobDrawer: หน้าต่างสไลด์ดูรายละเอียด e-Customs 0409 และแก้ไขข้อมูล Web-to-Excel
 * 
 * การเชื่อมต่อข้อมูลแบบ Real-time:
 * - Silent Auto-polling: ดึงข้อมูลสดจาก SharePoint ทุกๆ 15 วินาที ผ่าน `/api/sync`
 * - Two-Way Web-to-Excel Sync: เมื่อแก้ไขใน JobDrawer ข้อมูลจะถูกเขียนลง Excel
 *   บน OneDrive ตรงแถวของงานนั้นผ่าน Microsoft Graph API
 * ============================================================================
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  JobRecord,
  TransportRecord,
  QualityReport,
  AdvanceRecord,
  QualityAlertsReport,
  SnapshotManifestEntry,
} from "@/types/dashboard";
import { fmtNum, fmtDate } from "@/lib/dashboard-helpers";

// นำเข้าคอมโพเนนต์ย่อยที่แยกส่วนไว้ในโฟลเดอร์ src/components/dashboard/
import OverviewView from "./dashboard/OverviewView";
import JobsTable from "./dashboard/JobsTable";
import TransportTable from "./dashboard/TransportTable";
import SafetyRecoveryView from "./dashboard/SafetyRecoveryView";
import JobDrawer from "./dashboard/JobDrawer";
import { StagingUploadView } from "./dashboard/StagingUploadView";

import {
  LayoutDashboard,
  Briefcase,
  Truck,
  Wallet,
  UploadCloud,
  ShieldCheck,
  Menu,
  Search,
  RefreshCw,
  FileSpreadsheet,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";

/* ============================================================================
 * 1. TYPES & PAGE METADATA CONFIGURATION
 * ============================================================================ */
type PageKey =
  | "overview"
  | "jobs"
  | "transport"
  | "advances"
  | "upload"
  | "safety";

const PAGE_META: Record<PageKey, { title: string; sub: string }> = {
  overview: {
    title: "ภาพรวมงานปฏิบัติการ",
    sub: "ศูนย์ควบคุมชิปเมนท์ การเดินเรือ เที่ยวบิน และงานรถขนส่งในประเทศ",
  },
  jobs: {
    title: "ทะเบียนงานชิปเมนท์",
    sub: "สถานะงานนำเข้า-ส่งออกทางเรือ ทางอากาศ และเฟรท ประจำปี 2026",
  },
  transport: {
    title: "ตารางเดินรถในประเทศ",
    sub: "สถานะตู้คอนเทนเนอร์ 20'/40' และรถบรรทุกขนส่งสินค้า",
  },
  advances: {
    title: "บันทึกเงินทดรองจ่าย",
    sub: "ติดตามค่าใช้จ่ายหน้างาน ค่าธรรมเนียมท่าเรือ และรอบเคลียร์บัญชี",
  },
  upload: {
    title: "นำเข้าและประมวลผลไฟล์",
    sub: "ระบบผสานข้อมูลอัจฉริยะจากรายงาน FWD และ e-Customs เข้าสู่ฐานข้อมูลหลัก",
  },
  safety: {
    title: "ระบบสำรองและกู้คืนข้อมูล",
    sub: "ประวัติการซิงก์ จุดสำรองข้อมูล และการจัดการกู้คืนข้อมูล",
  },
};

interface DashboardClientProps {
  /** รายการงานทั้งหมดเริ่มต้นที่โหลดจาก Server Components */
  initialJobs: JobRecord[];
  /** รายการเที่ยวรถเริ่มต้น */
  initialTransport: TransportRecord[];
  /** สรุปรายงานคุณภาพข้อมูล */
  quality: QualityReport;
  /** รายการเงินทดรองจ่ายเริ่มต้น */
  initialAdvances: AdvanceRecord[];
  /** รายงานข้อผิดพลาดที่ตรวจจับได้ */
  initialQualityAlerts?: QualityAlertsReport;
  /** ประวัติ Snapshot สำหรับกู้คืน */
  initialSnapshots?: SnapshotManifestEntry[];
  /** หน้าที่ต้องการให้แสดงเป็นหน้าแรก */
  initialPage?: PageKey;
  /** รหัส Job No ที่ต้องการเปิด Drawer ทันที (ถ้ามี) */
  initialJobNo?: string;
  /** เปิดโหมดแก้ไขทันทีหรือไม่ */
  initialEdit?: boolean;
}

export default function DashboardClient({
  initialJobs,
  initialTransport,
  quality,
  initialAdvances,
  initialQualityAlerts,
  initialSnapshots,
  initialPage = "overview",
  initialJobNo,
  initialEdit = false,
}: DashboardClientProps) {
  /* ==========================================================================
   * 2. STATE MANAGEMENT (DATA STORES)
   * ========================================================================== */
  // หน้าปัจจุบันที่กำลังเปิด
  const [page, setPage] = useState<PageKey>(initialPage);

  // ข้อมูลงาน ชิปเมนท์ เที่ยวรถ และเงินทดรองจ่าย
  const [jobs, setJobs] = useState<JobRecord[]>(initialJobs);
  const [transport, setTransport] = useState<TransportRecord[]>(initialTransport);
  const [advances, setAdvances] = useState<AdvanceRecord[]>(initialAdvances);

  // ข้อมูลด้านความปลอดภัย และข้อผิดพลาดที่ระบบตรวจจับได้
  const [qualityAlerts, setQualityAlerts] = useState<QualityAlertsReport>(
    initialQualityAlerts || {
      summary: {
        dateSwapsCount: 0,
        crossSheetDupsCount: 0,
        unlinkedTransportCount: 0,
        hiddenSheetsCount: 0,
        totalAlerts: 0,
      },
      dateSwaps: [],
      crossSheetDuplicates: [],
      unlinkedTransport: [],
      hiddenSheets: [],
    }
  );
  const [snapshots, setSnapshots] = useState<SnapshotManifestEntry[]>(
    initialSnapshots || []
  );

  /* ==========================================================================
   * 3. STATE MANAGEMENT (UI CONTROLS & FILTERS)
   * ========================================================================== */
  // ควบคุมเมนู Sidebar บนมือถือ
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ตัวกรองเดือนส่วนกลาง (แชร์ระหว่าง Overview และ Jobs Table)
  const [monthFilter, setMonthFilter] = useState<string>("all");

  // ตัวเลือกส่งต่อการกรองเฉพาะงานเกินกำหนดจากหน้า Overview ไปยัง Jobs Table
  const [jobsOverdueOnly, setJobsOverdueOnly] = useState<boolean>(false);

  // คำค้นหาใน Top Search bar
  const [globalQ, setGlobalQ] = useState("");

  // รหัสงานที่เปิดใน Drawer (null หากปิด Drawer)
  const [selectedJobNo, setSelectedJobNo] = useState<string | null>(
    initialJobNo || null
  );

  // รหัสงานที่เพิ่งได้รับการอัปเดต (สำหรับแสดงแถบสีไฮไลต์ Flash Animation)
  const [highlightedJobNo, setHighlightedJobNo] = useState<string | null>(null);

  // Toast แจ้งเตือนความสำเร็จ/ข้อผิดพลาด
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // สถานะการซิงก์ข้อมูลแบบเรียลไทม์
  const [lastSynced, setLastSynced] = useState<Date>(new Date());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);

  // ตัวกรองของหน้าเงินทดรองจ่าย (Advances)
  const [advQ, setAdvQ] = useState("");
  const [advState, setAdvState] = useState("all");

  useEffect(() => {
    setMounted(true);
  }, []);

  // ค้นหา Job Record ที่กำลังเลือกเปิดดูใน Drawer
  const selectedJob = useMemo(
    () => jobs.find((j) => j.jobNo === selectedJobNo) || null,
    [jobs, selectedJobNo]
  );

  /* ==========================================================================
   * 4. KEYBOARD SHORTCUTS
   * คีย์ลัด ⌘K / Ctrl+K สำหรับโฟกัสช่องค้นหา และ Escape สำหรับปิด Drawer
   * ========================================================================== */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const input = document.getElementById("globalSearchInput");
        if (input) {
          input.focus();
          if ("select" in input) (input as HTMLInputElement).select();
        }
      }
      if (e.key === "Escape") {
        if (selectedJobNo) {
          setSelectedJobNo(null);
        } else {
          setSidebarOpen(false);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedJobNo]);

  /**
   * ฟังก์ชันแสดง Toast ข้อความแจ้งเตือนที่มุมขวาล่าง 4 วินาที
   */
  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  }

  /* ==========================================================================
   * 5. REAL-TIME DATA SYNCHRONIZATION
   * ซิงก์ข้อมูลสดจาก SharePoint Excel ผ่าน API Route
   * ========================================================================== */
  const handleSyncNow = async (silent = false) => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.jobs)) setJobs(data.jobs);
        if (Array.isArray(data.transport)) setTransport(data.transport);
        if (Array.isArray(data.advances)) setAdvances(data.advances);
        if (data.qualityAlerts) setQualityAlerts(data.qualityAlerts);
        if (Array.isArray(data.snapshots)) setSnapshots(data.snapshots);
        setLastSynced(new Date());
        if (!silent) {
          showToast(
            `ซิงก์ข้อมูลสดจาก SharePoint สำเร็จ (${
              data.totalJobs || data.jobs.length
            } งาน)`
          );
        }
      }
    } catch {
      if (!silent) {
        showToast("ไม่สามารถเชื่อมต่อระบบซิงก์ข้อมูลได้ในขณะนี้");
      }
    } finally {
      setIsSyncing(false);
    }
  };

  /**
   * เมื่อแก้ไขข้อมูลใน Drawer สำเร็จ ให้อัปเดตข้อมูลใน State ของระบบทันที
   * พร้อมเปิด Flash Highlight ให้แถวงานในตาราง
   */
  const handleJobUpdated = (updatedJob: JobRecord) => {
    setJobs((prev) =>
      prev.map((j) => (j.jobNo === updatedJob.jobNo ? updatedJob : j))
    );
    setHighlightedJobNo(updatedJob.jobNo);
    setTimeout(() => {
      setHighlightedJobNo((curr) => (curr === updatedJob.jobNo ? null : curr));
    }, 2500);
  };

  /* ==========================================================================
   * 7. RENDER MAIN SHELL & ROUTER
   * ========================================================================== */
  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] bg-[#f5f6f8] text-[#102238]">
      {/* --------------------------------------------------------------------
       * SIDEBAR NAVIGATION (Perkin Navy Theme #071a2f)
       * -------------------------------------------------------------------- */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-[260px] bg-[#071a2f] text-white flex flex-col justify-between border-r border-white/10 transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="p-5">
          {/* โลโก้บริษัท */}
          <div className="pb-5 border-b border-white/10">
            <div className="flex items-center gap-2">
              <div className="bg-white rounded-[7px] px-3 py-1.5 shadow-sm inline-flex items-center">
                <img
                  src="/assets/perkin-logo.png"
                  alt="Perkin Logistics"
                  height={28}
                  style={{ height: "28px", maxHeight: "28px", width: "auto", objectFit: "contain" }}
                  className="h-7 w-auto object-contain"
                />
              </div>
            </div>
            <p className="text-[11.5px] font-medium text-[#bed0df] truncate mt-2.5">
              PERKIN LOGISTICS (THAILAND) CO.,LTD.
            </p>
          </div>

          {/* รายการเมนูหลัก 6 ส่วน */}
          <div className="mt-6 mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            ระบบปฏิบัติการ
          </div>
          <nav className="space-y-1" aria-label="เมนูหลัก">
            {[
              { id: "overview", label: "ภาพรวมงาน", icon: LayoutDashboard },
              { id: "jobs", label: "ทะเบียนชิปเมนท์", icon: Briefcase },
              { id: "transport", label: "ตารางเดินรถ", icon: Truck },
              { id: "advances", label: "เงินทดรองจ่าย", icon: Wallet },
              { id: "upload", label: "นำเข้าไฟล์ FWD", icon: UploadCloud },
              {
                id: "safety",
                label: "สำรองและกู้คืน",
                icon: ShieldCheck,
              },
            ].map((item) => {
              const Icon = item.icon;
              const active = page === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setPage(item.id as PageKey);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-[background-color,color] duration-150 cursor-pointer ${
                    active
                      ? "bg-[#0c2340] text-white shadow-xs border border-white/10"
                      : "text-slate-300 hover:bg-white/5 hover:text-white"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${active ? "text-[#f56a22]" : "text-slate-400"}`} />
                  <span className="truncate">{item.label}</span>
                  {active && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#f56a22]" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* --------------------------------------------------------------------
       * MAIN CONTENT AREA: HEADER + VIEWS
       * -------------------------------------------------------------------- */}
      <div className="min-w-0 flex flex-col">
        {/* Sticky Topbar */}
        <header className="sticky top-0 z-30 h-[72px] bg-white border-b border-slate-200/90 px-4 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 text-slate-800 hover:bg-slate-50 transition-colors"
              aria-label="เปิดเมนู"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-lg lg:text-xl font-bold text-[#0c2340] tracking-tight truncate">
                {PAGE_META[page].title}
              </h1>
              <p className="hidden sm:block text-xs text-slate-500 truncate mt-0.5">
                {PAGE_META[page].sub}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* กล่องค้นหาด่วน (Quick Global Search) */}
            <div className="hidden md:flex items-center relative w-[240px] xl:w-[280px] shrink-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
              <input
                id="globalSearchInput"
                type="search"
                aria-label="ค้นหาด่วนตาม Job No, ลูกค้า หรือ B/L"
                value={globalQ}
                onChange={(e) => {
                  setGlobalQ(e.target.value);
                  if (page !== "jobs") setPage("jobs");
                }}
                placeholder="ค้นหา Job No, ลูกค้า, B/L..."
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#f56a22] focus:ring-2 focus:ring-[#f56a22]/15 outline-none transition-[background-color,border-color,box-shadow] duration-150"
              />
            </div>

            {/* แสดงสถานะฐานข้อมูลระบบ */}
            <div className="hidden xl:flex items-center gap-2 px-3 h-9 rounded-lg bg-emerald-50/80 border border-emerald-200 text-emerald-800 text-xs font-semibold whitespace-nowrap shrink-0">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
              </span>
              <span suppressHydrationWarning>
                {page === "transport"
                  ? `รถขนส่งในประเทศ · ${fmtNum(transport.length)} เที่ยว`
                  : `ออนไลน์ · ${fmtNum(jobs.length)} ชิปเมนท์`}
              </span>
            </div>

            {/* ปุ่มกดรีเฟรชข้อมูล */}
            <button
              type="button"
              onClick={() => handleSyncNow(false)}
              disabled={isSyncing}
              aria-label="รีเฟรชข้อมูลจากไฟล์ระบบ"
              className="h-9 px-3.5 rounded-lg bg-[#f56a22] hover:bg-[#e05612] disabled:opacity-60 text-white font-semibold text-xs flex items-center gap-2 shadow-xs transition-[background-color] duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[#f56a22] btn-press"
              title="ประมวลผลข้อมูลล่าสุดจากไฟล์ในเครื่อง"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 shrink-0 ${isSyncing ? "animate-spin" : ""}`}
              />
              <span>{isSyncing ? "กำลังซิงก์..." : "รีเฟรชข้อมูล"}</span>
            </button>

            {/* ปุ่มดาวน์โหลดไฟล์ Master Excel เพื่อนำไปอัปเดตบน SharePoint */}
            <a
              href="/api/export"
              download="2026_Booking_Report_Latest.xlsx"
              aria-label="ดาวน์โหลดไฟล์ 2026 Booking Report ล่าสุดเพื่อนำไปอัปเดตบน SharePoint"
              className="hidden sm:flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-[background-color,border-color] duration-150 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[#0d7a5f] btn-press shadow-2xs"
              title="ดาวน์โหลดไฟล์ 2026 Booking Report ล่าสุดเพื่อนำไปอัปเดตบน SharePoint"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#0d7a5f]" />
              <span>ส่งออก Excel</span>
            </a>

            {/* ทางลัดไปหน้าอัปโหลดไฟล์ FWD */}
            <button
              type="button"
              onClick={() => setPage("upload")}
              aria-label="เปิดหน้าต่างอัปโหลดไฟล์ FWD และใบขน"
              className={`h-9 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-[background-color,border-color,color] duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[#0c2948] btn-press ${
                page === "upload"
                  ? "bg-[#0c2948] border-[#0c2948] text-white shadow-xs"
                  : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700 shadow-2xs"
              }`}
              title="โยนไฟล์รายงาน FWD เพื่ออัปเดตอัตโนมัติ"
            >
              <UploadCloud className="w-4 h-4 text-[#f56a22]" />
              <span>อัปโหลด FWD</span>
            </button>
          </div>
        </header>

        {/* ------------------------------------------------------------------
         * PAGE BODY: RENDER DYNAMIC VIEW ACCORDING TO ACTIVE PAGE
         * ------------------------------------------------------------------ */}
        <main className="p-4 lg:p-8 max-w-[1600px] w-full mx-auto">
          <div key={page} className="animate-view-in space-y-6">
            {/* VIEW 1: EXECUTIVE OVERVIEW */}
            {page === "overview" && (
              <OverviewView
                jobs={jobs}
                transport={transport}
                monthFilter={monthFilter}
                setMonthFilter={setMonthFilter}
                onSelectJobNo={(jobNo) => setSelectedJobNo(jobNo)}
                onNavigateJobs={(overdueOnly) => {
                  setJobsOverdueOnly(Boolean(overdueOnly));
                  setPage("jobs");
                }}
              />
            )}

            {/* VIEW 2: ALL SHIPMENTS TABLE */}
            {page === "jobs" && (
              <JobsTable
                jobs={jobs}
                monthFilter={monthFilter}
                setMonthFilter={setMonthFilter}
                onSelectJobNo={(jobNo) => setSelectedJobNo(jobNo)}
                initialOverdueOnly={jobsOverdueOnly}
                highlightedJobNo={highlightedJobNo}
              />
            )}

          {/* VIEW 3: INLAND TRANSPORT FLEET */}
          {page === "transport" && (
            <TransportTable
              transport={transport}
              onSelectJobNo={(jobNo) => setSelectedJobNo(jobNo)}
            />
          )}

          {/* VIEW 4: SHIPPING ADVANCES & CLEARING */}
          {page === "advances" && (
            <section className="bg-white rounded-[8px] border border-[#dce2e8] overflow-hidden">
              <div className="p-4 border-b border-[#dce2e8] flex flex-wrap items-center gap-3">
                <div className="relative w-full sm:w-[280px]">
                  <Search className="w-4 h-4 text-[#6e7e91] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    aria-label="ค้นหาตาม Adv No, Job No หรือผู้รับเงิน"
                    value={advQ}
                    onChange={(e) => setAdvQ(e.target.value)}
                    placeholder="ค้นหา Adv No, Job No, ผู้รับเงิน…"
                    className="w-full h-9 pl-9 pr-3 rounded-[6px] border border-[#c5cfd9] text-[13.5px] outline-none focus:border-[#f56a22]"
                  />
                </div>
                <div className="inline-flex rounded-[6px] border border-[#c5cfd9] overflow-hidden text-[12.5px] font-medium">
                  {[
                    ["all", "ทั้งหมด"],
                    ["overdue", "เกินกำหนด (>5 วัน)"],
                    ["pending", "รอเคลียร์"],
                    ["cleared", "เคลียร์แล้ว"],
                  ].map(([k, label]) => (
                    <button
                      key={k}
                      onClick={() => setAdvState(k)}
                      className={`px-3 h-9 border-l first:border-l-0 border-[#dce2e8] ${
                        advState === k
                          ? "bg-[#071a2f] text-white"
                          : "bg-white text-[#526275] hover:bg-slate-50"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead>
                    <tr className="bg-[#f5f6f8] border-b border-[#dce2e8] text-[11.5px] font-semibold uppercase tracking-wider text-[#526275]">
                      <th className="py-3 px-4">Adv. No</th>
                      <th className="py-3 px-3">Job No</th>
                      <th className="py-3 px-4">ผู้รับเงิน / Shipping</th>
                      <th className="py-3 px-4">ลูกค้า</th>
                      <th className="py-3 px-3">วันที่เบิก</th>
                      <th className="py-3 px-4 text-right">ยอดเบิก (฿)</th>
                      <th className="py-3 px-3">Clearing No</th>
                      <th className="py-3 px-3">สถานะ</th>
                      <th className="py-3 px-4">หมายเหตุ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#dce2e8] text-[13.5px]">
                    {advances
                      .filter((r) => {
                        if (advState !== "all" && r.state !== advState)
                          return false;
                        if (advQ.trim()) {
                          const low = advQ.toLowerCase();
                          return [
                            r.advNo,
                            r.jobNo,
                            r.customer,
                            r.payTo,
                            r.clearNo,
                          ].some((v) =>
                            String(v || "")
                              .toLowerCase()
                              .includes(low)
                          );
                        }
                        return true;
                      })
                      .map((r) => (
                        <tr
                          key={r.advNo}
                          tabIndex={0}
                          role="button"
                          aria-label={`เปิดดูงาน ${r.jobNo} ของเงินทดรองจ่าย ${r.advNo}`}
                          onClick={() => {
                            if (jobs.some((j) => j.jobNo === r.jobNo)) {
                              setSelectedJobNo(r.jobNo);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              if (jobs.some((j) => j.jobNo === r.jobNo)) {
                                setSelectedJobNo(r.jobNo);
                              }
                            }
                          }}
                          className="hover:bg-slate-50 cursor-pointer focus-visible:outline-none focus-visible:bg-slate-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#073766]"
                        >
                          <td className="py-3 px-4 font-mono font-semibold text-[#073766] whitespace-nowrap">
                            {r.advNo}
                          </td>
                          <td className="py-3 px-3 font-mono text-xs whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded border border-[#c5cfd9] bg-white whitespace-nowrap">
                              {r.jobNo}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-medium text-[#102238] whitespace-nowrap">
                            {r.payTo}
                          </td>
                          <td className="py-3 px-4 text-[#526275] max-w-[220px] truncate">
                            {r.customer}
                          </td>
                          <td className="py-3 px-3 num text-[#526275] whitespace-nowrap">
                            {fmtDate(r.advDate)}
                          </td>
                          <td className="py-3 px-4 text-right num font-bold text-[#102238] whitespace-nowrap">
                            ฿{fmtNum(r.amount)}
                          </td>
                          <td className="py-3 px-3 font-mono text-xs text-[#526275] whitespace-nowrap">
                            {r.clearNo}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded whitespace-nowrap ${
                                r.state === "cleared"
                                  ? "bg-[#e6f5f0] text-[#0d7a5f]"
                                  : r.state === "overdue"
                                  ? "bg-[#fdecec] text-[#c9252d]"
                                  : "bg-[#fff1e8] text-[#b45309]"
                              }`}
                            >
                              {r.state === "cleared"
                                ? "เคลียร์แล้ว"
                                : r.state === "overdue"
                                ? `เกิน ${r.ageDays} วัน`
                                : `รอเคลียร์ (${r.ageDays} วัน)`}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-[#526275]">{r.note}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* VIEW 5: UPLOAD & AUTO-UPDATE PIPELINE (STAGING SANDBOX) */}
          {page === "upload" && (
            <StagingUploadView
              jobs={jobs}
              transport={transport}
              onApplyUpload={(updatedJobs, summaryText) => {
                setJobs(updatedJobs);
                setPage("overview");
                showToast(summaryText);
              }}
              onApplyTransportUpload={(updatedTransport, summaryText) => {
                setTransport(updatedTransport);
                setPage("transport");
                showToast(summaryText);
              }}
              onSyncNow={() => handleSyncNow()}
              showToast={showToast}
            />
          )}

          {/* VIEW 6: DATA SAFETY & RECOVERY */}
          {page === "safety" && (
            <SafetyRecoveryView
              qualityAlerts={qualityAlerts}
              snapshots={snapshots}
              isSyncing={isSyncing}
              onSyncNow={() => handleSyncNow(false)}
              onSelectJobNo={(jobNo) => setSelectedJobNo(jobNo)}
            />
          )}
        </div>
      </main>
    </div>

    {/* --------------------------------------------------------------------
     * SLIDE-OVER DRAWER FOR JOB INSPECTION & WEB-TO-EXCEL EDITING
     * -------------------------------------------------------------------- */}
    <JobDrawer
      selectedJob={selectedJob}
      onClose={() => setSelectedJobNo(null)}
      onJobUpdated={handleJobUpdated}
      showToast={showToast}
    />

    {/* --------------------------------------------------------------------
     * GLOBAL TOAST NOTIFICATION WITH SMOOTH SLIDE-UP & PROGRESS COUNTDOWN
     * -------------------------------------------------------------------- */}
    {toastMsg && (
      <div
        key={toastMsg}
        role="status"
        aria-live="polite"
        className="fixed bottom-5 right-5 z-50 bg-[#071a2f] text-white pl-4 pr-5 py-3 rounded-[10px] shadow-2xl border border-white/15 flex items-center gap-2.5 text-[13.5px] animate-toast-in overflow-hidden"
      >
        <span className="w-2.5 h-2.5 rounded-full bg-[#f56a22] animate-pulse shrink-0" />
        <span className="font-medium">{toastMsg}</span>
        <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-white/10 overflow-hidden">
          <div className="h-full bg-[#f56a22] animate-toast-progress" />
        </div>
      </div>
    )}
    </div>
  );
}
