"use client";

import { useEffect, useRef, useState } from "react";

import type { User } from "@/lib/domain/types";

type EmployeePickerProps = {
  employees: User[];
  label?: string;
  searchEndpoint: string;
  selectedEmployeeIds: string[];
  onClearSelection: () => void;
  onSelectMany: (employeeIds: string[]) => void;
  onToggleEmployee: (employeeId: string) => void;
};

type EmployeeSearchResponse = {
  employees: User[];
};

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(value: string, query: string) {
  const terms = query
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (terms.length === 0) {
    return value;
  }

  const matcher = new RegExp(`(${terms.map((term) => escapeRegExp(term)).join("|")})`, "ig");
  const parts = value.split(matcher);

  return parts.map((part, index) =>
    terms.some((term) => part.toLowerCase() === term.toLowerCase()) ? (
      <mark className="employee-picker-mark" key={`${part}-${index}`}>
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  );
}

export function EmployeePicker({
  employees,
  label = "Сотрудники",
  searchEndpoint,
  selectedEmployeeIds,
  onClearSelection,
  onSelectMany,
  onToggleEmployee,
}: EmployeePickerProps) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<User[]>(employees.slice(0, 50));
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const rowRefs = useRef<Array<HTMLLabelElement | null>>([]);

  const filteredEmployeeIds = options.map((employee) => employee.id);
  const hasFilteredResults = filteredEmployeeIds.length > 0;
  const allFilteredSelected =
    hasFilteredResults && filteredEmployeeIds.every((employeeId) => selectedEmployeeIds.includes(employeeId));

  useEffect(() => {
    const abortController = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsLoading(true);
      setSearchError("");

      try {
        const response = await fetch(
          `${searchEndpoint}?q=${encodeURIComponent(query.trim())}&limit=60`,
          { signal: abortController.signal },
        );

        if (!response.ok) {
          throw new Error("Не удалось загрузить сотрудников.");
        }

        const payload = (await response.json()) as EmployeeSearchResponse;
        setOptions(payload.employees);
        setActiveIndex(0);
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }
        setSearchError(error instanceof Error ? error.message : "Не удалось загрузить сотрудников.");
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, 180);

    return () => {
      abortController.abort();
      window.clearTimeout(timeoutId);
    };
  }, [query, searchEndpoint]);

  useEffect(() => {
    rowRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (options.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % options.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + options.length) % options.length);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const activeEmployee = options[activeIndex];
      if (activeEmployee) {
        onToggleEmployee(activeEmployee.id);
      }
    }
  }

  return (
    <div className="employee-picker">
      <label className="field">
        <span>{label}</span>
        <input
          aria-activedescendant={options[activeIndex] ? `employee-option-${options[activeIndex].id}` : undefined}
          aria-controls="employee-picker-list"
          aria-expanded="true"
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Поиск по имени, фамилии или email"
          role="combobox"
          value={query}
        />
      </label>

      <div className="employee-picker-meta">
        <span>{isLoading ? "Ищем сотрудников..." : `Найдено: ${options.length}`}</span>
        {searchError ? <span className="employee-picker-error">{searchError}</span> : null}
      </div>

      <div className="employee-picker-actions">
        <button
          className="link-button"
          disabled={!hasFilteredResults || allFilteredSelected}
          onClick={() => onSelectMany(filteredEmployeeIds)}
          type="button"
        >
          Выбрать найденных
        </button>
        <button
          className="link-button muted-link"
          disabled={selectedEmployeeIds.length === 0}
          onClick={onClearSelection}
          type="button"
        >
          Снять выбор
        </button>
      </div>

      <div className="employee-picker-list" id="employee-picker-list" role="listbox">
        {options.map((employee, index) => {
          const isSelected = selectedEmployeeIds.includes(employee.id);
          const isActive = index === activeIndex;

          return (
            <label
              aria-selected={isSelected}
              className={isActive ? "employee-picker-row active" : "employee-picker-row"}
              id={`employee-option-${employee.id}`}
              key={employee.id}
              onMouseEnter={() => setActiveIndex(index)}
              role="option"
              ref={(element) => {
                rowRefs.current[index] = element;
              }}
            >
              <input
                checked={isSelected}
                onChange={() => onToggleEmployee(employee.id)}
                type="checkbox"
              />

              <span className="employee-picker-avatar">{initials(employee.name)}</span>

              <span className="employee-picker-copy">
                <strong>{highlightText(employee.name, query)}</strong>
                <span>
                  {highlightText(`${employee.team ?? "Команда не указана"} · ${employee.email}`, query)}
                </span>
              </span>
            </label>
          );
        })}

        {!isLoading && options.length === 0 ? (
          <div className="employee-picker-empty">
            <strong>Ничего не найдено</strong>
            <span>Попробуйте изменить запрос</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
