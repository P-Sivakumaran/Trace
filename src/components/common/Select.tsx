import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

/**
 * Drop-in replacement for the native <select>: same <option> children and an
 * onChange that receives { target: { value } }, but the list is our own menu
 * (same look as every other TRACE menu) instead of the operating system's.
 *
 * Keyboard: Enter / Space / ↓ opens; ↑ ↓ Home End move; Enter selects;
 * Esc closes; typing jumps to a matching option.
 */

type SelectProps = {
  value: string | number | undefined;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  title?: string;
  required?: boolean;
  id?: string;
  'aria-label'?: string;
  /** Menu width: 'trigger' (default, at least 160px) or a number of px. */
  menuWidth?: 'trigger' | number;
};

interface Opt {
  value: string;
  label: string;
  disabled: boolean;
}

function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement(node)) return textOf((node.props as { children?: React.ReactNode }).children);
  return '';
}

function collectOptions(children: React.ReactNode, out: Opt[] = []): Opt[] {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const props = child.props as { value?: unknown; disabled?: boolean; children?: React.ReactNode };
    if (child.type === 'option') {
      const label = textOf(props.children).trim();
      out.push({ value: props.value === undefined ? label : String(props.value), label, disabled: !!props.disabled });
    } else if (child.type === React.Fragment || child.type === 'optgroup') {
      collectOptions(props.children, out);
    }
  });
  return out;
}

const MENU_MAX_H = 280;

export const Select: React.FC<SelectProps> = ({ value, onChange, children, className = 't-input', disabled, title, id, menuWidth = 'trigger', ...rest }) => {
  const options = useMemo(() => collectOptions(children), [children]);
  const current = value === undefined || value === null ? '' : String(value);
  const selected = options.find((o) => o.value === current);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [rect, setRect] = useState<{ left: number; top: number; width: number; above: boolean; maxH: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ text: '', timer: 0 as unknown as ReturnType<typeof setTimeout> });

  const place = useCallback(() => {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    const width = typeof menuWidth === 'number' ? menuWidth : Math.max(b.width, 160);
    const below = window.innerHeight - b.bottom - 8;
    const above = below < Math.min(MENU_MAX_H, options.length * 24 + 8) && b.top > below;
    const maxH = Math.max(120, Math.min(MENU_MAX_H, above ? b.top - 8 : below));
    const left = Math.max(8, Math.min(b.left, window.innerWidth - width - 8));
    setRect({ left, top: above ? b.top - 4 : b.bottom + 4, width, above, maxH });
  }, [menuWidth, options.length]);

  const openMenu = () => {
    if (disabled) return;
    place();
    setActive(Math.max(0, options.findIndex((o) => o.value === current)));
    setOpen(true);
  };
  const close = useCallback((refocus = false) => {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  }, []);

  const choose = (opt: Opt) => {
    if (opt.disabled) return;
    close(true);
    if (opt.value !== current) onChange?.({ target: { value: opt.value }, currentTarget: { value: opt.value } } as unknown as React.ChangeEvent<HTMLSelectElement>);
  };

  // Keep the menu glued to the trigger; close when the page scrolls elsewhere.
  useLayoutEffect(() => {
    if (!open) return;
    const onResize = () => place();
    const onScroll = (e: Event) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      close();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, place, close]);

  // Scroll the active option into view.
  useEffect(() => {
    if (!open || active < 0) return;
    menuRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, rect]);

  const move = (dir: 1 | -1, from = active) => {
    if (options.length === 0) return;
    let i = from;
    for (let n = 0; n < options.length; n++) {
      i = (i + dir + options.length) % options.length;
      if (!options[i].disabled) return setActive(i);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        close(true);
        break;
      case 'ArrowDown':
        e.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        move(-1);
        break;
      case 'Home':
        e.preventDefault();
        move(1, -1);
        break;
      case 'End':
        e.preventDefault();
        move(-1, 0);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (active >= 0) choose(options[active]);
        break;
      case 'Tab':
        close();
        break;
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
          const t = typeahead.current;
          clearTimeout(t.timer);
          t.text += e.key.toLowerCase();
          t.timer = setTimeout(() => (t.text = ''), 600);
          const i = options.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(t.text));
          if (i >= 0) setActive(i);
        }
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={rest['aria-label']}
        disabled={disabled}
        title={title}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
        className={`${className} flex items-center justify-between gap-1.5 text-left ${open ? '!border-[var(--t-accent)]' : ''}`}
      >
        <span className={`truncate ${selected && !selected.disabled ? '' : 'text-[var(--t-dim)]'}`}>{selected?.label ?? ''}</span>
        <ChevronDown className="w-3 h-3 shrink-0 opacity-60" />
      </button>
      {open && rect && (
        <>
          <div className="fixed inset-0 z-[79]" onMouseDown={() => close()} />
          <div
            ref={menuRef}
            role="listbox"
            className="t-menu fixed z-[80] overflow-y-auto"
            style={{
              left: rect.left,
              width: rect.width,
              maxHeight: rect.maxH,
              ...(rect.above ? { bottom: window.innerHeight - rect.top } : { top: rect.top }),
            }}
          >
            {options.map((o, i) => (
              <div
                key={`${o.value}-${i}`}
                data-idx={i}
                role="option"
                aria-selected={o.value === current}
                aria-disabled={o.disabled}
                onMouseEnter={() => !o.disabled && setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o)}
                className={`flex items-center gap-2 h-[24px] px-2.5 text-[12px] whitespace-nowrap ${
                  o.disabled ? 'text-zinc-600 cursor-not-allowed' : 'cursor-pointer'
                } ${i === active && !o.disabled ? 'bg-[var(--t-accent)] text-white' : 'text-[var(--t-text)]'}`}
              >
                <span className="w-3 shrink-0">{o.value === current && <Check className="w-3 h-3" />}</span>
                <span className="truncate">{o.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
};
