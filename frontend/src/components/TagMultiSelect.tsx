import { useState, useRef, useEffect, useMemo } from "react";

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
  const [searchText, setSearchText] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearchText("");
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      setTimeout(() => searchRef.current?.focus(), 50);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const toggle = (tag: string) => {
    const next = selectedTags.includes(tag)
      ? selectedTags.filter((t) => t !== tag)
      : [...selectedTags, tag];
    onChange(next);
  };

  const filteredTags = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return availableTags;
    return availableTags.filter((t) => t.toLowerCase().includes(q));
  }, [availableTags, searchText]);

  const count = selectedTags.length;

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      {/* Trigger button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setOpen((v) => !v); if (open) setSearchText(""); }}
        className={`inline-flex items-center gap-1.5 rounded-lg border text-sm transition-colors ${open
            ? "border-blue-500 ring-1 ring-blue-500 bg-white dark:bg-gray-800"
            : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-gray-400"
          } ${compact ? "px-2.5 py-1" : "px-3 py-1.5"} ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <svg className="h-3.5 w-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
        <span className={`${count > 0 ? "text-gray-800 dark:text-gray-200 font-medium" : "text-gray-400"} ${compact ? "text-xs" : "text-sm"}`}>
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
              className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 px-2 py-0.5 text-xs text-blue-700 dark:text-blue-300"
            >
              {tag}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggle(tag); }}
                className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-200"
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
        <div className="absolute z-50 mt-1 w-56 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg py-1 max-h-64 overflow-hidden flex flex-col">
          {/* Search input */}
          {availableTags.length > 5 && (
            <div className="px-2 py-1.5 border-b border-gray-100 dark:border-gray-700 shrink-0">
              <input
                ref={searchRef}
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="タグを検索..."
                className="w-full rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-2.5 py-1 text-xs text-gray-900 dark:text-gray-200 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
          {/* Tag list */}
          <div className="overflow-y-auto flex-1">
            {filteredTags.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-3">見つかりません</p>
            ) : (
              filteredTags.map((tag) => {
                const checked = selectedTags.includes(tag);
                return (
                  <label
                    key={tag}
                    className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(tag)}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className={`text-sm ${checked ? "text-gray-900 dark:text-white font-medium" : "text-gray-600 dark:text-gray-300"}`}>
                      {tag}
                    </span>
                  </label>
                );
              })
            )}
            {count > 0 && (
              <div className="border-t border-gray-100 dark:border-gray-700 px-3 py-1.5 mt-1">
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400"
                >
                  すべて解除
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
