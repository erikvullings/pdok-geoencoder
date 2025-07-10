import * as commandLineArgs from 'command-line-args';
import { ICommandOptions } from './models/command-options';
import { pdokGeoencoder } from './pdok-geoencoder';
import { OptionDefinition } from 'command-line-args';

/**
 * Adds missing properties from typings.
 */
export interface FixedOptionDefinition extends OptionDefinition {
  description: string;
  typeLabel: string;
}

export class CommandLineInterface {
  static optionDefinitions: FixedOptionDefinition[] = [
    {
      name: 'file',
      alias: 'f',
      type: String,
      typeLabel: 'String',
      defaultOption: true,
      description: 'Filename to parse',
    },
    {
      name: 'zip',
      alias: 'z',
      type: String,
      typeLabel: 'String',
      description:
        'Name of the input column that represents the zip code. By default, tries to look for "zip", "pc", "pc6" or "postal".',
    },
    {
      name: 'housenumber',
      alias: 'n',
      type: String,
      typeLabel: 'String',
      description:
        'Name of the input column that represents the house number. By default, "number", "house_number", "huisnummer" or "hn".',
    },
    {
      name: 'latitude',
      alias: 'y',
      type: Number,
      typeLabel: 'String',
      description: 'Name of the output column for the latitude. By default, "lat".',
    },
    {
      name: 'longitude',
      alias: 'x',
      type: Number,
      typeLabel: 'String',
      description: 'Name of the output column for the longitude. By default, "lon".',
    },
    {
      name: 'toCSV',
      alias: 'c',
      type: Boolean,
      typeLabel: 'Boolean',
      description: 'Converts the input CSV to a new CSV.',
    },
    {
      name: 'semicolon',
      alias: 's',
      type: Boolean,
      typeLabel: 'Boolean',
      description: 'Uses a semi-colon as CSV delimiter instead of the default comma.',
    },
    {
      name: 'out',
      alias: 'o',
      type: String,
      typeLabel: 'String',
      description: 'Optional output filename.',
    },
  ];

  static sections = [
    {
      header: 'PDOK-GEOENCODER',
      content: `Converts a CSV to a GeoJSON (default), or creates a new CSV with additional colums for the latitude and longitude.
        As it uses the PDOK API, it will only work for The Netherlands.`,
    },
    {
      header: 'Options',
      optionList: CommandLineInterface.optionDefinitions,
    },
    {
      header: 'Examples',
      content: [
        {
          desc: '01. Convert a CSV to a GeoJSON',
          example: '$ pdok-geoencoder input.csv',
        },
        {
          desc: '01. Convert a CSV to a GeoJSON specyfing column names',
          example: '$ pdok-geoencoder -z pc -n hn input.csv',
        },
        {
          desc: '01. Convert a CSV to a new CSV specifying column names',
          example: '$ pdok-geoencoder -c -x longitude -y latitude input.csv',
        },
      ],
    },
  ];
}

const options = commandLineArgs(CommandLineInterface.optionDefinitions) as ICommandOptions;
if (!options.file) {
  console.error('Supplied options: ');
  console.error(options);
  console.error('\nNo source specified.\n');
  const getUsage = require('command-line-usage');
  const usage = getUsage(CommandLineInterface.sections);
  console.log(usage);
  process.exit(1);
}

pdokGeoencoder(options);
