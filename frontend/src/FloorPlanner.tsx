import React, {
  useState, useCallback, useEffect, useRef,
} from "react";
import type { CSSProperties } from "react";
import type {
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from "react";
import {
  MousePointer2, Square, DoorOpen, Armchair,
  Users, Tag, Leaf, Undo2, Redo2,
  Save, Eye, Send, Layers, Lock, GripVertical, X,
  Plus, Minus, Copy, Trash2, HelpCircle, ChevronDown,
  Triangle, Maximize2, Menu, Sofa, RectangleHorizontal,
  Palette, ArrowLeft, Coffee, Refrigerator, Server,
  Bath, UtensilsCrossed, CircleDot, Hand, RotateCw, Upload, Download,
  Phone, PhoneCall, Presentation, Tv, Printer, Droplet, Star, StarOff,
  Building2, Building, Check,
} from "lucide-react";

import doorPng from "./assets/icons/door.png";
import plantPng from "./assets/icons/plant.png";

export type ObjectType =
  | "desk" | "chair" | "conference-table" | "round-table"
  | "wall" | "door" | "plant" | "sofa"
  | "basin" | "kitchen" | "fridge" | "server"
  | "room" | "meeting-room" | "label"
  | "whiteboard" | "tv" | "printer" | "water-cooler"
  | "coffee" | "phone-booth" | "lockers" | "call-pod";

export type ZoneType =
  | "Meeting Rooms" | "Open Desks" | "Reception"
  | "Kitchen" | "Bathroom" | "Storage" | "Common Area"
  | "Canteen" | "Server Room";

export type LayerGroupName =
  | "Meeting Room" | "Board Room" | "Desks" | "Reception"
  | "Kitchen" | "Walls" | "Floor" | "Furniture";

type ToolId =
  | "select" | "pan" | "room" | "wall" | "door" | "desk" | "chair"
  | "sofa" | "conference-table" | "round-table"
  | "basin" | "kitchen" | "fridge" | "server"
  | "meeting-room" | "label" | "plant"
  | "whiteboard" | "tv" | "printer" | "water-cooler"
  | "coffee" | "phone-booth" | "lockers" | "call-pod";

type SavedStatus = "saved" | "unsaved" | "saving";

export type FloorId = "downstairs" | "upstairs";

export interface FloorObject {
  id:         string;
  type:       ObjectType;
  label:      string;
  x:          number;
  y:          number;
  w:          number;
  h:          number;
  iso:        Record<string, unknown>;
  zone:       ZoneType;
  isBookable: boolean;
  layerGroup: LayerGroupName;
  isVisible:  boolean;
  customColor?: string;
  rotation?:  number;
  imageSrc?:  string;
}

interface LayerEntry {
  name:      LayerGroupName;
  isVisible: boolean;
  isLocked:  boolean;
  colour?:   string;
}

type HandleId = "N" | "S" | "E" | "W" | "NE" | "NW" | "SE" | "SW" | "ROT";

interface RendererProps {
  obj:      FloorObject;
  selected: boolean;
  handlers: {
    onPointerDown: (e: ReactPointerEvent<SVGGElement>) => void;
  };
  readOnly?: boolean;
  onHandleDown?: (e: ReactPointerEvent<Element>, handle: HandleId) => void;
}

const BRAND = "#0D9488";
const GRID  = 8;

const WALL_COLOR   = "#C9B89B";
const WALL_STROKE  = "#A89878";
const ROOM_FILL    = "#F7F3EC";
const ROOM_STROKE  = "#CBBfa6";

const WORLD_W = 12000;
const WORLD_H = 9000;
const WORLD_CX = WORLD_W / 2;
const WORLD_CY = WORLD_H / 2;

const CONTENT_OX = WORLD_CX - 600;
const CONTENT_OY = WORLD_CY - 420;

let _uid = 1;
function getId(): string { return `obj-${_uid++}`; }
function syncIdCounter(loaded: FloorObject[]): void {
  let max = 0;
  for (const o of loaded) {
    const m = /^obj-(\d+)$/.exec(o.id);
    if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
  }
  if (max >= _uid) _uid = max + 1;
}
function snap(v: number, free: boolean): number {
  return free ? Math.round(v) : Math.round(v / GRID) * GRID;
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
const d2r = (d: number) => (d * Math.PI) / 180;

function toLocalDelta(dx: number, dy: number, rotDeg: number) {
  const a = -d2r(rotDeg);
  return {
    lx: dx * Math.cos(a) - dy * Math.sin(a),
    ly: dx * Math.sin(a) + dy * Math.cos(a),
  };
}

function resizeRect(
  rect: { x: number; y: number; w: number; h: number; rotation?: number },
  handle: HandleId,
  dxWorld: number,
  dyWorld: number,
  minSize = 4,
) {
  const { x, y, w, h } = rect;
  const rotation = rect.rotation ?? 0;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const { lx, ly } = toLocalDelta(dxWorld, dyWorld, rotation);

  let nw = w, nh = h, shiftLX = 0, shiftLY = 0;
  if (handle.includes("E")) { nw = Math.max(minSize, w + lx); shiftLX = (nw - w) / 2; }
  if (handle.includes("W")) { nw = Math.max(minSize, w - lx); shiftLX = -(nw - w) / 2; }
  if (handle.includes("S")) { nh = Math.max(minSize, h + ly); shiftLY = (nh - h) / 2; }
  if (handle.includes("N")) { nh = Math.max(minSize, h - ly); shiftLY = -(nh - h) / 2; }

  const a = d2r(rotation);
  const wdx = shiftLX * Math.cos(a) - shiftLY * Math.sin(a);
  const wdy = shiftLX * Math.sin(a) + shiftLY * Math.cos(a);
  const ncx = cx + wdx, ncy = cy + wdy;
  return { x: ncx - nw / 2, y: ncy - nh / 2, w: nw, h: nh };
}

const ROOM_SWATCHES = [
  "#F7F3EC", "#EAF4FB", "#FCE7E7", "#E8F5E9",
  "#FFF4E0", "#EDE7F6", "#E0F2F1", "#F4F4F5",
];

function SvgDefs() {
  return (
    <defs>
      <filter id="ic-shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="2.5"
          floodColor="#0F172A" floodOpacity="0.16"/>
      </filter>
      <filter id="ic-glow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="0" stdDeviation="5"
          floodColor="#0D9488" floodOpacity="0.9"/>
      </filter>
      <filter id="ic-soft" x="-25%" y="-25%" width="150%" height="150%">
        <feDropShadow dx="0" dy="1.5" stdDeviation="2"
          floodColor="#0F172A" floodOpacity="0.12"/>
      </filter>
      <linearGradient id="wall-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"  stopColor="#D8C8A8"/>
        <stop offset="100%" stopColor="#C2B091"/>
      </linearGradient>
      <pattern id="world-grid" width={40} height={40} patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#E4E9F0" strokeWidth={1}/>
      </pattern>
      <pattern id="world-grid-major" width={200} height={200} patternUnits="userSpaceOnUse">
        <path d="M 200 0 L 0 0 0 200" fill="none" stroke="#D4DCE6" strokeWidth={1.5}/>
      </pattern>
    </defs>
  );
}

function SelectionOverlay({
  obj, onHandleDown,
}: {
  obj: FloorObject;
  onHandleDown: (e: ReactPointerEvent<Element>, handle: HandleId) => void;
}) {
  const { x, y, w, h } = obj;
  const rot = obj.rotation ?? 0;
  const cx = x + w / 2, cy = y + h / 2;
  const HS = 10;

  const edgeHandles: { id: HandleId; hx: number; hy: number; cursor: string }[] = [
    { id: "N", hx: cx,     hy: y,     cursor: "ns-resize" },
    { id: "S", hx: cx,     hy: y + h, cursor: "ns-resize" },
    { id: "W", hx: x,      hy: cy,    cursor: "ew-resize" },
    { id: "E", hx: x + w,  hy: cy,    cursor: "ew-resize" },
  ];
  const cornerHandles: { id: HandleId; hx: number; hy: number; cursor: string }[] = [
    { id: "NW", hx: x,     hy: y,     cursor: "nwse-resize" },
    { id: "NE", hx: x + w, hy: y,     cursor: "nesw-resize" },
    { id: "SW", hx: x,     hy: y + h, cursor: "nesw-resize" },
    { id: "SE", hx: x + w, hy: y + h, cursor: "nwse-resize" },
  ];
  const rotY = y - 34;

  return (
    <g transform={`rotate(${rot} ${cx} ${cy})`}>
      <rect x={x - 4} y={y - 4} width={w + 8} height={h + 8}
        fill="none" stroke={BRAND} strokeWidth={2} strokeDasharray="6 4" rx={3}
        pointerEvents="none"/>

      {}
      <line x1={cx} y1={y - 4} x2={cx} y2={rotY + 9} stroke={BRAND} strokeWidth={1.5} pointerEvents="none"/>
      <circle cx={cx} cy={rotY} r={9} fill="#fff" stroke={BRAND} strokeWidth={2}
        style={{ cursor: "grab" }} onPointerDown={(e) => onHandleDown(e, "ROT")}/>
      <g transform={`translate(${cx - 5},${rotY - 5})`} pointerEvents="none">
        <path d="M1 5 A4 4 0 1 1 5 9" fill="none" stroke={BRAND} strokeWidth={1.4}/>
        <path d="M5 9 l-1.7 -0.3 M5 9 l0.3 -1.7" stroke={BRAND} strokeWidth={1.4} strokeLinecap="round"/>
      </g>

      {edgeHandles.map(hd => (
        <rect key={hd.id} x={hd.hx - HS/2} y={hd.hy - HS/2} width={HS} height={HS} rx={2}
          fill="#fff" stroke={BRAND} strokeWidth={2}
          style={{ cursor: hd.cursor }} onPointerDown={(e) => onHandleDown(e, hd.id)}/>
      ))}
      {cornerHandles.map(hd => (
        <rect key={hd.id} x={hd.hx - HS/2} y={hd.hy - HS/2} width={HS} height={HS} rx={2}
          fill={BRAND} stroke="#fff" strokeWidth={2}
          style={{ cursor: hd.cursor }} onPointerDown={(e) => onHandleDown(e, hd.id)}/>
      ))}
    </g>
  );
}

function SelectRing({ obj }: { obj: FloorObject }) {
  const { x, y, w, h } = obj;
  const rot = obj.rotation ?? 0;
  const cx = x + w / 2, cy = y + h / 2;
  return (
    <g transform={`rotate(${rot} ${cx} ${cy})`} pointerEvents="none">
      <rect x={x - 6} y={y - 6} width={w + 12} height={h + 12}
        fill="none" stroke={BRAND} strokeWidth={2} strokeDasharray="5 4" rx={3}/>
    </g>
  );
}

function CanvasScrollbars({
  pan, zoom, viewW, viewH, worldW, worldH, onPan,
}: {
  pan: {x:number;y:number}; zoom:number;
  viewW:number; viewH:number; worldW:number; worldH:number;
  onPan: (p:{x:number;y:number}) => void;
}) {
  const drag = useRef<{axis:"x"|"y"; start:number; startPan:number}|null>(null);

  const visW = viewW / zoom, visH = viewH / zoom;

  const worldLeft = -pan.x / zoom, worldTop = -pan.y / zoom;

  const TRACK = 12;

  const hThumbW = clamp((visW / worldW) * viewW, 30, viewW);
  const hMax = viewW - hThumbW;
  const hThumbX = clamp((worldLeft / Math.max(1, worldW - visW)) * hMax, 0, hMax);

  const vThumbH = clamp((visH / worldH) * viewH, 30, viewH);
  const vMax = viewH - vThumbH;
  const vThumbY = clamp((worldTop / Math.max(1, worldH - visH)) * vMax, 0, vMax);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current; if (!d) return;
      if (d.axis==="x") {
        const dxPx = e.clientX - d.start;
        const frac = (d.startPan + dxPx) / Math.max(1,hMax);
        const worldX = clamp(frac,0,1) * Math.max(0, worldW - visW);
        onPan({ x: -worldX*zoom, y: pan.y });
      } else {
        const dyPx = e.clientY - d.start;
        const frac = (d.startPan + dyPx) / Math.max(1,vMax);
        const worldY = clamp(frac,0,1) * Math.max(0, worldH - visH);
        onPan({ x: pan.x, y: -worldY*zoom });
      }
    };
    const up = () => { drag.current = null; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove",move); window.removeEventListener("pointerup",up); };
  }, [pan.x, pan.y, zoom, hMax, vMax, visW, visH, worldW, worldH, onPan]);

  const thumbStyle: CSSProperties = {
    position:"absolute", backgroundColor:"#94A3B8", borderRadius:6,
    opacity:0.55, cursor:"pointer",
  };

  if (viewW<=0 || viewH<=0) return null;
  return (
    <>
      {}
      <div style={{position:"absolute",left:0,right:TRACK,bottom:0,height:TRACK,backgroundColor:"rgba(226,232,240,0.6)",zIndex:15}}>
        <div
          onPointerDown={(e)=>{ drag.current={axis:"x",start:e.clientX,startPan:hThumbX}; }}
          style={{...thumbStyle, left:hThumbX, top:2, height:TRACK-4, width:hThumbW}}/>
      </div>
      {}
      <div style={{position:"absolute",top:0,bottom:TRACK,right:0,width:TRACK,backgroundColor:"rgba(226,232,240,0.6)",zIndex:15}}>
        <div
          onPointerDown={(e)=>{ drag.current={axis:"y",start:e.clientY,startPan:vThumbY}; }}
          style={{...thumbStyle, top:vThumbY, left:2, width:TRACK-4, height:vThumbH}}/>
      </div>
    </>
  );
}

function IconImage({
  obj, selected, handlers, src, showLabel = true, readOnly,
}: RendererProps & { src: string; showLabel?: boolean }) {
  const { x, y, w, h, label } = obj;
  const rot = obj.rotation ?? 0;
  const cx = x + w / 2, cy = y + h / 2;
  return (
    <g>
      <g
        transform={`rotate(${rot} ${cx} ${cy})`}
        {...(readOnly ? {} : handlers)}
        style={{ cursor: readOnly ? "default" : "grab" }}
        filter={selected ? "url(#ic-glow)" : "url(#ic-shadow)"}
      >
        <image href={obj.imageSrc ?? src} x={x} y={y} width={w} height={h}
          preserveAspectRatio="xMidYMid meet"/>
        {showLabel && label && (
          <text x={cx} y={y + h + 13}
            textAnchor="middle" fontSize="10" fontWeight="700"
            fill="#334155" pointerEvents="none"
            style={{ fontFamily: "system-ui,sans-serif" }}>
            {label}
          </text>
        )}
      </g>
      {selected && !readOnly && <SelectRing obj={obj}/>}
    </g>
  );
}

