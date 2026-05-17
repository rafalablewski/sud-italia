"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SwipeRow } from "./SwipeRow";
import { useVirtual } from "./useVirtual";

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

import type { MultiSelectApi } from "./useMultiSelect";
import { MobileListSkeleton } from "./Skeleton";

interface Props<R> {
  items: MobileListItem<R>[];
  /** Renders when items is empty. */
  empty?: ReactNode;
  /** Section header above the list. */
  caption?: ReactNode;
  /**
   * Pass a row height (px) to enable windowing. We only mount rows the user
   * can actually see; necessary for lists ≥ ~200 rows (Customers, Audit log,
   * Stock movements). Omit for short lists.
   */
  virtualizeAt?: number;
  /** Threshold above which `virtualizeAt` kicks in. Defaults to 100. */
  virtualizeThreshold?: number;
  /**
   * Wire from `useMultiSelect()` to enable long-press multi-select.
   * When active, taps toggle selection instead of firing `onTap`.
   */
  multi?: MultiSelectApi<string>;
  /**
   * When true AND `items.length === 0`, render a pulse-skeleton list
   * instead of the empty state. Use during a first-load while the
   * fetch is in flight; refresh-while-data-present keeps showing the
   * current rows.
   */
  loading?: boolean;
  /** How many skeleton rows to render while loading. Defaults to 6. */
  skeletonRows?: number;
}

/**
 * The mobile replacement for `<Table>`. Each row is two lines (title +
 * subtitle) with optional swipe actions and a trailing slot. Long-press
 * fires `onLongPress` after 500ms of hold.
 */
