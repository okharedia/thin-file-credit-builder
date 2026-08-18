export function roundTo(value: number, decimalPlaces = 2): number
{
        const factor = 10 ** decimalPlaces;

        return Math.round(value * factor) / factor;
}