function VectorShell({
  obj, selected, handlers, readOnly, onHandleDown, children, labelOffset = 14, accent, hideLabel = false,
}: RendererProps & { children: React.ReactNode; labelOffset?: number; accent?: string; hideLabel?: boolean }) {
  const { x, y, w, h, label } = obj;
  const rot = obj.rotation ?? 0;
  const cx = x + w / 2, cy = y + h / 2;
  return (
    <g>
      <g
        transform={`rotate(${rot} ${cx} ${cy})`}
        {...(readOnly ? {} : handlers)}
        style={{ cursor: readOnly ? "default" : "grab" }}
        filter={selected ? "url(#ic-glow)" : "url(#ic-soft)"}
      >
        {children}
      </g>
      {label && !hideLabel && (
        <g pointerEvents="none">
          <text x={cx} y={y + h + labelOffset + 8} textAnchor="middle"
            fontSize="24" fontWeight="700" fill={accent ?? "#1E293B"}
            style={{ fontFamily: "system-ui,-apple-system,sans-serif", letterSpacing: "0.01em", paintOrder: "stroke" }}
            stroke="#FBF9F4" strokeWidth={4} strokeLinejoin="round">
            {label}
          </text>
        </g>
      )}
      {selected && !readOnly && onHandleDown && (
        <SelectionOverlay obj={obj} onHandleDown={onHandleDown}/>
      )}
    </g>
  );
}

function DeskRenderer(p: RendererProps) {
  const { x, y, w, h } = p.obj;
  const accent = p.obj.customColor ?? (p.obj.isBookable ? "#0D9488" : "#94A3B8");
  const deskH = h * 0.46;
  const deskY = y;
  const cx = x + w / 2;
  const chW = w * 0.62;
  const chX = cx - chW / 2;
  const chY = y + h * 0.50;
  const chH = h * 0.50;
  const labelSize = Math.max(14, Math.min(h * 0.16, w * 0.20));
  return (
    <VectorShell {...p} hideLabel>
      <rect x={chX + chW * 0.18} y={chY} width={chW * 0.64} height={chH * 0.22} rx={4}
        fill={accent} opacity={0.9}/>
      <rect x={chX + chW * 0.12} y={chY + chH * 0.20} width={chW * 0.76} height={chH * 0.62} rx={6}
        fill={accent} stroke="#0F766E" strokeWidth={1} opacity={0.85}/>
      <rect x={chX + chW * 0.04} y={chY + chH * 0.30} width={chW * 0.10} height={chH * 0.40} rx={3}
        fill={accent} opacity={0.7}/>
      <rect x={chX + chW * 0.86} y={chY + chH * 0.30} width={chW * 0.10} height={chH * 0.40} rx={3}
        fill={accent} opacity={0.7}/>
      <line x1={cx} y1={chY + chH * 0.30} x2={cx} y2={chY + chH * 0.74}
        stroke="#FFFFFF" strokeWidth={1} opacity={0.5}/>
      <rect x={x} y={deskY} width={w} height={deskH} rx={5}
        fill="#F1F5F9" stroke="#64748B" strokeWidth={1.6}/>
      <rect x={x + 3} y={deskY + 3} width={w - 6} height={deskH - 6} rx={4}
        fill="#FFFFFF" opacity={0.5}/>
      {p.obj.label && (
        <text x={cx} y={y + h + labelSize * 0.95} textAnchor="middle"
          fontSize={labelSize} fontWeight="800"
          fill="#0F172A" pointerEvents="none"
          style={{ fontFamily: "system-ui,-apple-system,sans-serif", paintOrder: "stroke" }}
          stroke="#FFFFFF" strokeWidth={3.5} strokeLinejoin="round">
          {p.obj.label}
        </text>
      )}
    </VectorShell>
  );
}

function ChairRenderer(p: RendererProps) {
  const { x, y, w, h } = p.obj;

  const seat = p.obj.customColor ?? (p.obj.isBookable ? "#0D9488" : "#94A3B8");
  const cx = x + w/2;
  return (
    <VectorShell {...p} labelOffset={13}>
      {}
      <rect x={x+w*0.18} y={y} width={w*0.64} height={h*0.22} rx={4} fill={seat} opacity={0.9}/>
      <rect x={x+w*0.12} y={y+h*0.20} width={w*0.76} height={h*0.62} rx={6}
        fill={seat} stroke="#0F766E" strokeWidth={1} opacity={0.85}/>
      <rect x={x+w*0.04} y={y+h*0.30} width={w*0.10} height={h*0.40} rx={3} fill={seat} opacity={0.7}/>
      <rect x={x+w*0.86} y={y+h*0.30} width={w*0.10} height={h*0.40} rx={3} fill={seat} opacity={0.7}/>
      <line x1={cx} y1={y+h*0.30} x2={cx} y2={y+h*0.74} stroke="#FFFFFF" strokeWidth={1} opacity={0.5}/>
    </VectorShell>
  );
}

function SofaRenderer(p: RendererProps) {
  const { x, y, w, h } = p.obj;
  const fill = p.obj.customColor ?? "#64748B";
  return (
    <VectorShell {...p}>
      <rect x={x} y={y+h*0.18} width={w} height={h*0.82} rx={10} fill={fill}/>
      <rect x={x+8} y={y} width={w-16} height={h*0.5} rx={8} fill={fill} opacity={0.8}/>
      <rect x={x+10} y={y+h*0.30} width={(w-28)/2} height={h*0.5} rx={6} fill="#FFFFFF" opacity={0.18}/>
      <rect x={x+w/2+4} y={y+h*0.30} width={(w-28)/2} height={h*0.5} rx={6} fill="#FFFFFF" opacity={0.18}/>
    </VectorShell>
  );
}

function ConfTableRenderer(p: RendererProps) {
  const { x, y, w, h } = p.obj;
  const fill = p.obj.customColor ?? "#E7D8BE";
  return (
    <VectorShell {...p}>
      <rect x={x} y={y} width={w} height={h} rx={Math.min(w,h)*0.28}
        fill={fill} stroke="#A98C5F" strokeWidth={2}/>
      <rect x={x+10} y={y+10} width={w-20} height={h-20} rx={Math.min(w,h)*0.22}
        fill="none" stroke="#C9B089" strokeWidth={1} opacity={0.7}/>
    </VectorShell>
  );
}

function RoundTableRenderer(p: RendererProps) {
  const { x, y, w, h } = p.obj;
  const fill = p.obj.customColor ?? "#E7D8BE";
  const cx = x+w/2, cy = y+h/2;
  return (
    <VectorShell {...p}>
      <ellipse cx={cx} cy={cy} rx={w/2} ry={h/2} fill={fill} stroke="#A98C5F" strokeWidth={2}/>
      <ellipse cx={cx} cy={cy} rx={w/2-8} ry={h/2-8} fill="none" stroke="#C9B089" strokeWidth={1} opacity={0.7}/>
    </VectorShell>
  );
}

function PlantRenderer(p: RendererProps) {
  const { x, y, w, h } = p.obj;
  return (
    <VectorShell {...p}>
      <image href={p.obj.imageSrc ?? plantPng} x={x} y={y} width={w} height={h}
        preserveAspectRatio="xMidYMid meet"/>
    </VectorShell>
  );
}

function BasinRenderer(p: RendererProps) {
  const { x, y, w, h } = p.obj;
  const cx = x+w/2, cy = y+h/2;
  return (
    <VectorShell {...p}>
      <rect x={x} y={y} width={w} height={h} rx={8} fill="#EAF2F8" stroke="#90A4AE" strokeWidth={2}/>
      <ellipse cx={cx} cy={cy+2} rx={w*0.32} ry={h*0.30} fill="#FFFFFF" stroke="#90A4AE" strokeWidth={1.5}/>
      <circle cx={cx} cy={cy+2} r={2.5} fill="#90A4AE"/>
      <rect x={cx-3} y={y+5} width={6} height={h*0.22} rx={3} fill="#B0BEC5"/>
    </VectorShell>
  );
}

function KitchenRenderer(p: RendererProps) {
  const { x, y, w, h } = p.obj;
  return (
    <VectorShell {...p}>
      <rect x={x} y={y} width={w} height={h} rx={6} fill="#F1E9DA" stroke="#A98C5F" strokeWidth={2}/>
      <circle cx={x+w*0.25} cy={y+h*0.35} r={h*0.13} fill="none" stroke="#94A3B8" strokeWidth={2}/>
      <circle cx={x+w*0.42} cy={y+h*0.35} r={h*0.13} fill="none" stroke="#94A3B8" strokeWidth={2}/>
      <rect x={x+w*0.60} y={y+h*0.22} width={w*0.30} height={h*0.5} rx={4} fill="#EAF2F8" stroke="#90A4AE" strokeWidth={1.5}/>
    </VectorShell>
  );
}

function FridgeRenderer(p: RendererProps) {
  const { x, y, w, h } = p.obj;
  return (
    <VectorShell {...p}>
      <rect x={x} y={y} width={w} height={h} rx={6} fill="#E2E8F0" stroke="#64748B" strokeWidth={2}/>
      <line x1={x} y1={y+h*0.42} x2={x+w} y2={y+h*0.42} stroke="#64748B" strokeWidth={1.5}/>
      <rect x={x+w*0.72} y={y+h*0.12} width={4} height={h*0.22} rx={2} fill="#64748B"/>
      <rect x={x+w*0.72} y={y+h*0.50} width={4} height={h*0.22} rx={2} fill="#64748B"/>
    </VectorShell>
  );
}

function ServerRenderer(p: RendererProps) {
  const { x, y, w, h } = p.obj;
  return (
    <VectorShell {...p}>
      <rect x={x} y={y} width={w} height={h} rx={5} fill="#1E293B" stroke="#0F172A" strokeWidth={2}/>
      {[0,1,2,3].map(i=>(
        <g key={i}>
          <rect x={x+5} y={y+8+i*(h-12)/4} width={w-10} height={(h-12)/4-4} rx={2} fill="#334155"/>
          <circle cx={x+w-10} cy={y+8+i*(h-12)/4+((h-12)/4-4)/2} r={2} fill="#22C55E"/>
        </g>
      ))}
    </VectorShell>
  );
}

function DoorRenderer(p: RendererProps) {
  const { x, y, w, h } = p.obj;
  const s = Math.min(w, h);
  return (
    <VectorShell {...p}>
      <rect x={x} y={y} width={w} height={h} fill="#000" fillOpacity={0.001} pointerEvents="all"/>
      <rect x={x} y={y} width={4} height={h} rx={1} fill="#B59B6E"/>
      <rect x={x} y={y} width={4} height={s} rx={1} fill="#8B6F47"
        transform={`rotate(-35 ${x+2} ${y+2})`}/>
      <path d={`M ${x+2} ${y+s} A ${s} ${s} 0 0 1 ${x+2+s*0.82} ${y+s*0.57}`}
        fill="none" stroke="#B59B6E" strokeWidth={1.4} strokeDasharray="4 3" opacity={0.7}/>
    </VectorShell>
  );
}

function WhiteboardRenderer(p: RendererProps) {
  const { x, y, w, h } = p.obj;
  return (
    <VectorShell {...p}>
      <rect x={x} y={y} width={w} height={h} rx={4} fill="#FFFFFF" stroke="#475569" strokeWidth={2}/>
      <rect x={x} y={y+h-5} width={w} height={5} rx={2} fill="#94A3B8"/>
      <path d={`M ${x+w*0.15} ${y+h*0.55} q ${w*0.15} ${-h*0.3} ${w*0.3} 0 t ${w*0.3} 0`}
        fill="none" stroke="#0D9488" strokeWidth={2} opacity={0.6}/>
      <rect x={x+w*0.55} y={y+h*0.25} width={w*0.28} height={h*0.18} rx={2} fill="#F59E0B" opacity={0.5}/>
    </VectorShell>
  );
}

function TvRenderer(p: RendererProps) {
  const { x, y, w, h } = p.obj;
  return (
    <VectorShell {...p}>
      <rect x={x} y={y} width={w} height={h*0.82} rx={4} fill="#0F172A" stroke="#334155" strokeWidth={2}/>
      <rect x={x+5} y={y+5} width={w-10} height={h*0.82-10} rx={2} fill="#1E40AF" opacity={0.35}/>
      <rect x={x+w*0.4} y={y+h*0.82} width={w*0.2} height={h*0.10} fill="#334155"/>
      <rect x={x+w*0.28} y={y+h*0.92} width={w*0.44} height={5} rx={2} fill="#475569"/>
    </VectorShell>
  );
}

function PrinterRenderer(p: RendererProps) {
  const { x, y, w, h } = p.obj;
  return (
    <VectorShell {...p}>
      <rect x={x} y={y+h*0.30} width={w} height={h*0.55} rx={5} fill="#CBD5E1" stroke="#64748B" strokeWidth={2}/>
      <rect x={x+w*0.18} y={y} width={w*0.64} height={h*0.34} rx={3} fill="#94A3B8"/>
      <rect x={x+w*0.2} y={y+h*0.52} width={w*0.6} height={h*0.12} rx={2} fill="#1E293B"/>
      <rect x={x+w*0.6} y={y+h*0.36} width={w*0.22} height={h*0.08} rx={2} fill="#22C55E"/>
    </VectorShell>
  );
}

function WaterCoolerRenderer(p: RendererProps) {
  const { x, y, w, h } = p.obj;
  const cx = x+w/2;
  return (
    <VectorShell {...p}>
      <path d={`M ${x+w*0.3} ${y} L ${x+w*0.7} ${y} L ${x+w*0.62} ${y+h*0.3} L ${x+w*0.38} ${y+h*0.3} Z`}
        fill="#7DD3FC" stroke="#0EA5E9" strokeWidth="1.5"/>
      <rect x={x+w*0.22} y={y+h*0.3} width={w*0.56} height={h*0.7} rx={5} fill="#E2E8F0" stroke="#64748B" strokeWidth={2}/>
      <rect x={cx-w*0.10} y={y+h*0.5} width={w*0.20} height={h*0.12} rx={2} fill="#0EA5E9"/>
    </VectorShell>
  );
}

function CoffeeRenderer(p: RendererProps) {
  const { x, y, w, h } = p.obj;
  return (
    <VectorShell {...p}>
      <rect x={x} y={y} width={w} height={h} rx={5} fill="#3F3F46" stroke="#18181B" strokeWidth={2}/>
      <rect x={x+w*0.18} y={y+h*0.12} width={w*0.64} height={h*0.22} rx={2} fill="#0D9488" opacity={0.7}/>
      <rect x={x+w*0.32} y={y+h*0.42} width={w*0.36} height={h*0.06} rx={2} fill="#71717A"/>
      <path d={`M ${x+w*0.36} ${y+h*0.55} h ${w*0.28} v ${h*0.18} a ${w*0.14} ${h*0.1} 0 0 1 ${-w*0.28} 0 Z`}
        fill="#E4E4E7"/>
    </VectorShell>
  );
}

function PhoneBoothRenderer(p: RendererProps) {
  const { x, y, w, h } = p.obj;
  return (
    <VectorShell {...p}>
      <rect x={x} y={y} width={w} height={h} rx={8} fill="#DCFCE7" stroke="#16A34A" strokeWidth={2.5}/>
      <rect x={x+6} y={y+6} width={w-12} height={h-12} rx={5} fill="none" stroke="#16A34A" strokeWidth={1} opacity={0.5}/>
      {}
      <path d={`M ${x+w*0.4} ${y+h*0.32} q -${w*0.04} -${h*0.02} 0 ${h*0.06} l ${w*0.04} ${h*0.06} q ${w*0.02} ${h*0.03} ${w*0.05} 0 l ${w*0.03} -${h*0.03} q ${w*0.02} -${h*0.02} 0 -${h*0.04} l -${w*0.04} -${h*0.02}`}
        fill="#15803D"/>
    </VectorShell>
  );
}

