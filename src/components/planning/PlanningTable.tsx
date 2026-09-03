"use client";

import { CSSProperties, DragEvent, FormEvent, PointerEvent, useMemo, useState } from "react";
import { InspectionActual, InspectionRule, OperationPlan, VehicleInspectionMaster, VehicleMaster } from "@/types/operation";
import styles from "./OperationTable.module.css";

const timeBands = {
  daytime: { label: "昼間 08:00 - 17:00", startTime: "08:00", endTime: "17:00" },
  dayNight: { label: "昼夜 08:00 - 24:00", startTime: "08:00", endTime: "24:00" },
  night: { label: "夜間 22:00 - 翌08:00", startTime: "22:00", endTime: "08:00" },
};
type TimeBand = keyof typeof timeBands;
type PlanEntry = OperationPlan & { departureBase: string; arrivalBase: string; timeBand: TimeBand };
type EditingCell = { date: string; base: string; planId?: string };
type ResizeState = { base: string; startX: number; startWidth: number };
type InspectionOverride = { machineNumber: string; dueDate: string; startDate: string; endDate: string; inspectionBase: string };
type InspectionEntry = VehicleInspectionMaster & { date: string; dueDate: string; startDate: string; endDate: string; inspectionType: string; inspectionDays: number };

type PlanningTableProps = { tenant: string; rows: OperationPlan[]; offices: string[]; bases: string[]; officeBases: Record<string, string[]>; vehicles: VehicleMaster[]; inspectionMasters: VehicleInspectionMaster[]; inspectionRules: InspectionRule[]; inspectionActuals: InspectionActual[] };

function initialPlans(rows: OperationPlan[]): PlanEntry[] {
  return rows.map((row, index) => {
    const storedRow = row as Partial<PlanEntry>;
    return {
    ...row,
    departureBase: storedRow.departureBase ?? ["大阪保守基地", "京都保守基地", "吹田保守基地"][index] ?? "大阪保守基地",
    arrivalBase: storedRow.arrivalBase ?? ["吹田保守基地", "京都保守基地", "神戸保守基地"][index] ?? "大阪保守基地",
    timeBand: storedRow.timeBand ?? (row.startTime.startsWith("22") ? "night" : "daytime"),
  };
  });
}

