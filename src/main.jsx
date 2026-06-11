import { StrictMode, useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DEFAULT_EMBED_DEFINITIONS, EmbedShapeUtil, GeoShapeGeoStyle, Tldraw } from 'tldraw'
import 'tldraw/tldraw.css'
import './styles.css'

const editorOptions = { wheelBehavior: 'pan' }
const webpageEmbedDefinition = {
  type: 'webpage',
  title: 'Web page',
  hostnames: ['*'],
  width: 960,
  height: 640,
  minWidth: 320,
  minHeight: 240,
  doesResize: true,
  canEditWhileLocked: true,
  embedOnPaste: true,
  toEmbedUrl: (url) => /^https?:\/\//i.test(url) ? url : undefined,
  fromEmbedUrl: (url) => /^https?:\/\//i.test(url) ? url : undefined,
}
const shapeUtils = [
  EmbedShapeUtil.configure({
    embedDefinitions: [...DEFAULT_EMBED_DEFINITIONS, webpageEmbedDefinition],
  }),
]

const shortcutTools = new Map([
  ['v', { id: 'select' }],
  ['h', { id: 'hand' }],
  ['d', { id: 'draw' }],
  ['r', { id: 'geo', geo: 'rectangle' }],
  ['o', { id: 'geo', geo: 'ellipse' }],
  ['t', { id: 'geo', geo: 'triangle' }],
  ['l', { id: 'line' }],
  ['a', { id: 'arrow' }],
  ['x', { id: 'text' }],
])

function isTextInput(target) {
  return target instanceof HTMLElement
    && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

function LaserOverlay({ active }) {
  const canvasRef = useRef(null)
  const pointsRef = useRef([])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas.getContext('2d')
    let frame

    const resize = () => {
      const ratio = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * ratio
      canvas.height = window.innerHeight * ratio
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
    }

    const draw = () => {
      const now = performance.now()
      pointsRef.current = pointsRef.current.filter((point) => now - point.time < 420)
      context.clearRect(0, 0, window.innerWidth, window.innerHeight)

      const points = pointsRef.current
      if (points.length > 1) {
        context.lineCap = 'round'
        context.lineJoin = 'round'
        for (let index = 1; index < points.length; index += 1) {
          const point = points[index]
          const previous = points[index - 1]
          const opacity = Math.max(0, 1 - (now - point.time) / 420)
          context.beginPath()
          context.moveTo(previous.x, previous.y)
          context.lineTo(point.x, point.y)
          context.strokeStyle = `rgba(244, 72, 77, ${opacity})`
          context.lineWidth = 4
          context.stroke()
        }
      }

      frame = requestAnimationFrame(draw)
    }

    resize()
    draw()
    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
  }, [])

  useEffect(() => {
    if (!active) pointsRef.current = []
  }, [active])

  return (
    <canvas
      ref={canvasRef}
      className={`laser-overlay ${active ? 'active' : ''}`}
      onPointerMove={(event) => {
        if (!active) return
        pointsRef.current.push({ x: event.clientX, y: event.clientY, time: performance.now() })
      }}
    />
  )
}