function LockersRenderer(p: RendererProps) {
  const { x, y, w, h } = p.obj;
  const cols = Math.max(2, Math.round(w/40));
  const cw = w/cols;
  return (
    <VectorShell {...p}>
      <rect x={x} y={y} width={w} height={h} rx={4} fill="#475569" stroke="#1E293B" strokeWidth={2}/>
      {Array.from({length:cols}).map((_,i)=>(
        <g key={i}>
          <rect x={x+i*cw+2} y={y+2} width={cw-4} height={h*0.48-3} rx={2} fill="#64748B" stroke="#334155" strokeWidth={1}/>
          <rect x={x+i*cw+2} y={y+h*0.5+1} width={cw-4} height={h*0.48-3} rx={2} fill="#64748B" stroke="#334155" strokeWidth={1}/>
          <circle cx={x+i*cw+cw*0.8} cy={y+h*0.24} r={1.6} fill="#CBD5E1"/>
          <circle cx={x+i*cw+cw*0.8} cy={y+h*0.74} r={1.6} fill="#CBD5E1"/>
        </g>
      ))}
    </VectorShell>
  );
}

function CallPodRenderer(p: RendererProps) {
  const { x, y, w, h } = p.obj;
  const fill = p.obj.customColor ?? "#EDE9FE";
  const cx = x+w/2, cy = y+h/2;
  return (
    <VectorShell {...p}>
      <rect x={x} y={y} width={w} height={h} rx={14} fill={fill} stroke="#7C3AED" strokeWidth={2.5}/>
      <rect x={x+6} y={y+6} width={w-12} height={h-12} rx={10} fill="none" stroke="#7C3AED" strokeWidth={1} opacity={0.4}/>
      <ellipse cx={cx} cy={cy+h*0.12} rx={w*0.16} ry={h*0.12} fill="#7C3AED" opacity={0.35}/>
      <rect x={cx-w*0.18} y={y+h*0.2} width={w*0.36} height={h*0.18} rx={4} fill="#7C3AED" opacity={0.25}/>
    </VectorShell>
  );
}

function WallRenderer({ obj, selected, handlers, readOnly, onHandleDown }: RendererProps) {
  const { x, y, w, h, customColor } = obj;
  const rot = obj.rotation ?? 0;
  const cx = x + w / 2, cy = y + h / 2;
  const fill = customColor ?? "url(#wall-grad)";
  return (
    <g>
      <g transform={`rotate(${rot} ${cx} ${cy})`}
        {...(readOnly ? {} : handlers)} style={{ cursor: readOnly ? "default" : "grab" }}>
        <rect x={x} y={y} width={w} height={h} rx={3}
          fill={fill} stroke="#8A7A5C" strokeWidth={1}/>
        {}
        <rect x={x+1} y={y+1} width={Math.max(0,w-2)} height={Math.max(1,h*0.32)} rx={2}
          fill="#FFFFFF" opacity={0.22}/>
      </g>
      {selected && !readOnly && onHandleDown && (
        <SelectionOverlay obj={obj} onHandleDown={onHandleDown}/>
      )}
    </g>
  );
}

function RoomRenderer({ obj, selected, handlers, readOnly }: RendererProps) {
  const { x, y, w, h, label, customColor, type } = obj;
  const rot = obj.rotation ?? 0;
  const cx = x + w / 2, cy = y + h / 2;
  const isMeet = type === "meeting-room" || obj.layerGroup === "Meeting Room";
  const fill = customColor ?? (isMeet ? "#EAF4FB" : ROOM_FILL);
  const stroke = isMeet ? "#9BC4DF" : ROOM_STROKE;
  const lblColor = isMeet ? "#1D4ED8" : "#7A6A4E";
  return (
    <g>
      <g transform={`rotate(${rot} ${cx} ${cy})`}
        {...(readOnly ? {} : handlers)} style={{ cursor: readOnly ? "default" : "grab" }}>
        <rect x={x} y={y} width={w} height={h} rx={4}
          fill={fill} stroke={stroke} strokeWidth={2}/>
        <rect x={x+4} y={y+4} width={w-8} height={h-8} rx={3}
          fill="none" stroke={stroke} strokeWidth={0.5} opacity={0.4}/>
        {label && (
          <text x={cx} y={y+54} textAnchor="middle"
            fontSize="40" fontWeight="800" fill={lblColor}
            pointerEvents="none"
            style={{ fontFamily:"system-ui,sans-serif", letterSpacing:"0.08em" }}>
            {label}
          </text>
        )}
      </g>
      {selected && !readOnly && <SelectRing obj={obj}/>}
    </g>
  );
}

function LabelRenderer({ obj, selected, handlers, readOnly }: RendererProps) {
  const { x, y, w, h, label } = obj;
  const rot = obj.rotation ?? 0;
  const text = label || "Label";
  const fontSize = Math.max(22, Math.min(h * 0.5, 40));
  const boxW = Math.max(w, text.length * fontSize * 0.62 + 28);
  const boxH = Math.max(h, fontSize + 22);
  const cx = x + w / 2;
  const bx = cx - boxW / 2;
  const by = y + (h - boxH) / 2;
  const bcy = by + boxH / 2;
  const rcx = x + w / 2, rcy = y + h / 2;
  return (
    <g>
      <g transform={`rotate(${rot} ${rcx} ${rcy})`}
        {...(readOnly ? {} : handlers)} style={{ cursor: readOnly ? "default" : "grab" }}>
        <rect x={bx} y={by} width={boxW} height={boxH} rx={10}
          fill="#F0FDF4" stroke="#22C55E" strokeWidth={2}/>
        <text x={cx} y={bcy + fontSize * 0.34} textAnchor="middle"
          fontSize={fontSize} fontWeight="800" fill="#15803D"
          pointerEvents="none"
          style={{ fontFamily:"system-ui,sans-serif", letterSpacing:"0.02em" }}>
          {text}
        </text>
      </g>
      {selected && !readOnly && <SelectRing obj={obj}/>}
    </g>
  );
}

const TYPE_DEFAULTS: Record<ObjectType, { w:number; h:number }> = {
  desk:               { w:110, h:132 },
  chair:              { w:64,  h:70  },
  sofa:               { w:150, h:88  },
  "conference-table": { w:240, h:160 },
  "round-table":      { w:150, h:150 },
  basin:              { w:66,  h:66  },
  kitchen:            { w:160, h:96  },
  fridge:             { w:70,  h:80  },
  server:             { w:74,  h:110 },
  plant:              { w:60,  h:60  },
  whiteboard:         { w:140, h:74  },
  tv:                 { w:110, h:78  },
  printer:            { w:78,  h:86  },
  "water-cooler":     { w:62,  h:96  },
  coffee:             { w:74,  h:86  },
  "phone-booth":      { w:110, h:110 },
  lockers:            { w:160, h:72  },
  "call-pod":         { w:150, h:150 },
  "meeting-room":     { w:240, h:180 },
  room:               { w:220, h:170 },
  wall:               { w:160, h:40  },
  door:               { w:56,  h:56  },
  label:              { w:150, h:40  },
};

const LAYER_FOR_TYPE: Record<ObjectType, LayerGroupName> = {
  desk:"Desks", chair:"Furniture", sofa:"Furniture",
  "conference-table":"Furniture", "round-table":"Furniture",
  basin:"Furniture", kitchen:"Furniture", fridge:"Furniture", server:"Furniture",
  plant:"Furniture", whiteboard:"Furniture", tv:"Furniture", printer:"Furniture",
  "water-cooler":"Furniture", coffee:"Furniture", "phone-booth":"Furniture",
  lockers:"Furniture", "call-pod":"Furniture",
  "meeting-room":"Meeting Room", room:"Floor",
  wall:"Walls", door:"Walls", label:"Walls",
};

const ZONE_FOR_TYPE: Partial<Record<ObjectType, ZoneType>> = {
  chair:"Open Desks", "conference-table":"Meeting Rooms",
  "round-table":"Canteen", basin:"Bathroom",
  kitchen:"Kitchen", fridge:"Kitchen", server:"Server Room",
  "call-pod":"Common Area", "phone-booth":"Common Area",
};

function createObj(type: ObjectType, x: number, y: number, label?: string, sizeOverride?: { w:number; h:number }): FloorObject {
  const { w, h } = sizeOverride ?? TYPE_DEFAULTS[type];
  return {
    id: getId(), type,
    label: label ?? (type.charAt(0).toUpperCase() + type.slice(1)),
    x: Math.round(x - w/2), y: Math.round(y - h/2),
    w, h, iso: {},
    zone: ZONE_FOR_TYPE[type] ?? "Common Area",
    isBookable: type === "chair" || type === "desk",
    layerGroup: LAYER_FOR_TYPE[type], isVisible: true,
    rotation: 0,
  };
}

function makeWall(x: number, y: number, w: number, h: number): FloorObject {
  return {
    id: getId(), type: "wall", label: "",
    x: x + CONTENT_OX, y: y + CONTENT_OY, w, h, iso: {}, zone: "Common Area",
    isBookable: false, layerGroup: "Walls", isVisible: true, rotation: 0,
  };
}
function makeDoor(x: number, y: number): FloorObject {
  const { w, h } = TYPE_DEFAULTS.door;
  return {
    id: getId(), type: "door", label: "",
    x: x + CONTENT_OX, y: y + CONTENT_OY, w, h, iso: {}, zone: "Common Area",
    isBookable: false, layerGroup: "Walls", isVisible: true,
    rotation: 0, imageSrc: doorPng,
  };
}

function deskCluster(
  items: FloorObject[], startN: number,
  x: number, y: number, cols: number, rows: number,
): number {
  const gx = 88, gy = 96;
  let n = startN;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const o = createObj("desk",
        x + c*gx + CONTENT_OX, y + r*gy + CONTENT_OY,
        `D-${String(n).padStart(2,"0")}`);
      items.push(o);
      n++;
    }
  }
  return n;
}

const API_BASE = "http://127.0.0.1:8000/api";

async function fetchFloorFromApi(slug: FloorId): Promise<FloorObject[]> {
  const res = await fetch(`${API_BASE}/floors/${slug}/`);
  if (!res.ok) throw new Error(`Failed to load floor (${res.status})`);
  const data = await res.json();
  return ((data.objects ?? []) as Array<Record<string, unknown>>).map(o => {
    const obj = { ...o, iso: {} } as FloorObject;
    if (!obj.customColor) delete obj.customColor;
    if (!obj.imageSrc) delete obj.imageSrc;
    if (!obj.label) obj.label = "";
    return obj;
  });
}

async function saveFloorToApi(slug: FloorId, objects: FloorObject[]): Promise<void> {
  const clean = objects.map(o => { const { iso, ...rest } = o; return rest; });
  const res = await fetch(`${API_BASE}/floors/${slug}/layout/`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ objects: clean }),
  });
  if (!res.ok) throw new Error(`Failed to save floor (${res.status})`);
}

async function fetchDefaultSizes(): Promise<Record<string, { w:number; h:number }>> {
  const res = await fetch(`${API_BASE}/default-sizes/`);
  if (!res.ok) throw new Error(`Failed to load default sizes (${res.status})`);
  const rows = await res.json() as Array<{ type:string; w:number; h:number }>;
  const map: Record<string, { w:number; h:number }> = {};
  for (const r of rows) map[r.type] = { w: r.w, h: r.h };
  return map;
}

async function saveDefaultSize(type: string, w: number, h: number): Promise<void> {
  const res = await fetch(`${API_BASE}/default-sizes/${type}/`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, w, h }),
  });
  if (!res.ok) throw new Error(`Failed to save default size (${res.status})`);
}



interface RenderObjectProps {
  obj:          FloorObject;
  selected:     boolean;
  onSelect:     (id:string) => void;
  onMoveStart:  (id:string, e: ReactPointerEvent<SVGGElement>) => void;
  onHandleDown: (id:string, e: ReactPointerEvent<Element>, handle: HandleId) => void;
  readOnly:     boolean;
}

function RenderObject({ obj, selected, onSelect, onMoveStart, onHandleDown, readOnly }: RenderObjectProps) {
  const onPointerDown = useCallback((e: ReactPointerEvent<SVGGElement>) => {
    if (readOnly) return;
    e.stopPropagation();

    onSelect(obj.id);
    onMoveStart(obj.id, e);
  }, [obj.id, onSelect, onMoveStart, readOnly]);

  const handleDown = useCallback((e: ReactPointerEvent<Element>, h: HandleId) => {
    onHandleDown(obj.id, e, h);
  }, [obj.id, onHandleDown]);

  const handlers = { onPointerDown };

  const noHandles = obj.type === "room" || obj.type === "meeting-room" || obj.type === "label";
  const rp: RendererProps = {
    obj, selected, handlers, readOnly,
    onHandleDown: noHandles ? undefined : handleDown,
  };

  switch (obj.type) {
    case "desk":              return <DeskRenderer        {...rp}/>;
    case "chair":             return <ChairRenderer       {...rp}/>;
    case "sofa":              return <SofaRenderer         {...rp}/>;
    case "conference-table":  return <ConfTableRenderer    {...rp}/>;
    case "round-table":       return <RoundTableRenderer   {...rp}/>;
    case "plant":             return <PlantRenderer        {...rp}/>;
    case "basin":             return <BasinRenderer        {...rp}/>;
    case "kitchen":           return <KitchenRenderer      {...rp}/>;
    case "fridge":            return <FridgeRenderer       {...rp}/>;
    case "server":            return <ServerRenderer       {...rp}/>;
    case "door":              return <DoorRenderer         {...rp}/>;
    case "whiteboard":        return <WhiteboardRenderer   {...rp}/>;
    case "tv":                return <TvRenderer           {...rp}/>;
    case "printer":           return <PrinterRenderer      {...rp}/>;
    case "water-cooler":      return <WaterCoolerRenderer  {...rp}/>;
    case "coffee":            return <CoffeeRenderer       {...rp}/>;
    case "phone-booth":       return <PhoneBoothRenderer   {...rp}/>;
    case "lockers":           return <LockersRenderer      {...rp}/>;
    case "call-pod":          return <CallPodRenderer      {...rp}/>;
    case "wall":              return <WallRenderer         {...rp}/>;
    case "label":             return <LabelRenderer        {...rp}/>;
    case "room":
    case "meeting-room":      return <RoomRenderer         {...rp}/>;
    default:                  return <RoomRenderer         {...rp}/>;
  }
}

interface ToolDef { id:ToolId; label:string; Icon:React.ComponentType<{size?:number|string}> }

