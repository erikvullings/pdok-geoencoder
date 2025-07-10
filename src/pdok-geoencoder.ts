import * as fs from 'fs';
import { resolve } from 'path';
import { ICommandOptions } from './models/command-options';
import { parse, ParseStepResult } from 'papaparse';
import { Feature, FeatureCollection, Point } from 'geojson';

const zipCodeNames = ['zip', 'pc', 'pc6', 'postal'];
const houseNumberNames = ['hn', 'huisnummer', 'house_number', 'number', 'nmbr'];

type PdokResult = {
  bron: 'BAG' | 'NWB' | string;
  woonplaatscode: string;
  type: 'adres' | 'postcode' | 'weg';
  woonplaatsnaam: string;
  wijkcode: string;
  huis_nlt: string;
  openbareruimtetype: string;
  buurtnaam: string;
  gemeentecode: string;
  rdf_seealso: string;
  weergavenaam: string;
  straatnaam_verkort: string;
  id: string;
  gekoppeld_perceel: string;
  gemeentenaam: string;
  buurtcode: string;
  wijknaam: string;
  identificatie: string;
  openbareruimte_id: string;
  waterschapsnaam: string;
  provinciecode: string;
  postcode: string;
  provincienaam: string;
  centroide_ll: string;
  nummeraanduiding_id: string;
  waterschapscode: string;
  adresseerbaarobject_id: string;
  huisnummer: string;
  provincieafkorting: string;
  centroide_rd: string;
  straatnaam: string;
  score: string;
};

export interface IPdokSearchResult {
  response: {
    numFound: number;
    start: number;
    maxScore: number;
    docs: Array<PdokResult>;
  };
}

type Location = {
  lat: number;
  lon: number;
  x: number;
  y: number;
  pdokProperties?: Omit<PdokResult, 'centroide_ll' | 'centroide_rd'>;
};

/** Extracts two numbers from a geopoint */
const pointRegex = /POINT\(([\d.]+) ([\d.]+)\)/;