function nextDate(date: string) {
  const value = new Date(`${date.replaceAll("/", "-")}T00:00:00`);
  value.setDate(value.getDate() + 1);
  return `${value.getFullYear()}/${String(value.getMonth() + 1).padStart(2, "0")}/${String(value.getDate()).padStart(2, "0")}`;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date.replaceAll("/", "-")}T00:00:00`);
  value.setDate(value.getDate() + days);
  return `${value.getFullYear()}/${String(value.getMonth() + 1).padStart(2, "0")}/${String(value.getDate()).padStart(2, "0")}`;
}

function addMonths(date: string, months: number) {
  const value = new Date(`${date.replaceAll("/", "-")}T00:00:00`);
  value.setMonth(value.getMonth() + months);
  return `${value.getFullYear()}/${String(value.getMonth() + 1).padStart(2, "0")}/${String(value.getDate()).padStart(2, "0")}`;
}

function monthDaysFor(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const days = new Date(year, monthNumber, 0).getDate();
  return Array.from({ length: days }, (_, index) => `${year}/${String(monthNumber).padStart(2, "0")}/${String(index + 1).padStart(2, "0")}`);
}

function formatMonth(month: string) {
  const [year, monthNumber] = month.split("-");
  return `${year}年${Number(monthNumber)}月`;
}

function formatUpdatedAt(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function inspectionEntries(masters: VehicleInspectionMaster[], rules: InspectionRule[], actuals: InspectionActual[], overrides: InspectionOverride[], monthDays: string[]) {
  return masters.flatMap((master) => {
    const latestActual = actuals.filter((actual) => actual.machineNumber === master.machineNumber).sort((left, right) => right.completedDate.localeCompare(left.completedDate))[0];
    if (!latestActual) return [];
    const categoryRules = rules.filter((rule) => rule.category === master.category);
    const cycleLength = master.category === "軌道モーターカー" ? 96 : 36;
    const entries: InspectionEntry[] = [];
    let phaseMonths = latestActual.phaseMonths;
    let dueDate = latestActual.completedDate;
    while (dueDate <= monthDays[monthDays.length - 1]) {
      phaseMonths += master.category === "軌道モーターカー" ? 6 : 12;
      dueDate = addMonths(dueDate, master.category === "軌道モーターカー" ? 6 : 12);
      const normalizedPhase = ((phaseMonths - 1) % cycleLength) + 1;
      const rule = [...categoryRules].sort((left, right) => right.phaseMonths - left.phaseMonths).find((item) => normalizedPhase % item.intervalMonths === 0);
      if (!rule) continue;
      const override = overrides.find((item) => item.machineNumber === master.machineNumber && item.dueDate === dueDate);
      const startDate = override?.startDate ?? dueDate;
      const endDate = override?.endDate ?? addDays(dueDate, rule.inspectionDays - 1);
      const inspectionBase = override?.inspectionBase ?? master.inspectionBase;
      const inspectionDays = Math.round((new Date(`${endDate.replaceAll("/", "-")}T00:00:00`).getTime() - new Date(`${startDate.replaceAll("/", "-")}T00:00:00`).getTime()) / 86_400_000) + 1;
      for (let day = 0; day < inspectionDays; day += 1) {
        const date = addDays(startDate, day);
        if (monthDays.includes(date)) entries.push({ ...master, inspectionBase, date, dueDate, startDate, endDate, inspectionType: rule.inspectionType, inspectionDays });
      }
    }
    return entries;
  });
}

export function PlanningTable({ tenant, rows, offices, bases, officeBases, vehicles, inspectionMasters, inspectionRules, inspectionActuals }: PlanningTableProps) {
  const [plans, setPlans] = useState<PlanEntry[]>(() => initialPlans(rows));
  const [office, setOffice] = useState("すべて");
  const [vehicleQuery, setVehicleQuery] = useState("");
  const [baseQuery, setBaseQuery] = useState("すべて");
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [baseWidths, setBaseWidths] = useState<Record<string, number>>(() => Object.fromEntries(bases.map((base) => [base, 220])));
  const [baseOrder, setBaseOrder] = useState(bases);
  const [draggedBase, setDraggedBase] = useState<string | null>(null);
  const [draggedPlanId, setDraggedPlanId] = useState<string | null>(null);
  const [draggedInspection, setDraggedInspection] = useState<InspectionEntry | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [inspectionOverrides, setInspectionOverrides] = useState<InspectionOverride[]>([]);
  const [editingInspection, setEditingInspection] = useState<InspectionEntry | null>(null);
  const [inspectionForm, setInspectionForm] = useState({ startDate: "", endDate: "", inspectionBase: "" });
  const [displayMonth, setDisplayMonth] = useState("2026-09");
  const [updatedAt, setUpdatedAt] = useState<Date>(() => new Date());
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false);
  const [form, setForm] = useState({ vehicle: "MC-042", departureBase: "大阪保守基地", arrivalBase: "吹田保守基地", timeBand: "daytime" as TimeBand });

  const monthDays = useMemo(() => monthDaysFor(displayMonth), [displayMonth]);
  const inspections = useMemo(() => inspectionEntries(inspectionMasters, inspectionRules, inspectionActuals, inspectionOverrides, monthDays), [inspectionActuals, inspectionMasters, inspectionOverrides, inspectionRules, monthDays]);
  const managedBases = office === "すべて" ? bases : officeBases[office] ?? [];
  const shownBases = baseOrder.filter((base) => managedBases.includes(base) && (baseQuery === "すべて" || base === baseQuery));
  const shownPlans = plans.filter((plan) => {
    const vehicle = `${plan.model} ${plan.machineNumber}`.toLowerCase();
    return (office === "すべて" || plan.office === office) && vehicle.includes(vehicleQuery.toLowerCase());
  });

  function openEditor(date: string, base: string) {
    const overnightArrival = plans.find((plan) => nextDate(plan.date) === date && plan.arrivalBase === base && plan.timeBand === "night");
    setEditingCell({ date, base });
    setForm((current) => ({ ...current, vehicle: overnightArrival?.machineNumber ?? current.vehicle, departureBase: base }));
  }

  function editPlan(plan: PlanEntry) {
    setSelectedPlanId(plan.id);
    setEditingCell({ date: plan.date, base: plan.departureBase, planId: plan.id });
    setForm({ vehicle: plan.machineNumber, departureBase: plan.departureBase, arrivalBase: plan.arrivalBase, timeBand: plan.timeBand });
  }

  function deleteSelectedPlan() {
    if (!selectedPlanId) return;
    setSaveStatus("saving");
    void fetch(`/api/tenants/${encodeURIComponent(tenant)}/plans?id=${encodeURIComponent(selectedPlanId)}`, { method: "DELETE" }).then((response) => { setSaveStatus(response.ok ? "saved" : "unsaved"); window.dispatchEvent(new CustomEvent("operation-dirty-change", { detail: !response.ok })); }).catch(() => setSaveStatus("unsaved"));
    setPlans((current) => current.filter((plan) => plan.id !== selectedPlanId));
    setSelectedPlanId(null);
    setUpdatedAt(new Date());
  }

  function startResize(event: PointerEvent<HTMLButtonElement>, base: string) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizeState({ base, startX: event.clientX, startWidth: baseWidths[base] });
  }

  function resizeColumn(event: PointerEvent<HTMLButtonElement>) {
    if (!resizeState) return;
    const width = Math.min(500, Math.max(60, resizeState.startWidth + event.clientX - resizeState.startX));
    setBaseWidths((current) => ({ ...current, [resizeState.base]: width }));
  }

  function moveBase(targetBase: string) {
    if (!draggedBase || draggedBase === targetBase) return;
    setBaseOrder((current) => {
      const nextOrder = current.filter((base) => base !== draggedBase);
      nextOrder.splice(nextOrder.indexOf(targetBase), 0, draggedBase);
      return nextOrder;
    });
  }

  function movePlan(planId: string, date: string, departureBase: string) {
    const plan = plans.find((item) => item.id === planId);
    if (!plan) return;
    const movedPlan = { ...plan, date, departureBase };
      setSaveStatus("saving");
      void fetch(`/api/tenants/${encodeURIComponent(tenant)}/plans`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(movedPlan) }).then((response) => { setSaveStatus(response.ok ? "saved" : "unsaved"); window.dispatchEvent(new CustomEvent("operation-dirty-change", { detail: !response.ok })); }).catch(() => setSaveStatus("unsaved"));
    setPlans((current) => current.map((item) => item.id === planId ? movedPlan : item));
    setSelectedPlanId(planId);
    setUpdatedAt(new Date());
    setDraggedPlanId(null);
  }

  function moveInspection(inspection: InspectionEntry, startDate: string, inspectionBase: string) {
    const override: InspectionOverride = { machineNumber: inspection.machineNumber, dueDate: inspection.dueDate, startDate, endDate: addDays(startDate, inspection.inspectionDays - 1), inspectionBase };
    setInspectionOverrides((current) => [...current.filter((item) => !(item.machineNumber === override.machineNumber && item.dueDate === override.dueDate)), override]);
      setSaveStatus("unsaved");
      setSaveStatus("unsaved");
    setUpdatedAt(new Date());
    window.dispatchEvent(new CustomEvent("operation-dirty-change", { detail: true }));
    setDraggedInspection(null);
  }

  function editInspection(inspection: InspectionEntry) {
    setEditingInspection(inspection);
    setInspectionForm({ startDate: inspection.startDate.replaceAll("/", "-"), endDate: inspection.endDate.replaceAll("/", "-"), inspectionBase: inspection.inspectionBase });
  }

  function saveInspection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingInspection || inspectionForm.endDate < inspectionForm.startDate) return;
    const override: InspectionOverride = { machineNumber: editingInspection.machineNumber, dueDate: editingInspection.dueDate, startDate: inspectionForm.startDate.replaceAll("-", "/"), endDate: inspectionForm.endDate.replaceAll("-", "/"), inspectionBase: inspectionForm.inspectionBase };
    setInspectionOverrides((current) => [...current.filter((item) => !(item.machineNumber === override.machineNumber && item.dueDate === override.dueDate)), override]);
    setUpdatedAt(new Date());
    window.dispatchEvent(new CustomEvent("operation-dirty-change", { detail: true }));
    setEditingInspection(null);
  }

  function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingCell) return;
    const vehicle = vehicles.find((item) => item.machineNumber === form.vehicle) ?? vehicles[0];
    const band = timeBands[form.timeBand];
    const entry: PlanEntry = {
      id: editingCell.planId ?? `plan-${Date.now()}`,
      date: editingCell.date,
      office: vehicle.office,
      model: vehicle.model,
      machineNumber: vehicle.machineNumber,
      work: "運用計画",
      operator: "未設定",
      startTime: band.startTime,
      endTime: band.endTime,
      status: "planned",
      note: "",
      departureBase: form.departureBase,
      arrivalBase: form.arrivalBase,
      timeBand: form.timeBand,
    };
      setSaveStatus("saving");
      void fetch(`/api/tenants/${encodeURIComponent(tenant)}/plans`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) }).then((response) => { setSaveStatus(response.ok ? "saved" : "unsaved"); window.dispatchEvent(new CustomEvent("operation-dirty-change", { detail: !response.ok })); }).catch(() => setSaveStatus("unsaved"));
    setPlans((current) => [...current.filter((plan) => plan.id !== editingCell.planId && !(plan.date === entry.date && plan.machineNumber === entry.machineNumber)), entry]);
    setSelectedPlanId(entry.id);
    setUpdatedAt(new Date());
    setEditingCell(null);
  }

  function exportCsv() {
    const rows = [["日付", "保線作業所", "機種", "機械番号", "出発基地", "到着・帰着基地", "開始", "終了", "時間帯"], ...shownPlans.map((plan) => [plan.date, plan.office, plan.model, plan.machineNumber, plan.departureBase, plan.arrivalBase, plan.startTime, plan.endTime, timeBands[plan.timeBand].label])];
    const csv = rows.map((row) => row.map((value) => `"${value.replaceAll("\"", "\"\"")}"`).join(",")).join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    link.download = `${displayMonth}_運用計画.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return <>
    <section className={styles.filters} aria-label="運用計画の検索条件">
      <div className={styles.filterTitle}><strong>検索条件</strong><span>ログインテナント: 大鉄道</span></div>
      <label>保線作業所<select value={office} onChange={(event) => { setOffice(event.target.value); setBaseQuery("すべて"); }}><option>すべて</option>{offices.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>保守用車<input value={vehicleQuery} onChange={(event) => setVehicleQuery(event.target.value)} placeholder="機種・機械番号" list="planning-vehicle-list" /><datalist id="planning-vehicle-list">{vehicles.map((vehicle) => <option key={vehicle.machineNumber} value={`${vehicle.model} / ${vehicle.machineNumber}`} />)}</datalist></label>
      <label>保守基地<select value={baseQuery} onChange={(event) => setBaseQuery(event.target.value)}><option>すべて</option>{managedBases.map((item) => <option key={item}>{item}</option>)}</select></label>
    </section>

    <section className={styles.schedule} aria-label={`${formatMonth(displayMonth)} 運用計画表`}>
      <div className={styles.scheduleHeader}><div><p>{formatMonth(displayMonth)}</p><h2>運用計画管理表</h2><small>最終更新: {formatUpdatedAt(updatedAt)}</small></div><div className={styles.planActions}><label className={styles.monthControl}>表示年月<input type="month" value={displayMonth} onChange={(event) => setDisplayMonth(event.target.value)} /></label><span className={`${styles.saveStatus} ${styles[saveStatus]}`}>{saveStatus === "saving" ? "保存中" : saveStatus === "saved" ? "保存済み" : "未保存の変更あり"}</span><span>セルをダブルクリックして運用を登録</span><button type="button" onClick={() => { const plan = plans.find((item) => item.id === selectedPlanId); if (plan) editPlan(plan); }} disabled={!selectedPlanId}>選択を編集</button><button type="button" className={styles.deleteButton} onClick={deleteSelectedPlan} disabled={!selectedPlanId}>選択を削除</button><button type="button" onClick={exportCsv}>CSV出力</button><button type="button" className={styles.printButton} onClick={() => setIsPrintPreviewOpen(true)}>PDF出力</button></div></div>
      <div className={styles.legend}><span className={styles.legendPlan} />計画登録済み <span className={styles.legendInspection} />検修予定 <span>昼間 08:00 - 17:00</span><span>昼夜 08:00 - 24:00</span><span>夜間 22:00 - 翌08:00</span></div>
      <div className={styles.gridWrap}><table className={styles.scheduleTable} style={{ "--table-min-width": `${40 + shownBases.reduce((total, base) => total + baseWidths[base], 0)}px` } as CSSProperties}><colgroup><col className={styles.dateColumn} />{shownBases.map((base) => <col key={base} style={{ width: `${baseWidths[base]}px` }} />)}</colgroup><thead><tr><th className={styles.dateHeader}>日付</th>{shownBases.map((base) => <th key={base} className={draggedBase === base ? styles.dragging : ""} onDragOver={(event) => event.preventDefault()} onDrop={() => moveBase(base)}><span className={styles.baseHeader} draggable onDragStart={() => setDraggedBase(base)} onDragEnd={() => setDraggedBase(null)}>{base}</span><button type="button" className={styles.resizeHandle} aria-label={`${base}の列幅を調整`} title="ドラッグして列幅を調整" onPointerDown={(event) => startResize(event, base)} onPointerMove={resizeColumn} onPointerUp={() => setResizeState(null)} onPointerCancel={() => setResizeState(null)} /></th>)}</tr></thead>
        <tbody>{monthDays.map((date) => <tr key={date}><th scope="row"><strong>{date.slice(-2)}</strong><span>{["日", "月", "火", "水", "木", "金", "土"][new Date(`${date.replaceAll("/", "-")}T00:00:00`).getDay()]}</span></th>{shownBases.map((base) => {
          const departures = shownPlans.filter((plan) => plan.date === date && plan.departureBase === base);
          const arrivals = shownPlans.filter((plan) => nextDate(plan.date) === date && plan.arrivalBase === base && plan.timeBand === "night");
          const baseInspections = inspections.filter((inspection) => inspection.date === date && inspection.inspectionBase === base);
          return <td key={base} onDoubleClick={() => openEditor(date, base)} onDragOver={(event) => event.preventDefault()} onDrop={(event: DragEvent<HTMLTableCellElement>) => { event.preventDefault(); if (draggedPlanId) movePlan(draggedPlanId, date, base); if (draggedInspection) moveInspection(draggedInspection, date, base); }}>{baseInspections.map((inspection) => <button type="button" className={styles.inspection} key={`${inspection.machineNumber}-${inspection.date}`} draggable onDragStart={() => setDraggedInspection(inspection)} onDragEnd={() => setDraggedInspection(null)} onClick={(event) => { event.stopPropagation(); editInspection(inspection); }}><b>{inspection.inspectionType} {inspection.date === inspection.startDate ? "開始" : "継続"}</b><strong>{inspection.model} / {inspection.machineNumber}</strong><span>{inspection.startDate} - {inspection.endDate} / {inspection.inspectionBase}</span></button>)}{arrivals.map((plan) => <div className={styles.nextDay} key={`${plan.id}-arrival`}>{plan.departureBase === plan.arrivalBase ? `翌日留置 ${plan.model} / ${plan.machineNumber}` : `夜間作業翌日 ${plan.model} / ${plan.machineNumber} 帰着`}</div>)}{departures.map((plan) => <button type="button" className={`${styles.plan} ${selectedPlanId === plan.id ? styles.selectedPlan : ""}`} key={plan.id} draggable onDragStart={() => setDraggedPlanId(plan.id)} onDragEnd={() => setDraggedPlanId(null)} onClick={(event) => { event.stopPropagation(); setSelectedPlanId(plan.id); }} onDoubleClick={(event) => { event.stopPropagation(); editPlan(plan); }}><b>{plan.model}</b><strong>{plan.machineNumber}</strong><span>{plan.startTime} - {plan.endTime}</span>{plan.departureBase !== plan.arrivalBase && <small>{plan.departureBase} -&gt; {plan.arrivalBase}</small>}</button>)}</td>;
        })}</tr>)}</tbody></table></div>
    </section>

    {editingCell && <div className={styles.dialogBackdrop} role="presentation" onMouseDown={() => setEditingCell(null)}><form className={styles.dialog} onSubmit={savePlan} onMouseDown={(event) => event.stopPropagation()}>
      <div className={styles.dialogHeader}><div><p>{editingCell.planId ? "運用計画を修正" : "運用計画を入力"}</p><h2>{editingCell.date} / {editingCell.base}</h2></div><button type="button" className={styles.closeButton} aria-label="閉じる" onClick={() => setEditingCell(null)}>×</button></div>
      <label>保守用車<select value={form.vehicle} onChange={(event) => setForm({ ...form, vehicle: event.target.value })}>{vehicles.map((vehicle) => <option value={vehicle.machineNumber} key={vehicle.machineNumber}>{vehicle.model} / {vehicle.machineNumber}</option>)}</select></label>
      <div className={styles.formRow}><label>出発基地<select value={form.departureBase} onChange={(event) => setForm({ ...form, departureBase: event.target.value })}>{bases.map((base) => <option key={base}>{base}</option>)}</select></label><label>到着・帰着基地<select value={form.arrivalBase} onChange={(event) => setForm({ ...form, arrivalBase: event.target.value })}>{bases.map((base) => <option key={base}>{base}</option>)}</select></label></div>
      <fieldset><legend>時間帯</legend>{(Object.keys(timeBands) as TimeBand[]).map((band) => <label className={styles.radio} key={band}><input type="radio" name="timeBand" checked={form.timeBand === band} onChange={() => setForm({ ...form, timeBand: band })} />{timeBands[band].label}</label>)}</fieldset>
      <div className={styles.dialogActions}><button type="button" className={styles.cancelButton} onClick={() => setEditingCell(null)}>キャンセル</button><button type="submit" className={styles.saveButton}>{editingCell.planId ? "計画を更新" : "計画を登録"}</button></div>
    </form></div>}
    {editingInspection && <div className={styles.dialogBackdrop} role="presentation" onMouseDown={() => setEditingInspection(null)}><form className={styles.dialog} onSubmit={saveInspection} onMouseDown={(event) => event.stopPropagation()}>
      <div className={styles.dialogHeader}><div><p>検修予定を修正</p><h2>{editingInspection.inspectionType} / {editingInspection.model} / {editingInspection.machineNumber}</h2></div><button type="button" className={styles.closeButton} aria-label="閉じる" onClick={() => setEditingInspection(null)}>×</button></div>
      <div className={styles.formRow}><label>検修開始日<input type="date" value={inspectionForm.startDate} onChange={(event) => setInspectionForm({ ...inspectionForm, startDate: event.target.value })} required /></label><label>検修終了日<input type="date" value={inspectionForm.endDate} min={inspectionForm.startDate} onChange={(event) => setInspectionForm({ ...inspectionForm, endDate: event.target.value })} required /></label></div>
      <label>検修基地<select value={inspectionForm.inspectionBase} onChange={(event) => setInspectionForm({ ...inspectionForm, inspectionBase: event.target.value })}>{bases.map((base) => <option key={base}>{base}</option>)}</select></label>
      <div className={styles.dialogActions}><button type="button" className={styles.cancelButton} onClick={() => setEditingInspection(null)}>キャンセル</button><button type="submit" className={styles.saveButton}>検修予定を更新</button></div>
    </form></div>}
    {isPrintPreviewOpen && <div className={styles.dialogBackdrop} role="presentation" onMouseDown={() => setIsPrintPreviewOpen(false)}><section className={`${styles.printPreview} print-preview`} aria-label="A3印刷プレビュー" onMouseDown={(event) => event.stopPropagation()}><header><div><p>A3 横向き印刷プレビュー</p><h2>{formatMonth(displayMonth)} 運用計画管理表</h2><small>最終更新: {formatUpdatedAt(updatedAt)}</small></div><button type="button" className={styles.closeButton} aria-label="閉じる" onClick={() => setIsPrintPreviewOpen(false)}>×</button></header><div className={styles.printTableWrap}><table><thead><tr><th>日付</th>{shownBases.map((base) => <th key={base}>{base}</th>)}</tr></thead><tbody>{monthDays.map((date) => <tr key={date}><th>{date.slice(-2)}</th>{shownBases.map((base) => { const baseInspections = inspections.filter((inspection) => inspection.date === date && inspection.inspectionBase === base); const departures = shownPlans.filter((plan) => plan.date === date && plan.departureBase === base); const arrivals = shownPlans.filter((plan) => nextDate(plan.date) === date && plan.arrivalBase === base && plan.timeBand === "night"); return <td key={base}>{baseInspections.map((inspection) => <p className={styles.printInspection} key={`${inspection.machineNumber}-${inspection.date}`}>{inspection.inspectionType} {inspection.model} / {inspection.machineNumber}</p>)}{arrivals.map((plan) => <p className={styles.printNextDay} key={`${plan.id}-arrival`}>翌日 {plan.machineNumber} 帰着</p>)}{departures.map((plan) => <p className={styles.printPlan} key={plan.id}>{plan.model} / {plan.machineNumber}{plan.departureBase !== plan.arrivalBase && ` -> ${plan.arrivalBase}`}</p>)}</td>; })}</tr>)}</tbody></table></div><footer><button type="button" className={styles.cancelButton} onClick={() => setIsPrintPreviewOpen(false)}>閉じる</button><button type="button" className={styles.saveButton} onClick={() => window.print()}>印刷</button></footer></section></div>}
  </>;
}
