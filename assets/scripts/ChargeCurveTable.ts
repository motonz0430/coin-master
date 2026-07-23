export interface ChargeCurvePoint {
    seconds: number;
    impulse: number;
}

export const CHARGE_CURVE_RESOURCE_PATH = 'config/charge_curve';

const TIME_STEP_SECONDS = 0.1;
const MIN_ROW_COUNT = 2;
const MAX_ROW_COUNT = 101;
const MAX_SECONDS = 10;
const MIN_IMPULSE = 0.1;
const MAX_IMPULSE = 100;
const FLOAT_TOLERANCE = 0.000001;

export function parseChargeCurveCsv(csvText: string): ChargeCurvePoint[] {
    const rows = csvText
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .map((text, index) => ({ text: text.trim(), lineNumber: index + 1 }))
        .filter((row) => row.text.length > 0 && !row.text.startsWith('#'));

    if (rows.length < MIN_ROW_COUNT + 1) {
        throw new Error(`至少需要表头和 ${MIN_ROW_COUNT} 行数值。`);
    }

    const header = splitCsvRow(rows[0].text).map((cell) => cell.toLowerCase());
    if (header.length !== 2 || header[0] !== 'seconds' || header[1] !== 'impulse') {
        throw new Error('第一行表头必须为 seconds,impulse。');
    }

    const dataRows = rows.slice(1);
    if (dataRows.length > MAX_ROW_COUNT) {
        throw new Error(`数值行不能超过 ${MAX_ROW_COUNT} 行。`);
    }

    const points = dataRows.map((row) => {
        const cells = splitCsvRow(row.text);
        if (cells.length !== 2) {
            throw new Error(`第 ${row.lineNumber} 行必须且只能包含 seconds 和 impulse 两列。`);
        }

        const seconds = Number(cells[0]);
        const impulse = Number(cells[1]);
        if (!Number.isFinite(seconds) || !Number.isFinite(impulse)) {
            throw new Error(`第 ${row.lineNumber} 行包含非数字内容。`);
        }
        if (seconds < 0 || seconds > MAX_SECONDS) {
            throw new Error(`第 ${row.lineNumber} 行 seconds 必须在 0.0 到 ${MAX_SECONDS.toFixed(1)} 之间。`);
        }
        if (!isMultipleOfTimeStep(seconds)) {
            throw new Error(`第 ${row.lineNumber} 行 seconds 必须是 ${TIME_STEP_SECONDS.toFixed(1)} 的整数倍。`);
        }
        if (impulse < MIN_IMPULSE || impulse > MAX_IMPULSE) {
            throw new Error(`第 ${row.lineNumber} 行 impulse 必须在 ${MIN_IMPULSE} 到 ${MAX_IMPULSE} 之间。`);
        }

        return { seconds: roundTime(seconds), impulse };
    });

    if (Math.abs(points[0].seconds) > FLOAT_TOLERANCE) {
        throw new Error('第一行数值的 seconds 必须为 0.0。');
    }

    for (let index = 1; index < points.length; index++) {
        const previous = points[index - 1];
        const current = points[index];
        if (Math.abs(current.seconds - previous.seconds - TIME_STEP_SECONDS) > FLOAT_TOLERANCE) {
            throw new Error(`第 ${index + 2} 行 seconds 必须比上一行增加 ${TIME_STEP_SECONDS.toFixed(1)}。`);
        }
        if (current.impulse <= previous.impulse) {
            throw new Error(`第 ${index + 2} 行 impulse 必须大于上一行。`);
        }
    }

    return points;
}

export function sampleChargeCurve(points: ChargeCurvePoint[], chargeSeconds: number): number {
    const clampedSeconds = Math.min(
        points[points.length - 1].seconds,
        Math.max(points[0].seconds, chargeSeconds),
    );

    for (let index = 1; index < points.length; index++) {
        const upper = points[index];
        if (clampedSeconds > upper.seconds) continue;

        const lower = points[index - 1];
        const ratio = (clampedSeconds - lower.seconds) / (upper.seconds - lower.seconds);
        return lower.impulse + (upper.impulse - lower.impulse) * ratio;
    }

    return points[points.length - 1].impulse;
}

export function createDefaultChargeCurve(): ChargeCurvePoint[] {
    const maxSeconds = 2.2;
    const minImpulse = 1;
    const maxImpulse = 15;
    const pointCount = Math.round(maxSeconds / TIME_STEP_SECONDS);
    const points: ChargeCurvePoint[] = [];

    for (let index = 0; index <= pointCount; index++) {
        const seconds = roundTime(index * TIME_STEP_SECONDS);
        const ratio = seconds / maxSeconds;
        const easedRatio = ratio * ratio * (3 - 2 * ratio);
        const impulse = Number((minImpulse + (maxImpulse - minImpulse) * easedRatio).toFixed(2));
        points.push({ seconds, impulse });
    }

    return points;
}

function splitCsvRow(row: string): string[] {
    return row.split(',').map((cell) => cell.trim().replace(/^"|"$/g, ''));
}

function isMultipleOfTimeStep(seconds: number): boolean {
    return Math.abs(seconds / TIME_STEP_SECONDS - Math.round(seconds / TIME_STEP_SECONDS)) < FLOAT_TOLERANCE;
}

function roundTime(seconds: number): number {
    return Math.round(seconds * 10) / 10;
}
