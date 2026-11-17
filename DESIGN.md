---
name: Perkin Logistics Control Deck — FWD & Customs Operations Hub
description: Architectural freight manifest and port control ledger built with Next.js 14 + TypeScript + Tailwind CSS for Perkin Logistics (Thailand) Co., Ltd., uniting FWD uploads, OneDrive Excel (Graph API), and real-time web operations.
colors:
  primary: "#f56a22"
  primary-deep: "#db5610"
  primary-soft: "#fff1e8"
  perkin-navy: "#071a2f"
  perkin-navy-mid: "#0c2948"
  perkin-royal-blue: "#073766"
  perkin-sky: "#5288b6"
  perkin-cream: "#f7f5ef"
  perkin-cream-2: "#f1ede4"
  surface: "#ffffff"
  border-hairline: "#dce1e5"
  border-strong: "#c5ced6"
  text-ink: "#102238"
  text-muted: "#526275"
  text-subtle: "#6e7e91"
  status-emerald: "#0d7a5f"
  status-emerald-soft: "#e5f6f0"
  status-amber: "#b45309"
  status-amber-soft: "#faeedd"
  status-crimson: "#d82936"
  status-crimson-soft: "#fae7e4"
  status-cobalt: "#073766"
  status-cobalt-soft: "#eaf4fc"
typography:
  display:
    fontFamily: "\"Manrope\", \"IBM Plex Sans Thai\", sans-serif"
    fontSize: "34px"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "\"Manrope\", \"IBM Plex Sans Thai\", sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  title:
    fontFamily: "\"IBM Plex Sans Thai\", \"Manrope\", sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.005em"
  body:
    fontFamily: "\"IBM Plex Sans Thai\", \"Manrope\", sans-serif"
    fontSize: "14.5px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "\"IBM Plex Mono\", \"Consolas\", monospace"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.08em"
rounded:
  sm: "4px"
  md: "6px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "38px"
  button-primary-hover:
    backgroundColor: "{colors.primary-deep}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-ink}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "38px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "34px"
---

# Design System: Perkin Logistics Control Deck — FWD & Customs Operations Hub

## Overview

**Creative North Star: "Perkin Logistics — The Maritime Freight Manifest & Port Control Ledger"**

Perkin Logistics Control Deck is engineered specifically for **Perkin Logistics (Thailand) Co., Ltd.** (`https://www.perkin-logistics.com/`) using **Next.js 14 (App Router), React 18, TypeScript, and Tailwind CSS**. Designed for operations managers, customs clearance teams, customer service officers, and shipping/accounting coordinators, the system translates Perkin Logistics' corporate identity—Deep Maritime Navy (`#071a2f` / `#0c2948`), Royal Blue (`#073766`), Signal Orange (`#f56a22`), and Warm Manifest Cream (`#f7f5ef`)—into a high-legibility operational workstation.

To ensure zero eye strain across 989+ jobs and 549+ transport trips, all Thai copy uses **`IBM Plex Sans Thai`** (a modern looped Thai typeface with generous x-height and clear vowel/tone separation) at a comfortable `14.5px` base size (`1.55` line-height), paired with **`Manrope`** (the display typeface from `perkin-logistics.com`) and **`IBM Plex Mono`** (`tabular-nums`) for job numbers, B/L codes, dates, and financial figures.

**Key Characteristics:**
- **Authentic Perkin Logistics Brand Identity:** Deep Maritime Navy (`#071a2f`) 264px command rail featuring Perkin's signature skewed orange `P` emblem (`border: 3px solid #f56a22; transform: skew(-7deg)`) alongside the official Perkin Logistics Thailand emblem (`perkin-logo.png`).
- **Effortless Thai Readability (`IBM Plex Sans Thai`):** Looped Thai typography at `14.5px` base size prevents character confusion (`ค/ด`, `พ/ผ`, `ป/บ`) during rapid customs and shipping document verification.
- **Maintainable Framework Architecture:** Built with Next.js 14 App Router (`src/app`), typed data models (`src/types/dashboard.ts`), server-side data persistence (`src/lib/data-store.ts`), and REST API endpoints (`/api/dashboard`, `/api/jobs/[jobNo]`, `/api/uploads`).
- **Excel-First Writeback Transparency:** Every edit drawer and FWD upload screen communicates the v0.3.1 contract: write to OneDrive Excel via Microsoft Graph API first, then commit to PostgreSQL + Audit Log.

## Colors

### Primary (Perkin Signal Orange)
- **Perkin Signal Orange** (`#f56a22`): Primary CTA buttons (`อัปโหลด FWD`, `บันทึก → Excel + Web`), the skewed `P` brand mark, active navigation indicators, and Sea Export (`SEA-EXP`) service coding.
- **Perkin Orange Deep** (`#db5610`): Hover and active state for primary buttons.
- **Perkin Orange Soft** (`#fff1e8`): Tinted badge fill for active jobs in progress (`กำลังดำเนินการ`) and highlighted workflow steps.

### Secondary (Perkin Maritime Navy & Royal Blue)
- **Perkin Maritime Navy** (`#071a2f`): Primary left navigation rail and dark structural headers.
- **Perkin Navy Mid** (`#0c2948`): Active navigation row fill and sidebar sync status cards.
- **Perkin Royal Blue** (`#073766` / soft `#eaf4fc`): Sea Import (`SEA-IMP`) service coding, `Job Waiting` (`รอเอกสาร`) badges, and secondary brand accents from the official Perkin logo.

