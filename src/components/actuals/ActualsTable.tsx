"use client";

import { CSSProperties, DragEvent, FormEvent, PointerEvent, useMemo, useState } from "react";
import { InspectionActual, InspectionRule, OperationPlan, VehicleInspectionMaster, VehicleMaster } from "@/types/operation";
import styles from "../planning/OperationTable.module.css";

type LocationChange = { machineNumber: string; date: string; base: string };
type InspectionOverride = { machineNumber: string; startDate: string; endDate: string; inspectionBase: string };
type InspectionEntry = { machineNumber: string; model: string; inspectionType: string; date: string; startDate: string; endDate: string; inspectionBase: string };
type ResizeState = { base: string; startX: number; startWidth: number };
type ActualsTableProps = { plans: OperationPlan[]; offices: string[]; bases: string[]; officeBases: Record<string, string[]>; vehicles: VehicleMaster[]; inspectionMasters: VehicleInspectionMaster[]; inspectionRules: InspectionRule[]; inspectionActuals: InspectionActual[] };

function monthDaysFor(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return Array.from({ length: new Date(year, monthNumber, 0).getDate() }, (_, index) => `${year}/${String(monthNumber).padStart(2, "0")}/${String(index + 1).padStart(2, "0")}`);
}

function addDays(date: string, days: number) {
  const value = new Date(`${date.replaceAll("/", "-")}T00:00:00`);
  value.setDate(value.getDate() + days);
  return `${value.getFullYear()}/${String(value.getMonth() + 1).padStart(2, "0")}/${String(value.getDate()).padStart(2, "0")}`;
}

function formatMonth(month: string) {
  const [year, monthNumber] = month.split("-");
  return `${year}年${Number(monthNumber)}月`;
}

function inspectionsFor(masters: VehicleInspectionMaster[], rules: InspectionRule[], actuals: InspectionActual[], overrides: InspectionOverride[], monthDays: string[]) {
  return masters.flatMap((master) => {
    const rule = rules.filter((item) => item.category === master.category).sort((left, right) => right.inspectionDays - left.inspectionDays)[0];
    if (!rule) return [];
    const latestActual = actuals.filter((actual) => actual.machineNumber === master.machineNumber).sort((left, right) => right.completedDate.localeCompare(left.completedDate))[0];
    const plannedStartDate = latestActual ? addDays(latestActual.completedDate, 180) : monthDays[0];
    const override = overrides.find((item) => item.machineNumber === master.machineNumber) ?? { startDate: plannedStartDate, endDate: addDays(plannedStartDate, rule.inspectionDays - 1), inspectionBase: master.inspectionBase };
    return monthDays.filter((date) => date >= override.startDate && date <= override.endDate).map((date) => ({ machineNumber: master.machineNumber, model: master.model, inspectionType: rule.inspectionType, date, ...override }));
  });
}

