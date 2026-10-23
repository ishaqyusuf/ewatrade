"use client"

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type {
  SectionInstance,
  TemplateManifest,
} from "@ewatrade/storefront-contracts/manifest"
import { portableTemplateName } from "@ewatrade/storefront-templates"

function SectionRow({
  section,
  label,
  selected,
  first,
  last,
  disabled,
  onSelect,
  onMove,
  onHide,
  onRemove,
}: {
  section: SectionInstance
  label: string
  selected: boolean
  first: boolean
  last: boolean
  disabled: boolean
  onSelect: () => void
  onMove: (direction: number) => void
  onHide: () => void
  onRemove: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id, disabled })
  return (
    <li
      ref={setNodeRef}
      className={`sf-outline-row${selected ? " sf-outline-selected" : ""}${isDragging ? " sf-outline-dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        type="button"
        className="sf-outline-grip"
        {...attributes}
        {...listeners}
        disabled={disabled}
        aria-label={`Reorder ${label}`}
      >
        ⠿
      </button>
      <button
        type="button"
        className="sf-outline-label"
        aria-pressed={selected}
        onClick={onSelect}
        title={label}
      >
        {label}
        {!section.visible ? <small>Hidden</small> : null}
      </button>
      <div className="sf-outline-actions">
        <button
          type="button"
          disabled={first || disabled}
          aria-label={`Move ${label} up`}
          onClick={() => onMove(-1)}
        >
          ↑
        </button>
        <button
          type="button"
          disabled={last || disabled}
          aria-label={`Move ${label} down`}
          onClick={() => onMove(1)}
        >
          ↓
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-label={`${section.visible ? "Hide" : "Show"} ${label}`}
          onClick={onHide}
        >
          {section.visible ? "◉" : "○"}
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Remove ${label}`}
          onClick={onRemove}
        >
          ×
        </button>
      </div>
    </li>
  )
}
export function StorefrontSectionOutline({
  sections,
  manifest,
  selectedId,
  disabled,
  onSelect,
  onMove,
  onReorder,
  onHide,
  onRemove,
  onAdd,
}: {
  sections: SectionInstance[]
  manifest: TemplateManifest
  selectedId: string
  disabled: boolean
  onSelect: (id: string) => void
  onMove: (id: string, direction: number) => void
  onReorder: (id: string, over: string) => void
  onHide: (id: string) => void
  onRemove: (id: string) => void
  onAdd: () => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )
  const interior = sections.filter(
    (section) => !["studio-header", "studio-footer"].includes(section.type),
  )
  const names = interior.map((section) => {
    const definition = manifest.sections.find(
      (entry) => entry.key === section.type,
    )
    const template = portableTemplateName(section.source?.templateKey)
    return `${definition?.label ?? section.type} • ${template}`
  })
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => {
        if (over && active.id !== over.id)
          onReorder(String(active.id), String(over.id))
      }}
    >
      <ol className="sf-section-outline">
        <li className="sf-outline-locked">
          <span aria-hidden="true">⌑</span> Header <small>Locked</small>
        </li>
        <SortableContext
          items={interior.map((section) => section.id)}
          strategy={verticalListSortingStrategy}
        >
          {interior.map((section, index) => (
            <SectionRow
              key={section.id}
              section={section}
              label={`${names[index]}${names.slice(0, index).includes(names[index] ?? "") ? ` ${names.slice(0, index + 1).filter((name) => name === names[index]).length}` : ""}`}
              selected={selectedId === section.id}
              first={index === 0}
              last={index === interior.length - 1}
              disabled={disabled}
              onSelect={() => onSelect(section.id)}
              onMove={(direction) => onMove(section.id, direction)}
              onHide={() => onHide(section.id)}
              onRemove={() => onRemove(section.id)}
            />
          ))}
        </SortableContext>
        <li>
          <button
            type="button"
            className="sf-outline-add"
            disabled={disabled || sections.length >= 32}
            onClick={onAdd}
          >
            ＋ Add section
          </button>
        </li>
        <li className="sf-outline-locked">
          <span aria-hidden="true">⌑</span> Footer <small>Locked</small>
        </li>
      </ol>
    </DndContext>
  )
}
