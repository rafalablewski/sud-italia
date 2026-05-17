"use client";

import { type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SwipeRow } from "./SwipeRow";

type Tone = "brand" | "info" | "success" | "warning" | "danger" | "neutral";

export interface MobileListItem<R> {
  /** Row data passthrough. */
  data: R;
  /** Unique React key. */
  id: string;
  /** Primary row text. */
  title: ReactNode;
  /** Sub-title (secondary line). */
  subtitle?: ReactNode;
  /** Right-aligned metric (e.g. order total). */
  trailing?: ReactNode;
  /** Right-aligned status pill. */
  status?: { label: string; tone: Tone };
  /** Leading visual — icon chip. */
  icon?: LucideIcon;
  /** Tone of the leading icon chip. */
  iconTone?: Tone;
  /** Tap handler. */
  onTap?: (row: R) => void;
  /** Swipe-left action (destructive by default). */
  leftAction?: { label: string; tone?: Tone; onCommit: (row: R) => void };
  /** Swipe-right action (primary by default). */
  rightAction?: { label: string; tone?: Tone; onCommit: (row: R) => void };
  /** Long-press handler (opens contextual menu). */
  onLongPress?: (row: R) => void;
}

interface Props<R> {
  items: MobileListItem<R>[];
  /** Renders when items is empty. */
  empty?: ReactNode;
  /** Section header above the list. */
  caption?: ReactNode;
}

/**
 * The mobile replacement for `<Table>`. Each row is two lines (title +
 * subtitle) with optional swipe actions and a trailing slot. Long-press
 * fires `onLongPress` after 500ms of hold.
 */
export function MobileList<R>({ items, empty, caption }: Props<R>) {
  return (
    <div className="v2-m-list-wrap">
      {caption && <div className="v2-m-list-caption">{caption}</div>}
      {items.length === 0 ? (
        <div className="v2-m-list-empty">{empty ?? "Nothing here yet."}</div>
      ) : (
        <ul role="list" className="v2-m-list">
          {items.map((it) => (
            <li key={it.id}>
              <SwipeRow
                leftAction={
                  it.leftAction
                    ? {
                        label: it.leftAction.label,
                        tone: it.leftAction.tone ?? "danger",
                        onCommit: () => it.leftAction!.onCommit(it.data),
                      }
                    : undefined
                }
                rightAction={
                  it.rightAction
                    ? {
                        label: it.rightAction.label,
                        tone: it.rightAction.tone ?? "primary",
                        onCommit: () => it.rightAction!.onCommit(it.data),
                      }
                    : undefined
                }
              >
                <RowInner it={it} />
              </SwipeRow>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RowInner<R>({ it }: { it: MobileListItem<R> }) {
  const Icon = it.icon;
  const tone = it.iconTone ?? "neutral";

  // Long-press detection
  const handlers: {
    onPointerDown?: (e: React.PointerEvent) => void;
    onPointerUp?: () => void;
    onPointerLeave?: () => void;
  } = {};

  if (it.onLongPress) {
    let timer: number | null = null;
    handlers.onPointerDown = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => it.onLongPress!(it.data), 500);
    };
    const clear = () => {
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
    };
    handlers.onPointerUp = clear;
    handlers.onPointerLeave = clear;
  }

  const inner = (
    <>
      {Icon && (
        <span className={`v2-m-list-icon v2-m-tone-${tone}`} aria-hidden>
          <Icon className="h-4 w-4" />
        </span>
      )}
      <span className="v2-m-list-stack">
        <span className="v2-m-list-title">{it.title}</span>
        {it.subtitle && <span className="v2-m-list-sub">{it.subtitle}</span>}
      </span>
      <span className="v2-m-list-trailing">
        {it.trailing && <span className="v2-m-list-metric tabular">{it.trailing}</span>}
        {it.status && (
          <span className={`v2-m-pill v2-m-pill-${it.status.tone}`}>
            {it.status.label}
          </span>
        )}
        {it.onTap && <ChevronRight className="v2-m-list-chev" aria-hidden />}
      </span>
    </>
  );

  if (it.onTap) {
    return (
      <button
        type="button"
        className="v2-m-list-row"
        onClick={() => it.onTap!(it.data)}
        {...handlers}
      >
        {inner}
      </button>
    );
  }
  return (
    <div className="v2-m-list-row" {...handlers}>
      {inner}
    </div>
  );
}
