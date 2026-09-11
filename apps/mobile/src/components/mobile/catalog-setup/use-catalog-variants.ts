import { useModal } from "@/components/ui/modal"
import { createCatalogFixture } from "@/internal-tooling/fixture-recipes"
import { useEffect, useRef, useState } from "react"
import { Keyboard } from "react-native"
import {
  catalogVariantDraftIssue,
  cloneVariantDraft,
  type CatalogVariantDraft,
  type CatalogVariantEditor,
  type CatalogVariantManagerProps,
} from "./catalog-variant-model"

type Target = { key: string; unitId?: string }

export function useCatalogVariants(props: CatalogVariantManagerProps) {
  const latest = useRef(props)
  latest.current = props
  const actionModal = useModal()
  const [action, setAction] = useState<Target | null>(null)
  const [editor, setEditor] = useState<CatalogVariantEditor | null>(null)
  const editorRef = useRef(editor)
  editorRef.current = editor
  const [descriptionVisible, setDescriptionVisible] = useState(false)
  const [editorExpanded, setEditorExpanded] = useState(false)
  const [editorError, setEditorError] = useState<string | null>(null)
  const [canUndoEditorQuickFill, setCanUndoEditorQuickFill] = useState(false)
  const quickFillSnapshot = useRef<CatalogVariantDraft | null>(null)
  const afterActionDismissal = useRef<Target | null>(null)
  const actionOpen = useRef(false)
  const actionCommitted = useRef(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      afterActionDismissal.current = null
    }
  }, [])

  const targetAllowed = (target: Target) => {
    const current = latest.current
    return (
      alive.current &&
      !current.disabled &&
      current.combinations.some((row) => row.key === target.key) &&
      (!target.unitId ||
        current.units.some((unit) => unit.id === target.unitId))
    )
  }
  const getDraft = (key: string) =>
    latest.current.drafts[key] ?? latest.current.makeDefaultDraft()
  const closeEditor = () => {
    Keyboard.dismiss()
    editorRef.current = null
    setEditor(null)
    setEditorError(null)
    quickFillSnapshot.current = null
    setCanUndoEditorQuickFill(false)
  }
  const openEditor = (key: string, unitId?: string) => {
    if (
      !targetAllowed({ key, unitId }) ||
      editorRef.current ||
      actionOpen.current
    )
      return
    Keyboard.dismiss()
    const draft = cloneVariantDraft(getDraft(key))
    const next = { key, unitId, draft }
    editorRef.current = next
    setEditor(next)
    setDescriptionVisible(Boolean(draft.description.trim()))
    setEditorExpanded(false)
    setEditorError(null)
    quickFillSnapshot.current = null
    setCanUndoEditorQuickFill(false)
  }
  const openActions = (key: string, unitId?: string) => {
    if (
      !targetAllowed({ key, unitId }) ||
      actionOpen.current ||
      editorRef.current
    )
      return
    Keyboard.dismiss()
    actionOpen.current = true
    actionCommitted.current = false
    afterActionDismissal.current = null
    setAction({ key, unitId })
    actionModal.present()
  }
  const onActionDismiss = () => {
    const target = afterActionDismissal.current
    afterActionDismissal.current = null
    actionOpen.current = false
    actionCommitted.current = false
    setAction(null)
    if (target) openEditor(target.key, target.unitId)
  }
  const editFromActions = () => {
    if (!action || !targetAllowed(action) || actionCommitted.current) return
    actionCommitted.current = true
    afterActionDismissal.current = action
    actionModal.dismiss()
  }
  const toggleEnabledFromActions = () => {
    if (
      !action ||
      !targetAllowed(action) ||
      actionCommitted.current ||
      !actionOpen.current
    )
      return
    actionCommitted.current = true
    const draft = getDraft(action.key)
    latest.current.onChangeDraft(action.key, {
      ...cloneVariantDraft(draft),
      enabled: !draft.enabled,
    })
    actionModal.dismiss()
  }
  const updateEditor = (update: Partial<CatalogVariantDraft>) => {
    const current = editorRef.current
    if (!current || !targetAllowed(current)) return
    const next = { ...current, draft: { ...current.draft, ...update } }
    editorRef.current = next
    setEditor(next)
    setEditorError(null)
  }
  const updateEditorUnitPrice = (unitId: string, value: string) => {
    const current = editorRef.current
    if (!current || !latest.current.units.some((unit) => unit.id === unitId))
      return
    updateEditor({
      unitPrices: { ...current.draft.unitPrices, [unitId]: value },
    })
  }
  const saveEditor = () => {
    const current = editorRef.current
    if (!current || !targetAllowed(current)) return
    const issue = catalogVariantDraftIssue(current.draft, latest.current)
    if (issue) {
      setEditorError(issue)
      return
    }
    latest.current.onChangeDraft(current.key, cloneVariantDraft(current.draft))
    closeEditor()
  }
  const fillEditor = (...args: Parameters<typeof createCatalogFixture>) => {
    const current = editorRef.current
    if (!current || !targetAllowed(current)) return
    quickFillSnapshot.current = cloneVariantDraft(current.draft)
    const fixture = createCatalogFixture(...args)
    updateEditor({
      description: fixture.description,
      price: fixture.price,
      quantity: latest.current.kind === "product" ? "12" : "",
      quoteRequired: false,
      sku: latest.current.kind === "product" ? fixture.sku : "",
      storeIds: latest.current.stores.map((store) => store.id),
      unitPrices: Object.fromEntries(
        latest.current.units.map((unit) => [unit.id, fixture.price]),
      ),
    })
    setDescriptionVisible(true)
    setCanUndoEditorQuickFill(true)
  }
  const undoEditorFill = () => {
    if (!quickFillSnapshot.current) return
    updateEditor(cloneVariantDraft(quickFillSnapshot.current))
    setDescriptionVisible(Boolean(quickFillSnapshot.current.description.trim()))
    quickFillSnapshot.current = null
    setCanUndoEditorQuickFill(false)
  }
  // Close drafts whose identity disappeared; never apply an old editor to a new row.
  useEffect(() => {
    if (editor && !targetAllowed(editor)) closeEditor()
    if (action && !targetAllowed(action)) {
      afterActionDismissal.current = null
      actionModal.dismiss()
    }
  }, [props.disabled, props.combinations, props.units, action, editor])

  return {
    action,
    actionModal,
    editor,
    editorError,
    editorExpanded,
    descriptionVisible,
    canUndoEditorQuickFill,
    getDraft,
    openActions,
    openEditor,
    onActionDismiss,
    editFromActions,
    toggleEnabledFromActions,
    updateEditor,
    updateEditorUnitPrice,
    saveEditor,
    closeEditor,
    fillEditor,
    undoEditorFill,
    setDescriptionVisible,
    expandEditor: () => {
      Keyboard.dismiss()
      setEditorExpanded(true)
    },
    collapseEditor: () => {
      Keyboard.dismiss()
      setEditorExpanded(false)
    },
  }
}

export type CatalogVariantsModel = ReturnType<typeof useCatalogVariants>