const PLACE_TOOLS: ToolDef[] = [
  { id:"select",           label:"Select",  Icon:MousePointer2       },
  { id:"wall",             label:"Wall",    Icon:Square              },
  { id:"door",             label:"Door",    Icon:DoorOpen            },
  { id:"desk",             label:"Desk",    Icon:RectangleHorizontal },
  { id:"chair",            label:"Chair",   Icon:Armchair            },
  { id:"sofa",             label:"Sofa",    Icon:Sofa                },
  { id:"conference-table", label:"Conf",    Icon:Users               },
  { id:"round-table",      label:"Round",   Icon:CircleDot           },
  { id:"call-pod",         label:"Call Pod",Icon:PhoneCall           },
  { id:"phone-booth",      label:"Booth",   Icon:Phone               },
  { id:"whiteboard",       label:"Board",   Icon:Presentation        },
  { id:"tv",               label:"TV",      Icon:Tv                  },
  { id:"printer",          label:"Printer", Icon:Printer             },
  { id:"coffee",           label:"Coffee",  Icon:Coffee              },
  { id:"water-cooler",     label:"Water",   Icon:Droplet            },
  { id:"lockers",          label:"Lockers", Icon:Lock                },
  { id:"kitchen",          label:"Kitchen", Icon:UtensilsCrossed     },
  { id:"basin",            label:"Basin",   Icon:Bath                },
  { id:"fridge",           label:"Fridge",  Icon:Refrigerator        },
  { id:"server",           label:"Server",  Icon:Server              },
  { id:"plant",            label:"Plant",   Icon:Leaf                },
  { id:"label",            label:"Label",   Icon:Tag                 },
];

const ROOM_TOOLS: ToolDef[] = [
  { id:"room",         label:"Empty Room", Icon:RectangleHorizontal },
];

const ZONE_COLORS: Record<ZoneType, string> = {
  "Meeting Rooms":"#0D9488","Open Desks":"#2563EB","Reception":"#7C3AED",
  "Kitchen":"#D97706","Bathroom":"#6B7280","Storage":"#9CA3AF",
  "Common Area":"#DB2777","Canteen":"#0891B2","Server Room":"#16A34A",
};
const ZONES = Object.keys(ZONE_COLORS) as ZoneType[];

const DEFAULT_LAYERS: LayerEntry[] = [
  { name:"Meeting Room", isVisible:true, isLocked:false, colour:BRAND     },
  { name:"Board Room",   isVisible:true, isLocked:false                   },
  { name:"Desks",        isVisible:true, isLocked:false                   },
  { name:"Furniture",    isVisible:true, isLocked:false                   },
  { name:"Reception",    isVisible:true, isLocked:false                   },
  { name:"Kitchen",      isVisible:true, isLocked:false                   },
  { name:"Walls",        isVisible:true, isLocked:false                   },
  { name:"Floor",        isVisible:true, isLocked:false, colour:"#F5F0EB" },
];
const ORDER: LayerGroupName[] = [
  "Floor","Walls","Kitchen","Reception","Board Room","Meeting Room","Furniture","Desks",
];

const tbS  = (a:boolean): CSSProperties => ({
  display:"flex",flexDirection:"column",alignItems:"center",gap:3,
  padding:"7px 2px",border:`1px solid ${a?"#99F6E4":"transparent"}`,
  borderRadius:8,cursor:"pointer",backgroundColor:a?"#F0FDFA":"transparent",
  color:a?BRAND:"#64748B",fontSize:10,transition:"all .15s",width:"100%",
  fontFamily:"system-ui,sans-serif",
});
const abS: CSSProperties = {
  display:"flex",alignItems:"center",gap:6,padding:"7px 14px",
  border:"1px solid #E2E8F0",borderRadius:8,backgroundColor:"#fff",
  color:"#475569",fontSize:13,cursor:"pointer",whiteSpace:"nowrap",
  flexShrink:0,fontFamily:"system-ui,sans-serif",
};
const spS: CSSProperties = {
  width:22,height:22,border:"1px solid #E2E8F0",borderRadius:4,
  backgroundColor:"#F8FAFC",cursor:"pointer",display:"flex",
  alignItems:"center",justifyContent:"center",color:"#475569",
};
const zbS: CSSProperties = {
  width:28,height:28,border:"1px solid #E2E8F0",borderRadius:6,
  backgroundColor:"#fff",display:"flex",alignItems:"center",
  justifyContent:"center",cursor:"pointer",color:"#475569",
};
const mtbS = (a:boolean): CSSProperties => ({
  display:"flex",flexDirection:"column",alignItems:"center",gap:3,
  padding:"8px 10px",borderRadius:10,border:"none",minWidth:52,
  backgroundColor:a?"#F0FDFA":"transparent",
  color:a?BRAND:"#64748B",fontSize:11,fontWeight:600,cursor:"pointer",flexShrink:0,
});
const mmbS = (a:boolean): CSSProperties => ({
  display:"flex",flexDirection:"column",alignItems:"center",gap:5,
  padding:12,borderRadius:14,border:`1px solid ${a?"#99F6E4":"#EEF2F7"}`,
  backgroundColor:a?"#F0FDFA":"#F8FAFC",minHeight:64,justifyContent:"center",
  color:a?BRAND:"#475569",cursor:"pointer",fontSize:11,fontWeight:600,
});
const lrS = (hi:boolean): CSSProperties => ({
  display:"flex",alignItems:"center",gap:6,padding:"7px 16px",
  borderBottom:"1px solid #F8FAFC",
  backgroundColor:hi?"#F0FDFA":"transparent",
});

interface PanelProps {
  selectedObj: FloorObject | null;
  layers: LayerEntry[];
  layersOpen: boolean;
  setLayersOpen: (b: boolean) => void;
  onChange: (obj: FloorObject | null) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleVis: (n: LayerGroupName) => void;
  onToggleLock: (n: LayerGroupName) => void;
  onClose: () => void;
  isRoom: boolean;
  onSwapImage: (dataUrl: string) => void;
  onSetDefaultSize: (type: string, w: number, h: number) => void;
}

function Panel({
  selectedObj, layers, layersOpen, setLayersOpen,
  onChange, onDuplicate, onDelete, onToggleVis, onToggleLock, onClose, isRoom, onSwapImage, onSetDefaultSize,
}: PanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const canSwapImage = !!selectedObj &&
    ["door","desk","chair","sofa","conference-table","round-table","plant","basin","kitchen","fridge","server"]
      .includes(selectedObj.type);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") onSwapImage(reader.result); };
    reader.readAsDataURL(f);
    e.target.value = "";
  };

  return (
    <div style={{display:"flex",flexDirection:"column",flex:1,minHeight:0,overflowY:"auto"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:"1px solid #F1F5F9",flexShrink:0}}>
        <span style={{fontSize:13,fontWeight:600,color:"#1E293B",fontFamily:"system-ui,sans-serif"}}>Object</span>
        <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:"#94A3B8",display:"flex",padding:0}}>
          <X size={16}/>
        </button>
      </div>

      {selectedObj ? (
        <div style={{padding:"10px 16px",display:"flex",flexDirection:"column",gap:10}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
            <span style={{fontSize:12,color:"#64748B",width:64,flexShrink:0,fontFamily:"system-ui,sans-serif"}}>Label</span>
            <input
              value={selectedObj.label}
              onChange={e=>onChange({...selectedObj,label:e.target.value})}
              style={{border:"1px solid #E2E8F0",borderRadius:6,padding:"4px 8px",fontSize:12,color:"#1E293B",width:140,outline:"none",fontFamily:"system-ui,sans-serif"}}
            />
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
            <span style={{fontSize:12,color:"#64748B",width:64,flexShrink:0,fontFamily:"system-ui,sans-serif"}}>Width</span>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:12,color:"#1E293B",minWidth:56,fontFamily:"system-ui,sans-serif"}}>{(selectedObj.w/40).toFixed(2)} m</span>
              <button onClick={()=>onChange({...selectedObj,w:Math.max(4,selectedObj.w-8)})} style={spS}><Minus size={10}/></button>
              <button onClick={()=>onChange({...selectedObj,w:selectedObj.w+8})}               style={spS}><Plus  size={10}/></button>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
            <span style={{fontSize:12,color:"#64748B",width:64,flexShrink:0,fontFamily:"system-ui,sans-serif"}}>Height</span>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:12,color:"#1E293B",minWidth:56,fontFamily:"system-ui,sans-serif"}}>{(selectedObj.h/35).toFixed(2)} m</span>
              <button onClick={()=>onChange({...selectedObj,h:Math.max(4,selectedObj.h-8)})} style={spS}><Minus size={10}/></button>
              <button onClick={()=>onChange({...selectedObj,h:selectedObj.h+8})}               style={spS}><Plus  size={10}/></button>
            </div>
          </div>

          <button
            onClick={()=>onSetDefaultSize(selectedObj.type, selectedObj.w, selectedObj.h)}
            title="New objects of this type will use this width and height"
            style={{display:"flex",alignItems:"center",justifyContent:"center",gap:7,width:"100%",padding:"8px 10px",marginTop:2,border:`1px solid ${BRAND}`,borderRadius:8,backgroundColor:"#F0FDFA",color:BRAND,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"system-ui,sans-serif"}}>
            <Check size={13}/>
            <span>Set as default size for {selectedObj.type}</span>
          </button>

          {}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
            <span style={{fontSize:12,color:"#64748B",width:64,flexShrink:0,fontFamily:"system-ui,sans-serif"}}>Rotation</span>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <input
                type="number"
                value={Math.round(selectedObj.rotation ?? 0)}
                onChange={e=>{
                  const deg = parseInt(e.target.value || "0", 10);
                  onChange({...selectedObj, rotation: ((deg % 360) + 360) % 360});
                }}
                style={{border:"1px solid #E2E8F0",borderRadius:6,padding:"4px 6px",fontSize:12,color:"#1E293B",width:64,outline:"none",fontFamily:"system-ui,sans-serif"}}
              />
              <span style={{fontSize:12,color:"#94A3B8"}}>°</span>
              <button title="Rotate 90°" onClick={()=>onChange({...selectedObj, rotation: (((selectedObj.rotation ?? 0)+90)%360)})} style={spS}><RotateCw size={11}/></button>
            </div>
          </div>

          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
            <span style={{fontSize:12,color:"#64748B",width:64,flexShrink:0,fontFamily:"system-ui,sans-serif"}}>Zone</span>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:10,height:10,borderRadius:"50%",backgroundColor:ZONE_COLORS[selectedObj.zone],flexShrink:0}}/>
              <select value={selectedObj.zone} onChange={e=>onChange({...selectedObj,zone:e.target.value as ZoneType})}
                style={{border:"1px solid #E2E8F0",borderRadius:6,padding:"4px 6px",fontSize:12,color:"#1E293B",width:140,outline:"none",fontFamily:"system-ui,sans-serif"}}>
                {ZONES.map(z=><option key={z} value={z}>{z}</option>)}
              </select>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
            <span style={{fontSize:12,color:"#64748B",width:64,flexShrink:0,fontFamily:"system-ui,sans-serif"}}>Bookable</span>
            <div onClick={()=>onChange({...selectedObj,isBookable:!selectedObj.isBookable})}
              style={{width:36,height:20,borderRadius:10,cursor:"pointer",position:"relative",backgroundColor:selectedObj.isBookable?BRAND:"#CBD5E1",transition:"background .2s",flexShrink:0}}>
              <div style={{position:"absolute",top:2,width:16,height:16,borderRadius:"50%",backgroundColor:"#fff",boxShadow:"0 1px 3px rgba(0,0,0,.2)",transition:"transform .2s",transform:selectedObj.isBookable?"translateX(16px)":"translateX(2px)"}}/>
            </div>
          </div>

          {}
          {canSwapImage && (
            <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:6,padding:"10px",border:"1px solid #F1F5F9",borderRadius:8,backgroundColor:"#FAFBFC"}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <Upload size={12} color="#64748B"/>
                <span style={{fontSize:12,color:"#475569",fontWeight:600,fontFamily:"system-ui,sans-serif"}}>
                  {selectedObj.type === "door" ? "Door Image" : "Custom Image"}
                </span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                {selectedObj.imageSrc && (
                  <img src={selectedObj.imageSrc} alt="" style={{width:34,height:34,objectFit:"contain",border:"1px solid #E2E8F0",borderRadius:6,background:"#fff"}}/>
                )}
                <button onClick={()=>fileRef.current?.click()}
                  style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"7px 0",border:"1px dashed #CBD5E1",borderRadius:8,backgroundColor:"#fff",color:"#475569",fontSize:12,cursor:"pointer",fontFamily:"system-ui,sans-serif"}}>
                  <Upload size={12}/><span>Upload PNG</span>
                </button>
                {selectedObj.imageSrc && selectedObj.type !== "door" && (
                  <button onClick={()=>onChange({...selectedObj, imageSrc: undefined})}
                    style={{border:"1px solid #E2E8F0",borderRadius:6,padding:"6px 8px",fontSize:11,backgroundColor:"#fff",cursor:"pointer",color:"#64748B",fontFamily:"system-ui,sans-serif"}}>Reset</button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{display:"none"}}/>
            </div>
          )}

          {isRoom && (
            <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:6,padding:"10px",border:"1px solid #F1F5F9",borderRadius:8,backgroundColor:"#FAFBFC"}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <Palette size={12} color="#64748B"/>
                <span style={{fontSize:12,color:"#475569",fontWeight:600,fontFamily:"system-ui,sans-serif"}}>Room Color</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(8,1fr)",gap:4}}>
                {ROOM_SWATCHES.map(c => {
                  const isActive = selectedObj.customColor === c;
                  return (
                    <button key={c} onClick={()=>onChange({...selectedObj,customColor:c})}
                      style={{width:"100%",aspectRatio:"1",borderRadius:5,backgroundColor:c,
                        border:isActive?`2px solid ${BRAND}`:"1px solid #CBD5E1",cursor:"pointer",padding:0}}/>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{display:"flex",gap:8,marginTop:4}}>
            <button onClick={onDuplicate} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:5,padding:"7px 0",border:"1px solid #E2E8F0",borderRadius:8,backgroundColor:"#F8FAFC",color:"#475569",fontSize:12,cursor:"pointer",fontFamily:"system-ui,sans-serif"}}>
              <Copy size={12}/><span>Duplicate</span>
            </button>
            <button onClick={onDelete} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:5,padding:"7px 0",border:"1px solid #FEE2E2",borderRadius:8,backgroundColor:"#FFF5F5",color:"#EF4444",fontSize:12,cursor:"pointer",fontFamily:"system-ui,sans-serif"}}>
              <Trash2 size={12}/><span>Delete</span>
            </button>
          </div>
        </div>
      ) : (
        <div style={{padding:"24px 16px",textAlign:"center",fontSize:12,color:"#94A3B8",fontFamily:"system-ui,sans-serif"}}>
          Click any object to select it. Select a <strong>wall</strong> to get resize &amp; rotate handles.
        </div>
      )}

      <div onClick={()=>setLayersOpen(!layersOpen)}
        style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderTop:"1px solid #F1F5F9",borderBottom:"1px solid #F1F5F9",cursor:"pointer",marginTop:4,flexShrink:0}}>
        <span style={{display:"flex",alignItems:"center",gap:6}}>
          <Layers size={14} color="#475569"/>
          <span style={{fontSize:13,fontWeight:600,color:"#1E293B",fontFamily:"system-ui,sans-serif"}}>Layers</span>
        </span>
        <ChevronDown size={14} color="#94A3B8"
          style={{transition:"transform .2s",transform:layersOpen?"rotate(180deg)":"rotate(0deg)"}}/>
      </div>

      {layersOpen && layers.map(layer => (
        <div key={layer.name} style={lrS(layer.name==="Meeting Room")}>
          <button onClick={()=>onToggleVis(layer.name)} style={{background:"none",border:"none",cursor:"pointer",padding:2,display:"flex",alignItems:"center"}}>
            <Eye size={13} color={layer.isVisible?"#475569":"#CBD5E1"}/>
          </button>
          <div style={{flex:1,display:"flex",alignItems:"center",gap:6}}>
            {layer.colour
              ? <div style={{width:12,height:12,borderRadius:2,backgroundColor:layer.colour,border:"1px solid #E2E8F0"}}/>
              : <Square size={12} color="#94A3B8"/>
            }
            <span style={{fontSize:12,color:"#1E293B",fontFamily:"system-ui,sans-serif"}}>{layer.name}</span>
          </div>
          <button onClick={()=>onToggleLock(layer.name)} style={{background:"none",border:"none",cursor:"pointer",padding:2,display:"flex",alignItems:"center"}}>
            <Lock size={11} color={layer.isLocked?BRAND:"#CBD5E1"}/>
          </button>
          <GripVertical size={11} color="#CBD5E1" style={{cursor:"grab"}}/>
        </div>
      ))}

    </div>
  );
}

