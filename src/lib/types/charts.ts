/** One value inside a tooltip row. `big` renders emoji at a readable size. */
export type TooltipCell = { label?: string; value: string; color?: string; big?: boolean };

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
	tooltip: { heading: string; rows: TooltipCell[][] };
};

export type TrendPoint = { t: number; label: string; value: number };
