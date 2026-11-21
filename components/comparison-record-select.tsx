"use client"

import { useId } from "react"
import { Select } from "@base-ui/react/select"
import { Check, ChevronDown } from "lucide-react"
import { useWorkspaceTheme } from "@/components/workspace-theme"

export type ComparisonChoice = {
  id: string
  title: string
  value?: string
  context?: string
  reference?: string
}

export function ComparisonRecordSelect({ slot, label, placeholder, selected, choices, onSelect }: {
  slot: "A" | "B"
  label: string
  placeholder: string
  selected: string
  choices: ComparisonChoice[]
  onSelect: (id: string) => void
}) {
  const labelId = useId()
  const { light } = useWorkspaceTheme()
  const current = choices.find((choice) => choice.id === selected)
  return <div className="ws-record-field" data-slot={slot}>
    <span className="ws-record-label" id={labelId}>{label}</span>
    <Select.Root value={selected} onValueChange={(value) => onSelect(value ?? "")} modal={false}>
      <Select.Trigger className="ws-record-trigger" aria-labelledby={labelId}>
        <Select.Value className="ws-record-trigger-value">
          {current ? <RecordSummary choice={current} /> : <span className="ws-record-placeholder">{placeholder}</span>}
        </Select.Value>
        <Select.Icon className="ws-record-chevron"><ChevronDown size={17} aria-hidden="true" /></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner className="ws-record-positioner" align="start" sideOffset={8} alignItemWithTrigger={false}>
          <Select.Popup className={`evidence-workspace ${light ? "theme-light" : "theme-dark"} ws-record-popup`} data-slot={slot}>
            <Select.List className="ws-record-list">
              <Select.Item className="ws-record-option ws-record-option-empty" value="">
                <Select.ItemText>{placeholder}</Select.ItemText>
                <Select.ItemIndicator className="ws-record-checked"><Check size={15} aria-hidden="true" /></Select.ItemIndicator>
              </Select.Item>
              {choices.map((choice) => <Select.Item value={choice.id} key={choice.id} className="ws-record-option"
                label={[choice.title, choice.value, choice.context, choice.reference].filter(Boolean).join(" · ")}>
                <RecordSummary choice={choice} />
                <Select.ItemIndicator className="ws-record-checked"><Check size={15} aria-hidden="true" /></Select.ItemIndicator>
              </Select.Item>)}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  </div>
}

function RecordSummary({ choice }: { choice: ComparisonChoice }) {
  return <span className="ws-record-summary">
    <span className="ws-record-head">
      <strong className="ws-record-metric">{choice.title}</strong>
      {choice.value && <span className="ws-record-number">{choice.value}</span>}
    </span>
    {(choice.context || choice.reference) && <span className="ws-record-meta">
      {choice.context && <span className="ws-record-context">{choice.context}</span>}
      {choice.reference && <span className="ws-record-reference">{choice.reference}</span>}
    </span>}
  </span>
}

