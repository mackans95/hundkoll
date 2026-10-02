/** One value inside a tooltip row. `big` renders emoji at a readable size. */
export type TooltipCell = { label?: string; value: string; color?: string; big?: boolean };

/**
 * Rows drawn as an inset box under the row before them, so what they say
 * belongs to it: Orolig's signs under Orolig, not beside it as more events.
 */
export type TooltipGroup = { nested: TooltipCell[][] };

export type TooltipRow = TooltipCell[] | TooltipGroup;

/**
 * A single column. Each tooltip row renders as its own card inside the
 * tooltip; cells in a row split its width evenly with divider lines
 * ("🚶 7 | 🟡 14 | 💩 3").
 */
export type ColumnBucket = {
	label: string;
	/** Whether this column gets an axis label — every 7th day, say. */
	tick: boolean;
	segments: number[];
	tooltip: { heading: string; rows: TooltipRow[] };
};

export type TrendPoint = { t: number; label: string; value: number };
