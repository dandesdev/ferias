import * as React from "react"
import { createRoot } from "react-dom/client"
import { ptBR } from "react-day-picker/locale"
import { ChevronDownIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

type Props = {
  value: string
  min: string
  max: string
  label: string
  onChange: (value: string) => void
}

const toDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, m - 1, d)
}
const toYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

// Date picker do shadcn no modo "date of birth": mês e ano em listas suspensas.
function DatePicker({ value, min, max, label, onChange }: Props) {
  const [open, setOpen] = React.useState(false)
  const date = toDate(value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" aria-label={label} className="dp-trigger justify-between font-normal">
          {date.toLocaleDateString("pt-BR")}
          <ChevronDownIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden p-0" align="start">
        <Calendar
          mode="single"
          locale={ptBR}
          selected={date}
          defaultMonth={date}
          captionLayout="dropdown"
          startMonth={toDate(min)}
          endMonth={toDate(max)}
          disabled={{ before: toDate(min), after: toDate(max) }}
          onSelect={(d) => {
            if (d) onChange(toYmd(d))
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

export function mountDatePicker(el: HTMLElement, props: Props) {
  const root = createRoot(el)
  const render = (p: Props) => root.render(<DatePicker {...p} />)
  render(props)
  return (next: Partial<Props>) => render((props = { ...props, ...next }))
}
