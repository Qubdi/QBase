/** Something the reader repaired or skipped. Shown to the person once. */
export interface WireWarning {
    /** where in the file, for example `tables[2].fields[0].nullable` */
    path: string;
    message: string;
}

export type Warn = (path: string, message: string) => void;
