export function ratio(numerator: number, denominator: number): number
{
        /**
         * Potential in future we could consider throwing a division by zero error if `denominator` is zero.
         */
        return denominator > 0 ? numerator / denominator : 0;
}
