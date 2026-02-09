import { useState, useRef, useEffect } from "react";

interface TagMultiSelectProps {
  availableTags: string[];
  selectedTags: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  compact?: boolean;
}

export default function TagMultiSelect({
  availableTags,
  selectedTags,
  onChange,
  disabled,
  compact,
}: TagMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const toggle = (tag: string) => {
    const next = selectedTags.includes(tag)
      ? selectedTags.filter((t) => t !== tag)
      : [...selectedTags, tag];
    onChange(next);
  };

  const count = selectedTags.length;

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      {/* Trigger button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-lg border text-sm transition-colors ${
          open
            ? "border-blue-500 ring-1 ring-blue-500 bg-white"
            : "border-gray-300 bg-white hover:border-gray-400"
        } ${compact ? "px-2.5 py-1" : "px-3 py-1.5"} ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <svg className="h-3.5 w-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
        <span className={`${count > 0 ? "text-gray-800 font-medium" : "text-gray-400"} ${compact ? "text-xs" : "text-sm"}`}>
          {count > 0 ? `${count}件選択中` : "タグ選択"}
        </span>
        <svg className={`h-3 w-3 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Selected tags pills (non-compact only) */}
      {!compact && count > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {selectedTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs text-blue-700"
            >
              {tag}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggle(tag); }}
                className="text-blue-400 hover:text-blue-600"
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Dropdown panel */}
      {open && availableTags.length > 0 && (
        <div className="absolute z-50 mt-1 w-52 rounded-lg border border-gray-200 bg-white shadow-lg py-1 max-h-56 overflow-y-auto">
          {availableTags.map((tag) => {
            const checked = selectedTags.includes(tag);
            return (
              <label
                key={tag}
                className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(tag)}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className={`text-sm ${checked ? "text-gray-900 font-medium" : "text-gray-600"}`}>
                  {tag}
                </span>
              </label>
            );
          })}
          {count > 0 && (
            <div className="border-t border-gray-100 px-3 py-1.5 mt-1">
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs text-red-500 hover:text-red-700"
              >
                すべて解除
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
