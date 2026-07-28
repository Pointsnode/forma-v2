"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Stage, Layer, Group, Circle, Rect, Text, Transformer } from "react-konva";
import type Konva from "konva";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { seatLabel, seatPositions } from "@/lib/seat-geometry.mjs";
import {
  addTable, addElement, moveItem, updateTableGeometry, updateElementGeometry, updateTableProps,
  deleteTable, deleteElement, assignSeatAt, unseatGuest,
} from "@/app/[locale]/(app)/wedding/[id]/floor-actions";

type Seat = { seatNo: number; guestId: string; name: string; diet: string[] };
type Table = { id: string; name: string; capacity: number; shape: "round" | "rect" | "banquet"; x: number; y: number; rotation: number; width: number; height: number; seats: Seat[] };
type Element = { id: string; kind: string; label: string | null; x: number; y: number; rotation: number; width: number; height: number };
type Attendee = { guestId: string; name: string; diet: string[]; seated: boolean };
type Exception = { guestId: string; name: string; rsvp: string; tableId: string; seatNo: number };

export type FloorEditorProps = {
  eventId: string; weddingId: string; planId: string;
  canvas: { w: number; h: number };
  tables: Table[]; elements: Element[]; attendees: Attendee[]; exceptions: Exception[];
  seatedCount: number; attendingCount: number;
  role: "staff" | "couple" | "view"; coupleCanEdit: boolean;
};

const SHAPES = ["round", "rect", "banquet"] as const;
const DECOR = ["stage", "dancefloor", "dj_booth", "bar", "buffet", "cake_table", "entrance", "exit", "restroom", "photo_booth", "lounge", "custom"] as const;
const snap = (v: number) => Math.round(v / 10) * 10;
const initialsOf = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "·";

