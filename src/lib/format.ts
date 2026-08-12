// Swedish number/duration formatting for the stats page.

const oneDecimal = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 });

export function svNum(value: number, digits = 1): string {
	return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: digits }).format(value);
}

/** "36 min" below 90 minutes, "7,4 tim" above. */
export function minutesText(minutes: number): string {
	if (minutes < 90) {
		return `${Math.round(minutes)} min`;
	}
	return `${oneDecimal.format(minutes / 60)} tim`;
}

/** 0.923 → "92 %" */
export function pctText(fraction: number): string {
	return `${Math.round(fraction * 100)} %`;
}