### Tertiary (Operational Status)
- **Customs Cleared Emerald** (`#0d7a5f` / soft `#e5f6f0`): Completed jobs (`เสร็จสิ้น`), Air Import (`AIR-IMP`) service coding, and OneDrive Excel sync health indicators.
- **Customs Control Amber** (`#b45309` / soft `#faeedd`): Pending shipping advances and data-health warnings.
- **Perkin Alert Red** (`#d82936` / soft `#fae7e4`): Overdue ETD alerts, overdue advance clearing (`> 5 วัน`), and validation errors.

### Neutral (Perkin Manifest Cream & Ledger Sheets)
- **Perkin Manifest Cream** (`#f7f5ef`) & **Warm Sand** (`#f1ede4`): Root workspace background from `perkin-logistics.com`, reducing glare under office lighting.
- **Ledger Sheet White** (`#ffffff`): Crisp surface for KPI cards, data tables, topbar, and the slide-over inspection drawer.
- **Ledger Hairline** (`#dce1e5`) & **Strong Rule** (`#c5ced6`): 1px structural borders dividing KPI cells, table rows, panel headers, and form inputs.
- **Perkin Ink** (`#102238`), **Muted Slate** (`#526275`), & **Subtle Slate** (`#6e7e91`): High-contrast text hierarchy tuned for WCAG AA/AAA readability.

### Named Rules
**The Looped Thai Legibility Rule.** All Thai operational copy, customer names, and form labels use `IBM Plex Sans Thai` (with loops) at `14px–15px` with `1.55` line-height so staff can distinguish similar Thai characters effortlessly during long shifts.
**The Tabular Identifier Rule.** Every Job No, Transport No (`TS26070003`), Advance No (`AV26070112`), B/L number, date, day count, and currency value must use `IBM Plex Mono` with `font-variant-numeric: tabular-nums`.
**The Perkin Brand Discipline Rule.** Perkin Signal Orange (`#f56a22`) is reserved for the brand emblem, primary CTAs, and active workflow highlights; Cleared Emerald (`#0d7a5f`), Royal Blue (`#073766`), and Alert Red (`#d82936`) signal operational state.

## Typography

**Display & Brand Font:** `Manrope` (600, 700, 800) + `IBM Plex Sans Thai`
**UI & Body Font:** `IBM Plex Sans Thai` (400, 500, 600, 700)
**Monospace / Tabular Font:** `IBM Plex Mono` (400, 500, 600)

### Hierarchy
- **Display** (`800`, `34px`, `line-height: 1.05`, `letter-spacing: -0.03em`): Top-level KPI numerals in the 4-column summary strip (`tabular-nums`).
- **Headline** (`700`, `20px`, `line-height: 1.25`, `letter-spacing: -0.015em`): Topbar page title (`ภาพรวมปฏิบัติการ (Overview)`, `รายการใบงานทั้งหมด`) and drawer Job No header (`22px` mono).
- **Title** (`600`, `15px`, `line-height: 1.35`): Panel headers (`สัดส่วนงานตามประเภทบริการ`, `งานที่ต้องเร่งติดตาม`).
- **Body** (`400–500`, `14.5px`, `line-height: 1.55`): Default interface copy, table cells (`14px`), and form controls (`14px`).
- **Label** (`500`, `11px`, `letter-spacing: 0.08em`, `uppercase`): Monospace table headers, KPI labels, and service chips (`SEA-IMP`).

## Layout & Framework Structure

The Next.js 14 application (`c:\Users\User\Desktop\n8n\dashboard`) uses a responsive two-column shell (`264px` fixed Perkin Navy sidebar + `1fr` fluid workspace) with a sticky `72px` topbar (`px-6`).

- `src/app/layout.tsx`: Root HTML shell, Perkin Logistics metadata, self-hosted font stylesheet (`/fonts/fonts.css`), and the HTML direction contract comment.
- `src/app/page.tsx`: Server Component loading initial jobs, transport, advances, and quality metrics from `src/lib/data-store.ts` with URL query support (`?page=`, `?job=`, `?edit=`).
- `src/components/DashboardClient.tsx`: Modular client workspace implementing all 7 operational views (`overview`, `jobs`, `transport`, `advances`, `upload`, `health`, `settings`) and the slide-over Job Inspection & Excel-First Edit Drawer.
- `src/app/api/jobs/[jobNo]/route.ts`: `PATCH` endpoint that validates edits, simulates/executes the Excel-First writeback, persists changes to `data/jobs.json`, and appends an audit log entry.

## Do's and Don'ts

### Do:
- **Do** keep `IBM Plex Sans Thai` at `≥ 14px` for body table cells and form controls so Thai vowel/tone marks remain crystal clear.
- **Do** keep `IBM Plex Mono` (`tabular-nums`) on all job identifiers, B/L codes, dates, row numbers, and financial figures.
- **Do** surface data provenance and Excel sync state (`OneDrive Excel Synced`, source sheet, and row number) so operators trust that Web and Excel match 100%.

### Don't:
- **Don't** use tiny (`< 11px`) loopless Thai fonts that cause eye strain in dense operational tables.
- **Don't** add eyebrow/kicker text above headings in headers or drawers.
- **Don't** use multi-pixel colored left borders (`border-l-4`) on cards or navigation items.
