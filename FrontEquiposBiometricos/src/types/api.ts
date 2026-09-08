export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  /** Presente solo en endpoints cuyo tamaño de página lo fija el backend. */
  page_size?: number;
  results: T[];
}
