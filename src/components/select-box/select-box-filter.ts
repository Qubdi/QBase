/**
 * What the list keeps for the typed text: a value or one of its keywords that
 * contains it. Plain text only: a keyword such as an enum value "a+b" or "(x"
 * is not a pattern.
 */
export const selectBoxFilter = (
    value: string,
    search: string,
    keywords?: string[]
): number => {
    const searchLower = search.toLowerCase();
    if (
        keywords?.some((keyword) => keyword.toLowerCase().includes(searchLower))
    ) {
        return 1;
    }
    return value.toLowerCase().includes(searchLower) ? 1 : 0;
};
