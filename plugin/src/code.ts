import { strip, getFileKey } from './utils'
import {
  handleGetDocument, handleGetSelection, handleGetNode, handleGetStyles, handleGetMetadata, handleGetDesignContext, handleGetFrameSummary,
  handleGetScreenshot, handleGetImage, handleGetCss, handleGetSvg, handleGetExportableNodes,
  handleGetFonts, handleGetColors, handleFindTextNodes, handleGetTextContent, handleGetTextSegments, handleDetectTextOverflow, handleFindPlaceholders, handleCheckTextConsistency, handleGetTypographyTokens,
  handleGetVariables, handleGetVariableTokens, handleGetNodeVariableBindings,
  handleGetLayoutSpec, handleGetResponsiveBehavior, handleGetCornerRadii, handleGetStrokeSpec, handleGetEffectSpec,
  handleGetComponentProperties, handleGetInstanceOverrides,
  handleSetTextContent, handleSetNodeVisibility, handleSetSolidFill, handleCreateText, handleSetNodeProperties,
  handleExportJson, handleToHtml, handleToHtmlPage,
} from './handlers'

figma.showUI(__html__, { width: 320, height: 230 })

figma.on('selectionchange', () => { try { sendStatus() } catch {} })

function sendStatus() {
  try {
    figma.ui.postMessage({
      type: 'plugin-status',
      payload: strip({ fileKey: getFileKey(), fileName: figma.root.name, selectionCount: figma.currentPage.selection.length }),
    })
  } catch {}
}

async function handleRequest(requestId: string, command: string, params: Record<string, unknown>) {
  try {
    let data: unknown = null
    switch (command) {
      case 'get_document':               data = await handleGetDocument(params); break
      case 'get_selection':              data = await handleGetSelection(params); break
      case 'get_node':                   data = await handleGetNode(params); break
      case 'get_styles':                 data = await handleGetStyles(params); break
      case 'get_metadata':               data = await handleGetMetadata(params); break
      case 'get_design_context':         data = await handleGetDesignContext(params); break
      case 'get_screenshot':             data = await handleGetScreenshot(params); break
      case 'get_image':                  data = await handleGetImage(params); break
      case 'get_css':                    data = await handleGetCss(params); break
      case 'get_svg':                    data = await handleGetSvg(params); break
      case 'get_exportable_nodes':       data = await handleGetExportableNodes(params); break
      case 'get_fonts':                  data = await handleGetFonts(params); break
      case 'get_colors':                 data = await handleGetColors(params); break
      case 'find_text_nodes':            data = await handleFindTextNodes(params); break
      case 'get_text_content':           data = await handleGetTextContent(params); break
      case 'get_text_segments':          data = await handleGetTextSegments(params); break
      case 'detect_text_overflow':       data = await handleDetectTextOverflow(params); break
      case 'find_placeholders':          data = await handleFindPlaceholders(params); break
      case 'check_text_consistency':     data = await handleCheckTextConsistency(params); break
      case 'get_typography_tokens':      data = await handleGetTypographyTokens(params); break
      case 'get_variables':              data = await handleGetVariables(params); break
      case 'get_variable_tokens':        data = await handleGetVariableTokens(params); break
      case 'get_node_variable_bindings': data = await handleGetNodeVariableBindings(params); break
      case 'get_layout_spec':            data = await handleGetLayoutSpec(params); break
      case 'get_responsive_behavior':    data = await handleGetResponsiveBehavior(params); break
      case 'get_corner_radii':           data = await handleGetCornerRadii(params); break
      case 'get_stroke_spec':            data = await handleGetStrokeSpec(params); break
      case 'get_effect_spec':            data = await handleGetEffectSpec(params); break
      case 'get_component_properties':   data = await handleGetComponentProperties(params); break
      case 'get_instance_overrides':     data = await handleGetInstanceOverrides(params); break
      case 'set_text_content':           data = await handleSetTextContent(params); break
      case 'set_node_visibility':        data = await handleSetNodeVisibility(params); break
      case 'set_solid_fill':             data = await handleSetSolidFill(params); break
      case 'create_text':                data = await handleCreateText(params); break
      case 'set_node_properties':        data = await handleSetNodeProperties(params); break
      case 'export_json':                data = await handleExportJson(params); break
      case 'get_frame_summary':          data = await handleGetFrameSummary(params); break
      case 'to_html':                    data = await handleToHtml(params); break
      case 'to_html_page':               data = await handleToHtmlPage(params); break
      default: throw new Error(`Unknown command: ${command}`)
    }
    figma.ui.postMessage({ type: 'response', requestId, data: strip(data) })
  } catch (e) {
    figma.ui.postMessage({ type: 'response', requestId, error: e instanceof Error ? e.message : String(e) })
  }
}

interface PluginMessage {
  type: string
  requestId?: string
  command?: string
  params?: Record<string, unknown>
  url?: string
}

figma.ui.onmessage = (msg: PluginMessage) => {
  if (msg.type === 'ui-ready') {
    void (async () => {
      try {
        const wsUrl = (await figma.clientStorage.getAsync('wsUrl')) as string | undefined
        figma.ui.postMessage({ type: 'ws_url', url: wsUrl || 'ws://localhost:3000' })
      } catch {
        figma.ui.postMessage({ type: 'ws_url', url: 'ws://localhost:3000' })
      }
      try { sendStatus() } catch {}
    })()
  }
  if (msg.type === 'save_ws_url') {
    void figma.clientStorage.setAsync('wsUrl', msg.url).catch(() => {})
  }
  if (msg.type === 'request') {
    void handleRequest(msg.requestId ?? '', msg.command ?? '', msg.params || {})
  }
}
