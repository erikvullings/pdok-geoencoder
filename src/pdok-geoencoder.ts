import * as fs from 'fs';
import { resolve } from 'path';
import { ICommandOptions } from './models/command-options';
import { parse, ParseStepResult } from 'papaparse';
import { Feature, FeatureCollection, Point } from 'geojson';

const zipCodeNames = ['zip', 'pc', 'pc6', 'postal'];
const houseNumberNames = ['hn', 'huisnummer', 'house_number', 'number', 'nmbr'];
type Location = {
  lat: number;
  lon: number;
  x: number;
  y: number;
};

export interface IPdokSearchResult {
  response: {
    numFound: number;
    start: number;
    maxScore: number;
    docs: Array<{
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
    }>;
  };
}

/** Extracts two numbers from a geopoint */
const pointRegex = /POINT\(([\d.]+) ([\d.]+)\)/;

const pdokLocationSvc = async (pc: string, hn: string, toev: string = '') => {
  hn = hn.replace('_', ', ');
  const pdokUrl = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${pc.replace(/ /g, '')} ${hn} ${toev}`;
  // await sleep(10);
  console.log(`PDOK resolving ${pc}, ${hn}${toev ? `, ${toev}` : ''}`);
  const response = await fetch(pdokUrl).catch((_) => {
    console.error(`Error resolving ${pc}, ${hn}${toev ? `, ${toev}` : ''} !`);
    console.error('');
    return undefined;
  });
  if (!response.ok) {
    console.error(`Error resolving ${pc}, ${hn}${toev ? `, ${toev}` : ''}!`);
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
      console.log(best);
      const { centroide_ll, centroide_rd } = best;
      const ll = pointRegex.exec(centroide_ll);
      const rd = pointRegex.exec(centroide_rd);
      if (ll && rd) {
        console.log({
          lat: +ll[2],
          lon: +ll[1],
          x: +rd[1],
          y: +rd[2],
        });
        return {
          lat: +ll[2],
          lon: +ll[1],
          x: +rd[1],
          y: +rd[2],
        };
      }
    }
  }
  console.error(`Error resolving ${pc}, ${hn}${toev ? `, ${toev}` : ''}!`);
  return undefined;
};

const outputFactory = (options: ICommandOptions) => {
  const { latitude = 'lat', longitude = 'lon' } = options;
  const csv = [] as string[];
  const geojson = {} as FeatureCollection<Point, any>;

  if (!options.toCSV) {
    geojson.type = 'FeatureCollection';
    geojson.features = [];
  }

  return options.toCSV
    ? (row?: ParseStepResult<unknown>, location = {} as Location) => {
        if (!row) return csv.join('\n');
        if (csv.length === 0) {
          // Add header
          csv.push([...Object.keys(row.data), latitude, longitude, 'x', 'y'].join(','));
        }
        const { lat, lon, x, y } = location;
        csv.push([...Object.keys(row.data).map((key) => row.data[key]), lat, lon, x, y].join(','));
      }
    : (row?: ParseStepResult<unknown>, location?: Location) => {
        if (!row) return geojson;
        const { lat, lon, x, y } = location;
        const feature = {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lon, lat] },
          properties: row.data,
        } as Feature<Point, any>;
        feature.properties.x = x;
        feature.properties.y = y;
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

  parse(fs.createReadStream(filename), {
    header: true,
    step: async (row, parser) => {
      parser.pause();
      if (!housenumber || !zip) determineFieldNames(row);
      const hn = row.data[housenumber];
      const pc = (row.data[zip] || '').replace(/ /g, '');
      if (hn && pc) {
        const location = await pdokLocationSvc(pc, hn);
        if (location) {
          output(row, location);
        } else {
          console.warn('Cannot find location for: ', row.data);
        }
      } else {
        console.warn('Cannot find zip code or house number for: ', row.data);
      }
      parser.resume();
    },
    complete: () => {
      const result = output();
      fs.writeFileSync(outFilename, typeof result === 'string' ? result : JSON.stringify(result));
    },
  });
};

//   private logger: (message?: any, ...optionalParams: any[]) => void = console.log;
//   // Re-use the keys acrross files.
//   private keys: { [key: string]: string }; // original key to new key
//   private reversedKeys: { [key: string]: string } = {}; // new key to original key
//   private lastKey = 1;

//   constructor(options: ICommandOptions) {
//     options.src.forEach((s) => {
//       const file = path.resolve(s);
//       if (!fs.existsSync(file)) {
//         console.error(`${file} does not exist! Are you perhaps missing a "?\n`);
//         return;
//       }
//       this.loadFile(file, (geojson) => {
//         if (!geojson) throw new Error('Could not read input file! Please see the options.');
//         const ext = options.topo ? '.min.topojson' : '.min.geojson';
//         const outputFile = file.replace(/\.[^/.]+$/, ext);

//         if (options.filter) {
//           geojson = this.filter(geojson, options.filter);
//         }

//         if (options.reproject) {
//           let crsName = options.reproject.toUpperCase();
//           if (!crsName.match(/^EPSG:/)) crsName = `EPSG:${crsName}`;
//           this.logger(`REPROJECTING from ${crsName} to WGS84`);
//           this.getCoordinateReferenceSystem(crsName, (crss) => {
//             geojson = reproject.toWgs84(geojson, crss, crss);
//             this.processGeoJSON(geojson, file, outputFile, options, () => {});
//           });
//         } else {
//           this.processGeoJSON(geojson, file, outputFile, options, () => {});
//         }
//       });
//     });
//   }

//   filter(geojson: FeatureCollection<GeometryObject>, filterQuery: string) {
//     const filters = convertQueryToPropertyFilters(filterQuery);

//     geojson.features = geojson.features.filter((feature) => {
//       let pass = true;
//       filters.some((f) => {
//         if (f(feature.properties)) {
//           return false;
//         }
//         pass = false;
//         return true;
//       });
//       return pass;
//     });

//     return geojson;
//   }

//   /**
//    * Minify the input (shape or GeoJSON) file.
//    *
//    * @param {string} inputFile
//    * @param {ICommandOptions} options
//    * @param {Function} callback(GeoJSON?)
//    */
//   private loadFile(inputFile: string, cb: (geojson?: GeoJSON.FeatureCollection<GeoJSON.GeometryObject>) => void) {
//     let geojson: GeoJSON.FeatureCollection<GeoJSON.GeometryObject>;
//     const ext = path.extname(inputFile);

//     if (ext.match(/json$/i)) {
//       fs.readFile(inputFile, 'utf8', (err, data) => {
//         if (err) throw err;

//         geojson = JSON.parse(data);
//         geojson.type = 'FeatureCollection'; // this is sometimes missing
//         cb(geojson);
//       });
//     } else if (ext.match(/shp$/i)) {
//       shapefile
//         .read(inputFile)
//         .then((readGeoJSON) => cb(readGeoJSON))
//         .catch((err) => console.error(err));
//     }
//   }

//   /**
//    * Minify the GeoJSON file.
//    *
//    * @param {GeoJSON.FeatureCollection<GeoJSON.GeometryObject>} geojson
//    * @param {string} inputFile
//    * @param {string} outputFile
//    * @param {ICommandOptions} options
//    * @param {Function} done
//    */
//   private processGeoJSON(
//     geojson: GeoJSON.FeatureCollection<GeoJSON.GeometryObject>,
//     inputFile: string,
//     outputFile: string,
//     options: ICommandOptions,
//     done: Function
//   ) {
//     const minifyKeys = options.keys;
//     const minifyCoordinates = options.coordinates;
//     const whitelist: string[] = options.whitelist ? options.whitelist.split(',').map((e) => e.trim()) : undefined;
//     const blacklist: string[] = options.blacklist ? options.blacklist.split(',').map((e) => e.trim()) : undefined;

//     // Process the property keys
//     if (minifyKeys || blacklist || whitelist) {
//       this.keys = minifyKeys ? {} : undefined;
//       geojson.features.forEach((f) => {
//         if (f.properties) {
//           if (blacklist || whitelist) f.properties = this.prune(f.properties, blacklist, whitelist);
//           if (minifyKeys) {
//             f.properties = this.minifyPropertyKeys(f.properties);
//           }
//         }
//       });
//     }
//     // Preserver map
//     if (minifyKeys && options.includeKeyMap) {
//       geojson['map'] = this.reversedKeys;
//     }
//     let json = <any>geojson;
//     // Convert to topojson
//     if (options.topo) {
//       // Overwrite the current GeoJSON object with a TopoJSON representation
//       this.logger('CONVERTING to TopoJSON');
//       // let topojson: ITopoJSON = require('topojson');
//       let converted = topology({ collection: geojson });
//       // topology = topojson.prune(topology, { verbose: options.verbose });
//       converted = presimplify(converted);
//       converted = simplify(converted);
//       converted = filter(converted, filterWeight(converted));
//       json = converted;
//     }

//     let minified: string;
//     if (!options.topo && typeof minifyCoordinates === 'number' && minifyCoordinates > 0) {
//       minified = JSON.stringify(json, (key, val) => {
//         if (isNaN(+key)) return val;
//         return val.toFixed ? Number(val.toFixed(minifyCoordinates)) : val;
//       });
//     } else {
//       minified = JSON.stringify(json);
//     }
//     fs.writeFile(outputFile, minified, (err) => {
//       if (err) throw err;
//       if (options.verbose) {
//         reportLog(this.logger, inputFile, outputFile, this.keys);
//       }
//       done();
//     });
//   }

//   /**
//    * Retrieve the CRS (Coordinate Reference System) online.
//    *
//    * @param {string} crsName
//    * @param {Function} cb Callback function
//    *
//    */
//   private getCoordinateReferenceSystem(crsName: string, cb: (crss: Object) => void) {
//     const crss = require('./crs-defs');
//     for (const k in crss) {
//       crss[k] = proj4(crss[k]);
//     }

//     if (crss[crsName]) {
//       return cb(crss[crsName]);
//     }

//     const crsPath = crsName.toLowerCase().replace(':', '/');
//     const url = 'http://www.spatialreference.org/ref/' + crsPath + '/proj4/';
//     let crsDef = '';

//     http.get(url, (res) => {
//       if (res.statusCode !== 200) {
//         throw new Error(`Spatialreference.org responded with HTTP ${res.statusCode} while looking up "${crsName}".`);
//       }
//       res
//         .on('data', (chunk) => {
//           crsDef += chunk;
//         })
//         .on('end', () => {
//           crss[crsName] = proj4(crsDef);
//           cb(crss[crsName]);
//         });
//     });
//   }

//   /**
//    * Minifies the property keys.
//    *
//    * @param {{ [key: string]: any }} props
//    * @returns
//    */
//   private minifyPropertyKeys(props: { [key: string]: any }) {
//     const newProps: { [key: string]: any } = {};
//     for (const key in props) {
//       let replace: string;
//       if (this.keys.hasOwnProperty(key)) {
//         replace = this.keys[key];
//       } else {
//         replace = this.smartKey(key);
//         if (!replace) {
//           do {
//             replace = this.convertToNumberingScheme(this.lastKey++);
//           } while (this.reversedKeys.hasOwnProperty(replace));
//         }
//         this.keys[key] = replace;
//         this.reversedKeys[replace] = key;
//       }
//       newProps[replace] = props[key];
//     }
//     return newProps;
//   }

//   /**
//    * Try to find an intelligent match, i.e. id remains, otherwise, try to use the first letter of the word.
//    *
//    * @param {string} key
//    * @returns
//    */
//   private smartKey(key: string) {
//     const id = 'id';
//     key = key.toLowerCase();
//     if (key === id) {
//       // Case 1: check for an id
//       if (!this.reversedKeys.hasOwnProperty(id)) return id;
//     }
//     // Case 2: can we use the first letter (ignoring white space)
//     let replace = key.trim()[0];
//     return this.reversedKeys.hasOwnProperty(replace) ? undefined : replace;
//   }

//   /**
//    * Remove all properties that are on the blacklist and not on the whitelist.
//    *
//    * @param {{ [key: string]: any }} props
//    */
//   private prune(props: { [key: string]: any }, blacklist: string[], whitelist: string[]) {
//     if (!blacklist && !whitelist) return props;
//     let newProps: { [key: string]: any } = {};
//     for (const key in props) {
//       if (blacklist && blacklist.indexOf(key) >= 0) continue;
//       if (whitelist && whitelist.indexOf(key) < 0) continue;
//       newProps[key] = props[key];
//     }
//     return newProps;
//   }

//   private convertToNumberingScheme(counter: number) {
//     const baseChar = 'a'.charCodeAt(0);
//     let letters = '';

//     do {
//       counter -= 1;
//       letters = String.fromCharCode(baseChar + (counter % 26)) + letters;
//       counter = (counter / 26) >> 0;
//     } while (counter > 0);

//     return letters;
//   }
// }
