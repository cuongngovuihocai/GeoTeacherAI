import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Download, ZoomIn, ZoomOut, Move, MousePointer2, Minus, Square, Circle, Type, Trash2, RefreshCw, Undo, Redo, LayoutGrid, RotateCw, MoreHorizontal } from 'lucide-react';

interface DrawingCanvasProps {
  svgContent: string | null;
  isLoading: boolean;
  error: string | null;
  currentHexColor: string;
}

type ToolType = 'select' | 'line' | 'rect' | 'circle' | 'text';
type DragMode = 'none' | 'vertex' | 'move' | 'rotate';

interface ControlPoint {
  x: number;
  y: number;
  id: number;
  type: 'vertex' | 'center' | 'radius' | 'resize';
}

interface TransformData {
  tx: number;
  ty: number;
  rotation: number; // degrees
  cx: number; // center x for rotation
  cy: number; // center y for rotation
}

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
}

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({ svgContent, isLoading, error, currentHexColor }) => {
  const [scale, setScale] = useState(1);
  const [tool, setTool] = useState<ToolType>('select');
  const mountRef = useRef<HTMLDivElement>(null);
  
  const svgRef = useRef<SVGSVGElement | null>(null);
  
  // State for UI rendering
  const [selectedElement, setSelectedElement] = useState<Element | null>(null);
  const [controlPoints, setControlPoints] = useState<ControlPoint[]>([]);
  const [selectionBBox, setSelectionBBox] = useState<BoundingBox | null>(null);

  // History State
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Refs for Event Handlers
  const toolRef = useRef<ToolType>(tool);
  const selectedElementRef = useRef<Element | null>(null);
  const dragModeRef = useRef<DragMode>('none');
  const isDraggingPointRef = useRef<number | null>(null); // Index of vertex being dragged
  const isDrawingRef = useRef(false);
  const startPointRef = useRef<{x: number, y: number} | null>(null);
  const currentDrawElementRef = useRef<Element | null>(null);
  const didChangeRef = useRef(false);
  const currentHexColorRef = useRef(currentHexColor);

  // Transform Refs
  const startTransformRef = useRef<TransformData>({ tx: 0, ty: 0, rotation: 0, cx: 0, cy: 0 });
  
  // Sync state to refs
  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { selectedElementRef.current = selectedElement; }, [selectedElement]);
  useEffect(() => { currentHexColorRef.current = currentHexColor; }, [currentHexColor]);

  // --- Helpers for Transforms ---
  const getElementTransform = (el: Element): TransformData => {
    const tx = parseFloat(el.getAttribute('data-tx') || '0');
    const ty = parseFloat(el.getAttribute('data-ty') || '0');
    const rotation = parseFloat(el.getAttribute('data-rotation') || '0');
    // If centers are not set, default to 0 (will be updated on selection)
    const cx = parseFloat(el.getAttribute('data-cx') || '0');
    const cy = parseFloat(el.getAttribute('data-cy') || '0');
    return { tx, ty, rotation, cx, cy };
  };

  const setElementTransform = (el: Element, data: TransformData) => {
    el.setAttribute('data-tx', String(data.tx));
    el.setAttribute('data-ty', String(data.ty));
    el.setAttribute('data-rotation', String(data.rotation));
    el.setAttribute('data-cx', String(data.cx));
    el.setAttribute('data-cy', String(data.cy));

    // Construct SVG transform string
    let transformStr = `translate(${data.tx}, ${data.ty})`;
    if (data.rotation !== 0) {
      transformStr += ` rotate(${data.rotation}, ${data.cx}, ${data.cy})`;
    }
    el.setAttribute('transform', transformStr);
  };

  const updateSelectionBBox = useCallback((el: Element | null) => {
    if (!el || !(el instanceof SVGGraphicsElement)) {
      setSelectionBBox(null);
      return;
    }
    try {
      const bbox = el.getBBox();
      setSelectionBBox({
        x: bbox.x,
        y: bbox.y,
        width: bbox.width,
        height: bbox.height,
        cx: bbox.x + bbox.width / 2,
        cy: bbox.y + bbox.height / 2
      });
    } catch (e) {
      console.warn("Could not get BBox", e);
      setSelectionBBox(null);
    }
  }, []);

  // --- History Management ---
  const getCurrentSVGString = useCallback(() => {
     const svg = mountRef.current?.querySelector('svg');
     if (!svg) return null;
     const serializer = new XMLSerializer();
     return serializer.serializeToString(svg);
  }, []);

  const addToHistory = useCallback(() => {
    const content = getCurrentSVGString();
    if (!content) return;
    
    setHistory(prev => {
        const newHistory = prev.slice(0, historyIndex + 1);
        newHistory.push(content);
        return newHistory;
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex, getCurrentSVGString]);

  const restoreState = (content: string) => {
      if (!mountRef.current) return;
      try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(content, "image/svg+xml");
          const newSvg = doc.documentElement as unknown as SVGSVGElement;
          
          newSvg.style.display = 'block';
          newSvg.style.overflow = 'visible';
          
          mountRef.current.innerHTML = '';
          mountRef.current.appendChild(newSvg);
          svgRef.current = newSvg; 
          
          setSelectedElement(null);
          setControlPoints([]);
          setSelectionBBox(null);
      } catch (e) {
          console.error("Error restoring state", e);
      }
  };

  const handleUndo = () => {
      if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          restoreState(history[newIndex]);
      }
  };

  const handleRedo = () => {
      if (historyIndex < history.length - 1) {
          const newIndex = historyIndex + 1;
          setHistoryIndex(newIndex);
          restoreState(history[newIndex]);
      }
  };

  // --- Initialization ---
  useEffect(() => {
    if (!mountRef.current || !svgContent) return;

    setSelectedElement(null);
    setControlPoints([]);
    setSelectionBBox(null);
    setHistory([]);
    setHistoryIndex(-1);
    
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgContent, "image/svg+xml");
      const newSvg = doc.documentElement as unknown as SVGSVGElement;
      
      if (newSvg.tagName.toLowerCase() !== 'svg') {
          console.error("Content is not a valid SVG");
          return;
      }

      newSvg.setAttribute('width', '100%');
      newSvg.setAttribute('height', '100%');
      if (!newSvg.hasAttribute('viewBox')) {
         const w = newSvg.getAttribute('width') || '500';
         const h = newSvg.getAttribute('height') || '500';
         newSvg.setAttribute('viewBox', `0 0 ${parseFloat(w)} ${parseFloat(h)}`);
      }
      newSvg.style.display = 'block';
      newSvg.style.overflow = 'visible';

      mountRef.current.innerHTML = '';
      mountRef.current.appendChild(newSvg);
      svgRef.current = newSvg;

      const serializer = new XMLSerializer();
      const initialContent = serializer.serializeToString(newSvg);
      setHistory([initialContent]);
      setHistoryIndex(0);
      
    } catch (e) {
      console.error("Error parsing SVG", e);
    }
  }, [svgContent]);

  // --- Coordinate Helpers ---
  const getSVGPoint = (clientX: number, clientY: number) => {
    const svg = mountRef.current?.querySelector('svg') as SVGSVGElement;
    if (!svg) return { x: 0, y: 0 };

    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const ctm = svg.getScreenCTM();
    if (ctm) {
      return point.matrixTransform(ctm.inverse());
    }
    return { x: 0, y: 0 };
  };

  const getLocalPoint = (clientX: number, clientY: number, el: SVGGraphicsElement) => {
    const svg = mountRef.current?.querySelector('svg') as SVGSVGElement;
    if (!svg) return { x: 0, y: 0 };

    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    
    // Crucial: Use the element's own CTM to map back to its local coordinate space
    const ctm = el.getScreenCTM(); 
    if (ctm) {
      return point.matrixTransform(ctm.inverse());
    }
    return getSVGPoint(clientX, clientY);
  };

  const parseControlPoints = (el: Element): ControlPoint[] => {
    const points: ControlPoint[] = [];
    const tagName = el.tagName.toLowerCase();

    if (tagName === 'line') {
      points.push({ x: parseFloat(el.getAttribute('x1') || '0'), y: parseFloat(el.getAttribute('y1') || '0'), id: 0, type: 'vertex' });
      points.push({ x: parseFloat(el.getAttribute('x2') || '0'), y: parseFloat(el.getAttribute('y2') || '0'), id: 1, type: 'vertex' });
    } else if (tagName === 'circle') {
      const cx = parseFloat(el.getAttribute('cx') || '0');
      const cy = parseFloat(el.getAttribute('cy') || '0');
      const r = parseFloat(el.getAttribute('r') || '0');
      points.push({ x: cx, y: cy, id: 0, type: 'center' });
      points.push({ x: cx + r, y: cy, id: 1, type: 'radius' });
    } else if (tagName === 'rect') {
      const x = parseFloat(el.getAttribute('x') || '0');
      const y = parseFloat(el.getAttribute('y') || '0');
      const w = parseFloat(el.getAttribute('width') || '0');
      const h = parseFloat(el.getAttribute('height') || '0');
      points.push({ x: x, y: y, id: 0, type: 'resize' }); 
      points.push({ x: x + w, y: y + h, id: 1, type: 'resize' }); 
    } else if (tagName === 'polygon' || tagName === 'polyline') {
      const pointsAttr = el.getAttribute('points') || '';
      const pairs = pointsAttr.trim().split(/\s+|,/).filter(p => p !== '');
      for (let i = 0; i < pairs.length; i += 2) {
        if (pairs[i] && pairs[i+1]) {
            points.push({ x: parseFloat(pairs[i]), y: parseFloat(pairs[i+1]), id: i/2, type: 'vertex' });
        }
      }
    } else if (tagName === 'path') {
        const d = el.getAttribute('d') || '';
        const commands = d.match(/[ML]\s*[\d.-]+\s*[\d.-]+/gi);
        if (commands) {
            commands.forEach((cmd, index) => {
                const parts = cmd.trim().split(/\s+/);
                if (parts.length >= 3) {
                     points.push({ x: parseFloat(parts[1]), y: parseFloat(parts[2]), id: index, type: 'vertex' });
                }
            });
        }
    } else if (tagName === 'text') {
        points.push({ x: parseFloat(el.getAttribute('x') || '0'), y: parseFloat(el.getAttribute('y') || '0'), id: 0, type: 'center' });
    }
    return points;
  };

  const updateElementShape = (el: Element, pointIndex: number, newX: number, newY: number) => {
    const tagName = el.tagName.toLowerCase();
    didChangeRef.current = true;

    if (tagName === 'line') {
      if (pointIndex === 0) { el.setAttribute('x1', String(newX)); el.setAttribute('y1', String(newY)); }
      else { el.setAttribute('x2', String(newX)); el.setAttribute('y2', String(newY)); }
    } 
    else if (tagName === 'circle') {
      if (pointIndex === 0) { 
        el.setAttribute('cx', String(newX));
        el.setAttribute('cy', String(newY));
      } else { 
        const cx = parseFloat(el.getAttribute('cx') || '0');
        const cy = parseFloat(el.getAttribute('cy') || '0');
        const newR = Math.sqrt(Math.pow(newX - cx, 2) + Math.pow(newY - cy, 2));
        el.setAttribute('r', String(newR));
      }
    }
    else if (tagName === 'rect') {
        const x = parseFloat(el.getAttribute('x') || '0');
        const y = parseFloat(el.getAttribute('y') || '0');
        const w = parseFloat(el.getAttribute('width') || '0');
        const h = parseFloat(el.getAttribute('height') || '0');
        
        if (pointIndex === 0) { 
            const newW = (x + w) - newX;
            const newH = (y + h) - newY;
            if (newW > 0 && newH > 0) {
                el.setAttribute('x', String(newX));
                el.setAttribute('y', String(newY));
                el.setAttribute('width', String(newW));
                el.setAttribute('height', String(newH));
            }
        } else {
            const newW = newX - x;
            const newH = newY - y;
            if (newW > 0 && newH > 0) {
                 el.setAttribute('width', String(newW));
                 el.setAttribute('height', String(newH));
            }
        }
    }
    else if (tagName === 'polygon' || tagName === 'polyline') {
        const currentPoints = parseControlPoints(el);
        if (currentPoints[pointIndex]) {
            currentPoints[pointIndex].x = newX;
            currentPoints[pointIndex].y = newY;
            const newPointsStr = currentPoints.map(p => `${p.x},${p.y}`).join(' ');
            el.setAttribute('points', newPointsStr);
        }
    }
    else if (tagName === 'path') {
        const d = el.getAttribute('d') || '';
        const commands = d.match(/[ML]\s*[\d.-]+\s*[\d.-]+/gi);
        if (commands && commands[pointIndex]) {
            const currentPoints = parseControlPoints(el);
            currentPoints[pointIndex].x = newX;
            currentPoints[pointIndex].y = newY;
            
            let newD = "";
            currentPoints.forEach((p, idx) => {
                 newD += `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y} `;
            });
            if (d.toLowerCase().includes('z')) newD += 'Z';
            
            el.setAttribute('d', newD);
        }
    }
    else if (tagName === 'text') {
        el.setAttribute('x', String(newX));
        el.setAttribute('y', String(newY));
    }
  };

  // --- Event Handlers ---

  // Handle click on canvas background or shapes
  const handleMouseDownCanvas = useCallback((e: React.MouseEvent) => {
    // If we clicked a control point, this handler won't fire because of stopPropagation in the point's handler.
    
    const pt = getSVGPoint(e.clientX, e.clientY);
    const tool = toolRef.current;
    // We access native event target to check what was clicked in SVG
    const target = e.target as Element; 

    // 1. Tool Logic: Drawing New Shapes
    if (tool !== 'select') {
        const svg = mountRef.current?.querySelector('svg');
        if (!svg) return;

        isDrawingRef.current = true;
        didChangeRef.current = false;
        startPointRef.current = pt;
        
        // Deselect current
        setSelectedElement(null);
        setControlPoints([]);
        setSelectionBBox(null);

        const color = currentHexColorRef.current;
        const newEl = document.createElementNS("http://www.w3.org/2000/svg", 
            tool === 'rect' ? 'rect' : tool === 'circle' ? 'circle' : tool === 'text' ? 'text' : 'line'
        );
        
        if (tool !== 'text') {
             newEl.setAttribute('stroke', color);
             newEl.setAttribute('stroke-width', '2');
             newEl.setAttribute('fill', 'none');
        } else {
             newEl.setAttribute('fill', color);
        }
        
        if (tool === 'line') {
            newEl.setAttribute('x1', String(pt.x));
            newEl.setAttribute('y1', String(pt.y));
            newEl.setAttribute('x2', String(pt.x));
            newEl.setAttribute('y2', String(pt.y));
        } else if (tool === 'rect') {
            newEl.setAttribute('x', String(pt.x));
            newEl.setAttribute('y', String(pt.y));
            newEl.setAttribute('width', '0');
            newEl.setAttribute('height', '0');
        } else if (tool === 'circle') {
            newEl.setAttribute('cx', String(pt.x));
            newEl.setAttribute('cy', String(pt.y));
            newEl.setAttribute('r', '0');
        } else if (tool === 'text') {
             const text = prompt("Nhập văn bản:", "A");
             if (text) {
                 newEl.textContent = text;
                 newEl.setAttribute('x', String(pt.x));
                 newEl.setAttribute('y', String(pt.y));
                 newEl.setAttribute('font-size', '16');
                 newEl.setAttribute('font-family', 'sans-serif');
                 newEl.setAttribute('text-anchor', 'middle');
                 newEl.setAttribute('dominant-baseline', 'middle');
                 
                 svg.appendChild(newEl);
                 addToHistory();
                 
                 setSelectedElement(newEl);
                 setControlPoints(parseControlPoints(newEl));
                 updateSelectionBBox(newEl);
                 isDrawingRef.current = false;
                 setTool('select');
                 return;
             } else {
                 isDrawingRef.current = false;
                 return; 
             }
        }

        svg.appendChild(newEl);
        currentDrawElementRef.current = newEl;
        return;
    }

    // 2. Select Logic
    if (tool === 'select') {
        startPointRef.current = pt;
        didChangeRef.current = false;
        
        // --- KEY FIX: INDIVIDUAL ELEMENT SELECTION ---
        // Instead of using closest('svg > *') which grabs groups, we identify if the clicked target
        // is a valid shape (leaf node) we want to select.
        const validShapeTags = ['line', 'rect', 'circle', 'path', 'polygon', 'polyline', 'text', 'ellipse'];
        const tagName = target.tagName.toLowerCase();
        
        const svg = mountRef.current?.querySelector('svg');
        
        if (svg && svg.contains(target) && validShapeTags.includes(tagName)) {
            // Select the specific element clicked
            setSelectedElement(target);
            setControlPoints(parseControlPoints(target));
            updateSelectionBBox(target);
            
            // Set Move Mode
            dragModeRef.current = 'move';
            startTransformRef.current = getElementTransform(target);
        } else {
            // Clicked empty space or non-shape
            setSelectedElement(null);
            setControlPoints([]);
            setSelectionBBox(null);
            dragModeRef.current = 'none';
        }
    }
  }, [addToHistory, updateSelectionBBox]);

  // Global Mouse Move
  const handleMouseMove = useCallback((e: MouseEvent) => {
      // General SVG Point
      const pt = getSVGPoint(e.clientX, e.clientY);

      // Mode: Vertex Edit
      if (dragModeRef.current === 'vertex' && isDraggingPointRef.current !== null && selectedElementRef.current) {
          // Use getLocalPoint to handle element transforms (move/rotate)
          // This maps the mouse cursor back to the element's original coordinate space
          const localPt = getLocalPoint(e.clientX, e.clientY, selectedElementRef.current as SVGGraphicsElement);
          updateElementShape(selectedElementRef.current, isDraggingPointRef.current, localPt.x, localPt.y);
          setControlPoints(parseControlPoints(selectedElementRef.current));
          updateSelectionBBox(selectedElementRef.current);
          return;
      }

      // Mode: Move (Translate)
      if (dragModeRef.current === 'move' && selectedElementRef.current && startPointRef.current) {
          didChangeRef.current = true;
          const dx = pt.x - startPointRef.current.x;
          const dy = pt.y - startPointRef.current.y;
          
          const startTx = startTransformRef.current;
          const newTx = startTx.tx + dx;
          const newTy = startTx.ty + dy;

          setElementTransform(selectedElementRef.current, {
              ...startTx,
              tx: newTx,
              ty: newTy
          });
      }

      // Mode: Rotate
      if (dragModeRef.current === 'rotate' && selectedElementRef.current && startPointRef.current && selectionBBox) {
           didChangeRef.current = true;
           const cx = selectionBBox.cx;
           const cy = selectionBBox.cy;
           
           // Calculate Center in SVG Space using CTM
           const el = selectedElementRef.current as SVGGraphicsElement;
           const ctm = el.getCTM();
           if (ctm) {
               const centerInSVG = DOMPoint.fromPoint({x: cx, y: cy}).matrixTransform(ctm);
               
               const angleNow = Math.atan2(pt.y - centerInSVG.y, pt.x - centerInSVG.x);
               // We approximate start angle based on drag start to prevent jumping
               // Ideally we should track the 'angleOffset' on MouseDown, but this is simpler
               
               // Alternative: Simple delta from previous MouseMove? No, react state.
               
               // Let's use the startPointRef to get initial angle relative to center
               const angleStart = Math.atan2(startPointRef.current.y - centerInSVG.y, startPointRef.current.x - centerInSVG.x);
               const angleDelta = (angleNow - angleStart) * (180 / Math.PI);
               
               setElementTransform(selectedElementRef.current, {
                   ...startTransformRef.current,
                   rotation: startTransformRef.current.rotation + angleDelta,
                   cx: cx,
                   cy: cy
               });
           }
      }

      // Mode: Drawing
      if (isDrawingRef.current && currentDrawElementRef.current && startPointRef.current) {
          const el = currentDrawElementRef.current;
          const start = startPointRef.current;
          const tool = toolRef.current;
          didChangeRef.current = true;
          
          if (tool === 'line') {
              el.setAttribute('x2', String(pt.x));
              el.setAttribute('y2', String(pt.y));
          } else if (tool === 'rect') {
              const width = pt.x - start.x;
              const height = pt.y - start.y;
              el.setAttribute('x', String(width < 0 ? pt.x : start.x));
              el.setAttribute('y', String(height < 0 ? pt.y : start.y));
              el.setAttribute('width', String(Math.abs(width)));
              el.setAttribute('height', String(Math.abs(height)));
          } else if (tool === 'circle') {
              const r = Math.sqrt(Math.pow(pt.x - start.x, 2) + Math.pow(pt.y - start.y, 2));
              el.setAttribute('r', String(r));
          }
      }
  }, [selectionBBox]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
      if (dragModeRef.current !== 'none') {
          dragModeRef.current = 'none';
          isDraggingPointRef.current = null;
          if (didChangeRef.current) {
              addToHistory();
              didChangeRef.current = false;
              if (selectedElementRef.current) {
                  updateSelectionBBox(selectedElementRef.current);
              }
          }
      }

      if (isDrawingRef.current) {
          isDrawingRef.current = false;
          if (currentDrawElementRef.current) {
              const el = currentDrawElementRef.current;
              // Validate size
              const isTiny = (el.tagName === 'circle' && parseFloat(el.getAttribute('r') || '0') < 1) ||
                             (el.tagName === 'rect' && parseFloat(el.getAttribute('width') || '0') < 1) ||
                             (el.tagName === 'line' && 
                                Math.abs(parseFloat(el.getAttribute('x1') || '0') - parseFloat(el.getAttribute('x2') || '0')) < 1 &&
                                Math.abs(parseFloat(el.getAttribute('y1') || '0') - parseFloat(el.getAttribute('y2') || '0')) < 1
                             );

              if (isTiny) {
                  el.parentNode?.removeChild(el);
              } else {
                  setSelectedElement(el);
                  setControlPoints(parseControlPoints(el));
                  updateSelectionBBox(el);
                  addToHistory();
                  setTool('select'); 
              }
              currentDrawElementRef.current = null;
          }
      }
  }, [addToHistory, updateSelectionBBox]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
      if (toolRef.current !== 'select') return;
      const target = e.target as Element;
      
      if (target.tagName.toLowerCase() === 'text') {
          e.stopPropagation(); // Stop propagation
          const currentText = target.textContent;
          const newText = prompt("Chỉnh sửa văn bản:", currentText || "");
          if (newText !== null && newText !== currentText) {
              target.textContent = newText;
              if (selectedElementRef.current === target) {
                  setControlPoints(parseControlPoints(target));
                  updateSelectionBBox(target);
              }
              addToHistory();
          }
      }
  }, [addToHistory, updateSelectionBBox]);

  // Bind Window listeners for move/up
  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const handleDelete = () => {
      if (selectedElement && selectedElement.parentNode) {
          selectedElement.parentNode.removeChild(selectedElement);
          setSelectedElement(null);
          setControlPoints([]);
          setSelectionBBox(null);
          addToHistory();
      }
  };

  const handleToggleDash = () => {
      if (selectedElement) {
          const svgEl = selectedElement as SVGElement;
          const attrDash = svgEl.getAttribute('stroke-dasharray');
          const styleDash = svgEl.style.strokeDasharray;

          // Detect if it is currently dashed (any value other than 'none' or empty)
          const isDashed = (attrDash && attrDash !== 'none') || (styleDash && styleDash !== 'none');

          if (isDashed) {
              // --- FORCE SOLID ---
              // IMPORTANT: Setting to 'none' explicitly overrides any inheritance from parent groups (<g>)
              svgEl.setAttribute('stroke-dasharray', 'none');
              svgEl.style.strokeDasharray = 'none';
          } else {
              // --- FORCE DASHED ---
              svgEl.setAttribute('stroke-dasharray', '4 4');
              svgEl.style.strokeDasharray = '4 4';
          }
          addToHistory();
      }
  };

  const handleChangeStrokeWidth = (width: string) => {
    if (selectedElement) {
        selectedElement.setAttribute('stroke-width', width);
        (selectedElement as SVGElement).style.strokeWidth = width + 'px';
        addToHistory();
    }
  };

  const handleDownload = () => {
    const svg = mountRef.current?.querySelector('svg');
    if (!svg) return;
    
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svg);
    if(!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)){
        source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    const blob = new Blob([source], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hinh-hoc-${Date.now()}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.2, 3));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.5));
  const handleResetZoom = () => setScale(1);

  const getSelectedElementStyle = () => {
      if (!selectedElement) return {};
      const t = getElementTransform(selectedElement);
      return {
          transform: `translate(${t.tx}px, ${t.ty}px) rotate(${t.rotation}deg)`,
          transformOrigin: `${t.cx}px ${t.cy}px`
      };
  };

  // ... (Loading, Error, Empty states remain same) ...
  if (isLoading) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 min-h-[500px] transition-colors">
        <div className="relative">
             <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600 dark:border-indigo-400 mb-4"></div>
             <div className="absolute top-0 left-0 w-full h-16 flex items-center justify-center">
                 <RefreshCw size={24} className="text-indigo-600 dark:text-indigo-400 animate-pulse opacity-50" />
             </div>
        </div>
        <p className="text-slate-600 dark:text-slate-400 font-medium animate-pulse">Đang phác thảo hình học...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-red-50 dark:bg-red-950/30 rounded-2xl border border-red-200 dark:border-red-900 min-h-[500px] p-8 text-center transition-colors">
        <div className="bg-red-100 dark:bg-red-900/50 p-4 rounded-full mb-4 text-red-600 dark:text-red-400 shadow-sm">
          <RefreshCw size={32} />
        </div>
        <h3 className="text-red-800 dark:text-red-300 font-bold text-lg mb-2">Đã xảy ra lỗi</h3>
        <p className="text-red-600 dark:text-red-400 text-sm max-w-md mx-auto">{error}</p>
      </div>
    );
  }

  if (!svgContent) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900/50 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 min-h-[500px] text-center p-8 transition-colors">
        <div className="bg-slate-100 dark:bg-slate-800 p-5 rounded-full mb-5 text-slate-400 dark:text-slate-500 shadow-inner">
          <LayoutGrid size={40} />
        </div>
        <h3 className="text-slate-700 dark:text-slate-200 font-bold text-lg mb-2">Không gian làm việc</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm">
          Sử dụng bảng điều khiển bên trái để mô tả hình học hoặc dùng công cụ vẽ thủ công.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden relative transition-colors duration-300">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between p-3 border-b border-slate-100 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm z-20">
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 border border-slate-200 dark:border-slate-700">
          <button onClick={handleZoomOut} className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-700 rounded transition-all">
            <ZoomOut size={18} />
          </button>
          <span className="text-xs font-mono w-10 text-center text-slate-500 dark:text-slate-400 font-medium">{Math.round(scale * 100)}%</span>
          <button onClick={handleZoomIn} className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-700 rounded transition-all">
            <ZoomIn size={18} />
          </button>
          <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-1"></div>
          <button onClick={handleResetZoom} className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-700 rounded transition-all">
            <Move size={18} />
          </button>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 border border-slate-200 dark:border-slate-700">
            <button onClick={handleUndo} disabled={historyIndex <= 0} className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-700 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                <Undo size={18} />
            </button>
            <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-700 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                <Redo size={18} />
            </button>
        </div>

        <div className="flex items-center gap-2">
            {selectedElement && (
                <>
                <button onClick={handleToggleDash} className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700">
                   <MoreHorizontal size={16} />
                </button>
                <div className="h-6 w-px bg-slate-300 dark:bg-slate-700 mx-1"></div>
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700">
                   {['1', '2', '4'].map(w => (
                     <button key={w} onClick={() => handleChangeStrokeWidth(w)} className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-700 rounded transition-all">
                        <Minus size={16} strokeWidth={parseInt(w)} />
                     </button>
                   ))}
                </div>
                <div className="h-6 w-px bg-slate-300 dark:bg-slate-700 mx-1"></div>
                <button onClick={handleDelete} className="flex items-center gap-1 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm font-medium rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors border border-red-100 dark:border-red-900/50">
                  <Trash2 size={16} />
                </button>
                </>
            )}
            <button onClick={handleDownload} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-md shadow-indigo-500/20 transition-all active:scale-95">
              <Download size={16} />
              <span className="hidden sm:inline">SVG</span>
            </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
          {/* Left Toolbar */}
          <div className="w-14 border-r border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur flex flex-col items-center py-4 gap-3 z-10">
             <button onClick={() => setTool('select')} className={`p-2.5 rounded-xl transition-all shadow-sm ${tool === 'select' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 ring-2 ring-indigo-500/20' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                 <MousePointer2 size={20} />
             </button>
             <div className="w-8 h-px bg-slate-200 dark:bg-slate-700 my-1"></div>
             {['line', 'rect', 'circle', 'text'].map((t) => (
               <button key={t} onClick={() => setTool(t as ToolType)} className={`p-2.5 rounded-xl transition-all shadow-sm ${tool === t ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 ring-2 ring-indigo-500/20' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                 {t === 'line' && <Minus size={20} className="-rotate-45" />}
                 {t === 'rect' && <Square size={20} />}
                 {t === 'circle' && <Circle size={20} />}
                 {t === 'text' && <Type size={20} />}
               </button>
             ))}
          </div>

          {/* Canvas Viewport */}
          <div 
            className="flex-1 overflow-auto bg-slate-100 dark:bg-[#0f172a] p-8 flex items-center justify-center relative transition-colors duration-300"
            style={{
                backgroundImage: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)',
                backgroundSize: '20px 20px',
                cursor: tool === 'select' && selectedElement ? 'move' : 'default'
            }}
            // Bind mouseDown to the CONTAINER to handle clicks on canvas/shapes
            onMouseDown={handleMouseDownCanvas}
            onDoubleClick={handleDoubleClick}
          >
            {/* The Paper */}
            <div className="relative shadow-2xl shadow-slate-400/20 dark:shadow-black/50">
                <div 
                  ref={mountRef}
                  className="bg-white transition-transform duration-200 ease-out origin-center select-none"
                  style={{ transform: `scale(${scale})`, minWidth: '500px', minHeight: '500px' }}
                />
                
                {/* Overlay for Handles - Rendered by React on top of the SVG content */}
                {tool === 'select' && selectedElement && (
                   <div 
                     className="absolute top-0 left-0 w-full h-full pointer-events-none overlay-container"
                     style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}
                   >
                       {/* Wrapper div that matches element transform to position handles correctly */}
                       <div className="absolute top-0 left-0 w-full h-full pointer-events-none overlay-ui" style={getSelectedElementStyle()}>
                           
                           {/* Bounding Box Outline */}
                           {selectionBBox && (
                               <div className="absolute border border-indigo-500 border-dashed pointer-events-none"
                                   style={{
                                       left: selectionBBox.x,
                                       top: selectionBBox.y,
                                       width: selectionBBox.width,
                                       height: selectionBBox.height,
                                   }}
                               >
                                   {/* Rotate Handle */}
                                   <div 
                                      className="rotate-handle absolute -top-8 left-1/2 -translate-x-1/2 w-6 h-6 bg-white border border-indigo-400 rounded-full flex items-center justify-center cursor-pointer hover:bg-indigo-50 pointer-events-auto shadow-sm text-indigo-600"
                                      // DIRECT EVENT BINDING: Stop propagation so canvas doesn't deselect
                                      onMouseDown={(e) => {
                                          e.stopPropagation();
                                          if (selectedElementRef.current) {
                                              dragModeRef.current = 'rotate';
                                              startTransformRef.current = getElementTransform(selectedElementRef.current);
                                              // We also need startPoint for angle calc
                                              startPointRef.current = getSVGPoint(e.clientX, e.clientY);
                                          }
                                      }}
                                   >
                                       <RotateCw size={14} className="pointer-events-none" />
                                   </div>
                                   <div className="absolute -top-8 left-1/2 -translate-x-px w-px h-8 bg-indigo-400 pointer-events-none"></div>
                               </div>
                           )}

                           {/* Vertex Control Points */}
                           {controlPoints.map((p, idx) => (
                               <div
                                 key={idx}
                                 className={`control-handle absolute w-3 h-3 bg-white border-2 border-indigo-600 rounded-full cursor-pointer hover:bg-indigo-50 hover:scale-125 hover:border-indigo-500 transition-transform z-50 pointer-events-auto shadow-sm ${p.type === 'center' ? 'bg-indigo-100' : ''}`}
                                 style={{ 
                                     left: p.x, 
                                     top: p.y, 
                                     transform: 'translate(-50%, -50%)' 
                                 }}
                                 // DIRECT EVENT BINDING: Stop propagation so canvas doesn't deselect
                                 onMouseDown={(e) => {
                                     e.stopPropagation();
                                     dragModeRef.current = 'vertex';
                                     isDraggingPointRef.current = idx;
                                 }}
                               />
                           ))}
                       </div>
                   </div>
                )}
            </div>
          </div>
      </div>
      
      <div className="bg-white dark:bg-slate-900 px-4 py-2 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 flex justify-between font-medium">
        <span>Chế độ: <span className="text-indigo-600 dark:text-indigo-400">{tool === 'select' ? (selectedElement ? 'Di chuyển & Xoay' : 'Chọn đối tượng') : 'Vẽ hình'}</span></span>
        <span>{selectedElement ? 'Kéo hình để di chuyển, nút ••• để đổi nét' : 'Click vào hình để sửa'}</span>
      </div>
    </div>
  );
};