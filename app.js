const { useState, useMemo, useRef, useEffect } = React;

// ---------- 상수 ----------
const LANE_HEIGHT = 92;
const ROW_HEIGHT = 56; // 레인 안에서 겹치는 노드가 쌓일 때 한 행의 높이
const HEADER_HEIGHT = 52;
const LABEL_COL_WIDTH = 190;

const ZOOM_PRESETS = {
  day: { pxPerDay: 92, label: "일간", pad: 2 },
  week: { pxPerDay: 24, label: "주간", pad: 7 },
  month: { pxPerDay: 8, label: "월간", pad: 20 },
  year: { pxPerDay: 1.6, label: "연간", pad: 60 },
};

const STATUS_STYLES = {
  done: { fill: "#2dd4bf", stroke: "#0f766e", text: "#04302b" },
  progress: { fill: "#fbbf24", stroke: "#b45309", text: "#3d2c02" },
  pending: { fill: "#475569", stroke: "#27303f", text: "#e2e8f0" },
};
const STATUS_LABEL = { done: "완료", progress: "진행중", pending: "대기" };

// 작업/단계에서 Bio/Kit/HPLC-MS 파트별 구분 색상 (상태색과 별개로, 카테고리를 지정하면 이 색이 박스 색이 됨)
const CATEGORY_STYLES = {
  bio: { fill: "#4ade80", stroke: "#15803d", text: "#052e12" },
  kit: { fill: "#c084fc", stroke: "#7e22ce", text: "#2e1065" },
  hplc: { fill: "#60a5fa", stroke: "#1d4ed8", text: "#0b1d3a" },
};
const CATEGORY_LABEL = { bio: "Bio", kit: "Kit", hplc: "HPLC-MS" };

// ---------- 유틸 ----------
const uid = (p = "n") => p + "_" + Math.random().toString(36).slice(2, 9);
const toDate = (s) => new Date(s + "T00:00:00");
const diffDays = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000);
const pad2 = (n) => String(n).padStart(2, "0");
const toLocalDateStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; // toISOString은 UTC라 한국시간(UTC+9)에서 하루씩 밀림 — 로컬 기준으로 직접 변환
const addDays = (s, n) => { const dt = toDate(s); dt.setDate(dt.getDate() + n); return toLocalDateStr(dt); };
const todayStr = () => toLocalDateStr(new Date());
// 글자 수 대비 박스 폭이 부족하면 폰트 크기를 자동으로 줄여서 잘리는 걸 최소화
const fitFontSize = (label, maxWidth, baseFontSize = 11, minFontSize = 7) => {
  const estWidth = label.length * baseFontSize * 0.62;
  if (estWidth <= maxWidth) return baseFontSize;
  return Math.max(minFontSize, baseFontSize * (maxWidth / estWidth));
};

// ---------- 초기 데이터 ----------
const T = todayStr();
const initialLanes = [
  { name: "dRAST 2.5 chip", visible: true },
  { name: "film jig 2.5 & evo", visible: true },
];
const initialNodes = [
  { id: "chip", lane: "dRAST 2.5 chip", label: "New 1,200ea 투입", start: addDays(T, 0), end: addDays(T, 0), type: "task", status: "done" },
  { id: "qc", lane: "dRAST 2.5 chip", label: "QC", start: addDays(T, 0), end: addDays(T, 0), type: "gate", status: "done" },
  { id: "build", lane: "dRAST 2.5 chip", label: "ADT dRAST 2.5", start: addDays(T, 1), end: addDays(T, 2), type: "task", status: "progress" },
  { id: "gate_device", lane: "dRAST 2.5 chip", label: "device?", start: addDays(T, 3), end: addDays(T, 3), type: "gate", status: "pending" },
  { id: "stage1", lane: "dRAST 2.5 chip", label: "New 1,100ea", start: addDays(T, 4), end: addDays(T, 4), type: "task", status: "pending" },
  { id: "check", lane: "film jig 2.5 & evo", label: "jig 진행상태 확인", start: addDays(T, 0), end: addDays(T, 1), type: "task", status: "progress" },
];
const initialEdges = [
  { id: "e1", from: "chip", to: "qc", label: "" },
  { id: "e2", from: "qc", to: "build", label: "QC pass" },
  { id: "e3", from: "qc", to: "chip", label: "QC fail" },
  { id: "e4", from: "build", to: "gate_device", label: "" },
  { id: "e5", from: "gate_device", to: "stage1", label: "device o" },
];

const emptyForm = (defaultLane) => ({
  id: null, lane: defaultLane, label: "", start: T, end: T, type: "task", status: "pending", category: "", half: "full", links: [], forwardLinks: [],
});