function CanvasApp() {
  const [editor, setEditor] = useState(null)
  const [isPreview, setIsPreview] = useState(false)
  const [isPreviewPanning, setIsPreviewPanning] = useState(false)
  const [isLaserActive, setIsLaserActive] = useState(false)
  const embedLockState = useRef(new Map())

  const chooseTool = useCallback((tool) => {
    if (!editor || isPreview) return
    if (tool.geo) editor.setStyleForNextShapes(GeoShapeGeoStyle, tool.geo)
    editor.setCurrentTool(tool.id)
  }, [editor, isPreview])

  const togglePreview = useCallback(() => {
    setIsPreview((current) => !current)
  }, [])

  useEffect(() => {
    if (!editor) return
    editor.selectNone()
    if (isPreview) {
      const embeds = editor.getCurrentPageShapes().filter((shape) => shape.type === 'embed')
      embedLockState.current = new Map(embeds.map((shape) => [shape.id, shape.isLocked]))
      editor.updateShapes(embeds.map((shape) => ({ id: shape.id, type: shape.type, isLocked: true })))
      editor.updateInstanceState({ isReadonly: true })
    } else {
      editor.updateInstanceState({ isReadonly: false })
      editor.updateShapes([...embedLockState.current].map(([id, isLocked]) => ({ id, type: 'embed', isLocked })))
      embedLockState.current.clear()
    }
    editor.setCurrentTool(isPreview ? 'hand' : 'select')
  }, [editor, isPreview])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (isTextInput(event.target)) return

      if (event.key.toLowerCase() === 'p' && (event.metaKey || event.ctrlKey) && !event.altKey) {
        event.preventDefault()
        event.stopPropagation()
        togglePreview()
        return
      }

      if ((event.metaKey || event.ctrlKey) && !event.altKey) {
        if (['+', '='].includes(event.key)) {
          event.preventDefault()
          event.stopPropagation()
          editor?.zoomIn(undefined, { animation: { duration: 120 } })
          return
        }
        if (event.key === '-') {
          event.preventDefault()
          event.stopPropagation()
          editor?.zoomOut(undefined, { animation: { duration: 120 } })
          return
        }
        if (event.key === '0') {
          event.preventDefault()
          event.stopPropagation()
          editor?.resetZoom(undefined, { animation: { duration: 120 } })
          return
        }
      }

      if (isPreview) {
        if (event.key.toLowerCase() === 'l') {
          event.preventDefault()
          event.stopPropagation()
          setIsLaserActive(true)
          return
        }
        if (event.key === ' ') {
          event.preventDefault()
          setIsPreviewPanning(true)
        }
        if (event.key !== ' ' && !event.metaKey && !event.ctrlKey) {
          event.preventDefault()
        }
        event.stopPropagation()
        return
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return
      const tool = shortcutTools.get(event.key.toLowerCase())
      if (!tool) return
      event.preventDefault()
      event.stopPropagation()
      chooseTool(tool)
    }
    const onKeyUp = (event) => {
      if (event.key === ' ') setIsPreviewPanning(false)
      if (event.key.toLowerCase() === 'l') setIsLaserActive(false)
    }
    const onBlur = () => {
      setIsPreviewPanning(false)
      setIsLaserActive(false)
    }
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [chooseTool, isPreview, togglePreview])

  useEffect(() => {
    const onPaste = (event) => {
      if (!editor || isPreview || isTextInput(event.target)) return
      const url = event.clipboardData?.getData('text/plain').trim()
      if (!url || !/^https?:\/\/\S+$/i.test(url)) return
      event.preventDefault()
      event.stopPropagation()
      const bounds = editor.getViewportPageBounds()
      editor.createShape({
        type: 'embed',
        x: bounds.x + (bounds.w - webpageEmbedDefinition.width) / 2,
        y: bounds.y + (bounds.h - webpageEmbedDefinition.height) / 2,
        props: {
          url,
          w: webpageEmbedDefinition.width,
          h: webpageEmbedDefinition.height,
        },
      })
    }
    window.addEventListener('paste', onPaste, true)
    return () => window.removeEventListener('paste', onPaste, true)
  }, [editor, isPreview])

  return (
    <main className={`canvas-shell ${isPreview ? 'preview-mode' : ''} ${isPreviewPanning ? 'preview-pan-mode' : ''}`}>
      <Tldraw
        persistenceKey="canvas-studio-document"
        options={editorOptions}
        onMount={setEditor}
        shapeUtils={shapeUtils}
        colorScheme="dark"
        hideUi
      />
      <LaserOverlay active={isPreview && isLaserActive} />
    </main>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <CanvasApp />
  </StrictMode>,
)