export function FloorEditor(props: FloorEditorProps) {
  const t = useTranslations("floor");
  const [tables, setTables] = useState<Table[]>(props.tables);
  const [elements, setElements] = useState<Element[]>(props.elements);
  const [sel, setSel] = useState<{ kind: "table" | "element"; id: string } | null>(null);
  const [chair, setChair] = useState<{ tableId: string; seatNo: number } | null>(null);
  const [search, setSearch] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [scale, setScale] = useState(0.6);
  const trRef = useRef<Konva.Transformer>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const nodeRefs = useRef<Map<string, Konva.Group>>(new Map());
  const flush = useRef<ReturnType<typeof setTimeout> | null>(null);

  function exportPNG() {
    const stage = stageRef.current;
    if (!stage) return;
    const url = stage.toDataURL({ pixelRatio: 2 });
    const a = document.createElement("a");
    a.href = url; a.download = "floor-plan.png"; a.click();
  }

  // Re-sync local (optimistic) state to the server's after a refresh — the
  // store-previous-props pattern (render-phase, not an effect).
  const [snap0, setSnap0] = useState({ t: props.tables, e: props.elements });
  if (snap0.t !== props.tables || snap0.e !== props.elements) {
    setSnap0({ t: props.tables, e: props.elements });
    setTables(props.tables);
    setElements(props.elements);
  }

  // the editor is interactive when staff, or couple with the lens on
  const canMove = props.role === "staff" || (props.role === "couple" && props.coupleCanEdit);
  const canEditGeom = props.role === "staff"; // create/resize/rotate/delete
  const canSeat = canMove;

  // attach transformer to the selected node (staff only)
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const node = sel && canEditGeom ? nodeRefs.current.get(sel.id) ?? null : null;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [sel, canEditGeom, tables, elements]);

  useEffect(() => {
    if (!canEditGeom) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && sel && !chair) {
        e.preventDefault();
        if (sel.kind === "table") { setTables((ts) => ts.filter((x) => x.id !== sel.id)); deleteTable(sel.id); }
        else { setElements((es) => es.filter((x) => x.id !== sel.id)); deleteElement(sel.id); }
        setSel(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel, chair, canEditGeom]);

  function whisper(p: Promise<{ error?: string }>) {
    setSaveState("saving");
    p.then((r) => setSaveState(r?.error ? "error" : "saved")).catch(() => setSaveState("error"));
    if (flush.current) clearTimeout(flush.current);
    flush.current = setTimeout(() => setSaveState("idle"), 1400);
  }

  const seatedIds = useMemo(() => new Set(tables.flatMap((tb) => tb.seats.map((s) => s.guestId))), [tables]);
  const unseated = props.attendees.filter((a) => !seatedIds.has(a.guestId) && a.name.toLowerCase().includes(search.toLowerCase()));
  const chairTable = chair ? tables.find((tb) => tb.id === chair.tableId) : null;
  const occupant = chairTable?.seats.find((s) => s.seatNo === chair!.seatNo) ?? null;

  function addShape(shape: "round" | "rect" | "banquet") {
    whisper(addTable(props.planId, props.weddingId, shape, 60, 60).then((r) => { if (r.id) setTables((ts) => [...ts, { id: r.id!, name: `Table ${ts.length + 1}`, capacity: 8, shape, x: 60, y: 60, rotation: 0, width: shape === "round" ? 120 : 200, height: shape === "round" ? 120 : 90, seats: [] }]); return r; }));
  }
  function addDecor(kind: string) {
    whisper(addElement(props.planId, props.weddingId, kind, 60, 60, null).then((r) => { if (r.id) setElements((es) => [...es, { id: r.id!, kind, label: null, x: 60, y: 60, rotation: 0, width: 120, height: 80 }]); return r; }));
  }

  function onDragEndItem(kind: "table" | "element", id: string, node: Konva.Group) {
    const x = snap(node.x()), y = snap(node.y());
    node.position({ x, y });
    if (kind === "table") setTables((ts) => ts.map((tb) => (tb.id === id ? { ...tb, x, y } : tb)));
    else setElements((es) => es.map((el) => (el.id === id ? { ...el, x, y } : el)));
    whisper(moveItem(kind, id, x, y, null)); // couple-safe move path
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

  function seat(guestId: string) {
    if (!chair) return;
    const c = chair;
    whisper(assignSeatAt(props.eventId, guestId, c.tableId, c.seatNo).then((r) => {
      if (!r.error) {
        const a = props.attendees.find((x) => x.guestId === guestId);
        setTables((ts) => ts.map((tb) => (tb.id === c.tableId ? { ...tb, seats: [...tb.seats.filter((s) => s.seatNo !== c.seatNo), { seatNo: c.seatNo, guestId, name: a?.name ?? "—", diet: a?.diet ?? [] }] } : tb)));
        setChair(null);
      }
      return r;
    }));
  }
  function unseat(guestId: string) {
    whisper(unseatGuest(props.eventId, guestId).then((r) => {
      if (!r.error) { setTables((ts) => ts.map((tb) => ({ ...tb, seats: tb.seats.filter((s) => s.guestId !== guestId) }))); setChair(null); }
      return r;
    }));
  }

  const selectedTable = sel?.kind === "table" ? tables.find((x) => x.id === sel.id) : null;

  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      <div className="min-w-0 flex-1">
        {/* toolbar */}
        {canEditGeom ? (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {SHAPES.map((sh) => <button key={sh} onClick={() => addShape(sh)} className="rounded-lg bg-ink px-2.5 py-1.5 text-[12px] text-bone">+ {t(`shape_${sh}`)}</button>)}
            <span className="mx-1 h-4 w-px bg-hairline" />
            {DECOR.map((d) => <button key={d} onClick={() => addDecor(d)} className="rounded-lg bg-bone px-2.5 py-1.5 text-[12px] text-taupe hover:text-ink">+ {t(`kind_${d}`)}</button>)}
            <span className="ml-auto text-[11.5px] text-muted">{saveState === "saving" ? t("saving") : saveState === "saved" ? t("saved") : saveState === "error" ? t("saveError") : ""}</span>
          </div>
        ) : (
          <div className="mb-2 flex items-center gap-2 text-[12px] text-muted">
            <span className="rounded-full bg-bone px-2.5 py-1">{props.coupleCanEdit ? t("coupleCanEdit") : t("readOnly")}</span>
            <span className="ml-auto">{saveState === "saving" ? t("saving") : saveState === "saved" ? t("saved") : ""}</span>
          </div>
        )}

        <p className="mb-1.5 text-[12.5px] text-muted">{t("totals", { seated: props.seatedCount, attending: props.attendingCount })}</p>
        {props.exceptions.length ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {props.exceptions.map((e) => (
              <button key={e.guestId} onClick={() => canSeat && unseat(e.guestId)} className="rounded-full bg-wine-soft px-2.5 py-1 text-[11.5px] text-wine hover:bg-wine hover:text-bone" title={t("exceptionHint")}>
                {t("exception", { name: e.name })}
              </button>
            ))}
          </div>
        ) : null}

        <div className="overflow-auto rounded-2xl bg-paper shadow-card" style={{ maxHeight: 620 }}>
          <Stage ref={stageRef} width={props.canvas.w * scale} height={props.canvas.h * scale} scaleX={scale} scaleY={scale}
            onMouseDown={(e) => { if (e.target === e.target.getStage()) { setSel(null); setChair(null); } }}>
            <Layer>
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
              {tables.map((tb) => {
                const chairs = seatPositions(tb.shape, tb.capacity, tb.width, tb.height, 0) as { x: number; y: number }[];
                return (
                  <Group key={tb.id} ref={(n) => { if (n) nodeRefs.current.set(tb.id, n); }}
                    x={tb.x} y={tb.y} rotation={tb.rotation} draggable={canMove}
                    onClick={() => canEditGeom && setSel({ kind: "table", id: tb.id })} onTap={() => canEditGeom && setSel({ kind: "table", id: tb.id })}
                    onDragEnd={(e) => onDragEndItem("table", tb.id, e.target as Konva.Group)}
                    onTransformEnd={(e) => onTransformEndItem("table", tb.id, e.target as Konva.Group)}>
                    {tb.shape === "round"
                      ? <Circle radius={tb.width / 2} fill="#fffdf9" stroke={sel?.id === tb.id ? "#121212" : "#d8c7b0"} strokeWidth={2} />
                      : <Rect x={-tb.width / 2} y={-tb.height / 2} width={tb.width} height={tb.height} cornerRadius={8} fill="#fffdf9" stroke={sel?.id === tb.id ? "#121212" : "#d8c7b0"} strokeWidth={2} />}
                    <Text x={-tb.width / 2} y={-9} width={tb.width} align="center" text={`${tb.name}  ${tb.seats.length}/${tb.capacity}`} fontSize={13} fill="#121212" />
                    {chairs.map((pos, i) => {
                      const occ = tb.seats.find((s) => s.seatNo === i);
                      const isSel = chair?.tableId === tb.id && chair?.seatNo === i;
                      return (
                        <Group key={i} x={pos.x} y={pos.y} onClick={(e) => { e.cancelBubble = true; if (canSeat) setChair({ tableId: tb.id, seatNo: i }); }} onTap={(e) => { e.cancelBubble = true; if (canSeat) setChair({ tableId: tb.id, seatNo: i }); }}>
                          <Circle radius={11} fill={occ ? "#7e3b41" : "#fffdf9"} stroke={isSel ? "#121212" : "#eae6dc"} strokeWidth={isSel ? 2.5 : 1} />
                          <Text x={-11} y={-5} width={22} align="center" text={occ ? initialsOf(occ.name) : seatLabel(i)} fontSize={occ ? 8 : 9} fill={occ ? "#f7f4ee" : "#8a867e"} />
                        </Group>
                      );
                    })}
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
          <Link href={`/wedding/${props.weddingId}/event/${props.eventId}/seating/print`} className="rounded bg-bone px-2 py-0.5 hover:text-ink" target="_blank">{t("exportPrint")}</Link>
          {selectedTable && canEditGeom ? <TableInspector table={selectedTable} onChange={(p) => { setTables((ts) => ts.map((x) => (x.id === selectedTable.id ? { ...x, ...p } : x))); whisper(updateTableProps(selectedTable.id, p)); }} t={t} /> : null}
        </div>
      </div>

      {/* sidebar: attending checklist */}
      <aside className="w-full shrink-0 lg:w-[280px]">
        <div className="rounded-2xl bg-paper p-4 shadow-card">
          <p className="mb-2 font-display text-[15px] text-ink">{t("attending", { count: props.attendingCount })}</p>
          {chair ? (
            <div className="mb-3 rounded-xl bg-bone p-3">
              <p className="mb-2 text-[12px] text-muted">{t("chairAt", { table: chairTable?.name ?? "", seat: seatLabel(chair.seatNo) })}</p>
              {occupant ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13.5px] text-ink">{occupant.name}{occupant.diet.length ? <span className="ml-1 text-[11px] text-taupe">· {occupant.diet.join(", ")}</span> : null}</span>
                  {canSeat ? <button onClick={() => unseat(occupant.guestId)} className="rounded-full bg-wine-soft px-2.5 py-1 text-[11.5px] text-wine">{t("unseat")}</button> : null}
                </div>
              ) : canSeat ? (
                <>
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("searchUnseated")} className="mb-2 w-full rounded-lg bg-paper px-2.5 py-1.5 text-[13px] text-ink shadow-card outline-none" />
                  <div className="flex max-h-40 flex-col gap-1 overflow-auto">
                    {unseated.map((a) => (
                      <button key={a.guestId} onClick={() => seat(a.guestId)} className="flex items-center justify-between rounded-lg px-2 py-1 text-left text-[13px] text-ink hover:bg-paper">
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
          <div className="flex max-h-[420px] flex-col gap-0.5 overflow-auto">
            {props.attendees.map((a) => (
              <div key={a.guestId} className="flex items-center gap-2 py-1 text-[13px]">
                <span className={a.seated ? "text-sage-ink" : "text-muted"}>{a.seated ? "✓" : "·"}</span>
                <span className={a.seated ? "text-ink" : "text-taupe"}>{a.name}</span>
                {a.diet.length ? <span className="ml-auto text-[10.5px] text-taupe">{a.diet.join(", ")}</span> : null}
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

function TableInspector({ table, onChange, t }: { table: Table; onChange: (p: { name?: string; capacity?: number }) => void; t: ReturnType<typeof useTranslations> }) {
  return (
    <span className="ml-auto flex items-center gap-2">
      <input defaultValue={table.name} onBlur={(e) => e.target.value !== table.name && onChange({ name: e.target.value })} className="w-24 rounded bg-bone px-2 py-0.5 text-[12px] text-ink outline-none" />
      <label className="flex items-center gap-1 text-[11.5px] text-muted">{t("capacity")}
        <input type="number" min={1} max={100} defaultValue={table.capacity} onBlur={(e) => Number(e.target.value) !== table.capacity && onChange({ capacity: Number(e.target.value) })} className="w-14 rounded bg-bone px-1.5 py-0.5 text-[12px] text-ink outline-none" />
      </label>
    </span>
  );
}
