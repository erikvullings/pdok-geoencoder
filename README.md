# PDOK-Geo-Encoder

Resolve zip code and house number to a latitude and longitude, and add them to the data. Works only in The Netherlands.

## How to install

```bash
npm i -g pdok-geoencoder
```

## How to use

```bash
PDOK-GEOENCODER

  Converts a CSV to a GeoJSON (default), or creates a new CSV with additional
  colums for the latitude and longitude.
  As it uses the PDOK API, it will only work for The Netherlands.

Options

  -f, --file String          Filename to parse
  -z, --zip String           Name of the input column that represents the zip code. By default, tries to
                             look for "zip", "pc", "pc6" or "postal".
  -n, --housenumber String   Name of the input column that represents the house number. By default,
                             "number", "house_number", "huisnummer" or "hn".
  -y, --latitude Number      Name of the output column for the latitude. By default, "lat".
  -x, --longitude Number     Name of the output column for the longitude. By default, "lon".
  -c, --toCSV Boolean        Converts the input CSV to a new CSV.
  -o, --out String           Optional output filename.

Examples

  1. Convert a CSV to a GeoJSON                           $ pdok-geoencoder input.csv
  2. Convert a CSV to a GeoJSON specyfing column names    $ pdok-geoencoder -z pc -n hn input.csv
  3. Convert a CSV to a new CSV specifying column names   $ pdok-geoencoder -c -x longitude -y latitude input.csv
```
