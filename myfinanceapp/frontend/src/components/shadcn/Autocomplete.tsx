import * as React from "react"
import { cn } from "../../lib/utils"
import { Check, ChevronDown, X } from "lucide-react"

interface AutocompleteProps {
  options: string[]
  value: string
  onChange: (value: string) => void
  onInputChange?: (value: string) => void
  placeholder?: string
  className?: string
  freeSolo?: boolean
  label?: string
  helperText?: string
  disabled?: boolean
}

export default function Autocomplete({
  options,
  value,
  onChange,
  onInputChange,
  placeholder = "Select...",
  className,
  freeSolo = false,
  label,
  helperText,
  disabled = false,
}: AutocompleteProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState(value || "")
  const [highlightedIndex, setHighlightedIndex] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listRef = React.useRef<HTMLUListElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    setInputValue(value || "")
  }, [value])

  const filteredOptions = React.useMemo(() => {
    if (!inputValue.trim()) return options
    return options.filter(opt =>
      opt.toLowerCase().includes(inputValue.toLowerCase())
    )
  }, [options, inputValue])

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        if (!freeSolo) {
          const matchingOption = options.find(opt => opt.toLowerCase() === inputValue.toLowerCase())
          if (matchingOption) {
            onChange(matchingOption)
            setInputValue(matchingOption)
          } else if (value) {
            setInputValue(value)
          }
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [options, inputValue, freeSolo, onChange, value])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
    setIsOpen(true)
    setHighlightedIndex(0)
    if (onInputChange) {
      onInputChange(newValue)
    }
    if (freeSolo) {
      onChange(newValue)
    }
  }

  const handleSelectOption = (option: string) => {
    setInputValue(option)
    onChange(option)
    setIsOpen(false)
    inputRef.current?.blur()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setIsOpen(true)
        e.preventDefault()
      }
      return
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setHighlightedIndex(prev =>
          prev < filteredOptions.length - 1 ? prev + 1 : prev
        )
        break
      case "ArrowUp":
        e.preventDefault()
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0))
        break
      case "Enter":
        e.preventDefault()
        if (filteredOptions[highlightedIndex]) {
          handleSelectOption(filteredOptions[highlightedIndex])
        } else if (freeSolo && inputValue) {
          onChange(inputValue)
          setIsOpen(false)
        }
        break
      case "Escape":
        setIsOpen(false)
        break
    }
  }

  const clearValue = () => {
    setInputValue("")
    onChange("")
    inputRef.current?.focus()
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {label && (
        <label className="block text-sm font-medium text-foreground mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 pr-16 text-sm text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-2 gap-1">
          {inputValue && (
            <button
              type="button"
              onClick={clearValue}
              className="p-1 rounded hover:bg-surface-hover text-foreground-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="p-1 rounded hover:bg-surface-hover text-foreground-muted"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
          </button>
        </div>
      </div>
      {helperText && (
        <p className="mt-1.5 text-xs text-foreground-muted">{helperText}</p>
      )}

      {isOpen && filteredOptions.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-md border border-border bg-background-paper shadow-lg"
        >
          {filteredOptions.map((option, index) => (
            <li
              key={option}
              onClick={() => handleSelectOption(option)}
              className={cn(
                "flex items-center justify-between px-3 py-2 text-sm cursor-pointer",
                index === highlightedIndex && "bg-surface-hover",
                option === value && "text-primary"
              )}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              {option}
              {option === value && <Check className="h-4 w-4" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
