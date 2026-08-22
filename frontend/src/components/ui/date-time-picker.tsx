import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon, Clock } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface DateTimePickerProps {
  value?: Date
  onChange?: (date: Date | undefined) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Pick a date and time",
  disabled = false,
  className
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(value)
  const [timeValue, setTimeValue] = React.useState<string>(
    value ? format(value, "HH:mm") : "09:00"
  )

  // Update local state when value prop changes
  React.useEffect(() => {
    setSelectedDate(value)
    if (value) setTimeValue(format(value, "HH:mm"))
  }, [value])

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) {
      setSelectedDate(undefined)
      onChange?.(undefined)
      return
    }

    const [hours, minutes] = timeValue.split(":").map(Number)
    const newDateTime = new Date(date)
    newDateTime.setHours(hours, minutes, 0, 0)
    
    setSelectedDate(newDateTime)
    onChange?.(newDateTime)
  }

  const handleTimeChange = (time: string) => {
    setTimeValue(time)
    if (!time) return  // partial input while typing

    // A time with no day picked yet means today
    const [hours, minutes] = time.split(":").map(Number)
    const newDateTime = new Date(selectedDate ?? new Date())
    newDateTime.setHours(hours, minutes, 0, 0)

    setSelectedDate(newDateTime)
    onChange?.(newDateTime)
  }

  const handleClear = () => {
    setSelectedDate(undefined)
    setTimeValue("09:00")
    onChange?.(undefined)
    setOpen(false)
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal",
              !selectedDate && "text-muted-foreground"
            )}
            disabled={disabled}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {selectedDate ? (
              format(selectedDate, "PPP 'at' HH:mm")
            ) : (
              <span>{placeholder}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="sm:flex">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDateSelect}
              initialFocus
              className="rounded-md border-0"
            />
            <div className="flex flex-col gap-2 px-3 py-4 border-t sm:border-t-0 sm:border-l">
              <Label htmlFor="time" className="text-sm font-medium">
                Time
              </Label>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 opacity-50" />
                <Input
                  id="time"
                  type="time"
                  value={timeValue}
                  onChange={(e) => handleTimeChange(e.target.value)}
                  className="w-[120px]"
                />
              </div>
              <div className="flex gap-2 mt-4">
                <Button
                  onClick={() => setOpen(false)}
                  className="flex-1"
                  size="sm"
                >
                  Done
                </Button>
                <Button
                  onClick={handleClear}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  Clear
                </Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
