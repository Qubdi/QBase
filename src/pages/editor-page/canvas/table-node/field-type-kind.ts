export type FieldTypeKind = 'text' | 'number' | 'time' | 'id' | 'bool' | 'json';

const ID = /^(uuid|guid|uniqueidentifier|objectid)$/;
const BOOL = /^(bool|boolean|bit)$/;
const TIME =
    /^(date|time|timetz|timestamp|timestamptz|datetime|datetime2|datetime64|datetimeoffset|date32|smalldatetime|interval|year)$/;
const JSON_LIKE = /^(json|jsonb|xml|xmltype|hstore)$/;
const NUMBER =
    /^(tinyint|smallint|mediumint|bigint|int\d*|uint\d+|integer|serial\d*|bigserial|smallserial|numeric|decimal|dec|float\d*|double|real|binary_double|binary_float|money|smallmoney|number)$/;

/** Groups a column type into a kind, so the table can tint its type chip. */
export const fieldTypeKind = (typeName: string): FieldTypeKind => {
    const word = typeName.toLowerCase().trim().split(/[\s(]/)[0];
    if (ID.test(word)) return 'id';
    if (BOOL.test(word)) return 'bool';
    if (TIME.test(word)) return 'time';
    if (JSON_LIKE.test(word)) return 'json';
    if (NUMBER.test(word)) return 'number';
    return 'text';
};

// full class names, so Tailwind can see them
export const FIELD_TYPE_KIND_CLASS: Record<FieldTypeKind, string> = {
    text: 'bg-teal-500/10 text-teal-700 dark:text-teal-300',
    number: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
    time: 'bg-orange-500/10 text-orange-700 dark:text-orange-300',
    id: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
    bool: 'bg-pink-500/10 text-pink-700 dark:text-pink-300',
    json: 'bg-lime-500/10 text-lime-800 dark:text-lime-300',
};
