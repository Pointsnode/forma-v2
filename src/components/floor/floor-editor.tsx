"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Stage, Layer, Group, Circle, Rect, Line, Text, Image as KImage, Transformer } from "react-konva";
import type Konva from "konva";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { seatLabel, seatPositions } from "@/lib/seat-geometry.mjs";
import { formaErrorMessage } from "@/lib/forma-error";
import {
  addTable, addElement, moveItem, updateTableGeometry, updateElementGeometry, updateTableProps,
  deleteTable, deleteElement, assignSeatAt, unseatGuest, duplicateTable, addLooseSeat, groupLooseSeat,
  uploadBackground, updateBackgroundSettings, removeBackground,
} from "@/app/[locale]/(app)/wedding/[id]/floor-actions";

type SeatSides = "all" | "long" | "one";
type Seat = { seatNo: number; guestId: string; name: string; diet: string[] };
type Table = { id: string; name: string; capacity: number; shape: "round" | "rect" | "banquet"; x: number; y: number; rotation: number; width: number; height: number; seatSides: SeatSides; isLoose: boolean; groupedWith: string | null; seats: Seat[] };
type Element = { id: string; kind: string; label: string | null; x: number; y: number; rotation: number; width: number; height: number };
type Attendee = { guestId: string; name: string; diet: string[]; seated: boolean };
type Exception = { guestId: string; name: string; rsvp: string; tableId: string; seatNo: number };
type BackgroundSettings = { opacity?: number; scale?: number; x?: number; y?: number; locked?: boolean };

export type FloorEditorProps = {
  eventId: string; weddingId: string; planId: string;
  canvas: { w: number; h: number };
  tables: Table[]; elements: Element[]; attendees: Attendee[]; exceptions: Exception[];
  seatedCount: number; attendingCount: number;
  role: "staff" | "couple" | "view"; coupleCanEdit: boolean;
  background: string | null; backgroundUrl: string | null; backgroundSettings: BackgroundSettings;
  printHref: string;
  initialPickGuest?: string | null; // §F deep-link from the guest list lands with this guest picked up
};

const SHAPES = ["round", "rect", "banquet"] as const;
const DECOR = ["stage", "dancefloor", "dj_booth", "bar", "buffet", "cake_table", "entrance", "exit", "restroom", "photo_booth", "lounge", "custom"] as const;
const snap = (v: number) => Math.round(v / 10) * 10;
const initialsOf = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "·";