const pdokLocationSvc = async (pc: string, hn: string, includePdokProperties: boolean = false, lineNumber = 0) => {
  const pdokUrl = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${pc.replace(/ /g, '')} ${hn}`;
  // await sleep(10);
  console.log(`${lineNumber}. PDOK resolving ${pc}, ${hn}`);
  const response = await fetch(pdokUrl).catch((_) => {
    console.error(`Error resolving ${pc}, ${hn} !`);
    console.error('');
    return undefined;
  });
  if (!response || !response.ok) {
    console.error(`Error resolving ${pc}, ${hn}!`);
    return undefined;
  }
  const searchResult = (await response.json()) as IPdokSearchResult;
  // console.log(searchResult)
  if (searchResult) {
    const {
      response: { docs = [] },
    } = searchResult;
    const found = docs.filter((doc) => doc.bron === 'BAG' && doc.type === 'adres');

    if (found.length > 0) {
      const best = found[0];
      // console.log(best);
      const { centroide_ll, centroide_rd } = best;
      const ll = pointRegex.exec(centroide_ll);
      const rd = pointRegex.exec(centroide_rd);
      if (ll && rd) {
        const location: Location = {
          lat: +ll[2],
          lon: +ll[1],
          x: +rd[1],
          y: +rd[2],
        };

        if (includePdokProperties) {
          // Include all PDOK properties except coordinates we already extracted
          const { centroide_ll: _, centroide_rd: __, ...pdokProps } = best;
          location.pdokProperties = pdokProps;
        }

        // console.log(location);
        return location;
      }
    }
  }
  console.error(`Error resolving ${pc}, ${hn}!`);
  return undefined;
};

const makeUniqueHeaders = (existingHeaders: string[], newHeaders: string[]): string[] => {
  const uniqueHeaders: string[] = [];
  const headerCounts: { [key: string]: number } = {};

  // Count existing headers
  existingHeaders.forEach((header) => {
    headerCounts[header] = (headerCounts[header] || 0) + 1;
  });

  // Process new headers and make them unique
  newHeaders.forEach((header) => {
    let uniqueHeader = header;
    if (headerCounts[header]) {
      let counter = 1;
      while (headerCounts[`${header}_${counter}`]) {
        counter++;
      }
      uniqueHeader = `${header}_${counter}`;
    }
    headerCounts[uniqueHeader] = 1;
    uniqueHeaders.push(uniqueHeader);
  });

  return uniqueHeaders;
};

const outputFactory = (options: ICommandOptions) => {
  const { latitude = 'lat', longitude = 'lon', merge = false } = options;
  const csv = [] as string[];
  const geojson = {} as FeatureCollection<Point, any>;
  let headersInitialized = false;

  if (!options.toCSV) {
    geojson.type = 'FeatureCollection';
    geojson.features = [];
  }

  const delimiter = options.semicolon ? ';' : ',';

  // Define all possible PDOK properties based on PdokResult type
  const allPdokProperties = [
    'bron',
    'woonplaatscode',
    'type',
    'woonplaatsnaam',
    'wijkcode',
    'huis_nlt',
    'openbareruimtetype',
    'buurtnaam',
    'gemeentecode',
    'rdf_seealso',
    'weergavenaam',
    'straatnaam_verkort',
    'id',
    'gekoppeld_perceel',
    'gemeentenaam',
    'buurtcode',
    'wijknaam',
    'identificatie',
    'openbareruimte_id',
    'waterschapsnaam',
    'provinciecode',
    'postcode',
    'provincienaam',
    'nummeraanduiding_id',
    'waterschapscode',
    'adresseerbaarobject_id',
    'huisnummer',
    'provincieafkorting',
    'straatnaam',
    'score',
  ];
  return options.toCSV
    ? (row?: ParseStepResult<unknown>, location = {} as Location) => {
        if (!row) return csv.join('\n');
        if (!headersInitialized) {
          // Add header
          const existingHeaders = Object.keys(row.data);
          const defaultHeaders = [latitude, longitude, 'x', 'y'];
          let allHeaders = [...existingHeaders, ...defaultHeaders];

          if (merge) {
            // Use all possible PDOK properties to ensure consistent headers
            const uniquePdokHeaders = makeUniqueHeaders(allHeaders, allPdokProperties);
            allHeaders = [...allHeaders, ...uniquePdokHeaders];
          }

          csv.push(allHeaders.join(delimiter));
          headersInitialized = true;
        }
        const { lat, lon, x, y, pdokProperties } = location || {};
        let values = [...Object.keys(row.data).map((key) => row.data[key]), lat, lon, x, y];

        if (merge) {
          const existingHeaders = [...Object.keys(row.data), latitude, longitude, 'x', 'y'];
          const uniquePdokHeaders = makeUniqueHeaders(existingHeaders, allPdokProperties);
          const pdokValues = uniquePdokHeaders.map((header) => {
            const originalHeader = header.replace(/_\d+$/, '');
            return pdokProperties?.[originalHeader] || '';
          });
          values = [...values, ...pdokValues];
        }

        csv.push(values.join(delimiter));
      }
    : (row?: ParseStepResult<unknown>, location?: Location) => {
        if (!row) return geojson;
        const { lat, lon, x, y, pdokProperties } = location || {};
        const feature = {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lon, lat] },
          properties: { ...((row.data as any) || {}) },
        } as Feature<Point, any>;
        feature.properties.x = x;
        feature.properties.y = y;

        if (merge) {
          const existingKeys = Object.keys(feature.properties);
          const uniquePdokKeys = makeUniqueHeaders(existingKeys, allPdokProperties);

          uniquePdokKeys.forEach((uniqueKey, index) => {
            const originalKey = allPdokProperties[index];
            feature.properties[uniqueKey] = pdokProperties?.[originalKey] || '';
          });
        }

        geojson.features.push(feature);
      };
};

export const pdokGeoencoder = (options: ICommandOptions) => {
  const { file } = options;
  let { housenumber, zip } = options;

  const determineFieldNames = (row: ParseStepResult<unknown>) => {
    if (!housenumber) {
      const found = Object.keys(row.data)
        .filter((key) => houseNumberNames.indexOf(key) >= 0)
        .shift();
      if (!found) {
        throw new Error(`Unable to determine housenumber from available fields`);
      }
      housenumber = found;
    }
    if (!zip) {
      const found = Object.keys(row.data)
        .filter((key) => zipCodeNames.indexOf(key) >= 0)
        .shift();
      if (!found) {
        throw new Error(`Unable to determine housenumber from available fields`);
      }
      zip = found;
    }
    console.log(`Using ${housenumber} for the house number and ${zip} as the zip code field.`);
  };

  const output = outputFactory(options);
  const filename = resolve(process.cwd(), file);
  const outFilename = options.toCSV ? filename.replace(/\.csv$/i, '_out.csv') : filename.replace(/\.csv$/i, '.json');

  if (!fs.existsSync(filename)) {
    throw new Error(`Filename ${filename} does not exist!`);
  }

  let lineNumber = 1;

  parse(fs.createReadStream(filename), {
    header: true,
    skipEmptyLines: true,
    step: async (row, parser) => {
      parser.pause();
      if (!housenumber || !zip) determineFieldNames(row);
      const hn = row.data[housenumber];
      const pc = (row.data[zip] || '').replace(/ /g, '');
      if (hn && pc) {
        const location = await pdokLocationSvc(pc, hn, options.merge, lineNumber++);
        if (location) {
          output(row, location);
        } else {
          console.warn(`Cannot find location at line ${lineNumber} for: `, row.data);
        }
      } else {
        console.warn('Cannot find zip code or house number for: ', row.data);
      }
      if (lineNumber % 1000 === 0) {
        const result = output();
        fs.writeFileSync(outFilename, typeof result === 'string' ? result : JSON.stringify(result));
      }
      parser.resume();
    },
    complete: () => {
      const result = output();
      fs.writeFileSync(outFilename, typeof result === 'string' ? result : JSON.stringify(result));
    },
  });
};
