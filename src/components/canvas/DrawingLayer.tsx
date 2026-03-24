import React from 'react'
import { useAnnotationStore, type Annotation } from '@/stores/annotations'

interface LiveDrawState {
  tool: 'pen' | 'rect' | 'ellipse' | 'line' | 'text' | 'select' | null
  points?: number[]  // live pen points
  shape?: { x: number; y: number; w: number; h: number; startX: number; startY: number } | null
  color?: string
  width?: number
  fillEnabled?: boolean
  marquee?: { x: number; y: number; w: number; h: number } | null
  textDragBox?: { x: number; y: number; w: number; h: number } | null
}

interface Props {
  zoomForDash: number  // viewport.zoom — used to scale dashes/stroke inversely
  live?: LiveDrawState
  annotationIds?: string[]  // if provided, only render these (for ArtNode preview)
}

function pathD(points: number[]) {
  if (points.length < 4) return ''
  let d = `M ${points[0]} ${points[1]}`
  for (let i = 2; i < points.length - 1; i += 2) d += ` L ${points[i]} ${points[i+1]}`
  return d
}

function AnnotationShape({ a }: { a: Annotation }) {
  if (a.type === 'stroke') {
    const d = pathD(a.points)
    if (!d) return null
    return <path d={d} fill="none" stroke={a.color} strokeWidth={a.width} strokeLinecap="round" strokeLinejoin="round" opacity={a.opacity} />
  }
  if (a.type === 'shape') {
    const common = { fill: a.fill ?? 'none', stroke: a.color, strokeWidth: a.width, opacity: a.opacity }
    if (a.shapeType === 'rect') return <rect x={a.x} y={a.y} width={a.w} height={a.h} {...common} />
    if (a.shapeType === 'ellipse') return <ellipse cx={a.x + a.w/2} cy={a.y + a.h/2} rx={a.w/2} ry={a.h/2} {...common} />
    if (a.shapeType === 'line') return <line x1={a.x} y1={a.y} x2={a.x + a.w} y2={a.y + a.h} stroke={a.color} strokeWidth={a.width} opacity={a.opacity} />
  }
  if (a.type === 'text') {
    const lines = a.text.split('\n')
    const lineH = a.fontSize * 1.2
    return (
      <g opacity={a.opacity}>
        {lines.map((line, i) => (
          <text key={i} x={a.x} y={a.y + i * lineH} fill={a.color} fontSize={a.fontSize} fontFamily={a.fontFamily ?? 'sans-serif'}>{line}</text>
        ))}
      </g>
    )
  }
  return null
}

