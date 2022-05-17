export interface ICommandOptions {
  /** Filename to parse */
  file: string;
  /** Name of the input column that represents the zip code. By default, tries to look for "zip", "pc", "pc6" or "postal" */
  zip: string;
  /** Name of the input column that represents the house number. By default, "number", "house_number", "huisnummer" or "hn". */
  housenumber: string;
  /** Name of the output column for the latitude. By default, "lat". */
  latitude: string;
  /** Name of the output column for the longitude. By default, "lon". */
  longitude: string;
  /** Converts the input CSV to a new CSV. */
  toCSV: boolean;
  /** Output file name. */
  out: string;
}
