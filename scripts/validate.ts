import * as parse from 'csv-parse/lib/sync';
import { dayOne } from '../src/constants';
import * as path from 'path';
import * as fs from 'fs';

const dataPath = path.join(__dirname, '..', 'assets', 'data');

const usedColumns = ['Country/Region', 'Province/State', 'Lat', 'Long'];

interface Record {
    [key: string]: string;
}
type ParsedCsv = Record[];

const casesText = fs.readFileSync(path.join(dataPath, 'cases.csv'), 'utf8');
const deathsText = fs.readFileSync(path.join(dataPath, 'deaths.csv'), 'utf8');

const casesHeaders = parse(casesText)[0] as string[];
const deathsHeaders = parse(deathsText)[0] as string[];

const cases = parse(casesText, { columns: true }) as ParsedCsv;
const deaths = parse(deathsText, { columns: true }) as ParsedCsv;

if (getDayCount(casesHeaders) !== getDayCount(deathsHeaders)) {
    throw new Error("Day counts for cases and deaths don't match");
}

if (!equalArrays(casesHeaders, deathsHeaders)) {
    throw new Error('Cases and deaths files have different column sets');
}

const dayCount = getDayCount(casesHeaders);
const dateList = getDateList(dayOne, dayCount);

for (const date of dateList) {
    if (!casesHeaders.includes(date)) {
        throw new Error(`Cases file doesn't have date ${date}`);
    }

    if (!deathsHeaders.includes(date)) {
        throw new Error(`Deaths file doesn't have date ${date}`);
    }
}

for (const column of usedColumns) {
    if (!casesHeaders.includes(column)) {
        throw new Error(`Cases file doesn't have column ${column}`);
    }

    if (!deathsHeaders.includes(column)) {
        throw new Error(`Deaths file doesn't have column ${column}`);
    }
}

if (cases.length !== deaths.length) {
    throw new Error('Cases and deaths files have different number of regions');
}

for (let i = 0; i < cases.length; i++) {
    const casesRecord = cases[i];
    const deathsRecord = deaths[i];

    for (const column of usedColumns) {
        if (casesRecord[column] !== deathsRecord[column]) {
            throw new Error(`Region data mismatch in row #${i}`);
        }
    }

    const lon = Number(casesRecord['Long']);
    const lng = Number(casesRecord['Lat']);
    if (Number.isNaN(lon) || lon < -180 || lon > 180) {
        throw new Error(`Invalid longtitude, row #${i}`);
    }
    if (Number.isNaN(lng) || lng < -90 || lng > 90) {
        throw new Error(`Invalid latitude, row #${i}`);
    }

    for (const date of dateList) {
        const cases = Number(casesRecord[date]);
        const deaths = Number(deathsRecord[date]);

        if (Number.isNaN(cases)) {
            throw new Error(`Invalid value in cases file, row #${i}, date ${date}`);
        }
        if (cases < 0) {
            throw new Error(`Negative value in cases file, row #${i}, date ${date}`);
        }
        if (Number.isNaN(deaths)) {
            throw new Error(`Invalid value in deaths file, row #${i}, date ${date}`);
        }
        if (deaths < 0) {
            throw new Error(`Negative value in deaths file, row #${i}, date ${date}`);
        }
    }
}

function getDayCount(headers: string[]): number {
    return headers.filter((header) => isDate(header)).length;
}

function getDateList(dayOne: Date, dayCount: number): string[] {
    const strings: string[] = [];
    const date = new Date(dayOne);

    for (let i = 0; i < dayCount; i++) {
        strings.push(format(date));
        date.setDate(date.getDate() + 1);
    }

    return strings;
}

function equalArrays(arr1: string[], arr2: string[]): boolean {
    if (arr1.length !== arr2.length) {
        return false;
    }

    for (let i = 0; i < arr1.length; i++) {
        if (arr1[i] !== arr2[i]) {
            return false;
        }
    }

    return true;
}

function isDate(key: string): boolean {
    return /^\d{1,2}\/\d{1,2}\/\d{2}$/g.test(key);
}

function format(date: Date): string {
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear() % 100}`;
}