export function MobileList<R>({
  items,
  empty,
  caption,
  virtualizeAt,
  virtualizeThreshold = 100,
  multi,
  loading,
  skeletonRows = 6,
}: Props<R>) {
  const shouldVirtualize =
    virtualizeAt !== undefined && items.length >= virtualizeThreshold;

  // Auto-skeleton on initial mount when no `loading` prop was passed:
  // we assume the parent will fetch and hydrate `items` shortly. We
  // show skeleton rows for up to 4 s — if data hasn't landed by then,
  // the explicit empty state takes over so the user isn't stuck.
  const [autoLoading, setAutoLoading] = useState(items.length === 0);
  const hadData = useRef(items.length > 0);
  useEffect(() => {
    if (items.length > 0) {
      hadData.current = true;
      setAutoLoading(false);
      return;
    }
    if (hadData.current) {
      // Once we've shown real data, refreshing into an empty state
      // shouldn't re-flash skeletons — that would feel like a regression.
      setAutoLoading(false);
      return;
    }
    const t = window.setTimeout(() => setAutoLoading(false), 4000);
    return () => window.clearTimeout(t);
  }, [items.length]);

  const showSkeleton =
    items.length === 0 && (loading === undefined ? autoLoading : loading);

  return (
    <div className="v2-m-list-wrap">
      {caption && <div className="v2-m-list-caption">{caption}</div>}
      {showSkeleton ? (
        <MobileListSkeleton rows={skeletonRows} />
      ) : items.length === 0 ? (
        <div className="v2-m-list-empty">{empty ?? "Nothing here yet."}</div>
      ) : shouldVirtualize ? (
        <VirtualList items={items} rowHeight={virtualizeAt!} multi={multi} />
      ) : (
        <ul role="list" className="v2-m-list">
          {items.map((it) => (
            <ListRow key={it.id} it={it} multi={multi} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ListRow<R>({
  it,
  multi,
}: {
  it: MobileListItem<R>;
  multi?: MultiSelectApi<string>;
}) {
  const selected = !!multi?.selected.has(it.id);
  const active = !!multi?.isActive;

  // When multi-select is active, swipe is disabled — taps toggle selection
  // instead. This matches iOS Mail / Photos behaviour.
  const left = active ? undefined : it.leftAction;
  const right = active ? undefined : it.rightAction;

  const rowOnTap = active
    ? () => multi!.toggle(it.id)
    : it.onTap
      ? () => it.onTap!(it.data)
      : undefined;

  const rowOnLongPress = () => {
    if (multi && !active) {
      multi.toggle(it.id);
    } else if (it.onLongPress) {
      it.onLongPress(it.data);
    }
  };

  return (
    <li>
      <SwipeRow
        leftAction={
          left
            ? {
                label: left.label,
                tone: left.tone ?? "danger",
                onCommit: () => left.onCommit(it.data),
              }
            : undefined
        }
        rightAction={
          right
            ? {
                label: right.label,
                tone: right.tone ?? "primary",
                onCommit: () => right.onCommit(it.data),
              }
            : undefined
        }
      >
        <RowInner
          it={{
            ...it,
            // Override the tap so multi-select wins when active.
            onTap: rowOnTap ? () => rowOnTap() : undefined,
            onLongPress: () => rowOnLongPress(),
          }}
          selected={selected}
          multiActive={active}
        />
      </SwipeRow>
    </li>
  );
}

function VirtualList<R>({
  items,
  rowHeight,
  multi,
}: {
  items: MobileListItem<R>[];
  rowHeight: number;
  multi?: MultiSelectApi<string>;
}) {
  const { startIndex, endIndex, paddingTop, paddingBottom, measureRef } = useVirtual({
    count: items.length,
    rowHeight,
  });
  const visible = items.slice(startIndex, endIndex);
  return (
    <ul role="list" className="v2-m-list" ref={measureRef}>
      {paddingTop > 0 && <li aria-hidden style={{ height: paddingTop }} />}
      {visible.map((it) => (
        <ListRow key={it.id} it={it} multi={multi} />
      ))}
      {paddingBottom > 0 && <li aria-hidden style={{ height: paddingBottom }} />}
    </ul>
  );
}

function RowInner<R>({
  it,
  selected = false,
  multiActive = false,
}: {
  it: MobileListItem<R>;
  selected?: boolean;
  multiActive?: boolean;
}) {
  const Icon = it.icon;
  const tone = it.iconTone ?? "neutral";

  // Long-press detection — react to a stationary press only. The
  // SwipeRow wrapper handles drag; here we time hold-in-place.
  const handlers: {
    onPointerDown?: (e: React.PointerEvent) => void;
    onPointerUp?: () => void;
    onPointerMove?: (e: React.PointerEvent) => void;
    onPointerLeave?: () => void;
    onPointerCancel?: () => void;
  } = {};

  if (it.onLongPress) {
    let timer: number | null = null;
    let startX = 0;
    let startY = 0;
    handlers.onPointerDown = (e) => {
      if (timer) window.clearTimeout(timer);
      startX = e.clientX;
      startY = e.clientY;
      timer = window.setTimeout(() => it.onLongPress!(it.data), 500);
    };
    handlers.onPointerMove = (e) => {
      // Cancel if the finger moves more than the SwipeRow threshold —
      // anything that scrolls or swipes shouldn't fire long-press.
      if (timer && (Math.abs(e.clientX - startX) > 6 || Math.abs(e.clientY - startY) > 6)) {
        window.clearTimeout(timer);
        timer = null;
      }
    };
    const clear = () => {
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
    };
    handlers.onPointerUp = clear;
    handlers.onPointerLeave = clear;
    handlers.onPointerCancel = clear;
  }

  const inner = (
    <>
      {multiActive ? (
        <span
          className={`v2-m-list-check ${selected ? "is-on" : ""}`}
          aria-hidden
        />
      ) : (
        Icon && (
          <span className={`v2-m-list-icon v2-m-tone-${tone}`} aria-hidden>
            <Icon className="h-4 w-4" />
          </span>
        )
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
        {it.onTap && !multiActive && (
          <ChevronRight className="v2-m-list-chev" aria-hidden />
        )}
      </span>
    </>
  );

  const cls = `v2-m-list-row ${selected ? "is-selected" : ""}`.trim();

  if (it.onTap) {
    return (
      <button
        type="button"
        className={cls}
        onClick={() => it.onTap!(it.data)}
        {...handlers}
      >
        {inner}
      </button>
    );
  }
  return (
    <div className={cls} {...handlers}>
      {inner}
    </div>
  );
}