// ---------- Firebase (실시간 공유 저장소) ----------
const firebaseConfig = {
  apiKey: "AIzaSyBtm_sjWDT6LaseZBVGqw9QmysMxE3Jyic",
  authDomain: "flowcal-17533.firebaseapp.com",
  projectId: "flowcal-17533",
  storageBucket: "flowcal-17533.firebasestorage.app",
  messagingSenderId: "861173687698",
  appId: "1:861173687698:web:736801a80f0c301c500d4b",
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const boardRef = db.collection("flowcal").doc("board");

function DateFlowchartTimeline() {
  const [lanes, setLanes] = useState(initialLanes);
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const [zoomKey, setZoomKey] = useState("day");
  const [viewYear, setViewYear] = useState(Number(T.slice(0, 4)));
  const [form, setForm] = useState(null);
  const [newLane, setNewLane] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const fileInputRef = useRef(null);
  const svgRef = useRef(null);
  const scrollRef = useRef(null);
  const [syncStatus, setSyncStatus] = useState("connecting"); // connecting | synced | error

  // Firestore 실시간 구독: 나 또는 다른 사람이 바꾸면 여기로 즉시 반영됨
  useEffect(() => {
    const unsub = boardRef.onSnapshot(
      (doc) => {
        if (doc.exists) {
          const data = doc.data();
          setLanes(data.lanes || initialLanes);
          setNodes(data.nodes || initialNodes);
          setEdges(data.edges || initialEdges);
        } else {
          boardRef.set({ lanes: initialLanes, nodes: initialNodes, edges: initialEdges });
        }
        setSyncStatus("synced");
      },
      (err) => { console.error("Firestore sync error", err); setSyncStatus("error"); }
    );
    return () => unsub();
  }, []);

  // 로컬에서 뭔가 바뀌면 Firestore에 그대로 반영 -> 실시간 구독이 다시 받아서 화면 갱신
  const commit = (partial) => {
    boardRef.set({ lanes, nodes, edges, ...partial });
  };

  const zoom = ZOOM_PRESETS[zoomKey];
  const visibleLanes = lanes.filter((l) => l.visible);
  const visibleLaneNames = visibleLanes.map((l) => l.name);
  const vNodes = nodes.filter((n) => visibleLaneNames.includes(n.lane));
  const vNodeIds = new Set(vNodes.map((n) => n.id));
  const vEdges = edges.filter((e) => vNodeIds.has(e.from) && vNodeIds.has(e.to));

  // 기본적으로 선택된 연도(viewYear) 전체(1/1~12/31)를 항상 포함하고,
  // 실제 노드 날짜가 그 범위를 벗어나면(다음 해로 넘어가는 등) 자동으로 확장됩니다.
  const { domainStart, domainEnd, totalDays } = useMemo(() => {
    let min = `${viewYear}-01-01`, max = `${viewYear}-12-31`;
    vNodes.forEach((n) => { if (n.start < min) min = n.start; if (n.end > max) max = n.end; });
    const ds = addDays(min, -zoom.pad), de = addDays(max, zoom.pad);
    return { domainStart: ds, domainEnd: de, totalDays: diffDays(ds, de) + 1 };
  }, [vNodes, zoomKey, viewYear]);

  // 연도 이동(◀ ▶) 버튼을 눌렀을 때만 그 해 1/1로 스크롤
  useEffect(() => {
    if (!scrollRef.current) return;
    const targetX = diffDays(domainStart, `${viewYear}-01-01`) * zoom.pxPerDay;
    scrollRef.current.scrollLeft = Math.max(0, targetX - 30);
  }, [viewYear]);

  // 줌 레벨을 바꾸거나 처음 열었을 때는 항상 오늘 날짜 기준으로 표시
  useEffect(() => {
    if (!scrollRef.current) return;
    const targetX = diffDays(domainStart, T) * zoom.pxPerDay;
    scrollRef.current.scrollLeft = Math.max(0, targetX - 200);
  }, [zoomKey]);

  const scrollToToday = () => {
    if (!scrollRef.current) return;
    const targetX = diffDays(domainStart, T) * zoom.pxPerDay;
    scrollRef.current.scrollLeft = Math.max(0, targetX - 200);
  };

  const [hover, setHover] = useState(null); // {x, laneIdx, date}
  const dragState = useRef({ dragging: false, startX: 0, startY: 0, startLeft: 0, startTop: 0, moved: false });

  const posToDateLane = (evt) => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const x = evt.clientX - rect.left, y = evt.clientY - rect.top;
    if (y < HEADER_HEIGHT) return null;
    const laneEntry = laneLayout.lanes.find((l) => y >= l.top && y < l.top + l.height);
    if (!laneEntry) return null;
    const dayOffset = Math.floor(x / zoom.pxPerDay);
    const date = addDays(domainStart, dayOffset);
    const withinDay = x - dayOffset * zoom.pxPerDay;
    const half = withinDay < zoom.pxPerDay / 2 ? "am" : "pm"; // 클릭한 위치가 그 날의 왼쪽 절반이면 오전, 오른쪽이면 오후
    return { lane: laneEntry.name, date, half, cellX: dayOffset * zoom.pxPerDay, laneTop: laneEntry.top, laneHeight: laneEntry.height };
  };

  const handleCanvasPointerDown = (evt) => {
    if (evt.button !== 0 || !scrollRef.current) return;
    // 캡처는 아직 잡지 않는다 — 여기서 잡아버리면 이후 클릭 이벤트가 전부
    // svg로만 전달돼서 노드 클릭(수정)이 막혀버림. 실제 드래그가 감지된 뒤에만 잡는다.
    dragState.current = { dragging: true, pointerId: evt.pointerId, startX: evt.clientX, startY: evt.clientY, startLeft: scrollRef.current.scrollLeft, startTop: scrollRef.current.scrollTop, moved: false };
  };
  const handleCanvasPointerUp = () => {
    if (dragState.current.moved && svgRef.current && dragState.current.pointerId != null) {
      try { svgRef.current.releasePointerCapture(dragState.current.pointerId); } catch (e) {}
    }
    dragState.current.dragging = false;
    if (svgRef.current) svgRef.current.style.cursor = "grab";
  };
  const handleCanvasPointerMove = (evt) => {
    const ds = dragState.current;
    if (ds.dragging) {
      const dx = evt.clientX - ds.startX, dy = evt.clientY - ds.startY;
      if (!ds.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        ds.moved = true;
        if (svgRef.current) {
          try { svgRef.current.setPointerCapture(ds.pointerId); } catch (e) {} // 진짜 드래그로 확정된 순간에만 캡처
          svgRef.current.style.cursor = "grabbing";
        }
      }
      if (ds.moved && scrollRef.current) {
        scrollRef.current.scrollLeft = ds.startLeft - dx;
        scrollRef.current.scrollTop = ds.startTop - dy;
        if (hover) setHover(null);
        return;
      }
    }
    const hit = posToDateLane(evt);
    setHover(hit);
  };
  const handleCanvasClick = (evt) => {
    if (dragState.current.moved) { dragState.current.moved = false; return; }
    const hit = posToDateLane(evt);
    if (!hit) return;
    setForm({ ...emptyForm(hit.lane), lane: hit.lane, start: hit.date, end: hit.date, half: zoomKey === "day" ? hit.half : "full" });
  };

  const totalWidth = Math.max(totalDays * zoom.pxPerDay, 600);
  const xOf = (dateStr) => diffDays(domainStart, dateStr) * zoom.pxPerDay;

  const ticks = useMemo(() => {
    const s = toDate(domainStart), e = toDate(domainEnd);
    let interval, fmt;
    if (zoomKey === "day") { interval = d3.timeDay; fmt = d3.timeFormat("%m/%d (%a)"); }
    else if (zoomKey === "week") { interval = d3.timeMonday; fmt = d3.timeFormat("%m/%d 주"); }
    else if (zoomKey === "month") { interval = d3.timeMonth; fmt = d3.timeFormat("%Y-%m"); }
    else { interval = d3.timeMonth.every(3); fmt = d3.timeFormat("%Y-%m"); }
    return interval.range(s, e).map((dt) => ({ x: diffDays(domainStart, toLocalDateStr(dt)) * zoom.pxPerDay, label: fmt(dt) }));
  }, [domainStart, domainEnd, zoomKey]);

  // 레인별 레이아웃: 날짜(x)는 절대 밀지 않고, 같은 날짜에 여러 개가 겹치면
  // 그 레인 안에서 아래쪽 행(row)으로 쌓는다. 레인 높이는 필요한 행 수만큼 늘어남.
  const laneLayout = useMemo(() => {
    const ROW_GAP = 14;
    let top = HEADER_HEIGHT;
    const lanes2 = visibleLanes.map((lane) => {
      const items = vNodes
        .filter((n) => n.lane === lane.name)
        .map((n) => {
          const isSingleDay = n.start === n.end;
          const isHalf = zoomKey === "day" && isSingleDay && (n.half === "am" || n.half === "pm");
          if (isHalf) {
            const halfW = zoom.pxPerDay / 2;
            const x = xOf(n.start) + (n.half === "pm" ? halfW : 0);
            const w = Math.max(halfW - 10, 30);
            return { n, x, w };
          }
          const dayBasedW = (diffDays(n.start, n.end) + 1) * zoom.pxPerDay - 18;
          const minW = zoom.pxPerDay >= 20 ? 46 : 14;
          return { n, x: xOf(n.start), w: Math.max(dayBasedW, minW) };
        })
        .sort((a, b) => a.x - b.x);
      const rowEnds = []; // 각 행에 마지막으로 배치된 노드의 오른쪽 끝 x
      items.forEach((item) => {
        let row = rowEnds.findIndex((end) => item.x >= end + ROW_GAP);
        if (row === -1) { row = rowEnds.length; rowEnds.push(-Infinity); }
        rowEnds[row] = item.x + item.w;
        item.row = row;
      });
      const rowCount = Math.max(1, rowEnds.length);
      const height = rowCount * ROW_HEIGHT;
      const entry = { name: lane.name, top, height, rowCount, items };
      top += height;
      return entry;
    });
    return { lanes: lanes2, totalHeight: top - HEADER_HEIGHT };
  }, [vNodes, visibleLaneNames.join(","), zoomKey, domainStart]);

  const chartHeight = HEADER_HEIGHT + laneLayout.totalHeight;

  const nodePos = useMemo(() => {
    const map = {};
    laneLayout.lanes.forEach((lane) => {
      lane.items.forEach(({ n, x, w, row }) => {
        const y = lane.top + row * ROW_HEIGHT + ROW_HEIGHT / 2;
        if (n.type === "gate") {
          const size = Math.min(40, Math.max(28, w * 0.7));
          const cx = x + w / 2;
          map[n.id] = { x, w, y, left: cx - size / 2, right: cx + size / 2, cx, size };
        } else {
          map[n.id] = { x, w, y, left: x, right: x + w };
        }
      });
    });
    return map;
  }, [laneLayout]);

  const openAdd = () => setForm(emptyForm(lanes[0]?.name || ""));
  const openEdit = (n) => {
    const links = edges.filter((e) => e.to === n.id).map((e) => ({ parentId: e.from, label: e.label, edgeId: e.id }));
    const forwardLinks = edges.filter((e) => e.from === n.id).map((e) => ({ childId: e.to, label: e.label, edgeId: e.id }));
    setForm({ ...n, half: n.half || "full", category: n.category || "", links, forwardLinks });
  };
  const closeForm = () => setForm(null);

  const saveForm = () => {
    if (!form.label.trim()) return;
    const id = form.id || uid();
    const end = form.end < form.start ? form.start : form.end;
    const half = form.start === end ? (form.half || "full") : "full"; // 하루짜리 일정에만 오전/오후 의미가 있음
    const category = form.type === "task" ? (form.category || "") : "";
    const nodeData = { id, lane: form.lane, label: form.label, start: form.start, end, type: form.type, status: form.type === "gate" ? "pending" : form.status, category, half };
    const exists = nodes.some((n) => n.id === id);
    const nextNodes = exists ? nodes.map((n) => (n.id === id ? nodeData : n)) : [...nodes, nodeData];
    const others = edges.filter((e) => e.to !== id && e.from !== id);
    const backward = form.links.filter((l) => l.parentId).map((l) => ({ id: l.edgeId || uid("e"), from: l.parentId, to: id, label: l.label || "" }));
    const forward = form.forwardLinks.filter((l) => l.childId).map((l) => ({ id: l.edgeId || uid("e"), from: id, to: l.childId, label: l.label || "" }));
    const nextEdges = [...others, ...backward, ...forward];
    commit({ nodes: nextNodes, edges: nextEdges });
    closeForm();
  };

  const deleteNode = () => {
    if (!form?.id) return;
    const nextNodes = nodes.filter((n) => n.id !== form.id);
    const nextEdges = edges.filter((e) => e.from !== form.id && e.to !== form.id);
    commit({ nodes: nextNodes, edges: nextEdges });
    closeForm();
  };

  const addLink = () => setForm((f) => ({ ...f, links: [...f.links, { parentId: "", label: "" }] }));
  const updateLink = (i, key, val) => setForm((f) => ({ ...f, links: f.links.map((l, idx) => (idx === i ? { ...l, [key]: val } : l)) }));
  const removeLink = (i) => setForm((f) => ({ ...f, links: f.links.filter((_, idx) => idx !== i) }));

  const addForwardLink = () => setForm((f) => ({ ...f, forwardLinks: [...f.forwardLinks, { childId: "", label: "" }] }));
  const updateForwardLink = (i, key, val) => setForm((f) => ({ ...f, forwardLinks: f.forwardLinks.map((l, idx) => (idx === i ? { ...l, [key]: val } : l)) }));
  const removeForwardLink = (i) => setForm((f) => ({ ...f, forwardLinks: f.forwardLinks.filter((_, idx) => idx !== i) }));

  const addLane = () => {
    const name = newLane.trim();
    if (!name || lanes.some((l) => l.name === name)) return;
    commit({ lanes: [...lanes, { name, visible: true }] });
    setNewLane("");
  };
  const removeLane = (name) => {
    const nextLanes = lanes.filter((l) => l.name !== name);
    const toRemove = nodes.filter((n) => n.lane === name).map((n) => n.id);
    const nextNodes = nodes.filter((n) => n.lane !== name);
    const nextEdges = edges.filter((e) => !toRemove.includes(e.from) && !toRemove.includes(e.to));
    commit({ lanes: nextLanes, nodes: nextNodes, edges: nextEdges });
  };
  const moveLane = (idx, dir) => {
    const arr = [...lanes]; const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    commit({ lanes: arr });
  };
  const toggleLane = (name) => commit({ lanes: lanes.map((l) => (l.name === name ? { ...l, visible: !l.visible } : l)) });
  const isolateLane = (name) => {
    const alreadyIsolated = lanes.every((l) => l.visible === (l.name === name));
    if (alreadyIsolated) commit({ lanes: lanes.map((l) => ({ ...l, visible: true })) });
    else commit({ lanes: lanes.map((l) => ({ ...l, visible: l.name === name })) });
  };
  const showAllLanes = () => commit({ lanes: lanes.map((l) => ({ ...l, visible: true })) });

  const [editingLane, setEditingLane] = useState(null);
  const [editingValue, setEditingValue] = useState("");
  const startRenameLane = (name) => { setEditingLane(name); setEditingValue(name); };
  const commitRenameLane = () => {
    const oldName = editingLane;
    const val = editingValue.trim();
    if (!val || val === oldName) { setEditingLane(null); return; }
    if (lanes.some((l) => l.name === val)) { alert("이미 있는 레인 이름입니다."); return; }
    const nextLanes = lanes.map((l) => (l.name === oldName ? { ...l, name: val } : l));
    const nextNodes = nodes.map((n) => (n.lane === oldName ? { ...n, lane: val } : n));
    commit({ lanes: nextLanes, nodes: nextNodes });
    setEditingLane(null);
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ lanes, nodes, edges }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "flowchart-timeline.json"; a.click();
    URL.revokeObjectURL(url);
  };

  const applyImport = (text) => {
    try {
      const data = JSON.parse(text);
      if (data.lanes && data.nodes && data.edges) {
        const normLanes = data.lanes.map((l) => (typeof l === "string" ? { name: l, visible: true } : l));
        boardRef.set({ lanes: normLanes, nodes: data.nodes, edges: data.edges });
        setImportOpen(false); setImportText("");
      }
    } catch (e) { alert("JSON 형식이 올바르지 않습니다."); }
  };

  const onFileChosen = (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => applyImport(String(reader.result));
    reader.readAsText(file);
    ev.target.value = "";
  };

  // 현재 보이는 내용만 PNG로 저장
  const exportPNG = () => {
    if (!svgRef.current || vNodes.length === 0) { alert("저장할 노드가 없습니다."); return; }
    let minStart = vNodes[0].start, maxEnd = vNodes[0].end;
    vNodes.forEach((n) => { if (n.start < minStart) minStart = n.start; if (n.end > maxEnd) maxEnd = n.end; });
    const padDays = zoomKey === "day" ? 1 : zoomKey === "week" ? 2 : zoomKey === "month" ? 5 : 20;
    const x0 = Math.max(0, xOf(addDays(minStart, -padDays)));
    const x1 = Math.min(totalWidth, xOf(addDays(maxEnd, padDays)));
    const cropW = x1 - x0, cropH = chartHeight;

    const clone = svgRef.current.cloneNode(true);
    clone.setAttribute("viewBox", `${x0} 0 ${cropW} ${cropH}`);
    clone.setAttribute("width", cropW);
    clone.setAttribute("height", cropH);
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("x", x0); bg.setAttribute("y", 0); bg.setAttribute("width", cropW); bg.setAttribute("height", cropH); bg.setAttribute("fill", "#0a0c10");
    clone.insertBefore(bg, clone.firstChild);

    const svgStr = new XMLSerializer().serializeToString(clone);
    const svg64 = btoa(unescape(encodeURIComponent(svgStr)));
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = cropW * scale; canvas.height = cropH * scale;
      const ctx = canvas.getContext("2d");
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, cropW, cropH);
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const laneTag = visibleLaneNames.length === 1 ? visibleLaneNames[0].replace(/\s+/g, "_") : "multi";
        a.href = url; a.download = `timeline_${laneTag}_${T}.png`; a.click();
        URL.revokeObjectURL(url);
      });
    };
    img.src = "data:image/svg+xml;base64," + svg64;
  };

  return (
    <div className="w-full h-full bg-zinc-950 text-zinc-100 flex flex-col" style={{ minHeight: "100vh" }}>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 flex-wrap">
        <div className="text-teal-400 font-semibold text-sm tracking-wide">📅 FlowCal</div>
        <span className={"text-[10px] px-2 py-0.5 rounded-full font-medium " + (syncStatus === "synced" ? "bg-teal-500/15 text-teal-400" : syncStatus === "error" ? "bg-rose-500/15 text-rose-400" : "bg-zinc-700 text-zinc-400")}>
          {syncStatus === "synced" ? "🟢 실시간 연결됨" : syncStatus === "error" ? "🔴 연결 오류" : "⏳ 연결 중..."}
        </span>
        <div className="flex bg-zinc-900 rounded-md p-0.5 gap-0.5">
          {Object.entries(ZOOM_PRESETS).map(([k, v]) => (
            <button key={k} onClick={() => setZoomKey(k)}
              className={"px-3 py-1.5 text-xs rounded font-medium transition-colors " + (zoomKey === k ? "bg-teal-500 text-zinc-950" : "text-zinc-400 hover:text-zinc-100")}>
              {v.label}
            </button>
          ))}
        </div>
        <button onClick={openAdd} className="flex items-center gap-1 bg-teal-500 hover:bg-teal-400 text-zinc-950 text-xs font-semibold px-3 py-1.5 rounded-md ml-2">＋ 새 노드</button>
        <button onClick={showAllLanes} className="text-xs text-zinc-400 hover:text-zinc-100 border border-zinc-700 px-3 py-1.5 rounded-md">전체 보기</button>
        <div className="flex items-center gap-1 bg-zinc-900 rounded-md p-0.5 ml-2">
          <button onClick={() => setViewYear((y) => y - 1)} className="px-2 py-1.5 text-xs text-zinc-400 hover:text-teal-400">◀</button>
          <span className="px-1 text-xs font-mono text-zinc-200 w-12 text-center">{viewYear}</span>
          <button onClick={() => setViewYear((y) => y + 1)} className="px-2 py-1.5 text-xs text-zinc-400 hover:text-teal-400">▶</button>
        </div>
        <button onClick={scrollToToday} className="text-xs text-zinc-400 hover:text-zinc-100 border border-zinc-700 px-3 py-1.5 rounded-md">오늘로</button>
        <div className="flex-1" />
        <button onClick={exportPNG} className="flex items-center gap-1 text-xs text-zinc-950 bg-zinc-100 hover:bg-white font-semibold px-3 py-1.5 rounded-md">📷 이미지로 저장</button>
        <button onClick={exportData} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-100 border border-zinc-700 px-3 py-1.5 rounded-md">⬇ 내보내기</button>
        <button onClick={() => setImportOpen(true)} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-100 border border-zinc-700 px-3 py-1.5 rounded-md">⬆ 가져오기</button>
      </div>
      <div className="flex items-center gap-4 px-4 py-1.5 border-b border-zinc-800 bg-zinc-950/60 flex-wrap">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">구분</span>
        {Object.entries(CATEGORY_LABEL).map(([k, label]) => (
          <span key={k} className="flex items-center gap-1.5 text-xs text-zinc-300">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: CATEGORY_STYLES[k].fill, border: `1px solid ${CATEGORY_STYLES[k].stroke}` }} />
            {label}
          </span>
        ))}
        <span className="w-px h-3 bg-zinc-700 mx-1" />
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">상태 점</span>
        {Object.entries(STATUS_LABEL).map(([k, label]) => (
          <span key={k} className="flex items-center gap-1.5 text-xs text-zinc-300">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_STYLES[k].fill }} />
            {label}
          </span>
        ))}
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div style={{ width: LABEL_COL_WIDTH }} className="flex-shrink-0 border-r border-zinc-800 bg-zinc-950 overflow-y-auto">
          <div style={{ height: HEADER_HEIGHT }} className="border-b border-zinc-800 flex items-center px-3 text-[11px] text-zinc-500 uppercase tracking-wider">분류 / 레인</div>
          {lanes.map((lane, i) => {
            const laneH = laneLayout.lanes.find((l) => l.name === lane.name)?.height || LANE_HEIGHT;
            return (
            <div key={lane.name} style={{ minHeight: laneH }} className={"border-b border-zinc-900 px-3 flex flex-col justify-center gap-1.5 " + (lane.visible ? "" : "opacity-40")}>
              <div className="flex items-start justify-between gap-1">
                {editingLane === lane.name ? (
                  <input
                    autoFocus
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") commitRenameLane(); if (e.key === "Escape") setEditingLane(null); }}
                    onBlur={commitRenameLane}
                    className="flex-1 min-w-0 bg-zinc-800 border border-teal-500 rounded px-1.5 py-0.5 text-sm text-zinc-100"
                  />
                ) : (
                  <span onClick={() => startRenameLane(lane.name)} title="클릭해서 이름 수정" className="text-sm font-medium text-zinc-200 leading-tight cursor-text hover:text-teal-300">
                    {lane.name} <span className="text-zinc-600 text-[10px]">✎</span>
                  </span>
                )}
                <button onClick={() => toggleLane(lane.name)} title="켜기/끄기" className="text-base leading-none flex-shrink-0">{lane.visible ? "👁" : "🚫"}</button>
              </div>
              <div className="flex gap-2 items-center">
                <button onClick={() => isolateLane(lane.name)} className="text-[10px] text-teal-400 hover:text-teal-300 border border-zinc-700 rounded px-1.5 py-0.5">
                  {lanes.every((l) => l.visible === (l.name === lane.name)) ? "전체보기" : "단독보기"}
                </button>
                <button onClick={() => moveLane(i, -1)} className="text-zinc-500 hover:text-teal-400 text-xs">▲</button>
                <button onClick={() => moveLane(i, 1)} className="text-zinc-500 hover:text-teal-400 text-xs">▼</button>
                <button onClick={() => removeLane(lane.name)} className="text-zinc-500 hover:text-rose-400 text-xs">삭제</button>
              </div>
            </div>
          );})}
          <div className="px-3 py-2 flex gap-1">
            <input value={newLane} onChange={(e) => setNewLane(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addLane()}
              placeholder="레인 추가" className="flex-1 min-w-0 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 placeholder-zinc-600" />
            <button onClick={addLane} className="text-teal-400 border border-zinc-700 rounded px-2">＋</button>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-auto">
          <svg ref={svgRef} width={totalWidth} height={chartHeight} style={{ display: "block", cursor: "grab", userSelect: "none", touchAction: "none" }}
            onClick={handleCanvasClick} onPointerDown={handleCanvasPointerDown} onPointerUp={handleCanvasPointerUp}
            onPointerMove={handleCanvasPointerMove} onPointerLeave={() => { if (!dragState.current.dragging) setHover(null); }}>
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9.5" markerHeight="9.5" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="#5eead4" />
              </marker>
              <marker id="arrow-back" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9.5" markerHeight="9.5" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="#fb7185" />
              </marker>
            </defs>
            {laneLayout.lanes.map((lane, i) => (
              <rect key={lane.name} x={0} y={lane.top} width={totalWidth} height={lane.height} fill={i % 2 === 0 ? "#0f1117" : "#0a0c10"} />
            ))}
            {hover && (
              <g pointerEvents="none">
                <rect x={hover.cellX} y={hover.laneTop} width={zoom.pxPerDay} height={hover.laneHeight} fill="#2dd4bf" opacity={0.12} />
                <rect x={hover.cellX} y={hover.laneTop + hover.laneHeight - 16} width={Math.max(zoom.pxPerDay, 64)} height={16} fill="#2dd4bf" />
                <text x={hover.cellX + 4} y={hover.laneTop + hover.laneHeight - 4} fontSize={9.5} fill="#04302b" fontFamily="ui-monospace, monospace">＋ {hover.date}</text>
              </g>
            )}
            {ticks.map((t, i) => (
              <g key={i}>
                <line x1={t.x} y1={0} x2={t.x} y2={chartHeight} stroke="#1f2733" strokeWidth={1} />
                {zoomKey === "day" && <line x1={t.x + zoom.pxPerDay / 2} y1={HEADER_HEIGHT} x2={t.x + zoom.pxPerDay / 2} y2={chartHeight} stroke="#1f2733" strokeWidth={1} strokeDasharray="2 3" opacity={0.6} />}
                <text x={t.x + 4} y={20} fontSize={10} fill="#8b96a8" fontFamily="ui-monospace, monospace">{t.label}</text>
              </g>
            ))}
            <line x1={0} y1={HEADER_HEIGHT} x2={totalWidth} y2={HEADER_HEIGHT} stroke="#2a3241" strokeWidth={1} />
            {(() => {
              const tx = xOf(T);
              if (tx < -zoom.pxPerDay || tx > totalWidth) return null;
              return (
                <g pointerEvents="none">
                  <rect x={tx} y={HEADER_HEIGHT} width={zoom.pxPerDay} height={chartHeight - HEADER_HEIGHT} fill="#f472b6" opacity={0.1} />
                  <rect x={tx} y={HEADER_HEIGHT} width={zoom.pxPerDay} height={3} fill="#f472b6" />
                  <text x={tx + zoom.pxPerDay / 2} y={HEADER_HEIGHT + 14} fontSize={10} fill="#f472b6" fontFamily="ui-monospace, monospace" textAnchor="middle">오늘</text>
                </g>
              );
            })()}
            {vEdges.map((e) => {
              const a = nodePos[e.from], b = nodePos[e.to];
              if (!a || !b) return null;
              const forward = b.x >= a.x; // 목적지가 오른쪽(또는 같은 위치)이면 정방향 흐름
              let path, mx, my;
              if (forward) {
                const x1 = a.right, y1 = a.y, x2 = b.left, y2 = b.y;
                const dx = Math.min(24, Math.max(6, (x2 - x1) / 2));
                path = `M ${x1},${y1} C ${x1 + dx},${y1} ${x2 - dx},${y2} ${x2 - 10},${y2}`;
                mx = (x1 + x2) / 2; my = (y1 + y2) / 2;
              } else {
                // 되돌아가는(역방향) 연결: 아래로 살짝 루프를 그려서 정방향 화살표와 겹치지 않게 분리
                const x1 = a.left, y1 = a.y, x2 = b.right, y2 = b.y;
                const loop = 26;
                path = `M ${x1},${y1} C ${x1 - loop},${y1 + loop} ${x2 + loop},${y2 + loop} ${x2 + 10},${y2}`;
                mx = (x1 + x2) / 2; my = Math.max(y1, y2) + loop * 0.7;
              }
              return (
                <g key={e.id}>
                  <path d={path} fill="none" stroke="#0a0c10" strokeWidth={6} opacity={0.95} />
                  <path d={path} fill="none" stroke={forward ? "#5eead4" : "#fb7185"} strokeWidth={2.2}
                    strokeDasharray={forward ? "none" : "5 4"} opacity={1} />
                  {e.label && (<g><rect x={mx - e.label.length * 3.4 - 4} y={my - 17} width={e.label.length * 6.8 + 8} height={15} rx={3} fill="#0f1117" stroke="#27303f" /><text x={mx} y={my - 6} fontSize={10} fill={forward ? "#5eead4" : "#fb7185"} textAnchor="middle">{e.label}</text></g>)}
                </g>
              );
            })}
            {vNodes.map((n) => {
              const p = nodePos[n.id];
              if (!p) return null;
              const st = (n.category && CATEGORY_STYLES[n.category]) || STATUS_STYLES[n.status] || STATUS_STYLES.pending;
              const fullTitle = `${n.label}${n.category ? " · " + CATEGORY_LABEL[n.category] : ""} (${n.start}${n.end !== n.start ? " ~ " + n.end : n.half === "am" ? " 오전" : n.half === "pm" ? " 오후" : ""})`;
              if (n.type === "gate") {
                const size = Math.min(40, Math.max(28, p.w * 0.7)); // 슬롯이 좁으면(오전/오후 등) 다이아몬드도 같이 줄임
                const cx = p.x + p.w / 2, cy = p.y; // 슬롯 왼쪽 경계가 아니라 가운데에 오도록
                const pts = `${cx},${cy - size / 2} ${cx + size / 2},${cy} ${cx},${cy + size / 2} ${cx - size / 2},${cy}`;
                const clipId = "clip-" + n.id;
                const gateFont = fitFontSize(n.label, size * 0.78, 10.5, 7);
                return (
                  <g key={n.id} onClick={(e) => { e.stopPropagation(); openEdit(n); }} style={{ cursor: "pointer" }}>
                    <title>{fullTitle}</title>
                    <clipPath id={clipId}><rect x={cx - size / 2} y={cy - size / 2} width={size} height={size} /></clipPath>
                    <polygon points={pts} fill="#1e293b" stroke="#5eead4" strokeWidth={1.4} />
                    <text x={cx} y={cy + gateFont * 0.35} fontSize={gateFont} fill="#e2e8f0" textAnchor="middle" clipPath={`url(#${clipId})`}>{n.label}</text>
                  </g>
                );
              }
              const clipId = "clip-" + n.id;
              const titleFont = fitFontSize(n.label, p.w - 10, 11, 7);
              return (
                <g key={n.id} onClick={(e) => { e.stopPropagation(); openEdit(n); }} style={{ cursor: "pointer" }}>
                  <title>{fullTitle}</title>
                  <clipPath id={clipId}><rect x={p.x} y={p.y - 18} width={p.w} height={36} rx={7} /></clipPath>
                  <rect x={p.x} y={p.y - 18} width={p.w} height={36} rx={7} fill={st.fill} stroke={st.stroke} strokeWidth={1.3} />
                  <text x={p.x + p.w / 2} y={p.y - 2} fontSize={titleFont} fontWeight={600} fill={st.text} textAnchor="middle" clipPath={`url(#${clipId})`}>{n.label}</text>
                  <text x={p.x + p.w / 2} y={p.y + 12} fontSize={9} fill={st.text} textAnchor="middle" opacity={0.75} clipPath={`url(#${clipId})`}>{n.start}{n.end !== n.start ? ` ~ ${n.end}` : n.half === "am" ? " 오전" : n.half === "pm" ? " 오후" : ""}</text>
                  {n.category && (
                    <circle cx={p.x + p.w - 8} cy={p.y - 12} r={4} fill={STATUS_STYLES[n.status]?.fill || "#475569"} stroke="#0a0c10" strokeWidth={1} />
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {form && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={closeForm}>
          <div onClick={(e) => e.stopPropagation()} className="bg-zinc-900 border border-zinc-700 rounded-lg w-[420px] max-w-[92vw] max-h-[85vh] overflow-y-auto overflow-x-hidden p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-teal-400">{form.id ? "노드 편집" : "새 노드"}</h3>
              <button onClick={closeForm} className="text-zinc-500 hover:text-zinc-200">✕</button>
            </div>
            <label className="block text-xs text-zinc-400 mb-1">제목</label>
            <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-sm mb-3" placeholder="예: ADT dRAST 2.5" />
            <label className="block text-xs text-zinc-400 mb-1">레인</label>
            <select value={form.lane} onChange={(e) => setForm({ ...form, lane: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-sm mb-3">
              {lanes.map((l) => <option key={l.name} value={l.name}>{l.name}</option>)}
            </select>
            <div className="flex gap-2 mb-3">
              <div className="flex-1"><label className="block text-xs text-zinc-400 mb-1">시작일</label><input type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-sm" /></div>
              <div className="flex-1"><label className="block text-xs text-zinc-400 mb-1">종료일</label><input type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-sm" /></div>
            </div>
            {form.start === form.end && (
              <div className="mb-3">
                <label className="block text-xs text-zinc-400 mb-1">시간대</label>
                <select value={form.half || "full"} onChange={(e) => setForm({ ...form, half: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-sm">
                  <option value="full">종일</option>
                  <option value="am">오전</option>
                  <option value="pm">오후</option>
                </select>
              </div>
            )}
            <div className="flex gap-2 mb-3">
              <div className="flex-1"><label className="block text-xs text-zinc-400 mb-1">유형</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-sm">
                  <option value="task">작업/단계</option><option value="gate">분기점</option>
                </select>
              </div>
              {form.type === "task" && (
                <div className="flex-1"><label className="block text-xs text-zinc-400 mb-1">상태</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-sm">
                    {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              )}
            </div>
            {form.type === "task" && (
              <div className="mb-3">
                <label className="block text-xs text-zinc-400 mb-1">구분 (Bio / Kit / HPLC-MS)</label>
                <select value={form.category || ""} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-sm">
                  <option value="">지정 안 함 (상태색 그대로)</option>
                  {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            )}
            <label className="block text-xs text-zinc-400 mb-1">연결 (이전 노드 → 이 노드)</label>
            <div className="space-y-2 mb-2">
              {form.links.map((l, i) => (
                <div key={i} className="flex gap-1.5">
                  <select value={l.parentId} onChange={(e) => updateLink(i, "parentId", e.target.value)} className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs">
                    <option value="">선택...</option>
                    {nodes.filter((n) => n.id !== form.id).map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
                  </select>
                  <input value={l.label} onChange={(e) => updateLink(i, "label", e.target.value)} placeholder="조건 라벨(선택)" className="w-24 flex-shrink-0 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs" />
                  <button onClick={() => removeLink(i)} className="text-zinc-500 hover:text-rose-400">✕</button>
                </div>
              ))}
            </div>
            <button onClick={addLink} className="text-xs text-teal-400 mb-4">＋ 연결 추가</button>

            <label className="block text-xs text-zinc-400 mb-1">다음 노드로 연결 (이 노드 → 다음 노드)</label>
            <div className="space-y-2 mb-2">
              {form.forwardLinks.map((l, i) => (
                <div key={i} className="flex gap-1.5">
                  <select value={l.childId} onChange={(e) => updateForwardLink(i, "childId", e.target.value)} className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs">
                    <option value="">선택...</option>
                    {nodes.filter((n) => n.id !== form.id).map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
                  </select>
                  <input value={l.label} onChange={(e) => updateForwardLink(i, "label", e.target.value)} placeholder="조건 라벨(선택)" className="w-24 flex-shrink-0 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs" />
                  <button onClick={() => removeForwardLink(i)} className="text-zinc-500 hover:text-rose-400">✕</button>
                </div>
              ))}
            </div>
            <button onClick={addForwardLink} className="text-xs text-teal-400 mb-4">＋ 연결 추가</button>
            <div className="flex justify-between items-center pt-2 border-t border-zinc-800">
              {form.id ? <button onClick={deleteNode} className="text-xs text-rose-400">🗑 삭제</button> : <span />}
              <div className="flex gap-2">
                <button onClick={closeForm} className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-300">취소</button>
                <button onClick={saveForm} className="text-xs px-3 py-1.5 rounded bg-teal-500 text-zinc-950 font-semibold">저장</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setImportOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-zinc-900 border border-zinc-700 rounded-lg w-[420px] p-5">
            <h3 className="text-sm font-semibold text-teal-400 mb-3">데이터 가져오기</h3>
            <input ref={fileInputRef} type="file" accept=".json" onChange={onFileChosen} className="text-xs text-zinc-400 mb-3" />
            <p className="text-xs text-zinc-500 mb-2">또는 JSON 텍스트를 붙여넣기:</p>
            <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={6} className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs mb-3 font-mono" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setImportOpen(false)} className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-300">취소</button>
              <button onClick={() => applyImport(importText)} className="text-xs px-3 py-1.5 rounded bg-teal-500 text-zinc-950 font-semibold">적용</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<DateFlowchartTimeline />);