export function FloorEditor(props: FloorEditorProps) {
  const t = useTranslations("floor");
  const te = useTranslations("errors");
  const [tables, setTables] = useState<Table[]>(props.tables);
  const [elements, setElements] = useState<Element[]>(props.elements);
  const [sel, setSel] = useState<{ kind: "table" | "element"; id: string } | null>(null);
  const [chair, setChair] = useState<{ tableId: string; seatNo: number } | null>(null);
  const [pickGuest, setPickGuest] = useState<string | null>(props.initialPickGuest ?? null); // §E guest-first (also the §F deep-link landing)
  const [search, setSearch] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [scale, setScale] = useState(0.6);
  const [bg, setBg] = useState<BackgroundSettings>(props.backgroundSettings ?? {});
  const [bgImg, setBgImg] = useState<HTMLImageElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const trRef = useRef<Konva.Transformer>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const nodeRefs = useRef<Map<string, Konva.Group>>(new Map());
  const flush = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canMove = props.role === "staff" || (props.role === "couple" && props.coupleCanEdit);
  const canEditGeom = props.role === "staff"; // create/resize/rotate/delete/blueprint
  const canSeat = canMove;

  // §L load the blueprint bitmap for the canvas (and the export/print). The remove handler clears
  // bgImg directly, so the effect only ever LOADS (no synchronous setState in its body).
  useEffect(() => {
    if (!props.backgroundUrl) return;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.src = props.backgroundUrl;
    img.onload = () => setBgImg(img);
    return () => { img.onload = null; };
  }, [props.backgroundUrl]);

  function exportPNG() {
    const stage = stageRef.current;
    if (!stage) return;
    const url = stage.toDataURL({ pixelRatio: 2 });
    const a = document.createElement("a");
    a.href = url; a.download = "floor-plan.png"; a.click();
  }

  // Re-sync optimistic state to the server's after a revalidation (store-previous-props, render-phase).
  const [snap0, setSnap0] = useState({ t: props.tables, e: props.elements, b: props.backgroundSettings });
  if (snap0.t !== props.tables || snap0.e !== props.elements || snap0.b !== props.backgroundSettings) {
    setSnap0({ t: props.tables, e: props.elements, b: props.backgroundSettings });
    setTables(props.tables);
    setElements(props.elements);
    setBg(props.backgroundSettings ?? {});
  }

  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const node = sel && canEditGeom ? nodeRefs.current.get(sel.id) ?? null : null;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [sel, canEditGeom, tables, elements]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setPickGuest(null); setChair(null); return; }
      if (!canEditGeom) return;
      if ((e.key === "Delete" || e.key === "Backspace") && sel && !chair) {
        e.preventDefault();
        // keyboard delete is direct (the confirm-when-seated lives on the inspector's Delete button)
        if (sel.kind === "table") { setTables((ts) => ts.filter((x) => x.id !== sel.id)); deleteTable(sel.id); }
        else { setElements((es) => es.filter((x) => x.id !== sel.id)); deleteElement(sel.id); }
        setSel(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel, chair, canEditGeom]);

  function whisper(p: Promise<{ error?: string; message?: string }>) {
    setSaveState("saving"); setErrMsg(null);
    p.then((r) => {
      if (r?.error) { setSaveState("error"); setErrMsg(formaErrorMessage(r, te)); }
      else { setSaveState("saved"); setErrMsg(null); }
    }).catch(() => { setSaveState("error"); setErrMsg(te("generic")); });
    if (flush.current) clearTimeout(flush.current);
    flush.current = setTimeout(() => setSaveState("idle"), 1800);
  }

  const realTables = useMemo(() => tables.filter((tb) => !tb.isLoose), [tables]);
  const looseSeats = useMemo(() => tables.filter((tb) => tb.isLoose), [tables]);
  const seatedIds = useMemo(() => new Set(tables.flatMap((tb) => tb.seats.map((s) => s.guestId))), [tables]);
  // §G counters use the attending population (rsvp='yes'), reused, not re-derived.
  const attendingSeated = props.attendees.filter((a) => seatedIds.has(a.guestId)).length;
  const unseated = props.attendees.filter((a) => !seatedIds.has(a.guestId) && a.name.toLowerCase().includes(search.toLowerCase()));
  const chairTable = chair ? tables.find((tb) => tb.id === chair.tableId) : null;
  const occupant = chairTable?.seats.find((s) => s.seatNo === chair!.seatNo) ?? null;
  const pickName = pickGuest ? props.attendees.find((a) => a.guestId === pickGuest)?.name ?? "" : "";
  const looseByTable = useMemo(() => {
    const m = new Map<string, number>();
    for (const ls of looseSeats) if (ls.groupedWith) m.set(ls.groupedWith, (m.get(ls.groupedWith) ?? 0) + 1);
    return m;
  }, [looseSeats]);

  function addShape(shape: "round" | "rect" | "banquet") {
    whisper(addTable(props.planId, props.weddingId, shape, 60, 60).then((r) => { if (r.id) setTables((ts) => [...ts, { id: r.id!, name: `Table ${ts.length + 1}`, capacity: 8, shape, x: 60, y: 60, rotation: 0, width: shape === "round" ? 120 : 200, height: shape === "round" ? 120 : 90, seatSides: "all", isLoose: false, groupedWith: null, seats: [] }]); return r; }));
  }
  function addLoose() {
    whisper(addLooseSeat(props.planId, props.weddingId, 90, 90).then((r) => { if (r.id) setTables((ts) => [...ts, { id: r.id!, name: `Seat ${ts.length + 1}`, capacity: 1, shape: "round", x: 90, y: 90, rotation: 0, width: 30, height: 30, seatSides: "all", isLoose: true, groupedWith: null, seats: [] }]); return r; }));
  }
  function addDecor(kind: string) {
    whisper(addElement(props.planId, props.weddingId, kind, 60, 60, null).then((r) => { if (r.id) setElements((es) => [...es, { id: r.id!, kind, label: null, x: 60, y: 60, rotation: 0, width: 120, height: 80 }]); return r; }));
  }
  function duplicate(id: string) {
    whisper(duplicateTable(id).then((r) => { if (r.id) { const src = tables.find((x) => x.id === id); if (src) setTables((ts) => [...ts, { ...src, id: r.id!, name: `${src.name} copy`, x: src.x + 24, y: src.y + 24, seats: [] }]); } return r; }));
    setSel(null);
  }
  function removeTable(id: string) {
    const tb = tables.find((x) => x.id === id);
    if (tb && !tb.isLoose && tb.seats.length && !window.confirm(t("confirmDelete", { n: tb.seats.length }))) return;
    setTables((ts) => ts.filter((x) => x.id !== id));
    setSel(null);
    whisper(deleteTable(id));
  }
  function setSides(id: string, sides: SeatSides) {
    setTables((ts) => ts.map((x) => (x.id === id ? { ...x, seatSides: sides } : x)));
    whisper(updateTableProps(id, { seatSides: sides }));
  }
  function group(looseId: string, tableId: string | null) {
    setTables((ts) => ts.map((x) => (x.id === looseId ? { ...x, groupedWith: tableId } : x)));
    whisper(groupLooseSeat(looseId, tableId));
  }

  function onDragEndItem(kind: "table" | "element", id: string, node: Konva.Group) {
    const x = snap(node.x()), y = snap(node.y());
    node.position({ x, y });
    if (kind === "table") setTables((ts) => ts.map((tb) => (tb.id === id ? { ...tb, x, y } : tb)));
    else setElements((es) => es.map((el) => (el.id === id ? { ...el, x, y } : el)));
    whisper(moveItem(kind, id, x, y, null));
  }
  function onTransformEndItem(kind: "table" | "element", id: string, node: Konva.Group) {
    const sx = node.scaleX(), sy = node.scaleY();
    node.scaleX(1); node.scaleY(1);
    const rotation = Math.round(node.rotation() / 15) * 15;
    node.rotation(rotation);
    if (kind === "table") {
      const tb = tables.find((x) => x.id === id)!;
      const width = Math.max(60, Math.round(tb.width * sx)), height = Math.max(60, Math.round(tb.height * sy));
      setTables((ts) => ts.map((x) => (x.id === id ? { ...x, width, height, rotation, x: snap(node.x()), y: snap(node.y()) } : x)));
      whisper(updateTableGeometry(id, { width, height, rotation, x: snap(node.x()), y: snap(node.y()) }));
    } else {
      const el = elements.find((x) => x.id === id)!;
      const width = Math.max(40, Math.round(el.width * sx)), height = Math.max(30, Math.round(el.height * sy));
      setElements((es) => es.map((x) => (x.id === id ? { ...x, width, height, rotation, x: snap(node.x()), y: snap(node.y()) } : x)));
      whisper(updateElementGeometry(id, { width, height, rotation, x: snap(node.x()), y: snap(node.y()) }));
    }
  }

  // seat: chair-first (pass a chair) or the currently-selected chair. Non-optimistic — the seat
  // only appears if the server accepted it, so a race loser sees the error, not a phantom seat.
  function seat(guestId: string, at?: { tableId: string; seatNo: number }) {
    const c = at ?? chair;
    if (!c) return;
    whisper(assignSeatAt(props.eventId, guestId, c.tableId, c.seatNo).then((r) => {
      if (!r.error) {
        const a = props.attendees.find((x) => x.guestId === guestId);
        setTables((ts) => ts.map((tb) => (tb.id === c.tableId ? { ...tb, seats: [...tb.seats.filter((s) => s.seatNo !== c.seatNo && s.guestId !== guestId), { seatNo: c.seatNo, guestId, name: a?.name ?? "·", diet: a?.diet ?? [] }] } : { ...tb, seats: tb.seats.filter((s) => s.guestId !== guestId) })));
        setChair(null); setPickGuest(null);
      }
      return r;
    }));
  }
  // §E clicking a chair while a guest is picked up seats them there.
  function chairClick(tableId: string, seatNo: number) {
    if (pickGuest) { seat(pickGuest, { tableId, seatNo }); return; }
    if (canSeat) setChair({ tableId, seatNo });
  }
  function unseat(guestId: string) {
    whisper(unseatGuest(props.eventId, guestId).then((r) => {
      if (!r.error) { setTables((ts) => ts.map((tb) => ({ ...tb, seats: tb.seats.filter((s) => s.guestId !== guestId) }))); setChair(null); }
      return r;
    }));
  }

  // §L blueprint controls (staff)
  function onUpload(file: File) {
    const fd = new FormData(); fd.append("file", file);
    setUploading(true); setErrMsg(null);
    uploadBackground(props.planId, props.weddingId, fd).then((r) => {
      setUploading(false);
      if (r.error) setErrMsg(r.error === "pdfDeferred" ? t("blueprintPdfDeferred") : r.error === "badType" ? t("blueprintBadType") : formaErrorMessage(r, te));
    }).catch(() => { setUploading(false); setErrMsg(te("generic")); });
  }
  function saveBg(next: BackgroundSettings) {
    setBg((b) => ({ ...b, ...next }));
    whisper(updateBackgroundSettings(props.planId, next));
  }
  function fitBg() {
    if (!bgImg) return;
    const s = Math.min(props.canvas.w / bgImg.width, props.canvas.h / bgImg.height);
    saveBg({ scale: s, x: 0, y: 0 });
  }

  const selectedTable = sel?.kind === "table" ? tables.find((x) => x.id === sel.id) : null;
  const bgLocked = bg.locked !== false; // default locked
  const bgScale = bg.scale ?? 1;

  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      <div className="min-w-0 flex-1">
        {canEditGeom ? (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {SHAPES.map((sh) => <button key={sh} onClick={() => addShape(sh)} className="rounded-[var(--radius)] bg-ink px-2.5 py-1.5 text-[12px] text-bone">+ {t(`shape_${sh}`)}</button>)}
            <button onClick={addLoose} className="rounded-[var(--radius)] bg-ink px-2.5 py-1.5 text-[12px] text-bone">+ {t("addLooseSeat")}</button>
            <span className="mx-1 h-4 w-px bg-hairline" />
            {DECOR.map((d) => <button key={d} onClick={() => addDecor(d)} className="rounded-[var(--radius)] bg-bone px-2.5 py-1.5 text-[12px] text-taupe hover:text-ink">+ {t(`kind_${d}`)}</button>)}
            <span className="ml-auto text-[11.5px] text-muted">{saveState === "saving" ? t("saving") : saveState === "saved" ? t("saved") : ""}</span>
          </div>
        ) : (
          <div className="mb-2 flex items-center gap-2 text-[12px] text-muted">
            <span className="rounded-[var(--radius)] bg-bone px-2.5 py-1">{props.coupleCanEdit ? t("coupleCanEdit") : t("readOnly")}</span>
            <span className="ml-auto">{saveState === "saving" ? t("saving") : saveState === "saved" ? t("saved") : ""}</span>
          </div>
        )}

        {/* §L blueprint bar (staff) */}
        {canEditGeom ? (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-[var(--radius)] bg-bone/60 px-2.5 py-1.5 text-[11.5px] text-muted">
            {!props.background ? (
              <label className="cursor-pointer rounded bg-bone px-2 py-1 text-ink hover:opacity-90">
                {uploading ? t("blueprintConverting") : t("addBlueprint")}
                <input type="file" accept="image/png,image/jpeg,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""; }} />
              </label>
            ) : (
              <>
                <span className="text-taupe">{t("blueprint")}</span>
                <label className="flex items-center gap-1">{t("opacity")}
                  <input type="range" min={10} max={100} defaultValue={Math.round((bg.opacity ?? 0.55) * 100)} onMouseUp={(e) => saveBg({ opacity: Number((e.target as HTMLInputElement).value) / 100 })} onTouchEnd={(e) => saveBg({ opacity: Number((e.target as HTMLInputElement).value) / 100 })} className="w-20 accent-ink" />
                </label>
                <button onClick={fitBg} className="rounded bg-bone px-2 py-0.5 text-ink">{t("fit")}</button>
                <button onClick={() => saveBg({ locked: !bgLocked })} className="rounded bg-bone px-2 py-0.5 text-ink">{bgLocked ? t("unlock") : t("lock")}</button>
                <button onClick={() => { setBgImg(null); whisper(removeBackground(props.planId)); }} className="rounded bg-bone px-2 py-0.5 text-wine">{t("removeBlueprint")}</button>
              </>
            )}
            <span className="ml-1 text-taupe">{t("blueprintHint")}</span>
          </div>
        ) : null}

        <p className="mb-1.5 text-[12.5px] text-muted">{attendingSeated >= props.attendingCount && props.attendingCount > 0 ? t("everyoneSeated") : t("totals", { seated: attendingSeated, attending: props.attendingCount })}</p>
        {/* §B/§E hint line */}
        <p className="mb-1.5 text-[12px] text-taupe">{pickGuest ? `${t("nowClickChair", { name: pickName })} · ${t("escToCancel")}` : chair ? "" : t("clickChairHint")}</p>
        {errMsg ? <p className="mb-1.5 text-[12.5px] text-wine">{errMsg}</p> : null}
        {props.exceptions.length ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {props.exceptions.map((e) => (
              <button key={e.guestId} onClick={() => canSeat && unseat(e.guestId)} className="rounded-[var(--radius)] bg-bone px-2.5 py-1 text-[11.5px] text-wine hover:bg-wine hover:text-bone" title={t("exceptionHint")}>
                {t("exception", { name: e.name })}
              </button>
            ))}
          </div>
        ) : null}

        <div className="overflow-auto rounded-[var(--radius)] bg-bone" style={{ maxHeight: 620 }}>
          <Stage ref={stageRef} width={props.canvas.w * scale} height={props.canvas.h * scale} scaleX={scale} scaleY={scale}
            onMouseDown={(e) => { if (e.target === e.target.getStage()) { setSel(null); setChair(null); setPickGuest(null); } }}>
            <Layer>
              {/* §L blueprint, behind everything */}
              {bgImg ? (
                <KImage image={bgImg} x={bg.x ?? 0} y={bg.y ?? 0} width={bgImg.width * bgScale} height={bgImg.height * bgScale} opacity={bg.opacity ?? 0.55}
                  listening={!bgLocked && canEditGeom} draggable={!bgLocked && canEditGeom}
                  onDragEnd={(e) => saveBg({ x: Math.round(e.target.x()), y: Math.round(e.target.y()) })} />
              ) : null}
              {/* hairlines from grouped loose seats to their table */}
              {looseSeats.filter((ls) => ls.groupedWith).map((ls) => {
                const tb = tables.find((x) => x.id === ls.groupedWith);
                return tb ? <Line key={`c${ls.id}`} points={[ls.x, ls.y, tb.x, tb.y]} stroke="#d8c7b0" strokeWidth={1} dash={[4, 4]} listening={false} /> : null;
              })}
              {elements.map((el) => (
                <Group key={el.id} ref={(n) => { if (n) nodeRefs.current.set(el.id, n); }}
                  x={el.x} y={el.y} rotation={el.rotation} draggable={canMove}
                  onClick={() => canEditGeom && setSel({ kind: "element", id: el.id })} onTap={() => canEditGeom && setSel({ kind: "element", id: el.id })}
                  onDragEnd={(e) => onDragEndItem("element", el.id, e.target as Konva.Group)}
                  onTransformEnd={(e) => onTransformEndItem("element", el.id, e.target as Konva.Group)}>
                  <Rect x={-el.width / 2} y={-el.height / 2} width={el.width} height={el.height} cornerRadius={6} fill="#efe7d9" stroke={sel?.id === el.id ? "#121212" : "#eae6dc"} strokeWidth={1.5} />
                  <Text x={-el.width / 2} y={-8} width={el.width} align="center" text={el.label || t(`kind_${el.kind}`)} fontSize={13} fill="#7a6a50" />
                </Group>
              ))}
              {realTables.map((tb) => {
                const chairs = seatPositions(tb.shape, tb.capacity, tb.width, tb.height, 0, tb.seatSides) as { x: number; y: number }[];
                const looseN = looseByTable.get(tb.id) ?? 0;
                return (
                  <Group key={tb.id} ref={(n) => { if (n) nodeRefs.current.set(tb.id, n); }}
                    x={tb.x} y={tb.y} rotation={tb.rotation} draggable={canMove}
                    onClick={() => canEditGeom && setSel({ kind: "table", id: tb.id })} onTap={() => canEditGeom && setSel({ kind: "table", id: tb.id })}
                    onDragEnd={(e) => onDragEndItem("table", tb.id, e.target as Konva.Group)}
                    onTransformEnd={(e) => onTransformEndItem("table", tb.id, e.target as Konva.Group)}>
                    {tb.shape === "round"
                      ? <Circle radius={tb.width / 2} fill="#fffdf9" stroke={sel?.id === tb.id ? "#121212" : "#d8c7b0"} strokeWidth={2} />
                      : <Rect x={-tb.width / 2} y={-tb.height / 2} width={tb.width} height={tb.height} cornerRadius={8} fill="#fffdf9" stroke={sel?.id === tb.id ? "#121212" : "#d8c7b0"} strokeWidth={2} />}
                    <Text x={-tb.width / 2} y={-9} width={tb.width} align="center" text={looseN ? t("tableWithLoose", { name: tb.name, seated: tb.seats.length, capacity: tb.capacity, loose: looseN }) : `${tb.name}  ${tb.seats.length}/${tb.capacity}`} fontSize={13} fill="#121212" />
                    {chairs.map((pos, i) => {
                      const occ = tb.seats.find((s) => s.seatNo === i);
                      const isSel = chair?.tableId === tb.id && chair?.seatNo === i;
                      return (
                        <Group key={i} x={pos.x} y={pos.y} onClick={(e) => { e.cancelBubble = true; chairClick(tb.id, i); }} onTap={(e) => { e.cancelBubble = true; chairClick(tb.id, i); }}>
                          <Circle radius={11} fill={occ ? "#7e3b41" : "#fffdf9"} stroke={isSel ? "#121212" : "#eae6dc"} strokeWidth={isSel ? 2.5 : 1} />
                          <Text x={-11} y={-5} width={22} align="center" text={occ ? initialsOf(occ.name) : seatLabel(i)} fontSize={occ ? 8 : 9} fill={occ ? "#f7f4ee" : "#8a867e"} />
                        </Group>
                      );
                    })}
                  </Group>
                );
              })}
              {/* §D loose seats — a single draggable chair, groupable to a table */}
              {looseSeats.map((ls) => {
                const occ = ls.seats[0];
                const isSel = chair?.tableId === ls.id;
                return (
                  <Group key={ls.id} ref={(n) => { if (n) nodeRefs.current.set(ls.id, n); }}
                    x={ls.x} y={ls.y} draggable={canMove}
                    onDragEnd={(e) => onDragEndItem("table", ls.id, e.target as Konva.Group)}>
                    <Group onClick={(e) => { e.cancelBubble = true; if (canEditGeom) setSel({ kind: "table", id: ls.id }); chairClick(ls.id, 0); }} onTap={(e) => { e.cancelBubble = true; if (canEditGeom) setSel({ kind: "table", id: ls.id }); chairClick(ls.id, 0); }}>
                      <Circle radius={13} fill={occ ? "#7e3b41" : "#fffdf9"} stroke={isSel || sel?.id === ls.id ? "#121212" : "#c9a24a"} strokeWidth={isSel || sel?.id === ls.id ? 2.5 : 1.5} />
                      <Text x={-13} y={-5} width={26} align="center" text={occ ? initialsOf(occ.name) : "◦"} fontSize={occ ? 9 : 12} fill={occ ? "#f7f4ee" : "#c9a24a"} />
                    </Group>
                  </Group>
                );
              })}
              {canEditGeom ? <Transformer ref={trRef} rotationSnaps={[0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345]} keepRatio={false} enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]} boundBoxFunc={(o, n) => (n.width < 40 || n.height < 30 ? o : n)} /> : null}
            </Layer>
          </Stage>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11.5px] text-muted">
          <button onClick={() => setScale((s) => Math.min(1.2, s + 0.1))} className="rounded bg-bone px-2 py-0.5 hover:text-ink">+</button>
          <button onClick={() => setScale((s) => Math.max(0.3, s - 0.1))} className="rounded bg-bone px-2 py-0.5 hover:text-ink">−</button>
          <span>{Math.round(scale * 100)}%</span>
          <span className="mx-1 h-3 w-px bg-hairline" />
          <button onClick={exportPNG} className="rounded bg-bone px-2 py-0.5 hover:text-ink">{t("exportPNG")}</button>
          <Link href={props.printHref} className="rounded bg-bone px-2 py-0.5 hover:text-ink" target="_blank">{t("exportPrint")}</Link>
          {selectedTable && canEditGeom ? (
            <TableInspector
              table={selectedTable} tables={realTables} t={t}
              onName={(name) => { setTables((ts) => ts.map((x) => (x.id === selectedTable.id ? { ...x, name } : x))); whisper(updateTableProps(selectedTable.id, { name })); }}
              onCapacity={(capacity) => { setTables((ts) => ts.map((x) => (x.id === selectedTable.id ? { ...x, capacity } : x))); whisper(updateTableProps(selectedTable.id, { capacity })); }}
              onSides={(s) => setSides(selectedTable.id, s)}
              onDuplicate={() => duplicate(selectedTable.id)}
              onDelete={() => removeTable(selectedTable.id)}
              onGroup={(tid) => group(selectedTable.id, tid)}
            />
          ) : null}
        </div>
      </div>

      <aside className="w-full shrink-0 lg:w-[280px]">
        <div className="rounded-[var(--radius)] bg-bone p-4">
          <p className="mb-2 font-display text-[15px] text-ink">{t("attending", { count: props.attendingCount })}</p>
          {chair && !pickGuest ? (
            <div className="mb-3 rounded-[var(--radius)] bg-bone p-3">
              <p className="mb-2 text-[12px] text-muted">{t("chairAt", { table: chairTable?.name ?? "", seat: seatLabel(chair.seatNo) })}</p>
              {occupant ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13.5px] text-ink">{occupant.name}{occupant.diet.length ? <span className="ml-1 text-[11px] text-taupe">· {occupant.diet.join(", ")}</span> : null}</span>
                  {canSeat ? <button onClick={() => unseat(occupant.guestId)} className="rounded-[var(--radius)] bg-bone px-2.5 py-1 text-[11.5px] text-wine">{t("unseat")}</button> : null}
                </div>
              ) : canSeat ? (
                <>
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("searchUnseated")} className="mb-2 w-full rounded-[var(--radius)] bg-bone px-2.5 py-1.5 text-[13px] text-ink outline-none" />
                  <div className="flex max-h-40 flex-col gap-1 overflow-auto">
                    {unseated.map((a) => (
                      <button key={a.guestId} onClick={() => seat(a.guestId)} className="flex items-center justify-between rounded-[var(--radius)] px-2 py-1 text-left text-[13px] text-ink hover:bg-bone">
                        <span>{a.name}</span>{a.diet.length ? <span className="text-[10.5px] text-taupe">{a.diet.join(", ")}</span> : null}
                      </button>
                    ))}
                    {unseated.length === 0 ? <p className="px-2 py-1 text-[12px] text-muted">{t("allSeated")}</p> : null}
                  </div>
                </>
              ) : <p className="text-[12.5px] text-muted">{t("readOnly")}</p>}
              <button onClick={() => setChair(null)} className="mt-2 text-[11.5px] text-muted hover:text-ink">{t("close")}</button>
            </div>
          ) : null}
          {/* §E guest-first: click a name to pick it up, then click any empty chair */}
          <div className="flex max-h-[440px] flex-col gap-0.5 overflow-auto">
            {props.attendees.map((a) => {
              const picked = pickGuest === a.guestId;
              return (
                <button key={a.guestId} disabled={!canSeat}
                  onClick={() => { if (a.seated) { unseat(a.guestId); } else { setChair(null); setPickGuest(picked ? null : a.guestId); } }}
                  className={`flex items-center gap-2 rounded-[var(--radius)] px-2 py-1 text-left text-[13px] ${picked ? "bg-ink text-bone" : "hover:bg-bone"}`}>
                  <span className={picked ? "text-bone" : a.seated ? "text-teal" : "text-muted"}>{a.seated ? "✓" : "·"}</span>
                  <span className={picked ? "text-bone" : a.seated ? "text-ink" : "text-taupe"}>{a.name}</span>
                  {a.diet.length ? <span className={`ml-auto text-[10.5px] ${picked ? "text-bone/70" : "text-taupe"}`}>{a.diet.join(", ")}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      </aside>
    </div>
  );
}

function TableInspector({
  table, tables, t, onName, onCapacity, onSides, onDuplicate, onDelete, onGroup,
}: {
  table: Table; tables: Table[]; t: ReturnType<typeof useTranslations>;
  onName: (name: string) => void; onCapacity: (capacity: number) => void; onSides: (s: SeatSides) => void;
  onDuplicate: () => void; onDelete: () => void; onGroup: (tableId: string | null) => void;
}) {
  if (table.isLoose) {
    // A loose seat: rename + group-with-a-table + delete.
    return (
      <span className="ml-auto flex flex-wrap items-center gap-2">
        <span className="text-[11.5px] text-taupe">{t("looseSeat")}</span>
        <input defaultValue={table.name} onBlur={(e) => e.target.value !== table.name && onName(e.target.value)} className="w-24 rounded bg-bone px-2 py-0.5 text-[12px] text-ink outline-none" />
        <label className="flex items-center gap-1 text-[11.5px] text-muted">{t("groupWith")}
          <select value={table.groupedWith ?? ""} onChange={(e) => onGroup(e.target.value || null)} className="rounded bg-bone px-1.5 py-0.5 text-[12px] text-ink outline-none">
            <option value="">·</option>
            {tables.map((tb) => <option key={tb.id} value={tb.id}>{tb.name}</option>)}
          </select>
        </label>
        <button onClick={onDelete} className="rounded bg-bone px-2 py-0.5 text-[11.5px] text-wine">{t("delete")}</button>
      </span>
    );
  }
  return (
    <span className="ml-auto flex flex-wrap items-center gap-2">
      <input defaultValue={table.name} onBlur={(e) => e.target.value !== table.name && onName(e.target.value)} className="w-24 rounded bg-bone px-2 py-0.5 text-[12px] text-ink outline-none" />
      <span className="flex items-center gap-1 text-[11.5px] text-muted">{t("seats")}
        <button onClick={() => onCapacity(Math.max(1, table.capacity - 1))} className="rounded bg-bone px-1.5 py-0.5 text-ink">−</button>
        <span className="w-6 text-center text-[12px] text-ink">{table.capacity}</span>
        <button onClick={() => onCapacity(Math.min(100, table.capacity + 1))} className="rounded bg-bone px-1.5 py-0.5 text-ink">+</button>
      </span>
      {table.shape !== "round" ? (
        <label className="flex items-center gap-1 text-[11.5px] text-muted">{t("seatedOn")}
          <select value={table.seatSides} onChange={(e) => onSides(e.target.value as SeatSides)} className="rounded bg-bone px-1.5 py-0.5 text-[12px] text-ink outline-none">
            <option value="all">{t("sidesAll")}</option>
            <option value="long">{t("sidesLong")}</option>
            <option value="one">{t("sidesOne")}</option>
          </select>
        </label>
      ) : null}
      <button onClick={onDuplicate} className="rounded bg-bone px-2 py-0.5 text-[11.5px] text-ink">{t("duplicate")}</button>
      <button onClick={onDelete} className="rounded bg-bone px-2 py-0.5 text-[11.5px] text-wine">{t("delete")}</button>
    </span>
  );
}
