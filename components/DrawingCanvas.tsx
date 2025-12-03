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
  type: 'vertex' | 'center' | 'radius' | 'resize' | 'radiusX' | 'radiusY';
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
  const [selectedElements, setSelectedElements] = useState<Element[]>([]);
  const [controlPoints, setControlPoints] = useState<ControlPoint[]>([]);
  const [selectionBBox, setSelectionBBox] = useState<BoundingBox | null>(null);

  // History State
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Refs for Event Handlers
  const toolRef = useRef<ToolType>(tool);
  const selectedElementsRef = useRef<Element[]>([]);
  const dragModeRef = useRef<DragMode>('none');
  const isDraggingPointRef = useRef<number | null>(null); // Index of vertex being dragged
  const isDrawingRef = useRef(false);
  const startPointRef = useRef<{x: number, y: number} | null>(null);
  const currentDrawElementRef = useRef<Element | null>(null);
  const didChangeRef = useRef(false);
  const currentHexColorRef = useRef(currentHexColor);
  
  // Rotation Center Snapshot
  const rotationCenterRef = useRef<{x: number, y: number} | null>(null);

  // Transform Refs
  // Map to store initial transforms for multiple elements during drag
  const startTransformsMapRef = useRef<Map<Element, TransformData>>(new Map());
  
  // Sync state to refs
  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { selectedElementsRef.current = selectedElements; }, [selectedElements]);
  useEffect(() => { currentHexColorRef.current = currentHexColor; }, [currentHexColor]);

  // --- Helpers for Transforms ---
  const getElementTransform = (el: Element): TransformData => {
    const tx = parseFloat(el.getAttribute('data-tx') || '0');
    const ty = parseFloat(el.getAttribute('data-ty') || '0');
    const rotation = parseFloat(el.getAttribute('data-rotation') || '0');
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

  // Coordinate Helper needed for BBox calculation
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

  const updateSelectionBBox = useCallback((elements: Element[]) => {
    if (elements.length === 0) {
      setSelectionBBox(null);
      return;
    }

    // Force a reflow/re-calc to ensure getBoundingClientRect is up to date after transforms
    // usually handled by browser, but if we just set attribute, we might need to wait?
    // In React event loop, it should be fine.
    
    try {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      
      elements.forEach(el => {
          const rect = el.getBoundingClientRect();
          const ptTL = getSVGPoint(rect.left, rect.top);
          const ptBR = getSVGPoint(rect.right, rect.bottom);
          
          minX = Math.min(minX, ptTL.x, ptBR.x);
          maxX = Math.max(maxX, ptTL.x, ptBR.x);
          minY = Math.min(minY, ptTL.y, ptBR.y);
          maxY = Math.max(maxY, ptTL.y, ptBR.y);
      });

      if (minX === Infinity || Math.abs(minX) > 10000) { // Sanity check
          setSelectionBBox(null);
          return;
      }

      setSelectionBBox({
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
        cx: (minX + maxX) / 2,
        cy: (minY + maxY) / 2
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
          
          setSelectedElements([]);
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

    setSelectedElements([]);
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
  const getLocalPoint = (clientX: number, clientY: number, el: SVGGraphicsElement) => {
    const svg = mountRef.current?.querySelector('svg') as SVGSVGElement;
    if (!svg) return { x: 0, y: 0 };

    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    
    // getScreenCTM returns the matrix that transforms local coords to screen coords.
    // We want screen -> local, so we invert it.
    const ctm = el.getScreenCTM(); 
    if (ctm) {
      return point.matrixTransform(ctm.inverse());
    }
    return getSVGPoint(clientX, clientY);
  };

  const parseControlPoints = (el: Element): ControlPoint[] => {
    const points: ControlPoint[] = [];
    const tagName = el.tagName.toLowerCase();

    // Note: These attributes are in local coordinate space (before transform)
    if (tagName === 'line') {
      points.push({ x: parseFloat(el.getAttribute('x1') || '0'), y: parseFloat(el.getAttribute('y1') || '0'), id: 0, type: 'vertex' });
      points.push({ x: parseFloat(el.getAttribute('x2') || '0'), y: parseFloat(el.getAttribute('y2') || '0'), id: 1, type: 'vertex' });
    } else if (tagName === 'circle') {
      const cx = parseFloat(el.getAttribute('cx') || '0');
      const cy = parseFloat(el.getAttribute('cy') || '0');
      const r = parseFloat(el.getAttribute('r') || '0');
      points.push({ x: cx, y: cy, id: 0, type: 'center' });
      points.push({ x: cx + r, y: cy, id: 1, type: 'radius' });
    } else if (tagName === 'ellipse') {
      const cx = parseFloat(el.getAttribute('cx') || '0');
      const cy = parseFloat(el.getAttribute('cy') || '0');
      const rx = parseFloat(el.getAttribute('rx') || '0');
      const ry = parseFloat(el.getAttribute('ry') || '0');
      points.push({ x: cx, y: cy, id: 0, type: 'center' });
      points.push({ x: cx + rx, y: cy, id: 1, type: 'radiusX' });
      points.push({ x: cx, y: cy + ry, id: 2, type: 'radiusY' });
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
    else if (tagName === 'ellipse') {
      if (pointIndex === 0) {
        el.setAttribute('cx', String(newX));
        el.setAttribute('cy', String(newY));
      } else if (pointIndex === 1) {
        const cx = parseFloat(el.getAttribute('cx') || '0');
        const newRx = Math.abs(newX - cx);
        el.setAttribute('rx', String(newRx));
      } else if (pointIndex === 2) {
        const cy = parseFloat(el.getAttribute('cy') || '0');
        const newRy = Math.abs(newY - cy);
        el.setAttribute('ry', String(newRy));
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

  const handleMouseDownCanvas = useCallback((e: React.MouseEvent) => {
    const pt = getSVGPoint(e.clientX, e.clientY);
    const tool = toolRef.current;
    const target = e.target as Element; 

    // 1. Tool Logic: Drawing New Shapes
    if (tool !== 'select') {
        const svg = mountRef.current?.querySelector('svg');
        if (!svg) return;

        isDrawingRef.current = true;
        didChangeRef.current = false;
        startPointRef.current = pt;
        
        // Deselect current
        setSelectedElements([]);
        setControlPoints([]);
        setSelectionBBox(null);

        const color = currentHexColorRef.current;
        const tagName = tool === 'rect' ? 'rect' : tool === 'circle' ? 'ellipse' : tool === 'text' ? 'text' : 'line';
        const newEl = document.createElementNS("http://www.w3.org/2000/svg", tagName);
        
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
            newEl.setAttribute('rx', '0');
            newEl.setAttribute('ry', '0');
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
                 
                 setSelectedElements([newEl]);
                 setControlPoints(parseControlPoints(newEl));
                 updateSelectionBBox([newEl]);
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
        const validShapeTags = ['line', 'rect', 'circle', 'ellipse', 'path', 'polygon', 'polyline', 'text'];
        const tagName = target.tagName.toLowerCase();
        const svg = mountRef.current?.querySelector('svg');
        
        if (svg && svg.contains(target) && validShapeTags.includes(tagName)) {
            // MULTI-SELECTION LOGIC
            const isCtrl = e.ctrlKey || e.metaKey;
            let newSelection = [...selectedElementsRef.current];

            if (isCtrl) {
                if (newSelection.includes(target)) {
                    newSelection = newSelection.filter(el => el !== target);
                } else {
                    newSelection.push(target);
                }
            } else {
                if (!newSelection.includes(target)) {
                     newSelection = [target];
                }
                // If clicking an item already in selection, keep the selection (don't reduce to 1 yet)
                // This allows starting a drag from any selected item
            }

            setSelectedElements(newSelection);
            
            if (newSelection.length === 1) {
                setControlPoints(parseControlPoints(newSelection[0]));
            } else {
                setControlPoints([]);
            }
            
            updateSelectionBBox(newSelection);
            
            // Set Move Mode immediately to allow drag
            dragModeRef.current = 'move';
            startPointRef.current = pt;
            didChangeRef.current = false;
            
            startTransformsMapRef.current.clear();
            newSelection.forEach(el => {
                startTransformsMapRef.current.set(el, getElementTransform(el));
            });

        } else {
            // Clicked empty space
            setSelectedElements([]);
            setControlPoints([]);
            setSelectionBBox(null);
            dragModeRef.current = 'none';
        }
    }
  }, [addToHistory, updateSelectionBBox]);

  const handleBBoxMouseDown = (e: React.MouseEvent) => {
      if (toolRef.current !== 'select') return;
      e.stopPropagation(); // Stop propagation to canvas
      
      dragModeRef.current = 'move';
      startPointRef.current = getSVGPoint(e.clientX, e.clientY);
      didChangeRef.current = false;

      startTransformsMapRef.current.clear();
      selectedElementsRef.current.forEach(el => {
          startTransformsMapRef.current.set(el, getElementTransform(el));
      });
  };

  const handleRotateMouseDown = (e: React.MouseEvent) => {
      if (toolRef.current !== 'select' || !selectionBBox) return;
      e.stopPropagation();
      
      dragModeRef.current = 'rotate';
      startPointRef.current = getSVGPoint(e.clientX, e.clientY);
      didChangeRef.current = false;
      
      // Snapshot rotation center (center of current BBox)
      rotationCenterRef.current = { x: selectionBBox.cx, y: selectionBBox.cy };

      startTransformsMapRef.current.clear();
      selectedElementsRef.current.forEach(el => {
          startTransformsMapRef.current.set(el, getElementTransform(el));
      });
  };

  const handleVertexMouseDown = (e: React.MouseEvent, idx: number) => {
      e.stopPropagation();
      dragModeRef.current = 'vertex';
      isDraggingPointRef.current = idx;
      didChangeRef.current = false;
  };

  // Global Mouse Move
  const handleMouseMove = useCallback((e: MouseEvent) => {
      const pt = getSVGPoint(e.clientX, e.clientY);

      if (dragModeRef.current === 'vertex' && isDraggingPointRef.current !== null && selectedElementsRef.current.length === 1) {
          const el = selectedElementsRef.current[0];
          // Local point logic handles mapping inverse CTM correctly for the vertex
          const localPt = getLocalPoint(e.clientX, e.clientY, el as SVGGraphicsElement);
          updateElementShape(el, isDraggingPointRef.current, localPt.x, localPt.y);
          setControlPoints(parseControlPoints(el));
          updateSelectionBBox([el]);
          return;
      }

      if (dragModeRef.current === 'move' && selectedElementsRef.current.length > 0 && startPointRef.current) {
          didChangeRef.current = true;
          const dx = pt.x - startPointRef.current.x;
          const dy = pt.y - startPointRef.current.y;
          
          selectedElementsRef.current.forEach(el => {
               const startTx = startTransformsMapRef.current.get(el);
               if (startTx) {
                   const newTx = startTx.tx + dx;
                   const newTy = startTx.ty + dy;

                   setElementTransform(el, {
                       ...startTx,
                       tx: newTx,
                       ty: newTy
                   });
               }
          });
          
          updateSelectionBBox(selectedElementsRef.current);
      }

      if (dragModeRef.current === 'rotate' && selectedElementsRef.current.length > 0 && startPointRef.current && rotationCenterRef.current) {
           didChangeRef.current = true;
           const cx = rotationCenterRef.current.x;
           const cy = rotationCenterRef.current.y;
           
           // Calculate angle of mouse relative to center
           const angleNow = Math.atan2(pt.y - cy, pt.x - cx);
           const angleStart = Math.atan2(startPointRef.current.y - cy, startPointRef.current.x - cx);
           const angleDelta = (angleNow - angleStart) * (180 / Math.PI);

           selectedElementsRef.current.forEach(el => {
                const startTx = startTransformsMapRef.current.get(el);
                if (startTx) {
                    setElementTransform(el, {
                        ...startTx,
                        rotation: startTx.rotation + angleDelta,
                        cx: cx, // Store center used for this rotation
                        cy: cy
                    });
                }
           });
           updateSelectionBBox(selectedElementsRef.current);
      }

      if (isDrawingRef.current && currentDrawElementRef.current && startPointRef.current) {
          const el = currentDrawElementRef.current;
          const start = startPointRef.current;
          const tool = toolRef.current;
          didChangeRef.current = true;
          
          if (tool === 'line') {
              let x2 = pt.x;
              let y2 = pt.y;

              if (e.shiftKey) {
                  const dx = pt.x - start.x;
                  const dy = pt.y - start.y;
                  const angle = Math.atan2(dy, dx);
                  const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  x2 = start.x + dist * Math.cos(snapAngle);
                  y2 = start.y + dist * Math.sin(snapAngle);
              }

              el.setAttribute('x2', String(x2));
              el.setAttribute('y2', String(y2));
          } else if (tool === 'rect') {
              let width = pt.x - start.x;
              let height = pt.y - start.y;

              if (e.shiftKey) {
                  const size = Math.max(Math.abs(width), Math.abs(height));
                  width = size * (width < 0 ? -1 : 1);
                  height = size * (height < 0 ? -1 : 1);
              }

              el.setAttribute('x', String(width < 0 ? start.x + width : start.x));
              el.setAttribute('y', String(height < 0 ? start.y + height : start.y));
              el.setAttribute('width', String(Math.abs(width)));
              el.setAttribute('height', String(Math.abs(height)));
          } else if (tool === 'circle') {
              let rx = Math.abs(pt.x - start.x);
              let ry = Math.abs(pt.y - start.y);
              
              if (e.shiftKey) {
                  const r = Math.max(rx, ry);
                  rx = r;
                  ry = r;
              }

              el.setAttribute('rx', String(rx));
              el.setAttribute('ry', String(ry));
          }
      }
  }, [selectionBBox, updateSelectionBBox]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
      if (dragModeRef.current !== 'none') {
          dragModeRef.current = 'none';
          isDraggingPointRef.current = null;
          if (didChangeRef.current) {
              addToHistory();
              didChangeRef.current = false;
              // Re-calc BBox one last time to ensure precision
              updateSelectionBBox(selectedElementsRef.current);
          }
      }

      if (isDrawingRef.current) {
          isDrawingRef.current = false;
          if (currentDrawElementRef.current) {
              const el = currentDrawElementRef.current;
              const isTiny = (el.tagName === 'circle' && parseFloat(el.getAttribute('r') || '0') < 1) ||
                             (el.tagName === 'ellipse' && (parseFloat(el.getAttribute('rx') || '0') < 1 || parseFloat(el.getAttribute('ry') || '0') < 1)) ||
                             (el.tagName === 'rect' && parseFloat(el.getAttribute('width') || '0') < 1) ||
                             (el.tagName === 'line' && 
                                Math.abs(parseFloat(el.getAttribute('x1') || '0') - parseFloat(el.getAttribute('x2') || '0')) < 1 &&
                                Math.abs(parseFloat(el.getAttribute('y1') || '0') - parseFloat(el.getAttribute('y2') || '0')) < 1
                             );

              if (isTiny) {
                  el.parentNode?.removeChild(el);
              } else {
                  setSelectedElements([el]);
                  setControlPoints(parseControlPoints(el));
                  updateSelectionBBox([el]);
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
          e.stopPropagation(); 
          const currentText = target.textContent;
          const newText = prompt("Chỉnh sửa văn bản:", currentText || "");
          if (newText !== null && newText !== currentText) {
              target.textContent = newText;
              if (selectedElementsRef.current.includes(target) && selectedElementsRef.current.length === 1) {
                  setControlPoints(parseControlPoints(target));
                  updateSelectionBBox([target]);
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
      if (selectedElements.length > 0) {
          selectedElements.forEach(el => {
              if (el.parentNode) el.parentNode.removeChild(el);
          });
          setSelectedElements([]);
          setControlPoints([]);
          setSelectionBBox(null);
          addToHistory();
      }
  };

  const handleToggleDash = () => {
      if (selectedElements.length > 0) {
          selectedElements.forEach(el => {
              const svgEl = el as SVGElement;
              const attrDash = svgEl.getAttribute('stroke-dasharray');
              const styleDash = svgEl.style.strokeDasharray;

              const isDashed = (attrDash && attrDash !== 'none') || (styleDash && styleDash !== 'none');

              if (isDashed) {
                  svgEl.setAttribute('stroke-dasharray', 'none');
                  svgEl.style.strokeDasharray = 'none';
              } else {
                  svgEl.setAttribute('stroke-dasharray', '4 4');
                  svgEl.style.strokeDasharray = '4 4';
              }
          });
          addToHistory();
      }
  };

  const handleChangeStrokeWidth = (width: string) => {
    if (selectedElements.length > 0) {
        selectedElements.forEach(el => {
            el.setAttribute('stroke-width', width);
            (el as SVGElement).style.strokeWidth = width + 'px';
        });
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

  // Helper to get CSS transform style for local control points overlay
  const getSingleElementStyle = () => {
      if (selectedElements.length === 1) {
          const t = getElementTransform(selectedElements[0]);
          return {
              transform: `translate(${t.tx}px, ${t.ty}px) rotate(${t.rotation}deg)`,
              transformOrigin: `${t.cx}px ${t.cy}px`
          };
      }
      return {};
  };

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
            {selectedElements.length > 0 && (
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

          <div 
            className="flex-1 overflow-auto bg-slate-100 dark:bg-[#0f172a] p-8 flex items-center justify-center relative transition-colors duration-300"
            style={{
                backgroundImage: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)',
                backgroundSize: '20px 20px',
                cursor: tool === 'select' && selectedElements.length > 0 ? 'move' : 'default'
            }}
            onMouseDown={handleMouseDownCanvas}
            onDoubleClick={handleDoubleClick}
          >
            <div className="relative shadow-2xl shadow-slate-400/20 dark:shadow-black/50">
                <div 
                  ref={mountRef}
                  className="bg-white transition-transform duration-200 ease-out origin-center select-none"
                  style={{ transform: `scale(${scale})`, minWidth: '500px', minHeight: '500px' }}
                />
                
                {tool === 'select' && selectedElements.length > 0 && (
                   <div 
                     className="absolute top-0 left-0 w-full h-full pointer-events-none overlay-container"
                     style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}
                   >
                       {/* 1. Global Bounding Box & Rotate Handle (AABB) */}
                       {selectionBBox && (
                           <div
                               className="absolute border border-indigo-400 border-dashed group pointer-events-auto cursor-move"
                               style={{
                                   left: selectionBBox.x,
                                   top: selectionBBox.y,
                                   width: selectionBBox.width,
                                   height: selectionBBox.height,
                               }}
                               onMouseDown={handleBBoxMouseDown}
                           >
                                {/* Transparent fill for easier grabbing */}
                                <div className="w-full h-full bg-transparent opacity-0 hover:opacity-5"></div>
                                
                                {/* Rotate Handle */}
                                <div 
                                    className="absolute left-1/2 -top-8 w-8 h-8 -ml-4 flex items-center justify-center cursor-pointer pointer-events-auto group-hover:scale-110 transition-transform"
                                    onMouseDown={handleRotateMouseDown}
                                >
                                     <div className="w-px h-4 bg-indigo-400 absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full"></div>
                                     <div className="w-6 h-6 bg-white border border-indigo-500 rounded-full flex items-center justify-center shadow-sm text-indigo-600">
                                        <RotateCw size={12} />
                                     </div>
                                </div>
                           </div>
                       )}

                       {/* 2. Local Control Points (Transformed) */}
                       {selectedElements.length === 1 && controlPoints.length > 0 && (
                           <div 
                                className="absolute top-0 left-0 w-full h-full pointer-events-none"
                                style={getSingleElementStyle()}
                           >
                               {controlPoints.map((p, idx) => (
                                   <div
                                     key={idx}
                                     className="absolute w-2.5 h-2.5 bg-white border border-indigo-600 rounded-full cursor-pointer z-50 pointer-events-auto hover:bg-indigo-600 hover:scale-125 transition-all shadow-sm"
                                     style={{
                                         left: p.x,
                                         top: p.y,
                                         transform: 'translate(-50%, -50%)'
                                     }}
                                     onMouseDown={(e) => handleVertexMouseDown(e, idx)}
                                   />
                               ))}
                           </div>
                       )}
                   </div>
                )}
            </div>
          </div>
      </div>
      
      <div className="bg-white dark:bg-slate-900 px-4 py-2 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 flex justify-between font-medium">
        <span>Chế độ: <span className="text-indigo-600 dark:text-indigo-400">{tool === 'select' ? (selectedElements.length > 0 ? (selectedElements.length > 1 ? `Đã chọn ${selectedElements.length} đối tượng` : 'Di chuyển & Xoay') : 'Chọn đối tượng (Giữ Ctrl để chọn nhiều)') : 'Vẽ hình (Giữ Shift để vẽ hình chuẩn)'}</span></span>
        <span>{selectedElements.length > 0 ? 'Kéo hình để di chuyển, nút ••• để đổi nét' : 'Click vào hình để sửa'}</span>
      </div>
    </div>
  );
};