export function ActualsTable({ plans, offices, bases, officeBases, vehicles, inspectionMasters, inspectionRules, inspectionActuals }: ActualsTableProps) {
  const [displayMonth, setDisplayMonth] = useState("2026-09");
  const [office, setOffice] = useState("すべて");
  const [query, setQuery] = useState("");
  const [changes, setChanges] = useState<LocationChange[]>([]);
  const [editingLocation, setEditingLocation] = useState<{ machineNumber: string; date: string; base: string } | null>(null);
  const [draggedVehicle, setDraggedVehicle] = useState<string | null>(null);
  const [draggedInspection, setDraggedInspection] = useState<InspectionEntry | null>(null);
  const [baseOrder, setBaseOrder] = useState(bases);
  const [draggedBase, setDraggedBase] = useState<string | null>(null);
  const [baseWidths, setBaseWidths] = useState<Record<string, number>>(() => Object.fromEntries(bases.map((base) => [base, 220])));
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [editingInspection, setEditingInspection] = useState<InspectionEntry | null>(null);
  const [inspectionOverrides, setInspectionOverrides] = useState<InspectionOverride[]>([]);
  const [inspectionForm, setInspectionForm] = useState({ startDate: "", endDate: "", inspectionBase: "" });
  const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const monthDays = useMemo(() => monthDaysFor(displayMonth), [displayMonth]);
  const plannedVehicles = useMemo(() => vehicles.filter((vehicle) => plans.some((plan) => plan.machineNumber === vehicle.machineNumber)), [plans, vehicles]);
  const inspections = useMemo(() => inspectionsFor(inspectionMasters, inspectionRules, inspectionActuals, inspectionOverrides, monthDays), [inspectionActuals, inspectionMasters, inspectionOverrides, inspectionRules, monthDays]);
  const shownVehicles = plannedVehicles.filter((vehicle) => `${vehicle.model} ${vehicle.machineNumber}`.includes(query));
  const shownBases = baseOrder.filter((base) => (office === "すべて" || (officeBases[office] ?? []).includes(base)));

  function locationFor(machineNumber: string, date: string) {
    if (inspections.some((inspection) => inspection.machineNumber === machineNumber && inspection.date === date)) return "検修中";
    return [...changes].filter((change) => change.machineNumber === machineNumber && change.date <= date).sort((left, right) => right.date.localeCompare(left.date))[0]?.base ?? vehicles.find((vehicle) => vehicle.machineNumber === machineNumber)?.homeBase ?? bases[0];
  }

  function saveLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingLocation) return;
    setChanges((current) => [...current.filter((change) => !(change.machineNumber === editingLocation.machineNumber && change.date === editingLocation.date)), editingLocation]);
    setHasUnsavedChanges(true);
    window.dispatchEvent(new CustomEvent("operation-dirty-change", { detail: true }));
    setEditingLocation(null);
  }

  function moveVehicle(machineNumber: string, date: string, base: string) {
    setChanges((current) => [...current.filter((change) => !(change.machineNumber === machineNumber && change.date === date)), { machineNumber, date, base }]);
    setHasUnsavedChanges(true);
    window.dispatchEvent(new CustomEvent("operation-dirty-change", { detail: true }));
    setDraggedVehicle(null);
  }

  function moveInspection(inspection: InspectionEntry, startDate: string, inspectionBase: string) {
    const override = { machineNumber: inspection.machineNumber, startDate, endDate: addDays(startDate, Math.round((new Date(`${inspection.endDate.replaceAll("/", "-")}T00:00:00`).getTime() - new Date(`${inspection.startDate.replaceAll("/", "-")}T00:00:00`).getTime()) / 86_400_000)), inspectionBase };
    setInspectionOverrides((current) => [...current.filter((item) => item.machineNumber !== override.machineNumber), override]);
    setHasUnsavedChanges(true);
    window.dispatchEvent(new CustomEvent("operation-dirty-change", { detail: true }));
    setDraggedInspection(null);
  }

  function startResize(event: PointerEvent<HTMLButtonElement>, base: string) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizeState({ base, startX: event.clientX, startWidth: baseWidths[base] });
  }

  function resizeColumn(event: PointerEvent<HTMLButtonElement>) {
    if (!resizeState) return;
    setBaseWidths((current) => ({ ...current, [resizeState.base]: Math.min(500, Math.max(40, resizeState.startWidth + event.clientX - resizeState.startX)) }));
  }

  function moveBase(targetBase: string) {
    if (!draggedBase || draggedBase === targetBase) return;
    setBaseOrder((current) => {
      const nextOrder = current.filter((base) => base !== draggedBase);
      nextOrder.splice(nextOrder.indexOf(targetBase), 0, draggedBase);
      return nextOrder;
    });
  }

  function openInspection(inspection: InspectionEntry) {
    setEditingInspection(inspection);
    setInspectionForm({ startDate: inspection.startDate.replaceAll("/", "-"), endDate: inspection.endDate.replaceAll("/", "-"), inspectionBase: inspection.inspectionBase });
  }

  function saveInspection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingInspection || inspectionForm.endDate < inspectionForm.startDate) return;
    const override = { machineNumber: editingInspection.machineNumber, startDate: inspectionForm.startDate.replaceAll("-", "/"), endDate: inspectionForm.endDate.replaceAll("-", "/"), inspectionBase: inspectionForm.inspectionBase };
    setInspectionOverrides((current) => [...current.filter((item) => item.machineNumber !== override.machineNumber), override]);
    setHasUnsavedChanges(true);
    window.dispatchEvent(new CustomEvent("operation-dirty-change", { detail: true }));
    setEditingInspection(null);
  }

  function exportCsv() {
    const rows = [["日付", "保守基地", "機種", "機械番号", "状態"]];
    monthDays.forEach((date) => {
      shownBases.forEach((base) => {
        shownVehicles.filter((vehicle) => locationFor(vehicle.machineNumber, date) === base).forEach((vehicle) => rows.push([date, base, vehicle.model, vehicle.machineNumber, "留置中"]));
      });
    });
    const csv = rows.map((row) => row.map((value) => `"${value.replaceAll("\"", "\"\"")}"`).join(",")).join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    link.download = `${displayMonth}_運用実績.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return <>
    <section className={styles.filters} aria-label="運用実績の検索条件"><div className={styles.filterTitle}><strong>留置場所検索</strong><span>運用計画の車両情報を反映</span></div><label>保線作業所<select value={office} onChange={(event) => setOffice(event.target.value)}><option>すべて</option>{offices.map((item) => <option key={item}>{item}</option>)}</select></label><label>保守用車<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="機種・機械番号" list="actuals-vehicle-list" /><datalist id="actuals-vehicle-list">{plannedVehicles.map((vehicle) => <option key={vehicle.machineNumber} value={`${vehicle.model} / ${vehicle.machineNumber}`} />)}</datalist></label><label>表示年月<input type="month" value={displayMonth} onChange={(event) => setDisplayMonth(event.target.value)} /></label></section>
    <section className={styles.schedule} aria-label="運用実績留置表"><div className={styles.scheduleHeader}><div><p>{formatMonth(displayMonth)}</p><h2>保守用車 留置実績管理表</h2></div><div className={styles.planActions}><span className={`${styles.saveStatus} ${hasUnsavedChanges ? styles.unsaved : styles.saved}`}>{hasUnsavedChanges ? "未保存" : "保存済み"}</span><span>車両をクリック、または移動先セルへドラッグして留置場所を変更</span><button type="button" onClick={exportCsv}>CSV出力</button><button type="button" className={styles.printButton} onClick={() => setIsPrintPreviewOpen(true)}>PDF出力</button></div></div><div className={styles.legend}><span className={styles.legendPlan} />留置実績 <span className={styles.legendInspection} />検修予定・実績</div>
      <div className={styles.gridWrap}><table className={styles.scheduleTable} style={{ "--table-min-width": `${40 + shownBases.reduce((total, base) => total + baseWidths[base], 0)}px` } as CSSProperties}><colgroup><col className={styles.dateColumn} />{shownBases.map((base) => <col key={base} style={{ width: `${baseWidths[base]}px` }} />)}</colgroup><thead><tr><th className={styles.dateHeader}>日付</th>{shownBases.map((base) => <th key={base} className={draggedBase === base ? styles.dragging : ""} onDragOver={(event) => event.preventDefault()} onDrop={() => moveBase(base)}><span className={styles.baseHeader} draggable onDragStart={() => setDraggedBase(base)} onDragEnd={() => setDraggedBase(null)}>{base}</span><button type="button" className={styles.resizeHandle} aria-label={`${base}の列幅を調整`} title="ドラッグして列幅を調整" onPointerDown={(event) => startResize(event, base)} onPointerMove={resizeColumn} onPointerUp={() => setResizeState(null)} onPointerCancel={() => setResizeState(null)} /></th>)}</tr></thead><tbody>{monthDays.map((date) => <tr key={date}><th scope="row"><strong>{date.slice(-2)}</strong><span>{["日", "月", "火", "水", "木", "金", "土"][new Date(`${date.replaceAll("/", "-")}T00:00:00`).getDay()]}</span></th>{shownBases.map((base) => { const cellVehicles = shownVehicles.filter((vehicle) => locationFor(vehicle.machineNumber, date) === base); const cellInspections = inspections.filter((inspection) => inspection.date === date && inspection.inspectionBase === base); return <td key={base} onDragOver={(event) => event.preventDefault()} onDrop={(event: DragEvent<HTMLTableCellElement>) => { event.preventDefault(); if (draggedVehicle) moveVehicle(draggedVehicle, date, base); if (draggedInspection) moveInspection(draggedInspection, date, base); }}>{cellInspections.map((inspection) => <button type="button" className={styles.inspection} key={`${inspection.machineNumber}-${inspection.date}`} draggable onDragStart={() => setDraggedInspection(inspection)} onDragEnd={() => setDraggedInspection(null)} onClick={() => openInspection(inspection)}><b>{inspection.inspectionType} {inspection.date === inspection.startDate ? "開始" : "継続"}</b><strong>{inspection.model} / {inspection.machineNumber}</strong><span>{inspection.startDate} - {inspection.endDate}</span></button>)}{cellVehicles.map((vehicle) => <button type="button" className={`${styles.actualLocation} ${changes.some((change) => change.machineNumber === vehicle.machineNumber && change.date <= date) ? styles.actualConfirmed : styles.actualPlanned}`} key={vehicle.machineNumber} draggable onDragStart={() => setDraggedVehicle(vehicle.machineNumber)} onDragEnd={() => setDraggedVehicle(null)} onClick={() => setEditingLocation({ machineNumber: vehicle.machineNumber, date, base })}><b>{vehicle.model}</b><strong>{vehicle.machineNumber}</strong><span>{changes.some((change) => change.machineNumber === vehicle.machineNumber && change.date === date) ? "留置変更日" : "留置中"}</span></button>)}</td>; })}</tr>)}</tbody></table></div>
    </section>
    {editingLocation && <div className={styles.dialogBackdrop} role="presentation" onMouseDown={() => setEditingLocation(null)}><form className={styles.dialog} onSubmit={saveLocation} onMouseDown={(event) => event.stopPropagation()}><div className={styles.dialogHeader}><div><p>留置場所を変更</p><h2>{editingLocation.machineNumber}</h2></div><button type="button" className={styles.closeButton} aria-label="閉じる" onClick={() => setEditingLocation(null)}>×</button></div><div className={styles.formRow}><label>変更日<input type="date" value={editingLocation.date.replaceAll("/", "-")} onChange={(event) => setEditingLocation({ ...editingLocation, date: event.target.value.replaceAll("-", "/") })} required /></label><label>変更後の留置基地<select value={editingLocation.base} onChange={(event) => setEditingLocation({ ...editingLocation, base: event.target.value })}>{bases.map((base) => <option key={base}>{base}</option>)}</select></label></div><div className={styles.dialogActions}><button type="button" className={styles.cancelButton} onClick={() => setEditingLocation(null)}>キャンセル</button><button type="submit" className={styles.saveButton}>留置場所を更新</button></div></form></div>}
    {editingInspection && <div className={styles.dialogBackdrop} role="presentation" onMouseDown={() => setEditingInspection(null)}><form className={styles.dialog} onSubmit={saveInspection} onMouseDown={(event) => event.stopPropagation()}><div className={styles.dialogHeader}><div><p>検修日程を修正</p><h2>{editingInspection.inspectionType} / {editingInspection.machineNumber}</h2></div><button type="button" className={styles.closeButton} aria-label="閉じる" onClick={() => setEditingInspection(null)}>×</button></div><div className={styles.formRow}><label>開始日<input type="date" value={inspectionForm.startDate} onChange={(event) => setInspectionForm({ ...inspectionForm, startDate: event.target.value })} required /></label><label>終了日<input type="date" value={inspectionForm.endDate} min={inspectionForm.startDate} onChange={(event) => setInspectionForm({ ...inspectionForm, endDate: event.target.value })} required /></label></div><label>検修基地<select value={inspectionForm.inspectionBase} onChange={(event) => setInspectionForm({ ...inspectionForm, inspectionBase: event.target.value })}>{bases.map((base) => <option key={base}>{base}</option>)}</select></label><div className={styles.dialogActions}><button type="button" className={styles.cancelButton} onClick={() => setEditingInspection(null)}>キャンセル</button><button type="submit" className={styles.saveButton}>検修日程を更新</button></div></form></div>}
    {isPrintPreviewOpen && <div className={styles.dialogBackdrop} role="presentation" onMouseDown={() => setIsPrintPreviewOpen(false)}><section className={`${styles.printPreview} print-preview`} aria-label="A3印刷プレビュー" onMouseDown={(event) => event.stopPropagation()}><header><div><p>A3 横向き印刷プレビュー</p><h2>{formatMonth(displayMonth)} 保守用車 留置実績管理表</h2></div><button type="button" className={styles.closeButton} aria-label="閉じる" onClick={() => setIsPrintPreviewOpen(false)}>×</button></header><div className={styles.printTableWrap}><table><thead><tr><th>日付</th>{baseOrder.map((base) => <th key={base}>{base}</th>)}</tr></thead><tbody>{monthDays.map((date) => <tr key={date}><th>{date.slice(-2)}</th>{baseOrder.map((base) => <td key={base}>{shownVehicles.filter((vehicle) => locationFor(vehicle.machineNumber, date) === base).map((vehicle) => <p className={styles.printPlan} key={vehicle.machineNumber}>{vehicle.model} / {vehicle.machineNumber}</p>)}{inspections.filter((inspection) => inspection.date === date && inspection.inspectionBase === base).map((inspection) => <p className={styles.printInspection} key={`${inspection.machineNumber}-${inspection.date}`}>{inspection.inspectionType} {inspection.machineNumber}</p>)}</td>)}</tr>)}</tbody></table></div><footer><button type="button" className={styles.cancelButton} onClick={() => setIsPrintPreviewOpen(false)}>閉じる</button><button type="button" className={styles.saveButton} onClick={() => window.print()}>印刷</button></footer></section></div>}
  </>;
}