export interface FloorPlannerProps {
  initialLayout?: FloorObject[];
  onChange?: (layout: FloorObject[]) => void;
  storageKey?: string | null;
  readOnly?: boolean;
  role?: "admin" | "employee";
}

const DEFAULT_STORAGE_KEY = "workspacecanvas:layout";

type Interaction =
  | { kind: "none" }
  | { kind: "move"; id: string; startWX: number; startWY: number; ox: number; oy: number; children: { id:string; ox:number; oy:number }[] }
  | { kind: "resize"; id: string; handle: HandleId; startWX: number; startWY: number; ox: number; oy: number; ow: number; oh: number; orot: number }
  | { kind: "rotate"; id: string; cx: number; cy: number; startAngle: number; orot: number }
  | { kind: "pan"; startCX: number; startCY: number; startPanX: number; startPanY: number };

export default function FloorPlanner({
  initialLayout,
  onChange,
  storageKey = DEFAULT_STORAGE_KEY,
  readOnly = false,
  role = "admin",
}: FloorPlannerProps = {}) {
  const isEmployee = role === "employee";
  const [floor, setFloor] = useState<FloorId>("upstairs");
  const [dirty, setDirty] = useState<boolean>(false);
  const [floorMenuOpen, setFloorMenuOpen] = useState<boolean>(false);

  const [objects, setObjects] = useState<FloorObject[]>(() => {
    if (initialLayout && initialLayout.length > 0) {
      syncIdCounter(initialLayout);
      return initialLayout;
    }
    return [];
  });
  const [loadingFloor, setLoadingFloor] = useState<boolean>(!(initialLayout && initialLayout.length > 0));
  const [defaultSizes, setDefaultSizes] = useState<Record<string, { w:number; h:number }>>({});

  const lastInitialRef = useRef(initialLayout);
  useEffect(() => {
    if (initialLayout && initialLayout !== lastInitialRef.current) {
      syncIdCounter(initialLayout);
      setObjects(initialLayout);
      lastInitialRef.current = initialLayout;
    }
  }, [initialLayout]);

  const [selectedId,  setSelectedId]  = useState<string|null>(null);
  const [activeTool,  setActiveTool]  = useState<ToolId>("select");
  const [zoom,        setZoom]        = useState<number>(1);
  const [pan,         setPan]         = useState<{x:number;y:number}>({ x: 0, y: 0 });
  const [undoStack,   setUndoStack]   = useState<FloorObject[][]>([]);
  const [redoStack,   setRedoStack]   = useState<FloorObject[][]>([]);
  const [layers,      setLayers]      = useState<LayerEntry[]>(DEFAULT_LAYERS);
  const [savedStatus, setSavedStatus] = useState<SavedStatus>("saved");
  const [pending,     setPending]     = useState<boolean>(false);
  const [menuOpen,    setMenuOpen]    = useState<boolean>(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState<boolean>(false);
  const [drawerOpen,  setDrawerOpen]  = useState<boolean>(false);
  const [layersOpen,  setLayersOpen]  = useState<boolean>(false);
  const [spaceDown,   setSpaceDown]   = useState<boolean>(false);
  const [snapOn,      setSnapOn]      = useState<boolean>(false);
  const [wallThickness, setWallThickness] = useState<number>(40);
  const [guides,      setGuides]      = useState<{v:number[];h:number[]}>({ v:[], h:[] });
  const [viewSize,    setViewSize]    = useState<{w:number;h:number}>({ w:0, h:0 });
  const [toasts,      setToasts]      = useState<{id:number;msg:string;tone:"success"|"info"|"error"}[]>([]);
  const [confirmBox,  setConfirmBox]  = useState<{msg:string;onYes:()=>void;onNo?:()=>void;yesLabel?:string;noLabel?:string}|null>(null);
  const toastId = useRef(1);
  const pushToast = useCallback((msg:string, tone:"success"|"info"|"error"="success") => {
    const id = toastId.current++;
    setToasts(t => [...t, { id, msg, tone }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3600);
  }, []);
  const askConfirm = useCallback((msg:string, onYes:()=>void, onNo?:()=>void, yesLabel?:string, noLabel?:string) => setConfirmBox({ msg, onYes, onNo, yesLabel, noLabel }), []);
  const [drawRoom,    setDrawRoom]    = useState<{x:number;y:number;w:number;h:number}|null>(null);
  const [previewMode, setPreviewMode] = useState<boolean>(readOnly || isEmployee);
  const [isMobile,    setIsMobile]    = useState<boolean>(
    () => typeof window !== "undefined" && window.innerWidth < 768,
  );

  const svgRef       = useRef<SVGSVGElement>(null);
  const viewportRef  = useRef<HTMLDivElement>(null);
  const zoomRef      = useRef(1);
  const panRef       = useRef({ x: 0, y: 0 });
  const activePointers = useRef<Map<number,{x:number;y:number}>>(new Map());
  const pinch        = useRef<{dist:number;midX:number;midY:number;startZoom:number;startPan:{x:number;y:number}}|null>(null);
  const roomStart    = useRef<{x:number;y:number}|null>(null);
  const interaction  = useRef<Interaction>({ kind: "none" });  const didInteract  = useRef(false);
  zoomRef.current = zoom;
  panRef.current  = pan;

  const fitToObjects = useCallback((next: FloorObject[]) => {
    const el = viewportRef.current;
    if (!el || !next.length) return;
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for (const o of next) { minX=Math.min(minX,o.x); minY=Math.min(minY,o.y); maxX=Math.max(maxX,o.x+o.w); maxY=Math.max(maxY,o.y+o.h); }
    const pad=80, vw=el.clientWidth, vh=el.clientHeight;
    const z=clamp(Math.min(vw/((maxX-minX)+pad*2), vh/((maxY-minY)+pad*2)), 0.1, 1.2);
    setZoom(z);
    setPan({ x: vw/2 - ((minX+maxX)/2)*z, y: vh/2 - ((minY+maxY)/2)*z });
  }, []);

  const loadFloorAsync = useCallback(async (f: FloorId) => {
    setLoadingFloor(true);
    try {
      const next = await fetchFloorFromApi(f);
      syncIdCounter(next);
      setObjects(next);
      setSelectedId(null);
      setDirty(false);
      fitToObjects(next);
    } catch {
      setObjects([]);
      pushToast("Could not load floor from server. Is the backend running?", "error");
    } finally {
      setLoadingFloor(false);
    }
  }, [fitToObjects, pushToast]);

  const saveToApi = useCallback(async (f: FloorId, objs: FloorObject[], silent = false) => {
    try {
      setSavedStatus("saving");
      await saveFloorToApi(f, objs);
      setSavedStatus("saved");
      setDirty(false);
      if (!silent) pushToast("Layout saved to server", "success");
      return true;
    } catch {
      setSavedStatus("unsaved");
      if (!silent) pushToast("Save failed. Is the backend running?", "error");
      return false;
    }
  }, [pushToast]);

  const doSwitchFloor = useCallback((f: FloorId) => {
    setFloor(f);
    void loadFloorAsync(f);
  }, [loadFloorAsync]);

  const requestSwitchFloor = useCallback((f: FloorId) => {
    if (f === floor) return;
    if (!isEmployee && dirty) {
      askConfirm("You have unsaved changes on this floor. Save them before switching?", () => {
        void saveToApi(floor, objects).then(() => doSwitchFloor(f));
      }, () => { doSwitchFloor(f); }, "Save & switch", "Discard");
    } else {
      doSwitchFloor(f);
    }
  }, [floor, isEmployee, dirty, objects, saveToApi, doSwitchFloor]);

  useEffect(() => {
    if (initialLayout && initialLayout.length > 0) return;
    void loadFloorAsync(floor);

  }, []);

  useEffect(() => {
    fetchDefaultSizes().then(setDefaultSizes).catch(() => {  });
  }, []);

  const handleSetDefaultSize = useCallback((type: string, w: number, h: number) => {
    setDefaultSizes(prev => ({ ...prev, [type]: { w, h } }));
    saveDefaultSize(type, w, h)
      .then(() => pushToast(`Default size set for ${type}`, "success"))
      .catch(() => pushToast("Could not save default size", "error"));
  }, [pushToast]);
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (loadingFloor) return;
    const t = setTimeout(() => {
      onChange?.(objects);
      if (!initialLayout && dirty) {
        void saveToApi(floor, objects, true);
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [objects, onChange, initialLayout, floor, dirty, loadingFloor, saveToApi]);

  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  useEffect(() => {
    const dn = (e:KeyboardEvent) => {
      if (e.code==="Space") {
        const a = document.activeElement as HTMLElement;
        if (a.tagName!=="INPUT" && a.tagName!=="SELECT" && a.tagName!=="TEXTAREA") {
          e.preventDefault(); setSpaceDown(true);
        }
      }
    };
    const up = (e:KeyboardEvent) => {
      if (e.code==="Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup",   up);
    return () => { window.removeEventListener("keydown",dn); window.removeEventListener("keyup",up); };
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const vw = el.clientWidth, vh = el.clientHeight;
    const items = objects.length ? objects : null;
    if (items) {
      let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
      for (const o of items) {
        minX=Math.min(minX,o.x); minY=Math.min(minY,o.y);
        maxX=Math.max(maxX,o.x+o.w); maxY=Math.max(maxY,o.y+o.h);
      }
      const pad = 80;
      const cw = (maxX-minX)+pad*2, ch = (maxY-minY)+pad*2;
      const z = Math.min(vw/cw, vh/ch, 1.2);
      setZoom(z);
      setPan({
        x: vw/2 - ((minX+maxX)/2) * z,
        y: vh/2 - ((minY+maxY)/2) * z,
      });
    } else {
      const z = isMobile ? 0.55 : 0.85;
      setZoom(z);
      setPan({ x: vw/2 - WORLD_CX*z, y: vh/2 - WORLD_CY*z });
    }
    setViewSize({ w: vw, h: vh });

  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      setViewSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [drawerOpen, previewMode, isMobile]);

  const selectedObj    = objects.find(o => o.id === selectedId) ?? null;
  const visibleLayers  = new Set(layers.filter(l => l.isVisible).map(l => l.name));
  const lockedLayers   = new Set(layers.filter(l => l.isLocked).map(l => l.name));
  const isSelectedRoom = !!selectedObj && (selectedObj.type === "room" || selectedObj.type === "meeting-room");

  const saveHistory = useCallback(() => {
    setUndoStack(prev => [...prev.slice(-49), objects.map(o => ({...o}))]);
    setRedoStack([]); setSavedStatus("unsaved"); setDirty(true);
  }, [objects]);

  const undo = useCallback(() => {
    setUndoStack(prev => {
      if (!prev.length) return prev;
      const s = prev[prev.length-1];
      setRedoStack(r => [...r, objects.map(o => ({...o}))]);
      setObjects(s); setSavedStatus("unsaved");
      return prev.slice(0,-1);
    });
  }, [objects]);

  const redo = useCallback(() => {
    setRedoStack(prev => {
      if (!prev.length) return prev;
      const s = prev[prev.length-1];
      setUndoStack(u => [...u, objects.map(o => ({...o}))]);
      setObjects(s); setSavedStatus("unsaved");
      return prev.slice(0,-1);
    });
  }, [objects]);

  const isRoomTool = activeTool==="room" || activeTool==="meeting-room";
  const panMode    = activeTool==="pan" || spaceDown;

  const selectTool = (id: ToolId) => {
    if (previewMode) return;
    setActiveTool(id);
    setPending(id !== "select" && id !== "pan" && id !== "room" && id !== "meeting-room");
    setMenuOpen(false);
    setActionsMenuOpen(false);
    setDrawerOpen(false);
    roomStart.current = null; setDrawRoom(null);
  };

  const toWorld = useCallback((cx:number, cy:number) => {
    const el = viewportRef.current;
    if (!el) return { x:0, y:0 };
    const r = el.getBoundingClientRect();
    return {
      x: (cx - r.left - pan.x) / zoom,
      y: (cy - r.top  - pan.y) / zoom,
    };
  }, [pan.x, pan.y, zoom]);

  const onMoveStart = useCallback((id:string, e: ReactPointerEvent<SVGGElement>) => {
    if (previewMode || activeTool!=="select") return;
    const o = objects.find(ob => ob.id===id);
    if (!o || lockedLayers.has(o.layerGroup)) return;
    const w = toWorld(e.clientX, e.clientY);

    let children: { id:string; ox:number; oy:number }[] = [];
    const isRoom = o.type === "room" || o.type === "meeting-room";
    if (isRoom) {
      const L=o.x, T=o.y, R=o.x+o.w, B=o.y+o.h;
      children = objects
        .filter(ob => ob.id!==o.id && ob.id!=="floor"
          && (ob.type!=="room" && ob.type!=="meeting-room")
          && ob.x >= L-0.5 && ob.y >= T-0.5
          && ob.x+ob.w <= R+0.5 && ob.y+ob.h <= B+0.5)
        .map(ob => ({ id:ob.id, ox:ob.x, oy:ob.y }));
    }

    interaction.current = { kind:"move", id, startWX:w.x, startWY:w.y, ox:o.x, oy:o.y, children };
    didInteract.current = false;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  }, [previewMode, activeTool, objects, lockedLayers, toWorld]);

  const onHandleDown = useCallback((id:string, e: ReactPointerEvent<Element>, handle: HandleId) => {
    if (previewMode) return;
    e.stopPropagation();
    const o = objects.find(ob => ob.id===id);
    if (!o) return;
    const w = toWorld(e.clientX, e.clientY);
    if (handle === "ROT") {
      const cx = o.x + o.w/2, cy = o.y + o.h/2;
      const startAngle = Math.atan2(w.y - cy, w.x - cx) * 180/Math.PI;
      interaction.current = { kind:"rotate", id, cx, cy, startAngle, orot:o.rotation ?? 0 };
    } else {
      interaction.current = {
        kind:"resize", id, handle,
        startWX:w.x, startWY:w.y, ox:o.x, oy:o.y, ow:o.w, oh:o.h, orot:o.rotation ?? 0,
      };
    }
    didInteract.current = false;
    saveHistory();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  }, [previewMode, objects, toWorld, saveHistory]);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const act = interaction.current;
      if (act.kind === "none") return;

      if (act.kind === "pan") {
        setPan({ x: act.startPanX + (e.clientX - act.startCX), y: act.startPanY + (e.clientY - act.startCY) });
        return;
      }

      const w = toWorld(e.clientX, e.clientY);

      const doSnap = snapOn;

      if (act.kind === "move") {
        if (!didInteract.current) { saveHistory(); didInteract.current = true; }
        let dx = w.x - act.startWX;
        let dy = w.y - act.startWY;
        let nx = act.ox + dx;
        let ny = act.oy + dy;
        if (doSnap) { nx = snap(nx, false); ny = snap(ny, false); dx = nx - act.ox; dy = ny - act.oy; }

        const movingObj = objects.find(o => o.id===act.id);
        const vG:number[] = [], hG:number[] = [];
        if (movingObj) {
          const TH = 6 / zoom;
          const myL=nx, myR=nx+movingObj.w, myCx=nx+movingObj.w/2;
          const myT=ny, myB=ny+movingObj.h, myCy=ny+movingObj.h/2;
          let bestVx:number|null=null, bestVd=TH;
          let bestHy:number|null=null, bestHd=TH;
          for (const o of objects) {
            if (o.id===act.id || o.id==="floor") continue;
            if (act.children.some(c=>c.id===o.id)) continue;
            const xs=[o.x, o.x+o.w/2, o.x+o.w];
            const ys=[o.y, o.y+o.h/2, o.y+o.h];
            for (const ex of xs) for (const me of [myL,myCx,myR]) {
              const d=Math.abs(ex-me); if (d<bestVd){bestVd=d; bestVx=ex; }
            }
            for (const ey of ys) for (const me of [myT,myCy,myB]) {
              const d=Math.abs(ey-me); if (d<bestHd){bestHd=d; bestHy=ey; }
            }
          }
          if (bestVx!==null) {

            const cands=[[myL,0],[myCx,movingObj.w/2],[myR,movingObj.w]] as [number,number][];
            let pick=cands[0], pd=Infinity;
            for (const c of cands){const d=Math.abs(c[0]-bestVx); if(d<pd){pd=d;pick=c;}}
            nx = bestVx - pick[1]; dx = nx - act.ox; vG.push(bestVx);
          }
          if (bestHy!==null) {
            const cands=[[myT,0],[myCy,movingObj.h/2],[myB,movingObj.h]] as [number,number][];
            let pick=cands[0], pd=Infinity;
            for (const c of cands){const d=Math.abs(c[0]-bestHy); if(d<pd){pd=d;pick=c;}}
            ny = bestHy - pick[1]; dy = ny - act.oy; hG.push(bestHy);
          }
        }
        setGuides({ v:vG, h:hG });

        const childMap = new Map(act.children.map(c => [c.id, c]));
        setObjects(prev => prev.map(o => {
          if (o.id===act.id) return {...o, x:nx, y:ny};
          const c = childMap.get(o.id);
          if (c) return {...o, x:c.ox+dx, y:c.oy+dy};
          return o;
        }));
        setSavedStatus("unsaved");
      } else if (act.kind === "resize") {
        const dx = w.x - act.startWX;
        const dy = w.y - act.startWY;
        const base = { x:act.ox, y:act.oy, w:act.ow, h:act.oh, rotation:act.orot };
        const r = resizeRect(base, act.handle, dx, dy);
        const nx = doSnap ? snap(r.x, false) : r.x;
        const ny = doSnap ? snap(r.y, false) : r.y;
        const nw = doSnap ? Math.max(4, snap(r.w, false)) : Math.max(4, r.w);
        const nh = doSnap ? Math.max(4, snap(r.h, false)) : Math.max(4, r.h);
        setObjects(prev => prev.map(o => o.id===act.id ? {...o, x:nx, y:ny, w:nw, h:nh} : o));
        setSavedStatus("unsaved");
        didInteract.current = true;
      } else if (act.kind === "rotate") {
        const ang = Math.atan2(w.y - act.cy, w.x - act.cx) * 180/Math.PI;
        let next = act.orot + (ang - act.startAngle);
        if (doSnap) next = Math.round(next / 15) * 15;
        next = ((next % 360) + 360) % 360;
        setObjects(prev => prev.map(o => o.id===act.id ? {...o, rotation: next} : o));
        setSavedStatus("unsaved");
        didInteract.current = true;
      }
    };
    const up = () => { interaction.current = { kind:"none" }; setGuides({ v:[], h:[] }); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [toWorld, snapOn, zoom, objects, saveHistory]);

  const onCanvasPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {

    activePointers.current.set(e.pointerId, { x:e.clientX, y:e.clientY });

    if (activePointers.current.size === 2) {
      const pts = [...activePointers.current.values()];
      const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
      pinch.current = {
        dist: Math.hypot(dx, dy),
        midX: (pts[0].x + pts[1].x) / 2,
        midY: (pts[0].y + pts[1].y) / 2,
        startZoom: zoomRef.current,
        startPan: { ...panRef.current },
      };
      interaction.current = { kind:"none" };
      roomStart.current = null; setDrawRoom(null);
      return;
    }

    if (previewMode) {
      interaction.current = { kind:"pan", startCX:e.clientX, startCY:e.clientY, startPanX:pan.x, startPanY:pan.y };
      return;
    }
    const onEmpty = e.target === svgRef.current || (e.target as Element).getAttribute?.("data-bg") === "1";

    if (panMode) {
      interaction.current = { kind:"pan", startCX:e.clientX, startCY:e.clientY, startPanX:pan.x, startPanY:pan.y };
      return;
    }
    if (isRoomTool && onEmpty) {
      const w = toWorld(e.clientX, e.clientY);
      roomStart.current = { x:w.x, y:w.y };
      setDrawRoom({ x:w.x, y:w.y, w:0, h:0 });
      return;
    }
    if (onEmpty) {
      setSelectedId(null);

      interaction.current = { kind:"pan", startCX:e.clientX, startCY:e.clientY, startPanX:pan.x, startPanY:pan.y };
    }
  };

  const onCanvasPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointers.current.has(e.pointerId)) {
      activePointers.current.set(e.pointerId, { x:e.clientX, y:e.clientY });
    }

    if (pinch.current && activePointers.current.size >= 2) {
      const pts = [...activePointers.current.values()];
      const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
      const dist = Math.hypot(dx, dy) || 1;
      const midX = (pts[0].x + pts[1].x) / 2, midY = (pts[0].y + pts[1].y) / 2;
      const el = viewportRef.current; if (!el) return;
      const r = el.getBoundingClientRect();
      const p = pinch.current;
      const nz = clamp(p.startZoom * (dist / p.dist), 0.1, 6);
      const px = midX - r.left, py = midY - r.top;

      const np = {
        x: px - (px - p.startPan.x) * (nz / p.startZoom) + (midX - p.midX),
        y: py - (py - p.startPan.y) * (nz / p.startZoom) + (midY - p.midY),
      };
      setZoom(nz); setPan(np);
      return;
    }
    if (!roomStart.current) return;
    const w = toWorld(e.clientX, e.clientY);
    const sx = roomStart.current.x, sy = roomStart.current.y;
    setDrawRoom({ x:Math.min(sx,w.x), y:Math.min(sy,w.y), w:Math.abs(w.x-sx), h:Math.abs(w.y-sy) });
  };

  const endPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size < 2) pinch.current = null;
    onCanvasPointerUp();
  };

  const onCanvasPointerUp = () => {
    if (roomStart.current && drawRoom) {
      if (drawRoom.w > 16 && drawRoom.h > 16) {
        saveHistory();
        const type: ObjectType = activeTool==="meeting-room" ? "meeting-room" : "room";
        const newObj: FloorObject = {
          id:getId(), type,
          label: type==="meeting-room" ? "MEETING ROOM" : "ROOM",
          x:Math.round(drawRoom.x), y:Math.round(drawRoom.y),
          w:Math.round(drawRoom.w), h:Math.round(drawRoom.h),
          iso:{}, zone: type==="meeting-room" ? "Meeting Rooms" : "Common Area",
          isBookable: false,
          layerGroup: type==="meeting-room" ? "Meeting Room" : "Floor",
          isVisible:true, rotation:0,
        };
        setObjects(prev => [...prev, newObj]);
        setSelectedId(newObj.id);
        if (isMobile) setDrawerOpen(true);
      }
      roomStart.current = null; setDrawRoom(null);
      setActiveTool("select"); setPending(false);
    }
    if (interaction.current.kind === "pan") interaction.current = { kind:"none" };
  };

  const onCanvasClick = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (previewMode || !pending || activeTool==="select" || activeTool==="pan" || isRoomTool) return;
    const tag = (e.target as Element).tagName;
    if (["image","text"].includes(tag)) return;
    const w = toWorld(e.clientX, e.clientY);
    saveHistory();
    const dc = objects.filter(o => o.type==="desk").length;
    const pretty: Partial<Record<ToolId,string>> = {
      "phone-booth":"Phone Booth", "water-cooler":"Water", "call-pod":"Call Pod",
      "round-table":"Table", "conference-table":"Conference", tv:"TV", whiteboard:"Whiteboard",
    };
    const label = activeTool==="desk"
      ? `Desk ${dc+1}`
      : (pretty[activeTool] ?? (activeTool.charAt(0).toUpperCase()+activeTool.slice(1)));
    const newObj = createObj(activeTool as ObjectType, w.x, w.y, activeTool==="door" ? "" : label, defaultSizes[activeTool]);
    if (activeTool==="wall" && !defaultSizes["wall"]) newObj.h = wallThickness;
    setObjects(prev => [...prev, newObj]);
    setSelectedId(newObj.id);
    setActiveTool("select"); setPending(false);
    if (isMobile) setDrawerOpen(true);
  };

  const handleChange = (updated:FloorObject|null) => {
    if (!updated) { setSelectedId(null); setDrawerOpen(false); return; }
    saveHistory();
    setObjects(prev => prev.map(o => o.id===updated.id ? updated : o));
  };

  const onSwapImage = (dataUrl: string) => {
    if (!selectedObj) return;
    saveHistory();
    setObjects(prev => prev.map(o => o.id===selectedObj.id ? {...o, imageSrc:dataUrl} : o));
  };

  const duplicate = () => {
    if (!selectedObj) return;
    saveHistory();
    const copy:FloorObject = { ...selectedObj, id:getId(), x:selectedObj.x+24, y:selectedObj.y+24, label:selectedObj.label?selectedObj.label+" (copy)":"" };
    setObjects(prev => [...prev, copy]); setSelectedId(copy.id);
  };

  const handleDelete = useCallback(() => {
    if (!selectedId) return;
    saveHistory();
    setObjects(prev => prev.filter(o => o.id!==selectedId));
    setSelectedId(null); setDrawerOpen(false);
  }, [selectedId, saveHistory]);

  const toggleLayerVis  = (n:LayerGroupName) => setLayers(l => l.map(x => x.name===n ? {...x,isVisible:!x.isVisible} : x));
  const toggleLayerLock = (n:LayerGroupName) => setLayers(l => l.map(x => x.name===n ? {...x,isLocked:!x.isLocked  } : x));

  const zoomAt = useCallback((factor:number, clientX:number, clientY:number) => {
    const el = viewportRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = clientX - r.left, py = clientY - r.top;
    const prevZoom = zoomRef.current;
    const prevPan  = panRef.current;
    const nz = clamp(prevZoom * factor, 0.1, 6);
    const np = {
      x: px - (px - prevPan.x) * (nz / prevZoom),
      y: py - (py - prevPan.y) * (nz / prevZoom),
    };
    setZoom(nz);
    setPan(np);
  }, []);

  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      zoomAt(e.deltaY < 0 ? 1.1 : 0.9, e.clientX, e.clientY);
    } else {
      setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  };

  const zoomIn  = () => { const el=viewportRef.current; if(el){const r=el.getBoundingClientRect(); zoomAt(1.15, r.left+r.width/2, r.top+r.height/2);} };
  const zoomOut = () => { const el=viewportRef.current; if(el){const r=el.getBoundingClientRect(); zoomAt(0.87, r.left+r.width/2, r.top+r.height/2);} };

  const fitView = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const vis = objects.filter(o => o.isVisible && visibleLayers.has(o.layerGroup));
    if (!vis.length) return;
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for (const o of vis) {
      minX=Math.min(minX,o.x); minY=Math.min(minY,o.y);
      maxX=Math.max(maxX,o.x+o.w); maxY=Math.max(maxY,o.y+o.h);
    }
    const pad = 80;
    const bw = (maxX-minX)+pad*2, bh=(maxY-minY)+pad*2;
    const z = clamp(Math.min(el.clientWidth/bw, el.clientHeight/bh), 0.1, 6);
    setZoom(z);
    setPan({
      x: el.clientWidth/2  - ((minX+maxX)/2)*z,
      y: el.clientHeight/2 - ((minY+maxY)/2)*z,
    });
  }, [objects, visibleLayers]);

  const handleSave    = () => { void saveToApi(floor, objects); };
  const handlePublish = () => { void saveToApi(floor, objects, true).then(ok => { if (ok) pushToast("Layout published successfully","success"); }); };
  const newPlan = () => {
    if (previewMode) return;
    askConfirm("Start a new blank floor plan? This clears the current canvas.", () => {
      saveHistory(); setObjects([]); setSelectedId(null); setSavedStatus("unsaved");
      pushToast("New blank plan created","info");
    });
  };
  const unifyWalls = () => {
    saveHistory();
    setObjects(prev => prev.map(o => {
      if (o.type !== "wall") return o;

      const horizontal = o.w >= o.h;
      return horizontal
        ? { ...o, h: wallThickness }
        : { ...o, w: wallThickness };
    }));
  };

  const alignSelected = (edge: "left"|"right"|"top"|"bottom") => {
    if (!selectedObj || selectedObj.type !== "wall") return;
    const others = objects.filter(o => o.type==="wall" && o.id!==selectedObj.id);
    if (!others.length) return;
    saveHistory();
    const val = (o:FloorObject, e:string) =>
      e==="left"?o.x : e==="right"?o.x+o.w : e==="top"?o.y : o.y+o.h;
    const target = val(selectedObj, edge);
    let best = target, bestD = Infinity;
    for (const o of others) {
      for (const e of ["left","right","top","bottom"] as const) {
        const v = val(o, e);
        const d = Math.abs(v - target);
        if (d < bestD) { bestD = d; best = v; }
      }
    }
    setObjects(prev => prev.map(o => {
      if (o.id !== selectedObj.id) return o;
      if (edge==="left")   return { ...o, x: best };
      if (edge==="right")  return { ...o, x: best - o.w };
      if (edge==="top")    return { ...o, y: best };
      return { ...o, y: best - o.h };
    }));
  };
  const togglePreview = () => {
    setPreviewMode(p => !p);
    setSelectedId(null); setActiveTool("select"); setPending(false);
    setDrawerOpen(false); setActionsMenuOpen(false);
    setTimeout(fitView, 30);
  };

  useEffect(() => {
    const onKey = (e:KeyboardEvent) => {
      if (previewMode) { if (e.key === "Escape") setPreviewMode(false); return; }
      const a = document.activeElement as HTMLElement;
      const typing = a.tagName==="INPUT"||a.tagName==="SELECT"||a.tagName==="TEXTAREA";
      if ((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z") { e.preventDefault(); undo(); }
      if ((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="y") { e.preventDefault(); redo(); }
      if (e.key==="Escape") {
        setSelectedId(null); setActiveTool("select"); setPending(false);
        setDrawerOpen(false); roomStart.current=null; setDrawRoom(null);
      }
      if ((e.key==="Delete"||e.key==="Backspace")&&selectedId&&!typing) { e.preventDefault(); handleDelete(); }
      if (e.key.toLowerCase()==="r" && selectedId && !typing) {
        setObjects(prev => prev.map(o => o.id===selectedId ? {...o, rotation: (((o.rotation??0)+15)%360)} : o));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, selectedId, handleDelete, previewMode]);

  const handleSelect = (id:string) => {
    if (previewMode) return;

    setSelectedId(id);
    if (isMobile && activeTool==="select") setDrawerOpen(true);
  };

  const closePanel = () => { setSelectedId(null); setDrawerOpen(false); };

  const sorted = [...objects]
    .filter(o => o.isVisible && visibleLayers.has(o.layerGroup))
    .sort((a,b) => ORDER.indexOf(a.layerGroup) - ORDER.indexOf(b.layerGroup));

  const statusColor = savedStatus==="saved"?"#22C55E":savedStatus==="saving"?"#F59E0B":"#94A3B8";
  const statusText  = savedStatus==="saved"?"Saved":savedStatus==="saving"?"Saving…":"Unsaved";

  const cursor = previewMode ? "grab"
    : panMode ? "grab"
    : (isRoomTool || pending) ? "crosshair"
    : "default";

  return (
    <div style={{width:"100vw",height:"100vh",display:"flex",flexDirection:"column",overflow:"hidden",backgroundColor:"#F8FAFC",fontFamily:"system-ui,-apple-system,sans-serif"}}>

      {previewMode && (
        <div style={{backgroundColor:"#0F172A",color:"#fff",padding:"8px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:13,fontWeight:600,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <Eye size={14}/><span>Preview — drag to pan, Ctrl+scroll to zoom</span>
          </div>
          <button onClick={togglePreview} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 12px",border:"1px solid #334155",borderRadius:6,backgroundColor:"transparent",color:"#fff",fontSize:12,cursor:"pointer",fontFamily:"system-ui,sans-serif"}}>
            <ArrowLeft size={12}/><span>Back to Editor</span>
          </button>
        </div>
      )}

      <div style={{height:56,backgroundColor:"#fff",borderBottom:"1px solid #E2E8F0",display:"flex",alignItems:"center",padding: isMobile ? "0 10px" : "0 16px",gap: isMobile ? 8 : 10,flexShrink:0,zIndex:10,boxSizing:"border-box"}}>
        <div style={{width: isMobile ? 28 : 32, height: isMobile ? 28 : 32,borderRadius:8,backgroundColor:"#F0FDFA",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <Triangle size={isMobile?14:16} fill={BRAND} color={BRAND}/>
        </div>

        {!isMobile && (
          <span style={{fontSize:17,fontWeight:800,color:"#0F172A",whiteSpace:"nowrap",flexShrink:0,letterSpacing:"-0.02em"}}>
            Work<span style={{color:BRAND}}>Space</span>Canvas
          </span>
        )}

        <div style={{position:"relative",flexShrink:0}}>
          <button onClick={()=>setFloorMenuOpen(v=>!v)}
            style={{display:"flex",alignItems:"center",gap:7,padding: isMobile ? "6px 10px" : "6px 12px",border:"1px solid #E2E8F0",borderRadius:8,backgroundColor:"#F8FAFC",cursor:"pointer",fontFamily:"system-ui,sans-serif"}}>
            <Building2 size={14} color={BRAND}/>
            {!isMobile && <span style={{fontSize:13,color:"#334155"}}>Dublin Office</span>}
            {!isMobile && <span style={{fontSize:13,color:"#94A3B8"}}>/</span>}
            <span style={{fontSize:13,color:BRAND,fontWeight:700,whiteSpace:"nowrap"}}>
              {floor==="upstairs" ? "Upstairs" : "Downstairs"}
            </span>
            <ChevronDown size={14} color="#64748B"/>
          </button>
          {floorMenuOpen && (
            <>
              <div onClick={()=>setFloorMenuOpen(false)} style={{position:"fixed",inset:0,zIndex:40}}/>
              <div style={{position:"absolute",top:"calc(100% + 6px)",left:0,minWidth:190,backgroundColor:"#fff",border:"1px solid #E2E8F0",borderRadius:12,boxShadow:"0 12px 32px rgba(15,23,42,0.16)",zIndex:41,overflow:"hidden",padding:6}}>
                {(["downstairs","upstairs"] as FloorId[]).map(f => {
                  const active = f===floor;
                  return (
                    <button key={f} onClick={()=>{ setFloorMenuOpen(false); requestSwitchFloor(f); }}
                      style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"10px 12px",border:"none",borderRadius:8,backgroundColor:active?"#F0FDFA":"transparent",color:active?BRAND:"#334155",fontSize:14,fontWeight:active?700:500,cursor:"pointer",textAlign:"left",fontFamily:"system-ui,sans-serif"}}>
                      <Building size={15} color={active?BRAND:"#94A3B8"}/>
                      <span style={{flex:1}}>{f==="upstairs"?"Upstairs":"Downstairs"}</span>
                      {active && <Check size={15} color={BRAND}/>}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {isMobile ? (
          <div title={statusText} style={{width:10,height:10,borderRadius:"50%",backgroundColor:statusColor,flexShrink:0}}/>
        ) : (
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",backgroundColor:"#F0FDFA",border:"1px solid #99F6E4",borderRadius:20,flexShrink:0}}>
            <div style={{width:8,height:8,borderRadius:"50%",backgroundColor:statusColor}}/>
            <span style={{fontSize:12,color:"#0F766E",whiteSpace:"nowrap"}}>{statusText}</span>
          </div>
        )}

        <div style={{flex:1,minWidth:0}}/>

        {!isMobile && !previewMode && <>
          <button onClick={newPlan}      style={abS}><Plus size={13}/><span>New</span></button>
          <button onClick={handleSave}   style={abS}><Save size={13}/><span>Save</span></button>
          <button onClick={togglePreview}style={abS}><Eye  size={13}/><span>Preview</span></button>
        </>}

        {!previewMode && (
          <button onClick={handlePublish} style={{display:"flex",alignItems:"center",gap:6,padding: isMobile ? "7px 12px" : "7px 16px",border:"none",borderRadius:8,backgroundColor:BRAND,color:"#fff",fontSize: isMobile ? 12 : 13,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
            <Send size={isMobile?12:13}/>{!isMobile && <span>Publish</span>}
          </button>
        )}

        {isMobile && !previewMode && (
          <button onClick={()=>setActionsMenuOpen(v=>!v)} title="Actions"
            style={{display:"flex",alignItems:"center",justifyContent:"center",width:36,height:36,border:"1px solid #E2E8F0",borderRadius:8,backgroundColor: actionsMenuOpen ? "#F0FDFA" : "#fff",color: actionsMenuOpen ? BRAND : "#475569",cursor:"pointer",flexShrink:0,padding:0}}>
            <Menu size={16}/>
          </button>
        )}
      </div>

      <div style={{flex:1,display:"flex",overflow:"hidden",minHeight:0}}>

        {!isMobile && !previewMode && (
          <div style={{width:88,backgroundColor:"#fff",borderRight:"1px solid #E2E8F0",display:"flex",flexDirection:"column",padding:"6px 4px",gap:1,overflowY:"auto",flexShrink:0}}>
            {PLACE_TOOLS.map(({id,label,Icon}) => (
              <button key={id} title={label} onClick={()=>selectTool(id)} style={tbS(activeTool===id)}>
                <Icon size={16}/><span style={{textAlign:"center",lineHeight:1.2}}>{label}</span>
              </button>
            ))}
            <div style={{height:1,backgroundColor:"#E2E8F0",margin:"4px 8px"}}/>
            <div style={{fontSize:9,fontWeight:700,color:"#94A3B8",textAlign:"center",padding:"2px 0",letterSpacing:"0.05em"}}>ROOMS</div>
            {ROOM_TOOLS.map(({id,label,Icon}) => (
              <button key={id} title={label} onClick={()=>selectTool(id)} style={tbS(activeTool===id)}>
                <Icon size={16}/><span style={{textAlign:"center",lineHeight:1.2}}>{label}</span>
              </button>
            ))}
            <div style={{height:1,backgroundColor:"#E2E8F0",margin:"4px 8px"}}/>
            {([
              {label:"Undo",Icon:Undo2,fn:undo,   ok:undoStack.length>0},
              {label:"Redo",Icon:Redo2,fn:redo,   ok:redoStack.length>0},
            ] as const).map(({label,Icon,fn,ok}) => (
              <button key={label} onClick={fn} disabled={!ok} title={label}
                style={{...tbS(false),opacity:ok?1:0.3,cursor:ok?"pointer":"default"}}>
                <Icon size={16}/><span>{label}</span>
              </button>
            ))}
          </div>
        )}

        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
          <div
            ref={viewportRef}
            style={{
              flex: isMobile && drawerOpen ? "0 0 calc(60vh - 100px)" : 1,
              overflow:"hidden", position:"relative",
              backgroundColor:"#EEF2F7",
              touchAction:"none",
              cursor,
            }}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            onPointerLeave={endPointer}
            onClick={onCanvasClick}
            onWheel={onWheel}
          >
            {!previewMode && pending && (
              <div style={{position:"absolute",top:16,left:"50%",transform:"translateX(-50%)",backgroundColor:BRAND,color:"#fff",borderRadius:10,padding:"8px 18px",fontSize:13,fontWeight:600,zIndex:20,pointerEvents:"none",boxShadow:"0 4px 18px rgba(13,148,136,.45)",whiteSpace:"nowrap"}}>
                {`Click to place "${activeTool}"`}
              </div>
            )}
            {!previewMode && isRoomTool && (
              <div style={{position:"absolute",top:16,left:"50%",transform:"translateX(-50%)",backgroundColor:BRAND,color:"#fff",borderRadius:10,padding:"8px 18px",fontSize:13,fontWeight:600,zIndex:20,pointerEvents:"none",boxShadow:"0 4px 18px rgba(13,148,136,.45)",whiteSpace:"nowrap"}}>
                Click &amp; drag to draw {activeTool==="meeting-room"?"a meeting room":"a room"}
              </div>
            )}
            {!previewMode && panMode && (
              <div style={{position:"absolute",top:16,left:"50%",transform:"translateX(-50%)",backgroundColor:"#1E293B",color:"#fff",borderRadius:8,padding:"4px 12px",fontSize:11,zIndex:20,pointerEvents:"none",opacity:0.85}}>
                Pan mode — drag to move the canvas
              </div>
            )}

            <svg ref={svgRef} width="100%" height="100%" style={{display:"block",position:"absolute",inset:0}}>
              <SvgDefs/>
              <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
                <rect data-bg="1" x={0} y={0} width={WORLD_W} height={WORLD_H} fill="#EEF2F7"/>
                <rect data-bg="1" x={0} y={0} width={WORLD_W} height={WORLD_H} fill="url(#world-grid)"/>
                <rect data-bg="1" x={0} y={0} width={WORLD_W} height={WORLD_H} fill="url(#world-grid-major)"/>

                {sorted.map(obj => (
                  <RenderObject key={obj.id} obj={obj} selected={obj.id===selectedId}
                    onSelect={handleSelect} onMoveStart={onMoveStart}
                    onHandleDown={onHandleDown} readOnly={previewMode}/>
                ))}

                {!previewMode && drawRoom && drawRoom.w>2 && drawRoom.h>2 && (
                  <g pointerEvents="none">
                    <rect x={drawRoom.x} y={drawRoom.y} width={drawRoom.w} height={drawRoom.h}
                      fill={activeTool==="meeting-room"?"#E8F4F8":"#EEF7FF"} fillOpacity={0.7}
                      stroke={BRAND} strokeWidth={2} strokeDasharray="6 4"/>
                    <text x={drawRoom.x+drawRoom.w/2} y={drawRoom.y+drawRoom.h/2}
                      textAnchor="middle" fontSize="12" fill={BRAND} fontWeight="700"
                      style={{fontFamily:"system-ui,sans-serif"}}>
                      {Math.round(drawRoom.w)}×{Math.round(drawRoom.h)}
                    </text>
                  </g>
                )}

                {}
                {!previewMode && (guides.v.length>0 || guides.h.length>0) && (
                  <g pointerEvents="none">
                    {guides.v.map((vx,i)=>(
                      <line key={`v${i}`} x1={vx} y1={0} x2={vx} y2={WORLD_H}
                        stroke="#F43F5E" strokeWidth={1/zoom} strokeDasharray={`${6/zoom} ${4/zoom}`}/>
                    ))}
                    {guides.h.map((hy,i)=>(
                      <line key={`h${i}`} x1={0} y1={hy} x2={WORLD_W} y2={hy}
                        stroke="#F43F5E" strokeWidth={1/zoom} strokeDasharray={`${6/zoom} ${4/zoom}`}/>
                    ))}
                  </g>
                )}
              </g>
            </svg>

            {!previewMode && !isMobile && (
              <CanvasScrollbars
                pan={pan} zoom={zoom}
                viewW={viewSize.w} viewH={viewSize.h}
                worldW={WORLD_W} worldH={WORLD_H}
                onPan={setPan}
              />
            )}
          </div>

          {!previewMode && (
            <div style={{height:44,backgroundColor:"#fff",borderTop:"1px solid #E2E8F0",display:"flex",alignItems:"center",padding:"0 14px",gap:8,flexShrink:0,overflowX:"auto"}}>
              <div style={{padding:"4px 10px",border:"1px solid #E2E8F0",borderRadius:6,backgroundColor:"#F0FDFA",color:BRAND,fontSize:12,fontWeight:700,flexShrink:0}}>TOP VIEW</div>
              <button onClick={zoomOut} style={zbS}><Minus size={13}/></button>
              <span style={{fontSize:12,color:"#64748B",minWidth:40,textAlign:"center"}}>{Math.round(zoom*100)}%</span>
              <button onClick={zoomIn}  style={zbS}><Plus  size={13}/></button>
              <button onClick={fitView} title="Fit to Screen"
                style={{display:"flex",alignItems:"center",gap:6,height:30,padding:"0 12px",border:"1px solid #E2E8F0",borderRadius:6,backgroundColor:"#F0FDFA",color:BRAND,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"system-ui,sans-serif",flexShrink:0,whiteSpace:"nowrap"}}>
                <Maximize2 size={13}/><span>Fit to Screen</span>
              </button>

              {}
              <button onClick={()=>setSnapOn(s=>!s)} title="Toggle snap to grid"
                style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",border:`1px solid ${snapOn?"#99F6E4":"#E2E8F0"}`,borderRadius:6,backgroundColor:snapOn?"#F0FDFA":"#fff",color:snapOn?BRAND:"#64748B",fontSize:12,cursor:"pointer",flexShrink:0,fontFamily:"system-ui,sans-serif"}}>
                <Square size={12}/><span>{snapOn?"Snap: On":"Snap: Off"}</span>
              </button>

              {}
              <div style={{display:"flex",alignItems:"center",gap:5,paddingLeft:6,borderLeft:"1px solid #E2E8F0",flexShrink:0}}>
                <span style={{fontSize:11,color:"#94A3B8"}}>Wall</span>
                <input type="number" min={2} max={60} value={wallThickness}
                  onChange={e=>setWallThickness(clamp(parseInt(e.target.value||"10",10),2,60))}
                  style={{width:46,border:"1px solid #E2E8F0",borderRadius:6,padding:"4px 6px",fontSize:12,outline:"none",fontFamily:"system-ui,sans-serif"}}/>
                <button onClick={unifyWalls} title="Make all walls this thickness"
                  style={{padding:"5px 10px",border:"1px solid #E2E8F0",borderRadius:6,backgroundColor:"#fff",color:"#475569",fontSize:12,cursor:"pointer",fontFamily:"system-ui,sans-serif"}}>
                  Unify walls
                </button>
              </div>

              {}
              {selectedObj?.type==="wall" && (
                <div style={{display:"flex",alignItems:"center",gap:4,paddingLeft:6,borderLeft:"1px solid #E2E8F0",flexShrink:0}}>
                  <span style={{fontSize:11,color:"#94A3B8"}}>Align</span>
                  {(["left","right","top","bottom"] as const).map(edge=>(
                    <button key={edge} onClick={()=>alignSelected(edge)} title={`Align ${edge} to nearest wall`}
                      style={{padding:"5px 8px",border:"1px solid #E2E8F0",borderRadius:6,backgroundColor:"#fff",color:"#475569",fontSize:11,cursor:"pointer",fontFamily:"system-ui,sans-serif",textTransform:"capitalize"}}>
                      {edge}
                    </button>
                  ))}
                </div>
              )}

              <div style={{marginLeft:"auto",flexShrink:0}}><Triangle size={14} fill={BRAND} color={BRAND}/></div>
            </div>
          )}
        </div>

        {!isMobile && !previewMode && (
          <div style={{width:272,backgroundColor:"#fff",borderLeft:"1px solid #E2E8F0",display:"flex",flexDirection:"column",overflow:"hidden",flexShrink:0}}>
            <Panel
              selectedObj={selectedObj} layers={layers} layersOpen={layersOpen} setLayersOpen={setLayersOpen}
              onChange={handleChange} onDuplicate={duplicate} onDelete={handleDelete}
              onToggleVis={toggleLayerVis} onToggleLock={toggleLayerLock} onClose={closePanel}
              isRoom={isSelectedRoom} onSwapImage={onSwapImage} onSetDefaultSize={handleSetDefaultSize}/>
          </div>
        )}
      </div>

      {isMobile && !previewMode && !drawerOpen && (
        <div style={{position:"fixed",right:12,bottom:"calc(env(safe-area-inset-bottom) + 84px)",zIndex:35,display:"flex",flexDirection:"column",alignItems:"center",gap:6,backgroundColor:"#fff",borderRadius:14,border:"1px solid #E2E8F0",boxShadow:"0 6px 20px rgba(15,23,42,0.16)",padding:6}}>
          <button onClick={zoomIn} title="Zoom in"
            style={{width:42,height:42,borderRadius:10,border:"none",backgroundColor:"#F0FDFA",color:BRAND,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
            <Plus size={20}/>
          </button>
          <span style={{fontSize:11,fontWeight:700,color:"#64748B",minWidth:36,textAlign:"center"}}>{Math.round(zoom*100)}%</span>
          <button onClick={zoomOut} title="Zoom out"
            style={{width:42,height:42,borderRadius:10,border:"none",backgroundColor:"#F0FDFA",color:BRAND,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
            <Minus size={20}/>
          </button>
          <div style={{width:28,height:1,backgroundColor:"#E2E8F0"}}/>
          <button onClick={fitView} title="Fit to Screen"
            style={{width:46,minHeight:46,borderRadius:10,border:"none",backgroundColor:"#F8FAFC",color:"#475569",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1,cursor:"pointer",padding:"4px 0"}}>
            <Maximize2 size={18}/>
            <span style={{fontSize:9,fontWeight:700,fontFamily:"system-ui,sans-serif",lineHeight:1}}>Fit</span>
          </button>
        </div>
      )}

      {isMobile && !previewMode && (
        <div style={{position:"fixed",bottom:0,left:0,right:0,backgroundColor:"#fff",borderTop:"1px solid #E2E8F0",zIndex:30,display:"flex",alignItems:"center",justifyContent:"space-around",padding:"4px",paddingBottom:"env(safe-area-inset-bottom)",boxSizing:"border-box"}}>
          {PLACE_TOOLS.slice(0,6).map(({id,label,Icon}) => (
            <button key={id} onClick={()=>selectTool(id)} style={mtbS(activeTool===id)}>
              <Icon size={18}/><span>{label}</span>
            </button>
          ))}
          <button onClick={()=>setMenuOpen(v=>!v)} style={mtbS(menuOpen)}>
            <Menu size={18}/><span>More</span>
          </button>
        </div>
      )}

      {isMobile && !previewMode && menuOpen && (
        <>
          <div onClick={()=>setMenuOpen(false)} style={{position:"fixed",inset:0,backgroundColor:"rgba(0,0,0,0.3)",zIndex:39}}/>
          <div style={{position:"fixed",bottom:72,left:8,right:8,backgroundColor:"#fff",borderRadius:16,border:"1px solid #E2E8F0",boxShadow:"0 -8px 32px rgba(0,0,0,.18)",zIndex:40,padding:14,maxHeight:"70vh",overflowY:"auto"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <span style={{fontSize:13,fontWeight:700,color:"#1E293B",fontFamily:"system-ui,sans-serif"}}>All Tools</span>
              <button onClick={()=>setMenuOpen(false)} style={{background:"none",border:"none",cursor:"pointer",color:"#94A3B8",padding:4,display:"flex"}}><X size={16}/></button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:14}}>
              {PLACE_TOOLS.map(({id,label,Icon}) => (
                <button key={id} onClick={()=>{ selectTool(id); setMenuOpen(false); }} style={mmbS(activeTool===id)}>
                  <Icon size={18}/><span>{label}</span>
                </button>
              ))}
            </div>
            <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.05em",fontFamily:"system-ui,sans-serif"}}>Rooms</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
              {ROOM_TOOLS.map(({id,label,Icon}) => (
                <button key={id} onClick={()=>{ selectTool(id); setMenuOpen(false); }} style={mmbS(activeTool===id)}>
                  <Icon size={18}/><span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {isMobile && !previewMode && actionsMenuOpen && (
        <>
          <div onClick={()=>setActionsMenuOpen(false)} style={{position:"fixed",inset:0,backgroundColor:"rgba(0,0,0,0.3)",zIndex:39}}/>
          <div style={{position:"fixed",top:64,right:10,backgroundColor:"#fff",borderRadius:12,border:"1px solid #E2E8F0",boxShadow:"0 8px 28px rgba(0,0,0,.18)",zIndex:40,padding:8,minWidth:220}}>
            {([
              {fn:()=>{newPlan();       setActionsMenuOpen(false);}, Icon:Plus,  label:"New Plan",     disabled:false, isPrimary:false},
              {fn:()=>{handleSave();    setActionsMenuOpen(false);}, Icon:Save,  label:"Save",         disabled:false, isPrimary:false},
              {fn:()=>{togglePreview();                          }, Icon:Eye,   label:"Preview",      disabled:false, isPrimary:false},
              {fn:()=>{undo();          setActionsMenuOpen(false);}, Icon:Undo2, label:"Undo",         disabled:!undoStack.length, isPrimary:false},
              {fn:()=>{redo();          setActionsMenuOpen(false);}, Icon:Redo2, label:"Redo",         disabled:!redoStack.length, isPrimary:false},
              {fn:()=>{handlePublish(); setActionsMenuOpen(false);}, Icon:Send,  label:"Publish",      disabled:false, isPrimary:true},
            ] as const).map((item, i) => (
              <button key={i} onClick={item.fn} disabled={item.disabled}
                style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"10px 12px",border:"none",borderRadius:8,backgroundColor: item.isPrimary ? BRAND : "transparent",color: item.isPrimary ? "#fff" : "#475569",fontSize:13,fontWeight: item.isPrimary ? 600 : 500,cursor: item.disabled ? "default" : "pointer",opacity: item.disabled ? 0.4 : 1,textAlign:"left",fontFamily:"system-ui,sans-serif",marginTop: item.isPrimary ? 4 : 0}}>
                <item.Icon size={15}/><span>{item.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {isMobile && drawerOpen && !previewMode && (
        <div style={{position:"fixed",bottom:0,left:0,right:0,backgroundColor:"#fff",borderRadius:"16px 16px 0 0",boxShadow:"0 -8px 40px rgba(0,0,0,.18)",zIndex:51,height:"42vh",display:"flex",flexDirection:"column"}}>
          <div style={{display:"flex",justifyContent:"center",padding:"8px 0 4px"}}>
            <div style={{width:40,height:4,borderRadius:2,backgroundColor:"#CBD5E1"}}/>
          </div>
          <Panel
            selectedObj={selectedObj} layers={layers} layersOpen={layersOpen} setLayersOpen={setLayersOpen}
            onChange={handleChange} onDuplicate={duplicate} onDelete={handleDelete}
            onToggleVis={toggleLayerVis} onToggleLock={toggleLayerLock} onClose={closePanel}
            isRoom={isSelectedRoom} onSwapImage={onSwapImage} onSetDefaultSize={handleSetDefaultSize}/>
          <div style={{paddingBottom:"env(safe-area-inset-bottom)"}}/>
        </div>
      )}

      {!previewMode && !isMobile && (
        <button title="Help"
          style={{position:"fixed",bottom:56,right:16,width:44,height:44,borderRadius:"50%",backgroundColor:BRAND,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 18px rgba(13,148,136,.45)",zIndex:100,transition:"bottom 0.2s ease"}}>
          <HelpCircle size={18} color="white"/>
        </button>
      )}

      {loadingFloor && (
        <div style={{position:"fixed",inset:0,zIndex:8000,display:"flex",alignItems:"center",justifyContent:"center",backgroundColor:"rgba(251,249,244,0.7)",backdropFilter:"blur(2px)"}}>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:14,backgroundColor:"#fff",padding:"26px 34px",borderRadius:16,boxShadow:"0 16px 48px rgba(15,23,42,0.18)",fontFamily:"system-ui,sans-serif"}}>
            <div style={{width:34,height:34,border:"4px solid #CCFBF1",borderTopColor:BRAND,borderRadius:"50%",animation:"wsc-spin 0.8s linear infinite"}}/>
            <span style={{fontSize:14,fontWeight:600,color:"#334155"}}>Loading floor…</span>
          </div>
        </div>
      )}

      <div style={{position:"fixed",top:isMobile?70:74,left:"50%",transform:"translateX(-50%)",display:"flex",flexDirection:"column",gap:10,zIndex:9000,pointerEvents:"none",width:"max-content",maxWidth:"92vw"}}>
        {toasts.map(t => {
          const tone = t.tone==="success"?{bg:"#0D9488",ic:"M5 13l4 4L19 7"}
            : t.tone==="error"?{bg:"#DC2626",ic:"M6 6l12 12M18 6L6 18"}
            : {bg:"#0F172A",ic:"M12 8v5M12 16.5v.5"};
          return (
            <div key={t.id}
              style={{display:"flex",alignItems:"center",gap:11,padding:"13px 18px",borderRadius:14,
                backgroundColor:"#fff",color:"#0F172A",fontSize:14,fontWeight:600,
                boxShadow:"0 12px 34px rgba(15,23,42,0.18),0 2px 8px rgba(15,23,42,0.10)",
                border:"1px solid #EEF2F7",pointerEvents:"auto",
                fontFamily:"system-ui,-apple-system,sans-serif",
                animation:"wsc-toast-in 0.34s cubic-bezier(0.16,1,0.3,1)"}}>
              <span style={{display:"flex",alignItems:"center",justifyContent:"center",width:24,height:24,borderRadius:"50%",backgroundColor:tone.bg,flexShrink:0}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d={tone.ic}/></svg>
              </span>
              <span>{t.msg}</span>
            </div>
          );
        })}
      </div>

      {confirmBox && (
        <div onClick={()=>setConfirmBox(null)}
          style={{position:"fixed",inset:0,backgroundColor:"rgba(15,23,42,0.45)",backdropFilter:"blur(2px)",zIndex:9500,display:"flex",alignItems:"center",justifyContent:"center",padding:20,animation:"wsc-fade-in 0.2s ease"}}>
          <div onClick={e=>e.stopPropagation()}
            style={{backgroundColor:"#fff",borderRadius:18,padding:"24px 24px 18px",width:"100%",maxWidth:380,boxShadow:"0 24px 64px rgba(15,23,42,0.32)",fontFamily:"system-ui,-apple-system,sans-serif",animation:"wsc-pop-in 0.26s cubic-bezier(0.16,1,0.3,1)"}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
              <span style={{display:"flex",alignItems:"center",justifyContent:"center",width:40,height:40,borderRadius:12,backgroundColor:"#FEF3C7",flexShrink:0}}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
              </span>
              <span style={{fontSize:16,fontWeight:700,color:"#0F172A"}}>Please confirm</span>
            </div>
            <p style={{margin:"0 0 20px",fontSize:14,lineHeight:1.55,color:"#475569"}}>{confirmBox.msg}</p>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end",flexWrap:"wrap"}}>
              <button onClick={()=>setConfirmBox(null)}
                style={{padding:"9px 16px",borderRadius:10,border:"1px solid #E2E8F0",backgroundColor:"#fff",color:"#475569",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"system-ui,sans-serif"}}>Cancel</button>
              {confirmBox.onNo && (
                <button onClick={()=>{ const fn=confirmBox.onNo!; setConfirmBox(null); fn(); }}
                  style={{padding:"9px 16px",borderRadius:10,border:"1px solid #E2E8F0",backgroundColor:"#fff",color:"#B45309",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"system-ui,sans-serif"}}>{confirmBox.noLabel ?? "Don't save"}</button>
              )}
              <button onClick={()=>{ const fn=confirmBox.onYes; setConfirmBox(null); fn(); }}
                style={{padding:"9px 18px",borderRadius:10,border:"none",backgroundColor:BRAND,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"system-ui,sans-serif",boxShadow:"0 4px 14px rgba(13,148,136,0.4)"}}>{confirmBox.yesLabel ?? "Confirm"}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes wsc-toast-in { from { opacity:0; transform:translateY(-14px) scale(0.96);} to { opacity:1; transform:translateY(0) scale(1);} }
        @keyframes wsc-fade-in { from { opacity:0;} to { opacity:1;} }
        @keyframes wsc-pop-in { from { opacity:0; transform:translateY(10px) scale(0.95);} to { opacity:1; transform:translateY(0) scale(1);} }
        @keyframes wsc-spin { to { transform:rotate(360deg); } }
      `}</style>
    </div>
  );
}