export default function DrawingLayer({ zoomForDash, live, annotationIds }: Props): React.ReactElement {
  const { annotations } = useAnnotationStore()
  const toRender = annotationIds
    ? annotations.filter(a => annotationIds.includes(a.id))
    : annotations

  const liveColor = live?.color ?? '#ff6b2b'
  const liveWidth = live?.width ?? 2
  const liveFillEnabled = live?.fillEnabled ?? false

  // The canvas container has overflow-hidden, so a 0×0 SVG's overflow gets clipped.
  // Positioning the SVG at a large negative offset with a large explicit size means its
  // screen-space extent covers the whole viewport regardless of zoom/pan.
  const HALF = 50000

  return (
    <svg
      className="absolute"
      style={{
        left: -HALF, top: -HALF,
        width: HALF * 2, height: HALF * 2,
        pointerEvents: 'none',
        zIndex: 5,
        overflow: 'visible',
      }}
    >
      <g transform={`translate(${HALF}, ${HALF})`}>
      {/* Committed annotations */}
      {toRender.map(a => <AnnotationShape key={a.id} a={a} />)}

      {/* Live pen preview */}
      {live?.tool === 'pen' && live.points && live.points.length >= 4 && (
        <path d={pathD(live.points)} fill="none" stroke={liveColor}
              strokeWidth={liveWidth} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
      )}

      {/* Live shape preview */}
      {live?.shape && live.tool === 'rect' && (
        <rect x={live.shape.x} y={live.shape.y} width={live.shape.w} height={live.shape.h}
              fill={liveFillEnabled ? liveColor + '44' : 'none'}
              stroke={liveColor} strokeWidth={liveWidth} opacity={0.85} />
      )}
      {live?.shape && live.tool === 'ellipse' && (
        <ellipse cx={live.shape.x + live.shape.w/2} cy={live.shape.y + live.shape.h/2}
                 rx={live.shape.w/2} ry={live.shape.h/2}
                 fill={liveFillEnabled ? liveColor + '44' : 'none'}
                 stroke={liveColor} strokeWidth={liveWidth} opacity={0.85} />
      )}
      {live?.shape && live.tool === 'line' && (
        <line x1={live.shape.startX} y1={live.shape.startY}
              x2={live.shape.startX + live.shape.w} y2={live.shape.startY + live.shape.h}
              stroke={liveColor} strokeWidth={liveWidth} opacity={0.85} />
      )}

      {/* Annotation marquee */}
      {live?.marquee && (
        <rect x={live.marquee.x} y={live.marquee.y}
              width={live.marquee.w} height={live.marquee.h}
              fill="rgba(108,71,255,0.06)"
              stroke="rgba(108,71,255,0.6)"
              strokeWidth={1.5 / zoomForDash}
              strokeDasharray={`${8 / zoomForDash} ${4 / zoomForDash}`} />
      )}

      {/* Text tool drag-size preview */}
      {live?.textDragBox && live.tool === 'text' && (
        <>
          <rect
            x={live.textDragBox.x} y={live.textDragBox.y}
            width={Math.max(live.textDragBox.w, 1)} height={Math.max(live.textDragBox.h, 1)}
            fill="rgba(108,71,255,0.04)"
            stroke={liveColor}
            strokeWidth={1.5 / zoomForDash}
            strokeDasharray={`${6 / zoomForDash} ${3 / zoomForDash}`}
          />
          {live.textDragBox.h > 12 / zoomForDash && (
            <text
              x={live.textDragBox.x + live.textDragBox.w / 2}
              y={live.textDragBox.y + live.textDragBox.h * 0.82}
              fill={liveColor}
              fontSize={live.textDragBox.h * 0.75}
              fontFamily="sans-serif"
              textAnchor="middle"
              opacity={0.45}
            >Aa</text>
          )}
        </>
      )}
      </g>
    </svg>
  )
}

/** Draw all annotations onto a Canvas2D context. offsetX/offsetY are world-space offsets (artBounds.x, artBounds.y). */
export function drawAnnotationsToCanvas(
  ctx: CanvasRenderingContext2D,
  annotations: Annotation[],
  offsetX: number,
  offsetY: number,
): void {
  for (const a of annotations) {
    ctx.save()
    ctx.globalAlpha = a.opacity
    if (a.type === 'stroke') {
      ctx.beginPath()
      ctx.strokeStyle = a.color
      ctx.lineWidth = a.width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      for (let i = 0; i < a.points.length - 1; i += 2) {
        const x = a.points[i] - offsetX, y = a.points[i+1] - offsetY
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.stroke()
    } else if (a.type === 'shape') {
      ctx.strokeStyle = a.color
      ctx.lineWidth = a.width
      if (a.fill) { ctx.fillStyle = a.fill; }
      const x = a.x - offsetX, y = a.y - offsetY
      if (a.shapeType === 'rect') {
        ctx.beginPath(); ctx.rect(x, y, a.w, a.h)
        if (a.fill) ctx.fill(); ctx.stroke()
      } else if (a.shapeType === 'ellipse') {
        ctx.beginPath(); ctx.ellipse(x + a.w/2, y + a.h/2, a.w/2, a.h/2, 0, 0, Math.PI * 2)
        if (a.fill) ctx.fill(); ctx.stroke()
      } else if (a.shapeType === 'line') {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + a.w, y + a.h); ctx.stroke()
      }
    } else if (a.type === 'text') {
      ctx.fillStyle = a.color
      ctx.font = `${a.fontSize}px ${a.fontFamily ?? 'sans-serif'}`
      const lines = a.text.split('\n')
      const lineH = a.fontSize * 1.2
      lines.forEach((line, i) => {
        ctx.fillText(line, a.x - offsetX, a.y - offsetY + i * lineH)
      })
    }
    ctx.restore()
  }
}
